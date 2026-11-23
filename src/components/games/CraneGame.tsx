import { useEffect, useRef, useState } from 'react'

/* ================= クレーンゲーム =================
 * UFOキャッチャー風のクレーンゲーム。アームを左右に動かして
 * ぬいぐるみの真上で下ろし、つかんで左の取り出し口まで運ぶ。
 * ・景品は8個。レアなものほど重くてつかみにくいが高得点
 * ・つかめるかはアームの真上からのズレと景品の重さで決まる
 * ・1ゲーム5回プレイ。取った景品の合計点で競う
 * ・ベストスコアを保存 */

const W = 360, H = 420
const FLOOR_Y = 356
const TOP_Y = 46
const CHUTE_X = 52
const CLAW_MIN_X = 96
const CLAW_MAX_X = 336
const PLAYS = 5
const BEST_KEY = 'webx-crane-best'

type PrizeKind = { emoji: string; label: string; pts: number; weight: number }
const KINDS: PrizeKind[] = [
  { emoji: '🧸', label: 'くま', pts: 10, weight: 1 },
  { emoji: '🐰', label: 'うさぎ', pts: 10, weight: 1 },
  { emoji: '🐱', label: 'ねこ', pts: 20, weight: 2 },
  { emoji: '🐶', label: 'いぬ', pts: 20, weight: 2 },
  { emoji: '🐼', label: 'パンダ', pts: 30, weight: 2 },
  { emoji: '🦊', label: 'きつね', pts: 30, weight: 3 },
  { emoji: '🐸', label: 'かえる', pts: 50, weight: 3 },
  { emoji: '👑', label: '金の王冠', pts: 100, weight: 4 },
]

type Prize = PrizeKind & { x: number; taken: boolean; wobble: number }
type ClawPhase = 'move' | 'drop' | 'lift' | 'carry' | 'release' | 'return'
type Phase = 'title' | 'playing' | 'done'
type Popup = { x: number; y: number; text: string; life: number }

