import { useEffect, useRef, useState } from 'react'

/* ================= PK戦 =================
 * サッカーのペナルティキック勝負。
 * ・キック（全5本）：ゴール内を動く照準をタイミングよく止めて蹴る。
 *   GKはランダムな方向へ飛ぶ。隅を狙うほど決まりやすい
 * ・ディフェンス（全5本）：相手のキックを止める。赤い予告マーカーが出たら
 *   GKをドラッグ／←→キーで動かしてシュートコースをふさぐ
 * ・5本ずつ終えたら勝敗判定。勝利数とベスト得点を保存 */

const W = 360, H = 300
const GOAL = { x0: 60, y0: 50, x1: 300, y1: 150 }
const SPOT = { x: W / 2, y: 262 }
const KICKS = 5
const WINS_KEY = 'webx-pk-wins'
const BEST_KEY = 'webx-pk-best'
const SAVE_R = 38

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

type Phase = 'title' | 'kick' | 'defend' | 'done'
type Turn = 'idle' | 'flying' | 'show'
type ShotResult = 'goal' | 'save' | null

type GState = {
  t: number
  aimT: number
  ballX: number
  ballY: number
  ballFromX: number
  ballFromY: number
  ballToX: number
  ballToY: number
  ballStart: number
  flying: boolean
  gkX: number
  gkDiveX: number
  gkDiveT: number
  targetX: number
  targetY: number
  showTarget: boolean
  flash: number
}

function newG(): GState {
  return {
    t: 0, aimT: 0,
    ballX: SPOT.x, ballY: SPOT.y,
    ballFromX: SPOT.x, ballFromY: SPOT.y,
    ballToX: SPOT.x, ballToY: SPOT.y,
    ballStart: -1, flying: false,
    gkX: W / 2, gkDiveX: W / 2, gkDiveT: 0,
    targetX: W / 2, targetY: 100,
    showTarget: false, flash: 0,
  }
}

