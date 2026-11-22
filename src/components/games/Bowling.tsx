import { useEffect, useRef, useState } from 'react'

/* ================= ボウリング =================
 * 10フレームのボウリング。正式スコア計算（ストライク／スペア／第10フレーム3投）。
 * ・ボールを引っ張って（ドラッグ）離すと投球。引く方向の逆へ、引いた長さが強さ
 * ・レーンの両端はガター。ガターに入るとピンは倒れない
 * ・ボールがピンに当たると倒れ、倒れたピンが隣のピンを巻き込むこともある
 * ・キーボード操作：←→で立ち位置、↑↓で強さ、Spaceでまっすぐ投げる */

const W = 360, H = 540
const LANE_L = 52, LANE_R = 308
const CENTER = (LANE_L + LANE_R) / 2
const BALL_R = 10
const PIN_R = 9
const BALL_Y = 452
const MAX_POWER = 15
const BEST_KEY = 'webx-bowling-best'

/** ピン配置：1番ピンが手前（下）、10番ピンが奥（上）の三角形 */
const PIN_POS: { x: number; y: number }[] = [
  { x: 180, y: 168 }, // 1
  { x: 166, y: 143 }, { x: 194, y: 143 }, // 2, 3
  { x: 152, y: 118 }, { x: 180, y: 118 }, { x: 208, y: 118 }, // 4, 5, 6
  { x: 138, y: 93 }, { x: 166, y: 93 }, { x: 194, y: 93 }, { x: 222, y: 93 }, // 7, 8, 9, 10
]

type Pin = {
  x: number; y: number
  standing: boolean
  fallen: boolean
  fallT: number
  fx: number; fy: number; fvx: number; fvy: number
}

type Phase = 'aim' | 'rolling' | 'settle' | 'done'

type GState = {
  frame: number // 0..9
  throwInFrame: number // 0, 1, 2
  frames: number[][] // 各フレームの投球ごとの倒した本数
  pins: Pin[]
  ball: { x: number; y: number; vx: number; vy: number }
  aimX: number
  aimPower: number
  dragging: boolean
  aimAngle: number
  gutter: boolean
  knockedThisThrow: number
  phase: Phase
  settleT: number
  message: string
  lastKnockBeep: number
  total: number
}

function freshPins(): Pin[] {
  return PIN_POS.map((p) => ({ ...p, standing: true, fallen: false, fallT: 0, fx: p.x, fy: p.y, fvx: 0, fvy: 0 }))
}

function freshState(): GState {
  return {
    frame: 0,
    throwInFrame: 0,
    frames: [],
    pins: freshPins(),
    ball: { x: CENTER, y: BALL_Y, vx: 0, vy: 0 },
    aimX: CENTER,
    aimPower: 7,
    dragging: false,
    aimAngle: -Math.PI / 2,
    gutter: false,
    knockedThisThrow: 0,
    phase: 'aim',
    settleT: 0,
    message: 'ボールを引っ張って離すと投げられます',
    lastKnockBeep: 0,
    total: 0,
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

/** 正式スコア計算。未確定フレームの累計は '' */
function calcScores(frames: number[][]): (number | '')[] {
  const flat: number[] = []
  const frameStart: number[] = []
  for (const f of frames) {
    frameStart.push(flat.length)
    flat.push(...f)
  }
  const out: (number | '')[] = []
  let total = 0
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]
    if (i < 9) {
      if (f.length === 0) { out.push(''); continue }
      if (f[0] === 10) {
        // ストライク：次の2投分
        const b1 = flat[frameStart[i] + 1]
        const b2 = flat[frameStart[i] + 2]
        if (b1 === undefined || b2 === undefined) { out.push(''); continue }
        total += 10 + b1 + b2
      } else if (f.length < 2) { out.push(''); continue }
      else if (f[0] + f[1] === 10) {
        const b1 = flat[frameStart[i] + 2]
        if (b1 === undefined) { out.push(''); continue }
        total += 10 + b1
      } else {
        total += f[0] + f[1]
      }
      out.push(total)
    } else {
      // 第10フレームは倒した本数の合計
      total += f.reduce((a, b) => a + b, 0)
      out.push(total)
    }
  }
  return out
}

function rollLabel(v: number, prev: number | null, isFirst: boolean): string {
  if (v === 0) return '–'
  if (isFirst && v === 10) return 'X'
  if (!isFirst && prev !== null && prev + v === 10) return '/'
  if (!isFirst && v === 10) return 'X'
  return String(v)
}

