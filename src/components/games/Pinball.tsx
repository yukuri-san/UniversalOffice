import { useEffect, useRef, useState } from 'react'

/* ================= ピンボール =================
 * フリッパーでボールを弾くアーケード・ピンボール。
 * バンパー・スリングショット・ロールオーバーレーンでスコアを稼ぐ。
 * 残機3。プランジャーは Space 長押し（タッチは「発射」ボタン長押し）で
 * チャージし、離すと発射。フリッパーは Z / ←（左）、/ / →（右）。 */

const PW = 360, PH = 520
const BALL_R = 7
const GRAV = 0.22
const FLIP_LEN = 48
const L_PIVOT = { x: 110, y: 470 }
const R_PIVOT = { x: 250, y: 470 }
const L_REST = 0.3, L_ACTIVE = -0.5
const R_REST = Math.PI - 0.3, R_ACTIVE = Math.PI + 0.5
const BEST_KEY = 'webx-pinball-best'

type Ball = { x: number; y: number; vx: number; vy: number }
type GameState = {
  ball: Ball
  lAngle: number; rAngle: number
  lVel: number; rVel: number
  lPress: boolean; rPress: boolean
  score: number
  ballsLeft: number
  lit: boolean[]
  bumpFlash: number[]
  slingCd: number
  charging: number // -1 = チャージ中でない、0..1 = チャージ量
  ready: boolean // ボールがプランジャーレーンで発射待ち
  over: boolean
  stuck: number
}

const BUMPERS = [
  { x: 100, y: 130, c: '#f87171' },
  { x: 180, y: 100, c: '#60a5fa' },
  { x: 260, y: 130, c: '#facc15' },
]
const LANES = [
  { x: 120, y: 52 },
  { x: 180, y: 42 },
  { x: 240, y: 52 },
]

function freshState(): GameState {
  return {
    ball: { x: 339, y: 495, vx: 0, vy: 0 },
    lAngle: L_REST, rAngle: R_REST, lVel: 0, rVel: 0,
    lPress: false, rPress: false,
    score: 0, ballsLeft: 3,
    lit: [false, false, false],
    bumpFlash: [0, 0, 0],
    slingCd: 0,
    charging: -1, ready: true, over: false, stuck: 0,
  }
}

