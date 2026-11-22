import { useEffect, useRef, useState } from 'react'

/* ================= ミニゴルフ =================
 * 9ホールのミニゴルフ。ボールを引っ張って（ドラッグ）離すとショット。
 * ・壁は跳ね返る／池に入ると1打罰で打ち直し／バンカーは転がりにくい
 * ・カップにゆっくり入れると沈む（速すぎると通り過ぎる）
 * ・各ホール最大10打。9ホール合計でパーとの差とベスト（最少打数）を競う
 * ・キーボード操作：←→で向き、↑↓で強さ、Spaceで打つ */

const W = 480, H = 320
const BALL_R = 7
const CUP_R = 10
const MAX_STROKES = 10
const MAX_POWER = 14
const BEST_KEY = 'webx-minigolf-best'

type Rect = { x: number; y: number; w: number; h: number }
type Hole = {
  par: number
  start: { x: number; y: number }
  cup: { x: number; y: number }
  walls: Rect[]
  water: Rect[]
  sand: Rect[]
}

const HOLES: Hole[] = [
  { par: 2, start: { x: 60, y: 160 }, cup: { x: 420, y: 160 }, walls: [], water: [], sand: [] },
  { par: 3, start: { x: 60, y: 270 }, cup: { x: 420, y: 60 },
    walls: [{ x: 235, y: 0, w: 14, h: 210 }], water: [], sand: [] },
  { par: 3, start: { x: 60, y: 160 }, cup: { x: 420, y: 160 },
    walls: [], water: [{ x: 190, y: 120, w: 100, h: 80 }], sand: [] },
  { par: 3, start: { x: 70, y: 60 }, cup: { x: 400, y: 250 },
    walls: [], water: [], sand: [{ x: 300, y: 180, w: 120, h: 110 }] },
  { par: 4, start: { x: 60, y: 270 }, cup: { x: 420, y: 50 },
    walls: [{ x: 150, y: 0, w: 14, h: 200 }, { x: 320, y: 120, w: 14, h: 200 }], water: [], sand: [] },
  { par: 3, start: { x: 60, y: 160 }, cup: { x: 420, y: 160 },
    walls: [{ x: 0, y: 90, w: 340, h: 14 }, { x: 140, y: 216, w: 340, h: 14 }], water: [], sand: [] },
  { par: 4, start: { x: 60, y: 280 }, cup: { x: 420, y: 60 },
    walls: [], water: [{ x: 200, y: 0, w: 90, h: 140 }], sand: [{ x: 300, y: 200, w: 110, h: 100 }] },
  { par: 4, start: { x: 60, y: 280 }, cup: { x: 420, y: 40 },
    walls: [{ x: 190, y: 80, w: 100, h: 160 }], water: [], sand: [] },
  { par: 5, start: { x: 60, y: 280 }, cup: { x: 420, y: 60 },
    walls: [{ x: 160, y: 0, w: 14, h: 180 }],
    water: [{ x: 280, y: 180, w: 120, h: 90 }], sand: [{ x: 360, y: 40, w: 90, h: 80 }] },
]

const TOTAL_PAR = HOLES.reduce((s, h) => s + h.par, 0)

type Phase = 'aim' | 'rolling' | 'splash' | 'sunk' | 'done'

type GState = {
  hole: number
  ball: { x: number; y: number; vx: number; vy: number }
  lastShot: { x: number; y: number }
  strokes: number
  scores: number[]
  aimAngle: number
  aimPower: number
  dragging: boolean
  phase: Phase
  splashT: number
  sinkT: number
  message: string
  lastWallBeep: number
}

function freshState(): GState {
  const h = HOLES[0]
  return {
    hole: 0,
    ball: { x: h.start.x, y: h.start.y, vx: 0, vy: 0 },
    lastShot: { ...h.start },
    strokes: 0,
    scores: [],
    aimAngle: 0,
    aimPower: 5,
    dragging: false,
    phase: 'aim',
    splashT: 0,
    sinkT: 0,
    message: 'ボールを引っ張って離すと打てます',
    lastWallBeep: 0,
  }
}