type GState = {
  t: number
  clawX: number
  clawY: number
  clawOpen: number // 0=閉じている 1=開いている
  phase: ClawPhase
  held: Prize | null
  prizes: Prize[]
  popups: Popup[]
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

function freshPrizes(): Prize[] {
  const xs = [116, 152, 188, 224, 260, 296, 322, 138]
  const order = [...KINDS].sort(() => Math.random() - 0.5)
  return order.map((k, i) => ({
    ...k,
    x: xs[i] + Math.floor(Math.random() * 10) - 5,
    taken: false,
    wobble: 0,
  }))
}

export default function CraneGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const g = useRef<GState>({
    t: 0,
    clawX: 200,
    clawY: TOP_Y,
    clawOpen: 1,
    phase: 'move',
    held: null,
    prizes: freshPrizes(),
    popups: [],
  })
  const [phase, setPhase] = useState<Phase>('title')
  const [playsLeft, setPlaysLeft] = useState(PLAYS)
  const [score, setScore] = useState(0)
  const [got, setGot] = useState<PrizeKind[]>([])
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0 } catch { return 0 }
  })
  const [message, setMessage] = useState('アームを動かして景品の真上で下ろそう！')
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const playsRef = useRef(playsLeft)
  playsRef.current = playsLeft
  const scoreRef = useRef(score)
  scoreRef.current = score
  const gotRef = useRef(got)
  gotRef.current = got

  function startGame() {
    g.current.prizes = freshPrizes()
    g.current.clawX = 200
    g.current.clawY = TOP_Y
    g.current.clawOpen = 1
    g.current.phase = 'move'
    g.current.held = null
    g.current.popups = []
    setPlaysLeft(PLAYS)
    setScore(0)
    setGot([])
    setMessage('←→キーやドラッグでアームを動かしてね')
    setPhase('playing')
    beep(660, 0.1, 0.06)
  }

  function endGame(total: number, taken: PrizeKind[]) {
    setPhase('done')
    if (total > best) {
      setBest(total)
      try { localStorage.setItem(BEST_KEY, String(total)) } catch { /* 保存できなくても遊べる */ }
      setMessage(`終了！ ${total}点（${taken.length}個ゲット）でベスト更新！`)
      ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, 0.06), i * 110))
    } else {
      setMessage(`終了！ ${total}点（${taken.length}個ゲット、ベスト ${best}点）`)
      ;[392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.2, 0.06), i * 130))
    }
  }

  /** 1プレイの終了処理。次へ進むかゲームを終える */
  function finishPlay() {
    const left = playsRef.current - 1
    setPlaysLeft(left)
    g.current.phase = 'return'
    if (left <= 0) {
      setTimeout(() => endGame(scoreRef.current, gotRef.current), 900)
    } else {
      setMessage(`残り${left}回。次の景品を狙おう！`)
    }
  }

  function dropClaw() {
    const s = g.current
    if (phaseRef.current !== 'playing' || s.phase !== 'move') return
    s.phase = 'drop'
    s.clawOpen = 1
    beep(440, 0.08, 0.05)
  }

  /** アームが床まで下りたときのつかみ判定 */
  function tryGrab() {
    const s = g.current
    const near = s.prizes
      .filter((p) => !p.taken)
      .map((p) => ({ p, dx: Math.abs(p.x - s.clawX) }))
      .filter(({ dx }) => dx < 34)
      .sort((a, b) => a.dx - b.dx)[0]
    if (!near) {
      s.clawOpen = 0
      setMessage('すかっ… 何もなかった！')
      beep(180, 0.15, 0.05)
      s.phase = 'lift'
      return
    }
    const { p, dx } = near
    // 真上ほど成功しやすく、重い景品ほどつかみにくい
    const chance = Math.max(0.12, 1 - dx / 34) * (1 - p.weight * 0.1)
    if (Math.random() < chance) {
      s.held = p
      s.clawOpen = 0
      setMessage(`${p.emoji} ${p.label}をつかんだ！ 取り出し口へ運ぼう`)
      beep(784, 0.1, 0.06)
      setTimeout(() => beep(988, 0.12, 0.06), 90)
    } else {
      p.wobble = 14
      s.clawOpen = 0
      setMessage(`${p.emoji} ${p.label}は重くてすべり落ちた…`)
      beep(220, 0.15, 0.05)
    }
    s.phase = 'lift'
  }

  /** クレーンの状態遷移ステップ */
  function stepClaw() {
    const s = g.current
    if (phaseRef.current !== 'playing') return
    if (s.phase === 'drop') {
      s.clawY += 4.5
      if (s.clawY >= FLOOR_Y - 26) {
        s.clawY = FLOOR_Y - 26
        tryGrab()
      }
    } else if (s.phase === 'lift') {
      s.clawY -= 3.5
      if (s.held) {
        // 持ち上げ中に重い景品はたまに落とす
        if (s.clawY < 220 && Math.random() < s.held.weight * 0.0012) {
          const p = s.held
          p.wobble = 12
          s.held = null
          s.clawOpen = 1
          setMessage(`${p.emoji} ${p.label}を落としてしまった…`)
          beep(200, 0.2, 0.06)
        }
      }
      if (s.clawY <= TOP_Y) {
        s.clawY = TOP_Y
        s.phase = s.held ? 'carry' : 'return'
        if (!s.held) finishPlay()
      }
    } else if (s.phase === 'carry') {
      s.clawX -= 3
      if (s.clawX <= CHUTE_X) {
        s.clawX = CHUTE_X
        s.phase = 'release'
      }
    } else if (s.phase === 'release') {
      const p = s.held
      if (p) {
        p.taken = true
        const total = scoreRef.current + p.pts
        setScore(total)
        setGot([...gotRef.current, p])
        s.popups.push({ x: CHUTE_X, y: 300, text: `+${p.pts}点 ゲット！`, life: 60 })
        setMessage(`${p.emoji} ${p.label}（${p.pts}点）ゲット！`)
        beep(1046, 0.12, 0.07)
        setTimeout(() => beep(1318, 0.2, 0.07), 100)
      }
      s.held = null
      s.clawOpen = 1
      s.phase = 'return'
    } else if (s.phase === 'return') {
      s.clawX += 3.5
      if (s.clawX >= 200) {
        s.clawX = 200
        if (playsRef.current > 0) {
          s.phase = 'move'
        } else {
          s.phase = 'move'
        }
      }
    }
  }

  function draw(ctx: CanvasRenderingContext2D) {
    const s = g.current
    ctx.clearRect(0, 0, W, H)
    // 筐体の外枠
    ctx.fillStyle = '#f472b6'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#be185d'
    ctx.fillRect(0, 0, W, 10)
    ctx.fillRect(0, H - 26, W, 26)
    // ガラスケース
    ctx.fillStyle = '#e0f2fe'
    ctx.fillRect(14, 14, W - 28, FLOOR_Y - 14)
    // ガラスの光沢
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    ctx.moveTo(60, 14)
    ctx.lineTo(110, 14)
    ctx.lineTo(50, FLOOR_Y)
    ctx.lineTo(20, FLOOR_Y)
    ctx.closePath()
    ctx.fill()
    // 床
    ctx.fillStyle = '#fbcfe8'
    ctx.fillRect(14, FLOOR_Y, W - 28, 14)
    // 取り出し口（左下の穴）
    ctx.fillStyle = '#831843'
    ctx.fillRect(20, FLOOR_Y - 44, 66, 44)
    ctx.fillStyle = '#f9a8d4'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('GET!', 53, FLOOR_Y - 50)
    ctx.fillStyle = '#fbcfe8'
    ctx.fillRect(20, FLOOR_Y - 2, 66, 2)
    // 景品
    ctx.font = '30px sans-serif'
    ctx.textAlign = 'center'
    for (const p of s.prizes) {
      if (p.taken) continue
      const wob = p.wobble > 0 ? Math.sin(s.t * 0.9) * (p.wobble / 3) : 0
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      ctx.beginPath()
      ctx.ellipse(p.x, FLOOR_Y + 2, 16, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillText(p.emoji, p.x + wob, FLOOR_Y - 6)
    }
    // アームのワイヤー
    ctx.strokeStyle = '#475569'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(s.clawX, 14)
    ctx.lineTo(s.clawX, s.clawY)
    ctx.stroke()
    // クレーン本体
    ctx.fillStyle = '#f59e0b'
    ctx.fillRect(s.clawX - 16, s.clawY - 8, 32, 16)
    ctx.fillStyle = '#92400e'
    ctx.font = 'bold 10px sans-serif'
    ctx.fillText('UFO', s.clawX, s.clawY + 3)
    // 3本のツメ（開き具合で広がる）
    const spread = 4 + s.clawOpen * 10
    ctx.strokeStyle = '#64748b'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    for (const dir of [-1, 0, 1]) {
      ctx.beginPath()
      ctx.moveTo(s.clawX + dir * 8, s.clawY + 8)
      ctx.lineTo(s.clawX + dir * spread, s.clawY + 30)
      ctx.stroke()
    }
    // つかんでいる景品
    if (s.held) {
      ctx.font = '30px sans-serif'
      ctx.fillText(s.held.emoji, s.clawX, s.clawY + 44)
    }
    // ポップアップ
    ctx.font = 'bold 18px sans-serif'
    for (const p of s.popups) {
      ctx.fillStyle = `rgba(190, 18, 93, ${Math.min(1, p.life / 30)})`
      ctx.fillText(p.text, p.x, p.y - (60 - p.life) * 0.5)
    }
    // 下部の操作パネル帯
    ctx.fillStyle = '#be185d'
    ctx.fillRect(0, H - 26, W, 26)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText('← → で移動 ／ Space でアームを下ろす', W / 2, H - 8)
  }

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        g.current.t += 1
        g.current.popups = g.current.popups.filter((p) => {
          p.life -= 1
          return p.life > 0
        })
        for (const p of g.current.prizes) if (p.wobble > 0) p.wobble -= 0.5
        stepClaw()
        draw(ctx)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function canvasPos(e: React.PointerEvent<HTMLCanvasElement>): { x: number } {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * W }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (phaseRef.current !== 'playing') return
    const p = canvasPos(e)
    g.current.clawX = Math.max(CLAW_MIN_X, Math.min(CLAW_MAX_X, p.x))
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (phaseRef.current !== 'playing') return
    if (e.buttons === 0) return
    const p = canvasPos(e)
    g.current.clawX = Math.max(CLAW_MIN_X, Math.min(CLAW_MAX_X, p.x))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const s = g.current
    if (e.key === ' ') e.preventDefault()
    if (e.key === ' ' && phaseRef.current === 'title') { startGame(); return }
    if (e.key === ' ' && phaseRef.current === 'done') { startGame(); return }
    if (phaseRef.current !== 'playing' || s.phase !== 'move') return
    if (e.key === 'ArrowLeft') { s.clawX = Math.max(CLAW_MIN_X, s.clawX - 10); beep(700, 0.03, 0.02) }
    if (e.key === 'ArrowRight') { s.clawX = Math.min(CLAW_MAX_X, s.clawX + 10); beep(700, 0.03, 0.02) }
    if (e.key === ' ') dropClaw()
  }

  const canDrop = phase === 'playing'

  return (
    <div className="crane" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="crane-head">
        <span>残り {playsLeft}回</span>
        <span>スコア <b>{score}</b>点</span>
        <span>ゲット {got.length}個</span>
        <span>ベスト {best}点</span>
      </div>
      <canvas
        ref={canvasRef}
        className="crane-canvas"
        width={W}
        height={H}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      />
      <p className="crane-msg">{message}</p>
      {got.length > 0 && (
        <p className="crane-got">ゲットした景品：{got.map((p) => p.emoji).join(' ')}</p>
      )}
      <div className="crane-btns">
        {phase === 'playing' && (
          <button onClick={dropClaw} disabled={!canDrop}>🕹️ アームを下ろす</button>
        )}
        {phase === 'title' && <button onClick={startGame}>スタート</button>}
        {phase === 'done' && (
          <>
            <button onClick={startGame}>もう一度</button>
            <button onClick={() => setPhase('title')}>タイトルへ</button>
          </>
        )}
      </div>
      <p className="crane-help">アームを左右に動かして景品の真上で下ろそう。真上ほどつかみやすいよ。重い景品（👑金の王冠など）は高得点だけどすべりやすいよ。つかんだら左の取り出し口まで自動で運ぶよ。1ゲーム5回勝負！</p>
    </div>
  )
}