export default function PenaltyKick() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const g = useRef<GState>(newG())
  const timers = useRef<number[]>([])
  const [phase, setPhase] = useState<Phase>('title')
  const [turn, setTurn] = useState<Turn>('idle')
  const [kickNo, setKickNo] = useState(1)
  const [defNo, setDefNo] = useState(1)
  const [goals, setGoals] = useState(0)
  const [conceded, setConceded] = useState(0)
  const [result, setResult] = useState<ShotResult>(null)
  const [wins, setWins] = useState(() => {
    try { return Number(localStorage.getItem(WINS_KEY) ?? 0) || 0 } catch { return 0 }
  })
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0 } catch { return 0 }
  })
  const [message, setMessage] = useState('キッカーは5本蹴って、GKは5本止めるよ。先にスタート！')
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const turnRef = useRef(turn)
  turnRef.current = turn
  const kickNoRef = useRef(kickNo)
  kickNoRef.current = kickNo
  const defNoRef = useRef(defNo)
  defNoRef.current = defNo
  const goalsRef = useRef(goals)
  goalsRef.current = goals
  const concededRef = useRef(conceded)
  concededRef.current = conceded

  function later(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms)
    timers.current.push(id)
  }

  useEffect(() => {
    const ts = timers.current
    return () => { ts.forEach((id) => clearTimeout(id)) }
  }, [])

  /** キック時の照準位置。回が進むほど速く動く */
  function aimPos(): { x: number; y: number } {
    const s = g.current
    const speed = 1 + (kickNoRef.current - 1) * 0.25
    const t = s.aimT * 0.028 * speed
    const rx = Math.sin(t * 1.9) * 100
    const ry = Math.sin(t * 2.7 + 1.1) * 38
    return { x: W / 2 + rx, y: 100 + ry }
  }

  function flyBall(toX: number, toY: number) {
    const s = g.current
    s.ballFromX = SPOT.x
    s.ballFromY = SPOT.y
    s.ballToX = toX
    s.ballToY = toY
    s.ballStart = s.t
    s.flying = true
  }

  function startGame() {
    g.current = newG()
    setKickNo(1)
    setDefNo(1)
    setGoals(0)
    setConceded(0)
    setResult(null)
    setMessage('キック開始！ 照準が動くよ。タイミングよく蹴ろう！')
    setPhase('kick')
    setTurn('idle')
  }

  function endGame(scored: number, lost: number) {
    setPhase('done')
    setTurn('idle')
    if (scored > best) {
      setBest(scored)
      try { localStorage.setItem(BEST_KEY, String(scored)) } catch { /* 保存できなくても遊べる */ }
    }
    if (scored > lost) {
      const w = wins + 1
      setWins(w)
      try { localStorage.setItem(WINS_KEY, String(w)) } catch { /* 保存できなくても遊べる */ }
      setMessage(`勝利！ ${scored} - ${lost} で勝ったよ！（勝利数 ${w}勝）`)
      ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, 0.06), i * 120))
    } else if (scored === lost) {
      setMessage(`引き分け！ ${scored} - ${lost}。もう一度挑戦しよう`)
      ;[440, 440].forEach((f, i) => setTimeout(() => beep(f, 0.15, 0.06), i * 150))
    } else {
      setMessage(`敗北… ${scored} - ${lost}。次は勝とう！`)
      ;[392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.2, 0.06), i * 130))
    }
  }

  function shoot() {
    if (phaseRef.current !== 'kick' || turnRef.current !== 'idle') return
    const s = g.current
    const pos = aimPos()
    // GKはランダムな方向へ飛ぶ（左右の隅ほど届きにくい）
    const diveZones = [-95, -55, -20, 0, 20, 55, 95]
    const dz = diveZones[Math.floor(Math.random() * diveZones.length)]
    s.gkDiveX = W / 2 + dz
    s.gkDiveT = 0
    s.targetX = pos.x
    s.targetY = pos.y
    flyBall(pos.x, pos.y)
    setTurn('flying')
    later(() => {
      const gloveX = s.gkDiveX
      const gloveY = 105
      const dist = Math.hypot(pos.x - gloveX, pos.y - gloveY)
      const scored = dist > SAVE_R
      s.flying = false
      s.flash = 10
      if (scored) {
        const total = goalsRef.current + 1
        setGoals(total)
        setResult('goal')
        beep(880, 0.25, 0.08)
        setMessage('ゴール！ 決まった！')
      } else {
        setResult('save')
        beep(220, 0.25, 0.07)
        setMessage('止められた… GKの読みが当たった')
      }
      setTurn('show')
      later(() => {
        setResult(null)
        g.current = { ...newG(), aimT: g.current.aimT }
        if (kickNoRef.current >= KICKS) {
          setMessage('ディフェンス開始！ 赤いマーカーが出たらGKを動かして止めよう')
          setPhase('defend')
          setTurn('idle')
          startDefendTurn()
        } else {
          setKickNo(kickNoRef.current + 1)
          setTurn('idle')
        }
      }, 1000)
    }, 320)
  }

  function startDefendTurn() {
    const s = g.current
    // 相手のシュートコースを決める（隅が多め）
    const tx = W / 2 + (Math.random() < 0.5 ? -1 : 1) * (55 + Math.random() * 55)
    const ty = 62 + Math.random() * 70
    s.targetX = Math.max(GOAL.x0 + 8, Math.min(GOAL.x1 - 8, tx))
    s.targetY = ty
    s.showTarget = true
    setTurn('idle')
    later(() => {
      if (phaseRef.current !== 'defend') return
      s.showTarget = false
      flyBall(s.targetX, s.targetY)
      setTurn('flying')
      later(() => {
        const saved = Math.abs(s.targetX - s.gkX) < SAVE_R
        s.flying = false
        s.flash = 10
        if (saved) {
          setResult('save')
          beep(660, 0.2, 0.07)
          setMessage('ナイスセーブ！ 止めた！')
        } else {
          const lost = concededRef.current + 1
          setConceded(lost)
          setResult('goal')
          beep(330, 0.25, 0.07)
          setMessage('決められた… 次は止めよう')
        }
        setTurn('show')
        later(() => {
          setResult(null)
          g.current = { ...newG(), aimT: g.current.aimT, gkX: s.gkX, gkDiveX: s.gkX }
          if (defNoRef.current >= KICKS) {
            endGame(goalsRef.current, concededRef.current)
          } else {
            setDefNo(defNoRef.current + 1)
            startDefendTurn()
          }
        }, 1000)
      }, 320)
    }, 1100)
  }

  function moveGk(clientX: number) {
    const canvas = canvasRef.current
    if (!canvas || phaseRef.current !== 'defend') return
    const rect = canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * W
    g.current.gkX = Math.max(GOAL.x0 + 12, Math.min(GOAL.x1 - 12, x))
    g.current.gkDiveX = g.current.gkX
  }

  function draw(ctx: CanvasRenderingContext2D) {
    const s = g.current
    ctx.clearRect(0, 0, W, H)
    // ピッチ
    ctx.fillStyle = '#15803d'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#16a34a'
    for (let i = 0; i < 5; i++) {
      if (i % 2 === 0) ctx.fillRect(0, i * 60, W, 60)
    }
    // ペナルティエリア
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 2
    ctx.strokeRect(40, 150, 280, 90)
    ctx.strokeRect(110, 150, 140, 40)
    ctx.beginPath()
    ctx.arc(SPOT.x, SPOT.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    // ゴール（ネット）
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(GOAL.x0, GOAL.y0, GOAL.x1 - GOAL.x0, GOAL.y1 - GOAL.y0)
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1
    for (let x = GOAL.x0 + 15; x < GOAL.x1; x += 15) {
      ctx.beginPath(); ctx.moveTo(x, GOAL.y0); ctx.lineTo(x, GOAL.y1); ctx.stroke()
    }
    for (let y = GOAL.y0 + 15; y < GOAL.y1; y += 15) {
      ctx.beginPath(); ctx.moveTo(GOAL.x0, y); ctx.lineTo(GOAL.x1, y); ctx.stroke()
    }
    // ゴール枠
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(GOAL.x0, GOAL.y1); ctx.lineTo(GOAL.x0, GOAL.y0)
    ctx.lineTo(GOAL.x1, GOAL.y0); ctx.lineTo(GOAL.x1, GOAL.y1)
    ctx.stroke()

    // GK（ダイブ中は体を傾ける）
    const dive = s.gkDiveT
    const lean = (s.gkDiveX - W / 2) * 0.35 * dive
    const gkX = s.gkX + (s.gkDiveX - s.gkX) * dive
    const feetY = GOAL.y1 - 4
    ctx.save()
    ctx.translate(gkX, feetY)
    ctx.rotate(lean * 0.008)
    // 体
    ctx.fillStyle = '#facc15'
    ctx.beginPath()
    ctx.roundRect(-11, -34, 22, 30, 6)
    ctx.fill()
    // 頭
    ctx.fillStyle = '#fcd9b8'
    ctx.beginPath()
    ctx.arc(0, -42, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1f2937'
    ctx.beginPath()
    ctx.arc(0, -46, 9, Math.PI, Math.PI * 2)
    ctx.fill()
    // 腕（グローブ）
    ctx.fillStyle = '#facc15'
    ctx.beginPath()
    ctx.arc(-16, -30, 6, 0, Math.PI * 2)
    ctx.arc(16, -30, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // ボール
    if (s.flying) {
      const p = Math.min(1, (s.t - s.ballStart) / 14)
      s.ballX = s.ballFromX + (s.ballToX - s.ballFromX) * p
      s.ballY = s.ballFromY + (s.ballToY - s.ballFromY) * p
    }
    const r = 9 - Math.max(0, (GOAL.y1 - s.ballY) / 120) * 3
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(s.ballX, s.ballY, Math.max(5, r), 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#1f2937'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = '#1f2937'
    ctx.beginPath()
    ctx.arc(s.ballX, s.ballY, Math.max(2, r * 0.35), 0, Math.PI * 2)
    ctx.fill()

    // 照準（キック待機中）
    if (phaseRef.current === 'kick' && turnRef.current === 'idle') {
      const a = aimPos()
      ctx.strokeStyle = '#dc2626'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(a.x, a.y, 12, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(a.x - 18, a.y); ctx.lineTo(a.x - 6, a.y)
      ctx.moveTo(a.x + 6, a.y); ctx.lineTo(a.x + 18, a.y)
      ctx.moveTo(a.x, a.y - 18); ctx.lineTo(a.x, a.y - 6)
      ctx.moveTo(a.x, a.y + 6); ctx.lineTo(a.x, a.y + 18)
      ctx.stroke()
    }
    // 予告マーカー（ディフェンス）
    if (s.showTarget) {
      const blink = Math.floor(s.t / 6) % 2 === 0
      if (blink) {
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(s.targetX, s.targetY, 14, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = '#ef4444'
        ctx.font = 'bold 16px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('!', s.targetX, s.targetY - 20)
      }
    }
    // シュート結果のフラッシュ
    if (s.flash > 0) {
      ctx.fillStyle = result === 'goal'
        ? `rgba(250, 204, 21, ${s.flash / 10 * 0.3})`
        : `rgba(59, 130, 246, ${s.flash / 10 * 0.3})`
      ctx.fillRect(GOAL.x0, GOAL.y0, GOAL.x1 - GOAL.x0, GOAL.y1 - GOAL.y0)
    }
  }

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const s = g.current
        s.t += 1
        s.aimT += 1
        if (s.flash > 0) s.flash -= 1
        // GKダイブのアニメーション
        if (s.gkDiveT < 1 && (phaseRef.current === 'kick' ? turnRef.current !== 'idle' : false)) {
          s.gkDiveT = Math.min(1, s.gkDiveT + 0.08)
        }
        if (phaseRef.current === 'defend') {
          s.gkDiveT = 1
          s.gkX += (s.gkDiveX - s.gkX) * 0.2
        }
        draw(ctx)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === ' ') e.preventDefault()
    if (e.key === ' ' && phaseRef.current === 'title') { startGame(); return }
    if (e.key === ' ' && phaseRef.current === 'done') { startGame(); return }
    if (e.key === ' ' && phaseRef.current === 'kick') { shoot(); return }
    if (phaseRef.current === 'defend') {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        g.current.gkDiveX = Math.max(GOAL.x0 + 12, g.current.gkDiveX - 14)
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        g.current.gkDiveX = Math.min(GOAL.x1 - 12, g.current.gkDiveX + 14)
      }
    }
  }

  const phaseLabel = phase === 'kick' ? `キック ${kickNo}/${KICKS}本目`
    : phase === 'defend' ? `ディフェンス ${defNo}/${KICKS}本目`
    : phase === 'done' ? '試合終了' : 'タイトル'

  return (
    <div className="pk" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="pk-head">
        <span>{phaseLabel}</span>
        <span>得点 <b>{goals}</b></span>
        <span>失点 <b>{conceded}</b></span>
        <span>勝利 {wins}勝</span>
        <span>ベスト {best}点</span>
      </div>
      <canvas
        ref={canvasRef}
        className="pk-canvas"
        width={W}
        height={H}
        onPointerDown={(e) => {
          if (phaseRef.current === 'kick') shoot()
          else if (phaseRef.current === 'defend') moveGk(e.clientX)
        }}
        onPointerMove={(e) => {
          if (phaseRef.current === 'defend' && (e.buttons & 1) === 1) moveGk(e.clientX)
        }}
      />
      <p className="pk-msg">{message}</p>
      {phase === 'title' && (
        <div className="pk-btns">
          <button onClick={startGame}>スタート</button>
        </div>
      )}
      {phase === 'done' && (
        <div className="pk-btns">
          <button onClick={startGame}>もう一度</button>
          <button onClick={() => setPhase('title')}>タイトルへ</button>
        </div>
      )}
      <p className="pk-help">キック：動く照準のタイミングでクリック／タップ／Space。隅を狙うほどGKに止められにくいよ。ディフェンス：赤い「!」マーカーが出たら、ドラッグか←→キーでGKを動かしてシュートコースをふさごう。5本ずつ蹴り合って得点を競うよ。</p>
    </div>
  )
}
