import { useEffect, useRef, useState } from 'react'

/* ================= バスケットボール =================
 * フリースローゲーム。ボールを引っ張って離すとシュート。
 * ・ゴールの距離は毎回ランダム（近い 1点／普通 2点／遠い 3点）
 * ・リングを通ればゴール。ボード・リム・床で跳ね返る物理つき
 * ・シュート前に点線で軌道プレビューを表示
 * ・10本勝負。連続成功でコンボボーナス（+1ずつ増加）
 * ・ベストスコアを保存 */

const W = 360, H = 420
const FLOOR_Y = 392
const GRAVITY = 0.32
const BALL_R = 11
const RIM_Y = 112
const RIM_L = 298
const RIM_R = 330
const BOARD_X = 334
const BOARD_TOP = 66
const BOARD_BOTTOM = 158
const THROWS = 10
const BEST_KEY = 'webx-basketball-best'

// 投げる位置（距離ごとに3スポット）
const SPOTS: { x: number; label: string; pts: number }[] = [
  { x: 238, label: '近い', pts: 1 },
  { x: 186, label: '普通', pts: 2 },
  { x: 132, label: '遠い', pts: 3 },
]

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

type Phase = 'title' | 'playing' | 'done'
type Ball = { x: number; y: number; vx: number; vy: number; flying: boolean; scored: boolean; t: number }
type Popup = { x: number; y: number; text: string; life: number }

type GState = {
  t: number
  ball: Ball
  aimAngle: number
  aimPower: number
  dragging: boolean
  dragX: number
  dragY: number
  popups: Popup[]
  netSway: number
}

function newBall(spotX: number): Ball {
  return { x: spotX, y: FLOOR_Y - BALL_R, vx: 0, vy: 0, flying: false, scored: false, t: 0 }
}