/** 円と線分の衝突。反射＋法線方向へのキック。 */
function collideSegment(b: Ball, ax: number, ay: number, bx: number, by: number, kick: number): boolean {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return false
  let t = ((b.x - ax) * dx + (b.y - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx, cy = ay + t * dy
  let nx = b.x - cx, ny = b.y - cy
  const d = Math.hypot(nx, ny)
  const minD = BALL_R + 5
  if (d >= minD || d === 0) return false
  nx /= d; ny /= d
  b.x = cx + nx * minD; b.y = cy + ny * minD
  const vn = b.vx * nx + b.vy * ny
  if (vn < 0) {
    b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny
    b.vx += nx * kick; b.vy += ny * kick
  }
  return true
}

export function Pinball() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) || 0))
  const [balls, setBalls] = useState(3)
  const [msg, setMsg] = useState('')
  const [running, setRunning] = useState(false)
  const g = useRef<GameState>(freshState())
  const runningRef = useRef(false)
  const setScoreRef = useRef(setScore)
  setScoreRef.current = setScore

  const addScore = (n: number) => {
    g.current.score += n
    setScoreRef.current(g.current.score)
  }

  const start = () => {
    g.current = freshState()
    setScore(0); setBalls(3); setMsg(''); setRunning(true)
    runningRef.current = true
  }

  const loseBall = () => {
    const s = g.current
    if (s.ballsLeft > 1) {
      s.ballsLeft -= 1
      setBalls(s.ballsLeft)
      s.ball = { x: 339, y: 495, vx: 0, vy: 0 }
      s.ready = true
      s.charging = -1
      setMsg('ボールロスト…発射して続けよう')
    } else {
      s.over = true
      setRunning(false)
      runningRef.current = false
      const sc = s.score
      setBest((prev) => {
        if (sc > prev) {
          localStorage.setItem(BEST_KEY, String(sc))
          setMsg(`ゲームオーバー！新記録 ${sc}！`)
          return sc
        }
        setMsg('ゲームオーバー')
        return prev
      })
    }
  }

  /* キーボード操作（ウィンドウを開いている間ずっと有効） */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!runningRef.current) return
      const s = g.current
      if (e.code === 'ArrowLeft' || e.code === 'KeyZ') { e.preventDefault(); s.lPress = true }
      else if (e.code === 'ArrowRight' || e.code === 'Slash') { e.preventDefault(); s.rPress = true }
      else if (e.code === 'Space') {
        e.preventDefault()
        if (s.ready && s.charging < 0) s.charging = 0
      }
    }
    const up = (e: KeyboardEvent) => {
      if (!runningRef.current) return
      const s = g.current
      if (e.code === 'ArrowLeft' || e.code === 'KeyZ') s.lPress = false
      else if (e.code === 'ArrowRight' || e.code === 'Slash') s.rPress = false
      else if (e.code === 'Space') {
        if (s.ready && s.charging >= 0) {
          s.ball.vy = -(9 + s.charging * 9)
          s.ball.vx = 0
          s.ready = false
          s.charging = -1
        }
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  /* 物理ループ */
  useEffect(() => {
    if (!running) return
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    let rafId = 0
    const stepFlipper = (cur: number, target: number, fast: boolean) => {
      const step = fast ? 0.3 : 0.14
      if (Math.abs(target - cur) <= step) return target
      return cur + Math.sign(target - cur) * step
    }
    const tick = () => {
      const s = g.current
      if (s.over) return
      /* フリッパー */
      const lPrev = s.lAngle, rPrev = s.rAngle
      s.lAngle = stepFlipper(s.lAngle, s.lPress ? L_ACTIVE : L_REST, s.lPress)
      s.rAngle = stepFlipper(s.rAngle, s.rPress ? R_ACTIVE : R_REST, s.rPress)
      s.lVel = s.lAngle - lPrev
      s.rVel = s.rAngle - rPrev
      /* チャージ */
      if (s.charging >= 0) s.charging = Math.min(1, s.charging + 0.02)
      /* ボール物理 */
      const b = s.ball
      if (!s.ready) {
        b.vy += GRAV
        b.vx *= 0.999
        const sp = Math.hypot(b.vx, b.vy)
        if (sp > 16) { b.vx = (b.vx / sp) * 16; b.vy = (b.vy / sp) * 16 }
        b.x += b.vx; b.y += b.vy
        /* 壁（上・左右） */
        if (b.x < 10 + BALL_R) { b.x = 10 + BALL_R; b.vx = Math.abs(b.vx) * 0.92 }
        if (b.x > 350 - BALL_R) { b.x = 350 - BALL_R; b.vx = -Math.abs(b.vx) * 0.92 }
        if (b.y < 10 + BALL_R) { b.y = 10 + BALL_R; b.vy = Math.abs(b.vy) * 0.92 }
        /* レーン上部で左へカーブ（アーチを回る） */
        if (b.x > 328 && b.y < 46 && b.vy < 0) b.vx -= 0.3
        /* 仕切り・ガイド・スリング（線分） */
        collideSegment(b, 328, 46, 328, 446, 0) // プランジャー仕切り
        collideSegment(b, 10, 400, 104, 464, 0) // 左ガイド
        collideSegment(b, 350, 400, 256, 464, 0) // 右ガイド
        if (s.slingCd > 0) s.slingCd -= 1
        if (collideSegment(b, 24, 388, 92, 424, 2.6) && s.slingCd === 0) { addScore(10); s.slingCd = 12 }
        if (collideSegment(b, 336, 388, 268, 424, 2.6) && s.slingCd === 0) { addScore(10); s.slingCd = 12 }
        /* フリッパー */
        const lTip = { x: L_PIVOT.x + Math.cos(s.lAngle) * FLIP_LEN, y: L_PIVOT.y + Math.sin(s.lAngle) * FLIP_LEN }
        const rTip = { x: R_PIVOT.x + Math.cos(s.rAngle) * FLIP_LEN, y: R_PIVOT.y + Math.sin(s.rAngle) * FLIP_LEN }
        if (collideSegment(b, L_PIVOT.x, L_PIVOT.y, lTip.x, lTip.y, Math.abs(s.lVel) * FLIP_LEN * 0.55)) {
          if (s.lPress && b.vy > -4) b.vy = -4
        }
        if (collideSegment(b, R_PIVOT.x, R_PIVOT.y, rTip.x, rTip.y, Math.abs(s.rVel) * FLIP_LEN * 0.55)) {
          if (s.rPress && b.vy > -4) b.vy = -4
        }
        /* バンパー */
        BUMPERS.forEach((bp, i) => {
          const dx = b.x - bp.x, dy = b.y - bp.y
          const d = Math.hypot(dx, dy)
          const minD = BALL_R + 17
          if (d < minD && d > 0) {
            const nx = dx / d, ny = dy / d
            b.x = bp.x + nx * minD; b.y = bp.y + ny * minD
            const vn = b.vx * nx + b.vy * ny
            if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny }
            b.vx += nx * 3.2; b.vy += ny * 3.2
            addScore(100)
            s.bumpFlash[i] = 10
          }
          if (s.bumpFlash[i] > 0) s.bumpFlash[i] -= 1
        })
        /* ロールオーバーレーン */
        LANES.forEach((ln, i) => {
          if (!s.lit[i] && Math.hypot(b.x - ln.x, b.y - ln.y) < 14) {
            s.lit[i] = true
            addScore(25)
            if (s.lit.every(Boolean)) {
              s.lit = [false, false, false]
              addScore(500)
              setMsg('レーン制覇！ +500')
            }
          }
        })
        /* 詰まり救済 */
        if (Math.hypot(b.vx, b.vy) < 0.35) {
          s.stuck += 1
          if (s.stuck > 90) { b.vy -= 2; b.vx += (Math.random() - 0.5) * 2; s.stuck = 0 }
        } else s.stuck = 0
        /* レーンへ戻ったボールは発射待ちへ */
        if (b.x > 328 && b.y > 470 && Math.hypot(b.vx, b.vy) < 0.6) {
          s.ready = true
          b.x = 339; b.y = 495; b.vx = 0; b.vy = 0
        }
        /* ドレイン */
        if (b.y - BALL_R > PH) loseBall()
      } else {
        /* 発射待ち：レーン底で静止 */
        b.x = 339; b.y = 495; b.vx = 0; b.vy = 0
      }
      /* ===== 描画 ===== */
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, PW, PH)
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 4; ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(10, 10); ctx.lineTo(10, 512)
      ctx.moveTo(350, 10); ctx.lineTo(350, 512)
      ctx.moveTo(10, 10); ctx.lineTo(350, 10)
      ctx.moveTo(328, 46); ctx.lineTo(328, 446)
      ctx.moveTo(10, 400); ctx.lineTo(104, 464)
      ctx.moveTo(350, 400); ctx.lineTo(256, 464)
      ctx.moveTo(328, 512); ctx.lineTo(350, 512)
      ctx.stroke()
      /* スリングショット */
      ctx.fillStyle = '#334155'; ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(24, 388); ctx.lineTo(92, 424); ctx.lineTo(30, 442); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(336, 388); ctx.lineTo(268, 424); ctx.lineTo(330, 442); ctx.closePath(); ctx.fill(); ctx.stroke()
      /* ロールオーバーレーン */
      LANES.forEach((ln, i) => {
        ctx.beginPath(); ctx.arc(ln.x, ln.y, 7, 0, Math.PI * 2)
        if (s.lit[i]) { ctx.fillStyle = '#facc15'; ctx.fill() }
        else { ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.stroke() }
      })
      /* バンパー */
      BUMPERS.forEach((bp, i) => {
        ctx.beginPath(); ctx.arc(bp.x, bp.y, 17, 0, Math.PI * 2)
        ctx.fillStyle = bp.c; ctx.fill()
        ctx.beginPath(); ctx.arc(bp.x, bp.y, 8, 0, Math.PI * 2)
        ctx.fillStyle = s.bumpFlash[i] > 0 ? '#ffffff' : 'rgba(255,255,255,.55)'; ctx.fill()
      })
      /* フリッパー */
      const drawFlipper = (px: number, py: number, ang: number) => {
        const tx = px + Math.cos(ang) * FLIP_LEN, ty = py + Math.sin(ang) * FLIP_LEN
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 12; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke()
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fillStyle = '#fbbf24'; ctx.fill()
      }
      drawFlipper(L_PIVOT.x, L_PIVOT.y, s.lAngle)
      drawFlipper(R_PIVOT.x, R_PIVOT.y, s.rAngle)
      /* チャージゲージ */
      if (s.charging >= 0) {
        ctx.fillStyle = '#f97316'
        ctx.fillRect(340, 500 - s.charging * 90, 7, s.charging * 90)
      }
      /* ボール */
      ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
      ctx.fillStyle = '#fde047'; ctx.fill()
      ctx.beginPath(); ctx.arc(b.x - 2, b.y - 2, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'; ctx.fill()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const pressFlipper = (side: 'l' | 'r', on: boolean) => {
    g.current[side === 'l' ? 'lPress' : 'rPress'] = on
  }
  const chargeStart = () => {
    const s = g.current
    if (running && s.ready && s.charging < 0) s.charging = 0
  }
  const chargeEnd = () => {
    const s = g.current
    if (running && s.ready && s.charging >= 0) {
      s.ball.vy = -(9 + s.charging * 9)
      s.ball.vx = 0
      s.ready = false
      s.charging = -1
    }
  }

  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">スコア<b>{score}</b></span>
        <span className="game-stat inline">ベスト<b>{best}</b></span>
        <span className="game-stat inline">残り<b>{'●'.repeat(Math.max(balls, 0))}</b></span>
        {msg && <span className="game-over">{msg}</span>}
        <button className="btn accent" onClick={start}>{running ? 'リスタート' : 'スタート'}</button>
      </div>
      <canvas ref={canvasRef} width={PW} height={PH} className="game-canvas" />
      <div className="game-bar">
        <button
          className="btn" style={{ minWidth: 92, minHeight: 44 }}
          onPointerDown={(e) => { e.preventDefault(); pressFlipper('l', true) }}
          onPointerUp={() => pressFlipper('l', false)}
          onPointerLeave={() => pressFlipper('l', false)}
        >◀ 左フリッパー</button>
        <button
          className="btn accent" style={{ minWidth: 76, minHeight: 44 }}
          onPointerDown={(e) => { e.preventDefault(); chargeStart() }}
          onPointerUp={chargeEnd}
          onPointerLeave={chargeEnd}
        >発射</button>
        <button
          className="btn" style={{ minWidth: 92, minHeight: 44 }}
          onPointerDown={(e) => { e.preventDefault(); pressFlipper('r', true) }}
          onPointerUp={() => pressFlipper('r', false)}
          onPointerLeave={() => pressFlipper('r', false)}
        >右フリッパー ▶</button>
      </div>
      <p className="game-help">Z／←と ／／→でフリッパー、Space長押し（発射ボタン長押し）でチャージして離すと発射。バンパー+100、レーン+25、3レーン制覇で+500。ボールが下に落ちると1機減ります。</p>
    </div>
  )
}