export default function Bowling() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gRef = useRef<GState>(freshState())
  const [frame, setFrame] = useState(0)
  const [throwInFrame, setThrowInFrame] = useState(0)
  const [frames, setFrames] = useState<number[][]>([])
  const [scores, setScores] = useState<(number | '')[]>([])
  const [phase, setPhase] = useState<Phase>('aim')
  const [message, setMessage] = useState(gRef.current.message)
  const [total, setTotal] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0) || 0)
  const uiRef = useRef({ frame, throwInFrame, frames, scores, phase, message, total })
  uiRef.current = { frame, throwInFrame, frames, scores, phase, message, total }

  const syncUi = () => {
    const g = gRef.current
    const sc = calcScores(g.frames)
    if (uiRef.current.frame !== g.frame) setFrame(g.frame)
    if (uiRef.current.throwInFrame !== g.throwInFrame) setThrowInFrame(g.throwInFrame)
    if (uiRef.current.frames !== g.frames) setFrames([...g.frames.map((f) => [...f])])
    if (JSON.stringify(uiRef.current.scores) !== JSON.stringify(sc)) setScores(sc)
    if (uiRef.current.phase !== g.phase) setPhase(g.phase)
    if (uiRef.current.message !== g.message) setMessage(g.message)
    if (uiRef.current.total !== g.total) setTotal(g.total)
  }

  const restartAll = () => {
    gRef.current = freshState()
    syncUi()
  }

  /** 投球後の処理：倒した本数を記録し、次の投球／フレームへ進む */
  const endThrow = () => {
    const g = gRef.current
    const knocked = g.knockedThisThrow
    const f = g.frame
    const frames = g.frames.map((x) => [...x])
    while (frames.length <= f) frames.push([])
    frames[f].push(knocked)
    g.frames = frames

    let msg = ''
    if (knocked === 10 && g.throwInFrame === 0 && f < 9) msg = 'ストライク！🎉'
    else if (f < 9 && g.throwInFrame === 1 && frames[f][0] + knocked === 10) msg = 'スペア！✨'
    else if (knocked === 0) msg = g.gutter ? 'ガター…' : 'はずれ…'
    else msg = `${knocked}本倒した！`

    if (f < 9) {
      const done = knocked === 10 || g.throwInFrame === 1
      if (done) {
        g.frame = f + 1
        g.throwInFrame = 0
        g.pins = freshPins()
        msg += g.frame < 10 ? ` 第${g.frame + 1}フレームへ` : ''
      } else {
        g.throwInFrame = 1
      }
    } else {
      // 第10フレーム
      const rolls = frames[9]
      const first = rolls[0] ?? 0
      const second = rolls[1] ?? 0
      if (g.throwInFrame === 0) {
        g.throwInFrame = 1
        if (first === 10) g.pins = freshPins()
      } else if (g.throwInFrame === 1) {
        const needThird = first === 10 || first + second === 10
        if (needThird) {
          g.throwInFrame = 2
          // スペア・ストライク後はピンを立て直す（2投目がストライクの場合も含む）
          if (second === 10 || first + second === 10) g.pins = freshPins()
        } else {
          finishGame(g, msg)
          return
        }
      } else {
        finishGame(g, msg)
        return
      }
    }

    if (msg.includes('ストライク')) jingle()
    else if (msg.includes('スペア')) beep(880, 0.2, 0.06)
    g.message = msg
    g.ball = { x: g.aimX, y: BALL_Y, vx: 0, vy: 0 }
    g.knockedThisThrow = 0
    g.gutter = false
    g.phase = 'aim'
    syncUi()
  }

  const finishGame = (g: GState, msg: string) => {
    g.total = calcScores(g.frames).filter((s): s is number => typeof s === 'number').pop() ?? 0
    const isBest = g.total > (Number(localStorage.getItem(BEST_KEY) ?? 0) || 0)
    if (isBest) {
      localStorage.setItem(BEST_KEY, String(g.total))
      setBest(g.total)
    }
    g.message = `${msg} ゲーム終了！ 合計 ${g.total}点${isBest ? '（ベスト更新！🏆）' : ''}`
    g.phase = 'done'
    jingle()
    syncUi()
  }

  const throwBall = () => {
    const g = gRef.current
    if (g.phase !== 'aim') return
    const p = Math.max(1, g.aimPower)
    g.ball.vx = Math.cos(g.aimAngle) * p
    g.ball.vy = Math.sin(g.aimAngle) * p
    g.ball.x = g.aimX
    g.ball.y = BALL_Y
    g.phase = 'rolling'
    g.message = ''
    syncUi()
  }

  /** ピンを倒す。倒れたピンが隣のピンを巻き込む */
  const knockPin = (g: GState, idx: number, vx: number, vy: number, now: number) => {
    const pin = g.pins[idx]
    if (!pin.standing) return
    pin.standing = false
    pin.fallen = true
    pin.fallT = 0
    pin.fvx = vx + (Math.random() - 0.5) * 2
    pin.fvy = vy * 0.6 + (Math.random() - 0.5) * 2
    g.knockedThisThrow += 1
    if (now - g.lastKnockBeep > 70) {
      g.lastKnockBeep = now
      beep(300 + Math.random() * 200, 0.06, 0.05)
    }
    // 連鎖：近くの立っているピンを巻き込む
    for (let j = 0; j < g.pins.length; j++) {
      if (j === idx || !g.pins[j].standing) continue
      const d = Math.hypot(g.pins[j].x - pin.x, g.pins[j].y - pin.y)
      if (d < 32 && Math.random() < 0.65) {
        knockPin(g, j, vx * 0.7, vy * 0.7, now)
      }
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const g = gRef.current
    if (g.phase !== 'aim') return
    if (e.key === 'ArrowLeft') { g.aimX = Math.max(LANE_L + 12, g.aimX - 8); g.ball.x = g.aimX; e.preventDefault() }
    else if (e.key === 'ArrowRight') { g.aimX = Math.min(LANE_R - 12, g.aimX + 8); g.ball.x = g.aimX; e.preventDefault() }
    else if (e.key === 'ArrowUp') { g.aimPower = Math.min(MAX_POWER, g.aimPower + 1); e.preventDefault() }
    else if (e.key === 'ArrowDown') { g.aimPower = Math.max(1, g.aimPower - 1); e.preventDefault() }
    else if (e.key === ' ') { g.aimAngle = -Math.PI / 2; throwBall(); e.preventDefault() }
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
      if (Math.hypot(dx, dy) >= 4) {
        g.aimAngle = Math.atan2(dy, dx)
        g.aimPower = Math.min(Math.hypot(dx, dy) / 10, MAX_POWER)
      }
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
      g.aimPower = Math.min(Math.hypot(dx, dy) / 10, MAX_POWER)
    }
    const onUp = () => {
      const g = gRef.current
      if (!g.dragging) return
      g.dragging = false
      if (g.phase === 'aim') throwBall()
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    const step = (now: number) => {
      const dt = Math.min((now - last) / 16.7, 2)
      last = now
      const g = gRef.current
      const b = g.ball

      if (g.phase === 'rolling') {
        b.x += b.vx * dt
        b.y += b.vy * dt
        const fr = 0.992
        b.vx *= Math.pow(fr, dt)
        b.vy *= Math.pow(fr, dt)
        // ガター判定：レーン端を出たらガターに固定
        if (!g.gutter && (b.x < LANE_L + BALL_R || b.x > LANE_R - BALL_R)) {
          g.gutter = true
          b.x = b.x < CENTER ? LANE_L - 8 : LANE_R + 8
          b.vx = 0
          g.message = 'ガター…'
          syncUi()
        }
        // ピンとの衝突（ガターでなければ）
        if (!g.gutter && b.y < 210) {
          for (let i = 0; i < g.pins.length; i++) {
            const pin = g.pins[i]
            if (!pin.standing) continue
            const d = Math.hypot(b.x - pin.x, b.y - pin.y)
            if (d < BALL_R + PIN_R) {
              knockPin(g, i, b.vx * 0.5, b.vy * 0.5, now)
              // ボールは少し減速して曲がる
              b.vy *= 0.9
              b.vx += (Math.random() - 0.5) * 0.8
            }
          }
        }
        const speed = Math.hypot(b.vx, b.vy)
        if (b.y < 48 || speed < 0.35) {
          b.vx = 0; b.vy = 0
          g.phase = 'settle'
          g.settleT = 0
          syncUi()
        }
      } else if (g.phase === 'settle') {
        g.settleT += dt
        for (const pin of g.pins) {
          if (pin.fallen && pin.fallT < 40) {
            pin.fallT += dt
            pin.fx += pin.fvx * dt
            pin.fy += pin.fvy * dt
            pin.fvx *= 0.92
            pin.fvy *= 0.92
          }
        }
        if (g.settleT > 40) endThrow()
      }

      // ===== 描画 =====
      ctx.clearRect(0, 0, W, H)
      // 背景
      ctx.fillStyle = '#1f2937'
      ctx.fillRect(0, 0, W, H)
      // ガター
      ctx.fillStyle = '#111827'
      ctx.fillRect(0, 0, LANE_L - 14, H)
      ctx.fillRect(LANE_R + 14, 0, W - LANE_R - 14, H)
      // レーン（木目ボード）
      ctx.fillStyle = '#d9a05b'
      ctx.fillRect(LANE_L, 0, LANE_R - LANE_L, H)
      ctx.fillStyle = '#c98f4e'
      for (let x = LANE_L + 16; x < LANE_R; x += 32) ctx.fillRect(x, 0, 2, H)
      // ピンデッキ
      ctx.fillStyle = '#b9823f'
      ctx.fillRect(LANE_L, 60, LANE_R - LANE_L, 150)
      // ファウルライン
      ctx.fillStyle = '#ef4444'
      ctx.fillRect(LANE_L, 468, LANE_R - LANE_L, 4)
      // ドットマーカー
      ctx.fillStyle = '#7c4a1e'
      for (const dx of [-60, -20, 20, 60]) {
        ctx.beginPath()
        ctx.arc(CENTER + dx, 400, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      // 倒れたピン（横たわって滑る）
      for (const pin of g.pins) {
        if (!pin.fallen) continue
        const a = Math.max(0, 1 - pin.fallT / 40)
        ctx.save()
        ctx.globalAlpha = a * 0.9
        ctx.translate(pin.fx, pin.fy)
        ctx.rotate(1.2)
        ctx.fillStyle = '#f8fafc'
        ctx.beginPath()
        ctx.ellipse(0, 0, 12, 5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#ef4444'
        ctx.fillRect(-2, -5, 4, 10)
        ctx.restore()
      }
      // 立っているピン
      for (const pin of g.pins) {
        if (!pin.standing) continue
        ctx.fillStyle = '#f8fafc'
        ctx.beginPath()
        ctx.arc(pin.x, pin.y, PIN_R, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#cbd5e1'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = '#ef4444'
        ctx.fillRect(pin.x - PIN_R, pin.y - 3, PIN_R * 2, 3)
        ctx.fillStyle = '#f8fafc'
        ctx.beginPath()
        ctx.arc(pin.x, pin.y - PIN_R - 2, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      // 狙いのガイド（ドラッグ中）
      if (g.phase === 'aim' && g.dragging && g.aimPower >= 0.5) {
        const len = 30 + g.aimPower * 6
        const ex = g.ball.x + Math.cos(g.aimAngle) * len
        const ey = g.ball.y + Math.sin(g.aimAngle) * len
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(g.ball.x, g.ball.y)
        ctx.lineTo(ex, ey)
        ctx.stroke()
        ctx.setLineDash([])
      }
      // ボール
      if (g.phase !== 'done') {
        ctx.fillStyle = '#1e3a8a'
        ctx.beginPath()
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#60a5fa'
        ctx.beginPath()
        ctx.arc(b.x - 3, b.y - 3, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#0f172a'
        ctx.beginPath()
        ctx.arc(b.x + 3, b.y - 2, 1.5, 0, Math.PI * 2)
        ctx.arc(b.x + 5, b.y + 2, 1.5, 0, Math.PI * 2)
        ctx.arc(b.x + 1, b.y + 4, 1.5, 0, Math.PI * 2)
        ctx.fill()
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

  const frameLabel = (i: number) => {
    const f = frames[i]
    if (!f) return { r1: '', r2: '', r3: '' }
    if (i < 9) {
      const r1 = f[0] !== undefined ? rollLabel(f[0], null, true) : ''
      const r2 = f[1] !== undefined ? rollLabel(f[1], f[0], false) : ''
      return { r1, r2, r3: '' }
    }
    const r1 = f[0] !== undefined ? rollLabel(f[0], null, true) : ''
    const r2 = f[1] !== undefined ? rollLabel(f[1], f[0], false) : ''
    const r3 = f[2] !== undefined ? rollLabel(f[2], f[1] === 10 ? null : f[1], f[1] === 10) : ''
    return { r1, r2, r3 }
  }

  return (
    <div className="bowling" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="bowling-head">
        <span>第{frame + 1}フレーム {phase === 'done' ? '' : `・${throwInFrame + 1}投目`}</span>
        <span>合計 {total}点</span>
        <span>ベスト {best}点</span>
      </div>
      <div className="bowling-sheet">
        {Array.from({ length: 10 }, (_, i) => {
          const l = frameLabel(i)
          return (
            <div key={i} className={`bowling-frame${i === frame && phase !== 'done' ? ' cur' : ''}`}>
              <div className="bowling-frame-no">{i + 1}</div>
              <div className="bowling-rolls">
                <span>{l.r1}</span>
                <span>{l.r2}</span>
                {i === 9 && <span>{l.r3}</span>}
              </div>
              <div className="bowling-cum">{scores[i] === '' || scores[i] === undefined ? '' : scores[i]}</div>
            </div>
          )
        })}
      </div>
      <canvas ref={canvasRef} className="bowling-canvas" width={W} height={H} />
      <p className="bowling-msg">{message}</p>
      <div className="bowling-btns">
        {phase === 'aim' && (
          <button onClick={() => { gRef.current.aimAngle = -Math.PI / 2; throwBall() }}>
            投げる（Space）
          </button>
        )}
        <button onClick={restartAll}>最初から</button>
      </div>
      <p className="bowling-help">ドラッグ：引っ張って離すと投球 ／ ←→：立ち位置、↑↓：強さ、Space：投げる</p>
    </div>
  )
}