export default function Basketball() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const g = useRef<GState>({
    t: 0,
    ball: newBall(SPOTS[1].x),
    aimAngle: 58,
    aimPower: 10,
    dragging: false,
    dragX: 0,
    dragY: 0,
    popups: [],
    netSway: 0,
  })
  const [phase, setPhase] = useState<Phase>('title')
  const [spot, setSpot] = useState(1)
  const [thrown, setThrown] = useState(0)
  const [score, setScore] = useState(0)
  const [makes, setMakes] = useState(0)
  const [streak, setStreak] = useState(0)
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0 } catch { return 0 }
  })
  const [message, setMessage] = useState('ボールを引っ張って離すとシュート！')
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const scoreRef = useRef(score)
  scoreRef.current = score
  const thrownRef = useRef(thrown)
  thrownRef.current = thrown
  const streakRef = useRef(streak)
  streakRef.current = streak
  const makesRef = useRef(makes)
  makesRef.current = makes
  const spotRef = useRef(spot)
  spotRef.current = spot

  function pickSpot(): number {
    return Math.floor(Math.random() * SPOTS.length)
  }

  function startGame() {
    const s = pickSpot()
    setSpot(s)
    g.current.ball = newBall(SPOTS[s].x)
    g.current.aimAngle = 58
    g.current.aimPower = 10
    g.current.popups = []
    setThrown(0)
    setScore(0)
    setMakes(0)
    setStreak(0)
    setMessage(`${SPOTS[s].label}い距離（${SPOTS[s].pts}点）からスタート！`)
    setPhase('playing')
  }

  function endGame(total: number) {
    setPhase('done')
    if (total > best) {
      setBest(total)
      try { localStorage.setItem(BEST_KEY, String(total)) } catch { /* 保存できなくても遊べる */ }
      setMessage(`終了！ ${total}点でベスト更新！ ${makesRef.current}本成功`)
      ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, 0.06), i * 110))
    } else {
      setMessage(`終了！ ${total}点（ベスト ${best}点）。${makesRef.current}本成功`)
      ;[392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.2, 0.06), i * 130))
    }
  }

  /** 1投の結果を確定して次へ進む */
  function resolveThrow(scored: boolean) {
    const s = g.current
    const nextThrown = thrownRef.current + 1
    setThrown(nextThrown)
    if (scored) {
      const newStreak = streakRef.current + 1
      const bonus = newStreak > 1 ? newStreak - 1 : 0
      const pts = SPOTS[spotRef.current].pts + bonus
      const total = scoreRef.current + pts
      setScore(total)
      setStreak(newStreak)
      setMakes(makesRef.current + 1)
      s.popups.push({ x: (RIM_L + RIM_R) / 2, y: RIM_Y - 24, text: `+${pts}点`, life: 50 })
      s.netSway = 14
      if (bonus > 0) setMessage(`ゴール！ ${pts}点（コンボ${newStreak}連続・ボーナス+${bonus}）`)
      else setMessage(`ゴール！ ${pts}点！`)
      beep(880, 0.15, 0.07)
      setTimeout(() => beep(1174, 0.25, 0.07), 90)
    } else {
      setStreak(0)
      setMessage(nextThrown >= THROWS ? 'はずれ…' : 'はずれ… 次のシュートを狙おう')
      beep(220, 0.2, 0.06)
    }
    if (nextThrown >= THROWS) {
      setTimeout(() => endGame(scoreRef.current), 1100)
      return
    }
    // 次の投げる位置へ
    setTimeout(() => {
      const ns = pickSpot()
      setSpot(ns)
      g.current.ball = newBall(SPOTS[ns].x)
      g.current.aimAngle = 58
      g.current.aimPower = 10
      setMessage(`${SPOTS[ns].label}い距離（${SPOTS[ns].pts}点）。残り${THROWS - nextThrown}本`)
    }, 1100)
  }

  function shoot() {
    const s = g.current
    if (phaseRef.current !== 'playing' || s.ball.flying) return
    const rad = (s.aimAngle * Math.PI) / 180
    s.ball.vx = Math.cos(rad) * s.aimPower
    s.ball.vy = -Math.sin(rad) * s.aimPower
    s.ball.flying = true
    s.ball.t = 0
    s.dragging = false
    beep(300, 0.1, 0.05)
  }

  /** 物理ステップ。ゴール・跳ね返り・投了判定を行う */
  function stepBall() {
    const s = g.current
    const b = s.ball
    if (!b.flying) return
    b.t += 1
    const prevY = b.y
    b.vy += GRAVITY
    b.x += b.vx
    b.y += b.vy
    // ゴール判定：リング面を上から下へ、リングの内側で通過
    if (!b.scored && b.vy > 0 && prevY < RIM_Y && b.y >= RIM_Y && b.x > RIM_L - 2 && b.x < RIM_R + 2) {
      b.scored = true
    }
    // リム（左右の端）との衝突。ゴール後はすり抜ける
    if (!b.scored) {
      for (const rx of [RIM_L, RIM_R]) {
        const dx = b.x - rx
        const dy = b.y - RIM_Y
        const d = Math.hypot(dx, dy)
        if (d < BALL_R + 3 && d > 0) {
          const nx = dx / d
          const ny = dy / d
          const dot = b.vx * nx + b.vy * ny
          if (dot < 0) {
            b.vx -= 2 * dot * nx
            b.vy -= 2 * dot * ny
            b.vx *= 0.55
            b.vy *= 0.55
            b.x = rx + nx * (BALL_R + 3)
            b.y = RIM_Y + ny * (BALL_R + 3)
            beep(500, 0.06, 0.05)
          }
        }
      }
      // バックボード（右端の板）との衝突
      if (b.x + BALL_R > BOARD_X && b.x < BOARD_X + 8 && b.y > BOARD_TOP && b.y < BOARD_BOTTOM && b.vx > 0) {
        b.x = BOARD_X - BALL_R
        b.vx = -b.vx * 0.6
        beep(420, 0.06, 0.05)
      }
    }
    // 左右の壁
    if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.5 }
    if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx) * 0.5 }
    // 天井
    if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy) * 0.5 }
    // 床
    if (b.y > FLOOR_Y - BALL_R) {
      b.y = FLOOR_Y - BALL_R
      if (Math.abs(b.vy) > 1.2) {
        b.vy = -b.vy * 0.5
        b.vx *= 0.8
        beep(180, 0.05, 0.04)
      } else {
        b.vy = 0
        b.vx *= 0.9
        if (Math.abs(b.vx) < 0.4) b.vx = 0
      }
    }
    // 投了判定：静止したか、長く飛びすぎた
    const settled = b.vy === 0 && b.vx === 0 && b.y >= FLOOR_Y - BALL_R - 0.5
    if (settled || b.t > 260) {
      b.flying = false
      resolveThrow(b.scored)
    }
  }

  /** 現在の狙いから予測した軌道の点列 */
  function previewPoints(): { x: number; y: number }[] {
    const s = g.current
    const rad = (s.aimAngle * Math.PI) / 180
    let x = s.ball.x
    let y = s.ball.y
    let vx = Math.cos(rad) * s.aimPower
    let vy = -Math.sin(rad) * s.aimPower
    const pts: { x: number; y: number }[] = []
    for (let i = 0; i < 40; i++) {
      vy += GRAVITY
      x += vx
      y += vy
      if (y > FLOOR_Y - BALL_R) break
      if (i % 3 === 0) pts.push({ x, y })
    }
    return pts
  }

  function draw(ctx: CanvasRenderingContext2D) {
    const s = g.current
    const b = s.ball
    ctx.clearRect(0, 0, W, H)
    // 体育館の壁
    ctx.fillStyle = '#dbeafe'
    ctx.fillRect(0, 0, W, FLOOR_Y)
    ctx.fillStyle = '#bfdbfe'
    for (let x = 0; x < W; x += 60) ctx.fillRect(x, 0, 2, FLOOR_Y)
    // 床（木目）
    ctx.fillStyle = '#d97706'
    ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y)
    ctx.fillStyle = '#b45309'
    for (let y = FLOOR_Y + 8; y < H; y += 12) ctx.fillRect(0, y, W, 1)
    // スリーポイントライン風の弧
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc((RIM_L + RIM_R) / 2, RIM_Y, 190, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
    // 投げる位置のスポット
    const sp = SPOTS[spotRef.current]
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.ellipse(sp.x, FLOOR_Y - 2, 26, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#92400e'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${sp.label}・${sp.pts}点`, sp.x, FLOOR_Y - 10)
    // バックボードの支柱
    ctx.fillStyle = '#475569'
    ctx.fillRect(BOARD_X + 6, BOARD_TOP - 30, 6, BOARD_BOTTOM - BOARD_TOP + 30)
    // バックボード
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(BOARD_X - 4, BOARD_TOP, 10, BOARD_BOTTOM - BOARD_TOP)
    ctx.strokeStyle = '#f97316'
    ctx.lineWidth = 2
    ctx.strokeRect(BOARD_X - 2, RIM_Y - 22, 6, 26)
    // ネット（ゴール後は揺れる）
    const sway = s.netSway > 0 ? Math.sin(s.t * 0.5) * (s.netSway / 14) * 3 : 0
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const t = i / 4
      const x0 = RIM_L + (RIM_R - RIM_L) * t
      const x1 = RIM_L + 6 + (RIM_R - RIM_L - 12) * t + sway
      ctx.beginPath()
      ctx.moveTo(x0, RIM_Y)
      ctx.lineTo(x1, RIM_Y + 26)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(RIM_L + 6 + sway, RIM_Y + 26)
    ctx.lineTo(RIM_R - 6 + sway, RIM_Y + 26)
    ctx.stroke()
    // リング
    ctx.strokeStyle = '#ea580c'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(RIM_L, RIM_Y)
    ctx.lineTo(RIM_R, RIM_Y)
    ctx.stroke()
    // 軌道プレビュー（飛んでいないときだけ）
    if (phaseRef.current === 'playing' && !b.flying) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)'
      for (const p of previewPoints()) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
      // 狙いの矢印
      const rad = (s.aimAngle * Math.PI) / 180
      const ax = b.x + Math.cos(rad) * 34
      const ay = b.y - Math.sin(rad) * 34
      ctx.strokeStyle = '#dc2626'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(b.x, b.y)
      ctx.lineTo(ax, ay)
      ctx.stroke()
      ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      ctx.arc(ax, ay, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    // ボール
    ctx.fillStyle = '#f97316'
    ctx.beginPath()
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#7c2d12'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(b.x - BALL_R, b.y)
    ctx.lineTo(b.x + BALL_R, b.y)
    ctx.moveTo(b.x, b.y - BALL_R)
    ctx.lineTo(b.x, b.y + BALL_R)
    ctx.stroke()
    // ポップアップ（+2点など）
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'center'
    for (const p of s.popups) {
      ctx.fillStyle = `rgba(220, 38, 38, ${Math.min(1, p.life / 25)})`
      ctx.fillText(p.text, p.x, p.y - (50 - p.life) * 0.5)
    }
  }

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        g.current.t += 1
        if (g.current.netSway > 0) g.current.netSway -= 0.3
        g.current.popups = g.current.popups.filter((p) => {
          p.life -= 1
          return p.life > 0
        })
        stepBall()
        draw(ctx)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function canvasPos(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const s = g.current
    if (phaseRef.current !== 'playing' || s.ball.flying) return
    s.dragging = true
    const p = canvasPos(e)
    s.dragX = p.x
    s.dragY = p.y
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const s = g.current
    if (!s.dragging || s.ball.flying) return
    const p = canvasPos(e)
    s.dragX = p.x
    s.dragY = p.y
    // 引っ張りベクトル（ボールから指を離す向きの逆）から角度と強さを決める
    const dx = (s.ball.x - p.x) * 0.22
    const dy = (s.ball.y - p.y) * 0.22
    const power = Math.min(16, Math.hypot(dx, dy))
    if (power > 1) {
      s.aimAngle = Math.max(15, Math.min(85, (Math.atan2(-dy, dx) * 180) / Math.PI))
      s.aimPower = Math.max(4, power)
    }
  }

  function onPointerUp() {
    const s = g.current
    if (!s.dragging) return
    s.dragging = false
    shoot()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const s = g.current
    if (e.key === ' ') e.preventDefault()
    if (e.key === ' ' && phaseRef.current === 'title') { startGame(); return }
    if (e.key === ' ' && phaseRef.current === 'done') { startGame(); return }
    if (phaseRef.current !== 'playing') return
    if (e.key === 'ArrowLeft') s.aimAngle = Math.min(85, s.aimAngle + 2)
    if (e.key === 'ArrowRight') s.aimAngle = Math.max(15, s.aimAngle - 2)
    if (e.key === 'ArrowUp') s.aimPower = Math.min(16, s.aimPower + 0.5)
    if (e.key === 'ArrowDown') s.aimPower = Math.max(4, s.aimPower - 0.5)
    if (e.key === ' ') shoot()
  }

  const throwsLeft = THROWS - thrown
  const cur = SPOTS[spot]

  return (
    <div className="basketball" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="basketball-head">
        <span>残り {throwsLeft}本</span>
        <span>スコア <b>{score}</b>点</span>
        <span>成功 {makes}本</span>
        <span>連続 {streak}</span>
        <span>ベスト {best}点</span>
      </div>
      <canvas
        ref={canvasRef}
        className="basketball-canvas"
        width={W}
        height={H}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <p className="basketball-msg">{message}</p>
      <p className="basketball-aim">今は「{cur.label}」い距離（{cur.pts}点）。点線の軌道をみて狙おう</p>
      {phase === 'title' && (
        <div className="basketball-btns">
          <button onClick={startGame}>スタート</button>
        </div>
      )}
      {phase === 'done' && (
        <div className="basketball-btns">
          <button onClick={startGame}>もう一度</button>
          <button onClick={() => setPhase('title')}>タイトルへ</button>
        </div>
      )}
      <p className="basketball-help">ボールを引っ張って離すとシュート。点線がボールの軌道だよ。←→キーで角度、↑↓キーで強さを変えてSpaceでも打てるよ。10本勝負で、遠いほど高得点。連続成功でコンボボーナスがつくよ。</p>
    </div>
  )
}
