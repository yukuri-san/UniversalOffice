import { useEffect, useRef, useState } from 'react'

/* ================= ダーツ =================
 * 的の中心を狙ってダーツを投げるゲーム。
 * ・照準がくるくる動く。タイミングよくクリック／タップ／Spaceで投げる
 * ・中心に近いほど高得点（ブル 50点／インナー 25点／10点／5点／1点）
 * ・1ラウンド3投 × 全5ラウンド（計15投）。ラウンドが進むほど照準が速くなる
 * ・合計スコアとベストスコアを保存 */

const W = 360, H = 360
const CX = W / 2, CY = H / 2
const ROUNDS = 5
const THROWS_PER_ROUND = 3
const BEST_KEY = 'webx-darts-best'

// 的のリング（中心からの距離 → 得点）
const RINGS: { r: number; score: number; color: string }[] = [
  { r: 12, score: 50, color: '#dc2626' },
  { r: 30, score: 25, color: '#16a34a' },
  { r: 62, score: 10, color: '#f8fafc' },
  { r: 92, score: 5, color: '#0f172a' },
  { r: 122, score: 1, color: '#f8fafc' },
]
const BOARD_R = 130

function scoreFor(dist: number): number {
  for (const ring of RINGS) if (dist <= ring.r) return ring.score
  return 0
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

type Phase = 'title' | 'playing' | 'done'
type Mark = { x: number; y: number; score: number }

type GState = {
  t: number
  marks: Mark[]
  flash: number
}

export default function Darts() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const g = useRef<GState>({ t: 0, marks: [], flash: 0 })
  const [phase, setPhase] = useState<Phase>('title')
  const [round, setRound] = useState(1)
  const [thrown, setThrown] = useState(0)
  const [score, setScore] = useState(0)
  const [lastScore, setLastScore] = useState<number | null>(null)
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0 } catch { return 0 }
  })
  const [message, setMessage] = useState('照準が動くよ。タイミングよく投げよう！')
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const roundRef = useRef(round)
  roundRef.current = round
  const thrownRef = useRef(thrown)
  thrownRef.current = thrown
  const scoreRef = useRef(score)
  scoreRef.current = score

  /** 現在の照準位置。ラウンドが進むほど速く動く */
  function aimPos(): { x: number; y: number } {
    const s = g.current
    const speed = 1 + (roundRef.current - 1) * 0.35
    const t = s.t * 0.03 * speed
    const rx = Math.sin(t * 1.7) * 105
    const ry = Math.sin(t * 2.3 + 1.2) * 105
    return { x: CX + rx, y: CY + ry }
  }

  function startGame() {
    g.current = { t: 0, marks: [], flash: 0 }
    setRound(1)
    setThrown(0)
    setScore(0)
    setLastScore(null)
    setMessage('第1ラウンド！ 3投してね')
    setPhase('playing')
  }

  function endGame(total: number) {
    setPhase('done')
    if (total > best) {
      setBest(total)
      try { localStorage.setItem(BEST_KEY, String(total)) } catch { /* 保存できなくても遊べる */ }
      setMessage(`終了！ 合計 ${total}点でベスト更新！`)
      ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, 0.06), i * 110))
    } else {
      setMessage(`終了！ 合計 ${total}点（ベスト ${best}点）。もう一度挑戦しよう`)
      ;[392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.2, 0.06), i * 130))
    }
  }

  function throwDart() {
    if (phaseRef.current !== 'playing') return
    const s = g.current
    const pos = aimPos()
    const dist = Math.hypot(pos.x - CX, pos.y - CY)
    const got = scoreFor(dist)
    const marks = [...s.marks, { x: pos.x, y: pos.y, score: got }]
    s.marks = marks
    s.flash = 10
    const total = scoreRef.current + got
    setScore(total)
    setLastScore(got)
    if (got >= 50) { beep(1046, 0.25, 0.08); setMessage('ブル！ 50点！ すごい！') }
    else if (got >= 25) { beep(880, 0.2, 0.07); setMessage(`インナーブル！ ${got}点！`) }
    else if (got > 0) { beep(660, 0.12, 0.06); setMessage(`${got}点！`) }
    else { beep(220, 0.2, 0.06); setMessage('はずれ… 次を狙おう') }

    const nextThrown = thrownRef.current + 1
    if (nextThrown >= THROWS_PER_ROUND) {
      if (roundRef.current >= ROUNDS) {
        endGame(total)
        return
      }
      // 次のラウンドへ。的のダーツを消して照準をリセット
      setRound(roundRef.current + 1)
      setThrown(0)
      setTimeout(() => {
        g.current.marks = []
        setMessage(`第${roundRef.current}ラウンド！ 照準が速くなったよ`)
      }, 900)
      setMessage(`ラウンド終了！ 合計 ${total}点`)
    } else {
      setThrown(nextThrown)
    }
  }

  function draw(ctx: CanvasRenderingContext2D) {
    const s = g.current
    ctx.clearRect(0, 0, W, H)
    // 的の台
    ctx.fillStyle = '#78350f'
    ctx.beginPath()
    ctx.arc(CX, CY, BOARD_R + 10, 0, Math.PI * 2)
    ctx.fill()
    // リング（外側から）
    for (let i = RINGS.length - 1; i >= 0; i--) {
      ctx.fillStyle = RINGS[i].color
      ctx.beginPath()
      ctx.arc(CX, CY, RINGS[i].r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    // 得点ラベル
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('50', CX, CY - 4)
    ctx.fillText('25', CX, CY + 44)
    ctx.fillText('10', CX, CY + 76)
    ctx.fillText('5', CX, CY + 106)
    ctx.fillText('1', CX, CY + 128)
    // 刺さったダーツ
    for (const m of s.marks) {
      ctx.strokeStyle = m.score >= 25 ? '#dc2626' : '#334155'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(m.x - 7, m.y - 7)
      ctx.lineTo(m.x + 7, m.y + 7)
      ctx.moveTo(m.x + 7, m.y - 7)
      ctx.lineTo(m.x - 7, m.y + 7)
      ctx.stroke()
      ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      ctx.arc(m.x, m.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    // 照準（プレイ中のみ）
    if (phaseRef.current === 'playing') {
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
      ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      ctx.arc(a.x, a.y, 2, 0, Math.PI * 2)
      ctx.fill()
    }
    // 投げた瞬間のフラッシュ
    if (s.flash > 0) {
      ctx.fillStyle = `rgba(250, 204, 21, ${s.flash / 10 * 0.35})`
      ctx.beginPath()
      ctx.arc(CX, CY, BOARD_R, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        g.current.t += 1
        if (g.current.flash > 0) g.current.flash -= 1
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
    if (e.key === ' ') throwDart()
  }

  const throwsLeft = THROWS_PER_ROUND - thrown

  return (
    <div className="darts" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="darts-head">
        <span>第{round}ラウンド</span>
        <span>残り {throwsLeft}投</span>
        <span>合計 <b>{score}</b>点</span>
        <span>ベスト {best}点</span>
        {lastScore !== null && <span>前回 {lastScore}点</span>}
      </div>
      <canvas
        ref={canvasRef}
        className="darts-canvas"
        width={W}
        height={H}
        onPointerDown={() => throwDart()}
      />
      <p className="darts-msg">{message}</p>
      {phase === 'title' && (
        <div className="darts-btns">
          <button onClick={startGame}>スタート</button>
        </div>
      )}
      {phase === 'done' && (
        <div className="darts-btns">
          <button onClick={startGame}>もう一度</button>
          <button onClick={() => setPhase('title')}>タイトルへ</button>
        </div>
      )}
      <p className="darts-help">照準がくるくる動くよ。中心に近いほど高得点。クリック／タップまたはSpaceキーでダーツを投げよう。全{ROUNDS}ラウンド（1ラウンド{THROWS_PER_ROUND}投）で合計点を競うよ。</p>
    </div>
  )
}
