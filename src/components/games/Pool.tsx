import { useEffect, useRef, useState } from 'react'

/* ================= ビリヤード =================
 * 9ボール・ソロチャレンジ。1〜9番のボールを順に狙い、9番を落とせばクリア。
 * ・一番小さい番号のボールを最初に当てないとファウル（ボールインハンド）
 * ・手玉をポケットに入れてもファウル（ボールインハンド）
 * ・9番を落とせばクリア。打数が少ないほどよい（ベストを保存）
 * ・ドラッグ：手玉から引っ張って離すとショット（引いた逆方向・長さが強さ）
 * ・キーボード：←→で向き、↑↓で強さ、Spaceで打つ */

const W = 360, H = 232
const TX = 16, TY = 16, TW = 328, TH = 180
const BALL_R = 7.5
const POCKET_R = 12
const BEST_KEY = 'webx-pool-best'
const WINS_KEY = 'webx-pool-wins'

const POCKETS: { x: number; y: number }[] = [
  { x: TX, y: TY }, { x: TX + TW / 2, y: TY }, { x: TX + TW, y: TY },
  { x: TX, y: TY + TH }, { x: TX + TW / 2, y: TY + TH }, { x: TX + TW, y: TY + TH },
]

const BALL_COLORS: Record<number, string> = {
  1: '#facc15', 2: '#2563eb', 3: '#dc2626', 4: '#7c3aed', 5: '#ea580c',
  6: '#16a34a', 7: '#7f1d1d', 8: '#1f2937', 9: '#facc15',
}
const CY = TY + TH / 2
const APEX_X = TX + TW * 0.72
const CUE_X = TX + TW * 0.25

type Ball = { n: number; x: number; y: number; vx: number; vy: number; active: boolean }
type Phase = 'aim' | 'moving' | 'place' | 'done'

type GState = {
  balls: Ball[]
  phase: Phase
  aimAngle: number
  aimPower: number
  dragging: boolean
  shots: number
  pocketed: number[]
  firstHit: number | null
  cuePocketed: boolean
  message: string
  foul: boolean
}

function rackBalls(): Ball[] {
  const defs: { n: number; dx: number; dy: number }[] = [
    { n: 1, dx: 0, dy: 0 },
    { n: 2, dx: -13, dy: -7.5 }, { n: 3, dx: -13, dy: 7.5 },
    { n: 4, dx: -26, dy: -15 }, { n: 9, dx: -26, dy: 0 }, { n: 5, dx: -26, dy: 15 },
    { n: 6, dx: -39, dy: -7.5 }, { n: 7, dx: -39, dy: 7.5 },
    { n: 8, dx: -52, dy: 0 },
  ]
  const balls: Ball[] = [{ n: 0, x: CUE_X, y: CY, vx: 0, vy: 0, active: true }]
  for (const d of defs) balls.push({ n: d.n, x: APEX_X + d.dx, y: CY + d.dy, vx: 0, vy: 0, active: true })
  return balls
}

function freshState(): GState {
  return {
    balls: rackBalls(),
    phase: 'aim',
    aimAngle: 0,
    aimPower: 0.5,
    dragging: false,
    shots: 0,
    pocketed: [],
    firstHit: null,
    cuePocketed: false,
    message: '1番を狙ってブレイク！ドラッグで引いて離すとショット',
    foul: false,
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

function jingle() {
  ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, 0.06), i * 110))
}

function lowestRemaining(balls: Ball[]): number {
  const rest = balls.filter((b) => b.n > 0 && b.active).map((b) => b.n)
  return rest.length ? Math.min(...rest) : 0
}