function beep(freq: number, dur = 0.08, vol = 0.05) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = freq
    o.type = 'sine'
    g.gain.value = vol
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + dur)
    o.onended = () => void ctx.close()
  } catch { /* 音が出なくても遊べる */ }
}

function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

/** 円と矩形の衝突。跳ね返りがあれば true */
function collideRect(b: { x: number; y: number; vx: number; vy: number }, r: Rect): boolean {
  const cx = Math.max(r.x, Math.min(b.x, r.x + r.w))
  const cy = Math.max(r.y, Math.min(b.y, r.y + r.h))
  const dx = b.x - cx
  const dy = b.y - cy
  const d2 = dx * dx + dy * dy
  if (d2 >= BALL_R * BALL_R) return false
  let nx = dx, ny = dy
  const d = Math.sqrt(d2)
  if (d < 0.001) {
    // 中心が矩形の中：最も浅い辺から押し出す
    const left = b.x - r.x, right = r.x + r.w - b.x
    const top = b.y - r.y, bottom = r.y + r.h - b.y
    const m = Math.min(left, right, top, bottom)
    if (m === left) { nx = -1; ny = 0 } else if (m === right) { nx = 1; ny = 0 }
    else if (m === top) { nx = 0; ny = -1 } else { nx = 0; ny = 1 }
    b.x += nx * (BALL_R + 1)
    b.y += ny * (BALL_R + 1)
  } else {
    nx = dx / d; ny = dy / d
    b.x = cx + nx * BALL_R
    b.y = cy + ny * BALL_R
  }
  const vn = b.vx * nx + b.vy * ny
  if (vn < 0) {
    b.vx -= 1.72 * vn * nx
    b.vy -= 1.72 * vn * ny
    b.vx *= 0.98
    b.vy *= 0.98
    return true
  }
  return false
}

function scoreLabel(strokes: number, par: number): string {
  if (strokes === 1) return 'ホールインワン！🎉'
  const d = strokes - par
  if (d <= -2) return 'イーグル！🦅'
  if (d === -1) return 'バーディ！🐦'
  if (d === 0) return 'パー！'
  if (d === 1) return 'ボギー'
  return `+${d}`
}