export default function Pool() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gRef = useRef<GState>(freshState())
  const lastClickRef = useRef(0)
  const [phase, setPhase] = useState<Phase>('aim')
  const [shots, setShots] = useState(0)
  const [pocketed, setPocketed] = useState<number[]>([])
  const [target, setTarget] = useState(1)
  const [message, setMessage] = useState(gRef.current.message)
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0) || 0)
  const [wins, setWins] = useState(() => Number(localStorage.getItem(WINS_KEY) ?? 0) || 0)
  const uiRef = useRef({ phase, shots, pocketed, target, message })
  uiRef.current = { phase, shots, pocketed, target, message }

  function syncUI() {
    const g = gRef.current
    setPhase(g.phase)
    setShots(g.shots)
    setPocketed([...g.pocketed])
    setTarget(lowestRemaining(g.balls))
    setMessage(g.message)
  }

  function shoot() {
    const g = gRef.current
    if (g.phase !== 'aim' || g.dragging) return
    const cue = g.balls[0]
    if (!cue.active) return
    const speed = 2 + g.aimPower * 15
    cue.vx = Math.cos(g.aimAngle) * speed
    cue.vy = Math.sin(g.aimAngle) * speed
    g.shots += 1
    g.firstHit = null
    g.cuePocketed = false
    g.foul = false
    g.phase = 'moving'
    g.message = '転がっています…'
    beep(300, 0.05, 0.04)
    syncUI()
  }

  function respotNine(g: GState) {
    const nine = g.balls.find((b) => b.n === 9)
    if (!nine) return
    nine.active = true
    nine.vx = 0; nine.vy = 0
    let x = APEX_X, y = CY
    for (let tries = 0; tries < 40; tries++) {
      const clash = g.balls.some((b) => b.active && b.n !== 9 && Math.hypot(b.x - x, b.y - y) < BALL_R * 2 + 1)
      if (!clash) break
      x -= 16
      if (x < TX + BALL_R * 2) { x = APEX_X; y += 16 }
    }
    nine.x = x; nine.y = y
    g.pocketed = g.pocketed.filter((n) => n !== 9)
  }

  function resolveShot() {
    const g = gRef.current
    const cue = g.balls[0]
    const ninePocketed = g.pocketed.includes(9)
    const lowest = lowestRemaining(g.balls)
    let foul = false
    let msg = ''
    if (g.cuePocketed) { foul = true; msg = 'スクラッチ！手玉がポケットに落ちました。' }
    else if (g.firstHit === null) { foul = true; msg = 'どのボールにも当たりませんでした。' }
    else if (g.firstHit !== lowest && lowest !== 0) { foul = true; msg = `${lowest}番を狙うところ、${g.firstHit}番に先に当たりました。` }

    if (ninePocketed && !foul) {
      g.phase = 'done'
      g.message = `クリア！ ${g.shots}打で9番を落としました🎉`
      jingle()
      const w = wins + 1
      setWins(w)
      localStorage.setItem(WINS_KEY, String(w))
      if (best === 0 || g.shots < best) {
        setBest(g.shots)
        localStorage.setItem(BEST_KEY, String(g.shots))
        g.message = `クリア！ ${g.shots}打で9番を落としました🎉 新記録！`
      }
      syncUI()
      return
    }
    if (ninePocketed && foul) {
      respotNine(g)
      msg += ' 9番はファウルのため戻しました。'
    }
    if (foul) {
      g.foul = true
      cue.active = true
      cue.vx = 0; cue.vy = 0
      cue.x = CUE_X; cue.y = CY
      g.phase = 'place'
      g.message = `${msg} タップで手玉を置き直してください。`
      beep(160, 0.25, 0.06)
    } else {
      const got = g.pocketed.length > 0
      g.phase = 'aim'
      g.message = got
        ? `${g.pocketed.join('・')}番を落としました。次は${lowest}番を狙おう。`
        : '何も入りませんでした。次は' + lowest + '番を狙おう。'
    }
    g.pocketed = []
    syncUI()
  }

  function step() {
    const g = gRef.current
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) draw(ctx, g)
    }
    if (g.phase === 'moving') {
      let moving = false
      for (const b of g.balls) {
        if (!b.active) continue
        b.x += b.vx
        b.y += b.vy
        b.vx *= 0.982
        b.vy *= 0.982
        if (Math.hypot(b.vx, b.vy) < 0.12) { b.vx = 0; b.vy = 0 }
        if (b.vx !== 0 || b.vy !== 0) moving = true
        // クッション
        if (b.x - BALL_R < TX) { b.x = TX + BALL_R; b.vx = Math.abs(b.vx) * 0.8 }
        if (b.x + BALL_R > TX + TW) { b.x = TX + TW - BALL_R; b.vx = -Math.abs(b.vx) * 0.8 }
        if (b.y - BALL_R < TY) { b.y = TY + BALL_R; b.vy = Math.abs(b.vy) * 0.8 }
        if (b.y + BALL_R > TY + TH) { b.y = TY + TH - BALL_R; b.vy = -Math.abs(b.vy) * 0.8 }
        // ポケット
        for (const p of POCKETS) {
          if (Math.hypot(b.x - p.x, b.y - p.y) < POCKET_R - 1) {
            b.active = false
            b.vx = 0; b.vy = 0
            if (b.n === 0) g.cuePocketed = true
            else g.pocketed.push(b.n)
            beep(880, 0.12, 0.06)
            break
          }
        }
      }
      // ボール同士の衝突（等質量・弾性）
      const act = g.balls.filter((b) => b.active)
      for (let i = 0; i < act.length; i++) {
        for (let j = i + 1; j < act.length; j++) {
          const a = act[i], b = act[j]
          const dx = b.x - a.x, dy = b.y - a.y
          const dist = Math.hypot(dx, dy)
          const min = BALL_R * 2
          if (dist > 0 && dist < min) {
            const nx = dx / dist, ny = dy / dist
            const overlap = (min - dist) / 2
            a.x -= nx * overlap; a.y -= ny * overlap
            b.x += nx * overlap; b.y += ny * overlap
            const rvx = b.vx - a.vx, rvy = b.vy - a.vy
            const vn = rvx * nx + rvy * ny
            if (vn < 0) {
              const imp = -vn
              a.vx -= imp * nx; a.vy -= imp * ny
              b.vx += imp * nx; b.vy += imp * ny
              if (g.firstHit === null && (a.n === 0 || b.n === 0)) {
                g.firstHit = a.n === 0 ? b.n : a.n
              }
              const now = performance.now()
              if (imp > 1 && now - lastClickRef.current > 50) {
                lastClickRef.current = now
                beep(440 + Math.min(400, imp * 40), 0.05, 0.05)
              }
            }
          }
        }
      }
      if (!moving) resolveShot()
    }
  }

  function draw(ctx: CanvasRenderingContext2D, g: GState) {
    ctx.clearRect(0, 0, W, H)
    // テーブル
    ctx.fillStyle = '#78350f'
    ctx.fillRect(4, 4, W - 8, H - 8)
    ctx.fillStyle = '#15803d'
    ctx.fillRect(TX, TY, TW, TH)
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.strokeRect(TX + 0.5, TY + 0.5, TW, TH)
    // フットスポット
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.beginPath(); ctx.arc(APEX_X, CY, 2, 0, Math.PI * 2); ctx.fill()
    // ポケット
    for (const p of POCKETS) {
      ctx.fillStyle = '#111827'
      ctx.beginPath(); ctx.arc(p.x, p.y, POCKET_R, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#78350f'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(p.x, p.y, POCKET_R, 0, Math.PI * 2); ctx.stroke()
      ctx.lineWidth = 1
    }
    // 狙いガイド
    const cue = g.balls[0]
    if (g.phase === 'aim' && cue.active) {
      const gx = cue.x + Math.cos(g.aimAngle) * (60 + g.aimPower * 60)
      const gy = cue.y + Math.sin(g.aimAngle) * (60 + g.aimPower * 60)
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.setLineDash([6, 5])
      ctx.beginPath(); ctx.moveTo(cue.x, cue.y); ctx.lineTo(gx, gy); ctx.stroke()
      ctx.setLineDash([])
      // キュー（引いた方向）
      const qx = cue.x - Math.cos(g.aimAngle) * (18 + g.aimPower * 26)
      const qy = cue.y - Math.sin(g.aimAngle) * (18 + g.aimPower * 26)
      ctx.strokeStyle = '#d97706'
      ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(cue.x - Math.cos(g.aimAngle) * 12, cue.y - Math.sin(g.aimAngle) * 12); ctx.stroke()
      ctx.lineWidth = 1
    }
    // ボール
    for (const b of g.balls) {
      if (!b.active) continue
      ctx.fillStyle = b.n === 0 ? '#f8fafc' : BALL_COLORS[b.n]
      ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.stroke()
      if (b.n === 9) {
        ctx.fillStyle = '#f8fafc'
        ctx.fillRect(b.x - BALL_R, b.y - 3, BALL_R * 2, 6)
      }
      if (b.n > 0) {
        ctx.fillStyle = '#f8fafc'
        ctx.beginPath(); ctx.arc(b.x, b.y, 4.5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#111827'
        ctx.font = 'bold 7px sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(String(b.n), b.x, b.y + 0.5)
      } else {
        ctx.fillStyle = '#dc2626'
        ctx.beginPath(); ctx.arc(b.x, b.y, 2, 0, Math.PI * 2); ctx.fill()
      }
    }
    // 配置モードの目安
    if (g.phase === 'place') {
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('手玉を置く場所をタップ', W / 2, TY + TH + 18)
    }
  }

  useEffect(() => {
    let raf = 0
    const loop = () => { step(); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = gRef.current
      if (g.phase === 'done') return
      if (g.phase === 'aim') {
        if (e.key === 'ArrowLeft') { g.aimAngle += 0.05; e.preventDefault() }
        else if (e.key === 'ArrowRight') { g.aimAngle -= 0.05; e.preventDefault() }
        else if (e.key === 'ArrowUp') { g.aimPower = Math.min(1, g.aimPower + 0.05); e.preventDefault() }
        else if (e.key === 'ArrowDown') { g.aimPower = Math.max(0.1, g.aimPower - 0.05); e.preventDefault() }
        else if (e.key === ' ' || e.key === 'Enter') { shoot(); e.preventDefault() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function canvasPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gRef.current
    const p = canvasPos(e)
    if (g.phase === 'place') {
      const cue = g.balls[0]
      const ok = p.x > TX + BALL_R && p.x < TX + TW - BALL_R && p.y > TY + BALL_R && p.y < TY + TH - BALL_R
        && !POCKETS.some((pk) => Math.hypot(p.x - pk.x, p.y - pk.y) < POCKET_R + BALL_R + 2)
        && !g.balls.some((b) => b.active && b.n !== 0 && Math.hypot(b.x - p.x, b.y - p.y) < BALL_R * 2 + 1)
      if (ok) {
        cue.x = p.x; cue.y = p.y
        g.phase = 'aim'
        g.message = `手玉を置き直しました。${lowestRemaining(g.balls)}番を狙おう。`
        beep(660, 0.08, 0.05)
        syncUI()
      } else {
        g.message = 'そこには置けません。別の場所をタップしてください。'
        syncUI()
      }
      return
    }
    if (g.phase !== 'aim') return
    const cue = g.balls[0]
    if (!cue.active) return
    if (Math.hypot(p.x - cue.x, p.y - cue.y) < 40) {
      g.dragging = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gRef.current
    if (!g.dragging || g.phase !== 'aim') return
    const p = canvasPos(e)
    const cue = g.balls[0]
    const dx = cue.x - p.x, dy = cue.y - p.y
    const dist = Math.hypot(dx, dy)
    if (dist > 8) {
      g.aimAngle = Math.atan2(dy, dx)
      g.aimPower = Math.min(1, Math.max(0.1, dist / 90))
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gRef.current
    if (!g.dragging) return
    g.dragging = false
    if (g.phase === 'aim') shoot()
    void e
  }

  function restart() {
    gRef.current = freshState()
    syncUI()
  }

  const remaining = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => gRef.current.balls.some((b) => b.n === n && b.active))

  return (
    <div className="pool" tabIndex={0}>
      <h2>🎱 ビリヤード</h2>
      <div className="pool-head">
        <span>打数：{shots}</span>
        <span>ベスト：{best === 0 ? '—' : `${best}打`}</span>
        <span>クリア：{wins}回</span>
        <button onClick={restart}>最初から</button>
      </div>
      <p className="pool-msg">{message}</p>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <div className="pool-power">
        <span>強さ</span>
        <meter min={0} max={1} value={gRef.current.aimPower} />
        <button
          onClick={() => { gRef.current.aimAngle -= 0.15 }}
          disabled={phase !== 'aim'}
        >←</button>
        <button
          onClick={() => { gRef.current.aimAngle += 0.15 }}
          disabled={phase !== 'aim'}
        >→</button>
        <button className="pool-shoot" onClick={shoot} disabled={phase !== 'aim'}>打つ</button>
      </div>
      <div className="pool-balls">
        <span>ねらう：<b>{target === 0 ? '—' : `${target}番`}</b></span>
        <span>残り：{remaining.length ? remaining.join('・') : 'なし'}</span>
      </div>
      <div className="pool-rules">
        <p>9ボール・ソロチャレンジ。1〜9番を順に狙い、9番を落とせばクリア。</p>
        <p>手玉から引っ張って離すとショット。←→で向き、↑↓で強さ、Spaceで打てます。</p>
        <p>狙う番号以外に先に当てる・手玉を落とすとファウルでボールインハンド（置き直し）です。</p>
      </div>
    </div>
  )
}