export default function MiniGolf() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gRef = useRef<GState>(freshState())
  const [hole, setHole] = useState(0)
  const [strokes, setStrokes] = useState(0)
  const [scores, setScores] = useState<number[]>([])
  const [phase, setPhase] = useState<Phase>('aim')
  const [message, setMessage] = useState(gRef.current.message)
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0) || 0)
  const uiRef = useRef({ hole, strokes, scores, phase, message })
  uiRef.current = { hole, strokes, scores, phase, message }

  const syncUi = () => {
    const g = gRef.current
    if (uiRef.current.hole !== g.hole) setHole(g.hole)
    if (uiRef.current.strokes !== g.strokes) setStrokes(g.strokes)
    if (uiRef.current.scores !== g.scores) setScores([...g.scores])
    if (uiRef.current.phase !== g.phase) setPhase(g.phase)
    if (uiRef.current.message !== g.message) setMessage(g.message)
  }

  const startHole = (idx: number, keepScores: number[]) => {
    const g = gRef.current
    const h = HOLES[idx]
    g.hole = idx
    g.ball = { x: h.start.x, y: h.start.y, vx: 0, vy: 0 }
    g.lastShot = { ...h.start }
    g.strokes = 0
    g.scores = keepScores
    g.aimAngle = Math.atan2(h.cup.y - h.start.y, h.cup.x - h.start.x)
    g.aimPower = 5
    g.dragging = false
    g.phase = 'aim'
    g.message = `第${idx + 1}ホール パー${h.par} — ボールを引っ張って打とう`
    syncUi()
  }

  const restartAll = () => {
    const g = gRef.current
    g.scores = []
    startHole(0, [])
  }

  const shoot = () => {
    const g = gRef.current
    if (g.phase !== 'aim' || g.aimPower < 0.5) return
    g.ball.vx = Math.cos(g.aimAngle) * g.aimPower
    g.ball.vy = Math.sin(g.aimAngle) * g.aimPower
    g.lastShot = { x: g.ball.x, y: g.ball.y }
    g.strokes += 1
    g.phase = 'rolling'
    g.message = ''
    syncUi()
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    let last = performance.now()

    const toLocal = (e: PointerEvent | React.PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) }
    }
    const onDown = (e: PointerEvent) => {
      const g = gRef.current
      if (g.phase !== 'aim') return
      const p = toLocal(e)
      g.dragging = true
      const dx = g.ball.x - p.x
      const dy = g.ball.y - p.y
      g.aimAngle = Math.atan2(dy, dx)
      g.aimPower = Math.min(Math.hypot(dx, dy) / 12, MAX_POWER)
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      const g = gRef.current
      if (!g.dragging || g.phase !== 'aim') return
      const p = toLocal(e)
      const dx = g.ball.x - p.x
      const dy = g.ball.y - p.y
      if (Math.hypot(dx, dy) < 4) return
      g.aimAngle = Math.atan2(dy, dx)
      g.aimPower = Math.min(Math.hypot(dx, dy) / 12, MAX_POWER)
    }
    const onUp = () => {
      const g = gRef.current
      if (!g.dragging) return
      g.dragging = false
      if (g.phase === 'aim') shoot()
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    const step = (now: number) => {
      const dt = Math.min((now - last) / 16.7, 2)
      last = now
      const g = gRef.current
      const h = HOLES[g.hole]
      const b = g.ball

      if (g.phase === 'rolling') {
        b.x += b.vx * dt
        b.y += b.vy * dt
        const inSand = h.sand.some((r) => inRect(b.x, b.y, r))
        const fr = inSand ? 0.92 : 0.985
        b.vx *= Math.pow(fr, dt)
        b.vy *= Math.pow(fr, dt)
        // 壁
        for (const w of h.walls) {
          if (collideRect(b, w) && now - g.lastWallBeep > 90) {
            g.lastWallBeep = now
            beep(180, 0.05, 0.03)
          }
        }
        // 外枠
        if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.72 }
        if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx) * 0.72 }
        if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy) * 0.72 }
        if (b.y > H - BALL_R) { b.y = H - BALL_R; b.vy = -Math.abs(b.vy) * 0.72 }
        // 池
        if (h.water.some((r) => inRect(b.x, b.y, r))) {
          g.phase = 'splash'
          g.splashT = 0
          g.message = '池ポチャ… 1打罰で打ち直し'
          syncUi()
        }
        // カップ
        const dc = Math.hypot(b.x - h.cup.x, b.y - h.cup.y)
        const speed = Math.hypot(b.vx, b.vy)
        if (dc < CUP_R + 2 && speed < 5) {
          g.phase = 'sunk'
          g.sinkT = 0
          g.scores = [...g.scores, g.strokes]
          g.message = `${scoreLabel(g.strokes, h.par)}（${g.strokes}打）`
          beep(g.strokes === 1 ? 1046 : 880, 0.25, 0.06)
          syncUi()
        } else if (speed < 0.25) {
          b.vx = 0; b.vy = 0
          if (dc < CUP_R + 4) {
            g.phase = 'sunk'
            g.sinkT = 0
            g.scores = [...g.scores, g.strokes]
            g.message = `${scoreLabel(g.strokes, h.par)}（${g.strokes}打）`
            beep(880, 0.25, 0.06)
            syncUi()
          } else if (g.strokes >= MAX_STROKES) {
            g.scores = [...g.scores, MAX_STROKES]
            g.phase = 'sunk'
            g.message = `10打上限です（${MAX_STROKES}打）`
            syncUi()
          } else {
            g.phase = 'aim'
            g.aimAngle = Math.atan2(h.cup.y - b.y, h.cup.x - b.x)
            g.aimPower = 5
            syncUi()
          }
        }
      } else if (g.phase === 'splash') {
        g.splashT += dt
        if (g.splashT > 45) {
          b.x = g.lastShot.x
          b.y = g.lastShot.y
          b.vx = 0; b.vy = 0
          g.strokes += 1
          g.phase = 'aim'
          g.aimAngle = Math.atan2(h.cup.y - b.y, h.cup.x - b.x)
          g.aimPower = 5
          g.message = '池ポチャ… 1打罰で打ち直し'
          syncUi()
        }
      }

      // ===== 描画 =====
      ctx.clearRect(0, 0, W, H)
      // 芝（縞）
      ctx.fillStyle = '#3f9e4d'
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#379145'
      for (let i = 0; i < 6; i++) if (i % 2 === 0) ctx.fillRect(0, i * 56, W, 56)
      // バンカー
      for (const s of h.sand) {
        ctx.fillStyle = '#e8d28a'
        ctx.beginPath()
        ctx.roundRect(s.x, s.y, s.w, s.h, 10)
        ctx.fill()
        ctx.fillStyle = '#d9c06e'
        ctx.beginPath()
        ctx.arc(s.x + s.w * 0.3, s.y + s.h * 0.4, 3, 0, Math.PI * 2)
        ctx.arc(s.x + s.w * 0.7, s.y + s.h * 0.65, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      // 池
      for (const wtr of h.water) {
        ctx.fillStyle = '#38a8e0'
        ctx.beginPath()
        ctx.roundRect(wtr.x, wtr.y, wtr.w, wtr.h, 12)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(wtr.x + 12, wtr.y + wtr.h * 0.35)
        ctx.quadraticCurveTo(wtr.x + wtr.w / 2, wtr.y + wtr.h * 0.2, wtr.x + wtr.w - 12, wtr.y + wtr.h * 0.35)
        ctx.moveTo(wtr.x + 12, wtr.y + wtr.h * 0.65)
        ctx.quadraticCurveTo(wtr.x + wtr.w / 2, wtr.y + wtr.h * 0.5, wtr.x + wtr.w - 12, wtr.y + wtr.h * 0.65)
        ctx.stroke()
      }
      // 壁
      for (const wl of h.walls) {
        ctx.fillStyle = '#8d6e63'
        ctx.fillRect(wl.x, wl.y, wl.w, wl.h)
        ctx.fillStyle = '#6d4c41'
        ctx.fillRect(wl.x, wl.y, wl.w, 4)
      }
      // カップ＋旗
      ctx.fillStyle = '#111'
      ctx.beginPath()
      ctx.arc(h.cup.x, h.cup.y, CUP_R, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(h.cup.x, h.cup.y, CUP_R, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = '#f5f5f5'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(h.cup.x, h.cup.y)
      ctx.lineTo(h.cup.x, h.cup.y - 34)
      ctx.stroke()
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.moveTo(h.cup.x, h.cup.y - 34)
      ctx.lineTo(h.cup.x + 16, h.cup.y - 28)
      ctx.lineTo(h.cup.x, h.cup.y - 22)
      ctx.closePath()
      ctx.fill()
      // 狙い線
      if (g.phase === 'aim') {
        const ax = b.x + Math.cos(g.aimAngle) * g.aimPower * 9
        const ay = b.y + Math.sin(g.aimAngle) * g.aimPower * 9
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 6])
        ctx.beginPath()
        ctx.moveTo(b.x, b.y)
        ctx.lineTo(ax, ay)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(ax, ay, 4, 0, Math.PI * 2)
        ctx.fill()
      }
      // ボール
      if (g.phase !== 'splash' && g.phase !== 'sunk') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.beginPath()
        ctx.ellipse(b.x + 2, b.y + 3, BALL_R, BALL_R * 0.7, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#cbd5e1'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
        ctx.stroke()
      } else if (g.phase === 'splash') {
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.font = 'bold 20px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('💦', b.x, b.y)
      }
      // パワーゲージ
      if (g.phase === 'aim') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.beginPath()
        ctx.roundRect(10, 10, 110, 12, 6)
        ctx.fill()
        ctx.fillStyle = g.aimPower > 10 ? '#ef4444' : g.aimPower > 6 ? '#eab308' : '#4ade80'
        ctx.beginPath()
        ctx.roundRect(10, 10, 110 * (g.aimPower / MAX_POWER), 12, 6)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 11px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText('パワー', 126, 20)
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const g = gRef.current
    if (g.phase !== 'aim') return
    if (e.key === 'ArrowLeft') { g.aimAngle -= 0.06; e.preventDefault() }
    else if (e.key === 'ArrowRight') { g.aimAngle += 0.06; e.preventDefault() }
    else if (e.key === 'ArrowUp') { g.aimPower = Math.min(MAX_POWER, g.aimPower + 0.5); e.preventDefault() }
    else if (e.key === 'ArrowDown') { g.aimPower = Math.max(0.5, g.aimPower - 0.5); e.preventDefault() }
    else if (e.key === ' ' || e.key === 'Enter') { shoot(); e.preventDefault() }
  }

  const nextHole = () => {
    const g = gRef.current
    if (g.hole >= HOLES.length - 1) {
      g.phase = 'done'
      const total = g.scores.reduce((s, v) => s + v, 0)
      if (!best || total < best) {
        setBest(total)
        localStorage.setItem(BEST_KEY, String(total))
      }
      syncUi()
      return
    }
    startHole(g.hole + 1, g.scores)
  }

  const total = scores.reduce((s, v) => s + v, 0)
  const isDone = phase === 'done'
  const totalDiff = total - TOTAL_PAR

  return (
    <div className="minigolf" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="minigolf-head">
        <span>⛳ 第{hole + 1}ホール / 9</span>
        <span>パー {HOLES[hole].par}</span>
        <span>このホール {strokes}打</span>
        <span>合計 {total}打（パー{TOTAL_PAR}）</span>
        {best > 0 && <span>ベスト {best}打</span>}
      </div>
      <div className="minigolf-holes">
        {HOLES.map((h, i) => (
          <span key={i} className={`minigolf-hole-dot${i === hole ? ' cur' : ''}${scores[i] != null ? ' done' : ''}`}>
            {i + 1}{scores[i] != null ? `:${scores[i]}` : ''}
          </span>
        ))}
      </div>
      <canvas ref={canvasRef} width={W} height={H} className="minigolf-canvas" />
      <p className="minigolf-msg">{message}</p>
      {isDone ? (
        <div className="minigolf-result">
          <p>全9ホール終了！ 合計 {total}打（パー{TOTAL_PAR} に対して {totalDiff > 0 ? `+${totalDiff}` : totalDiff}）</p>
          <p>{totalDiff <= -5 ? 'すごい！プロ級です🏆' : totalDiff < 0 ? 'アンダーパー！お見事です🎉' : totalDiff === 0 ? 'イーブンパー！👏' : '次はアンダーパーを目指そう！'}</p>
          {best > 0 && <p>ベスト：{best}打</p>}
          <button onClick={restartAll}>最初からプレー</button>
        </div>
      ) : (
        <div className="minigolf-btns">
          {phase === 'sunk' && (
            <button onClick={nextHole}>{hole >= HOLES.length - 1 ? '結果を見る' : '次のホールへ →'}</button>
          )}
          <button onClick={restartAll}>最初から</button>
          <span className="minigolf-hint">ドラッグで引っ張って離すとショット／←→向き・↑↓強さ・Spaceで打つ</span>
        </div>
      )}
    </div>
  )
}
