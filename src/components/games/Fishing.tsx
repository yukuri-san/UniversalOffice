import { useEffect, useRef, useState } from 'react'

/* ================= 釣りゲーム =================
 * 制限時間60秒でできるだけたくさん魚を釣るゲーム。
 * ・魚は深いほど大きくて高得点（小魚10点／中魚30点／大魚50点／金の魚100点）
 * ・←→キーやドラッグでボートを動かし、Space／ボタンで糸を垂らす
 * ・フックが魚に触れると自動で巻き上げてキャッチ。底に着くと空振り
 * ・釣った魚の合計スコアとベストスコアを保存 */

const W = 360, H = 420
const SURFACE_Y = 78
const BOTTOM_Y = H - 14
const TIME_LIMIT = 60
const BEST_KEY = 'webx-fishing-best'

type FishKind = 'small' | 'medium' | 'large' | 'gold'
type Fish = { x: number; y: number; vx: number; kind: FishKind; wob: number }

const KINDS: Record<FishKind, { name: string; score: number; size: number; minY: number; maxY: number; minV: number; maxV: number; body: string; belly: string }> = {
  small: { name: '小魚', score: 10, size: 22, minY: 100, maxY: 200, minV: 0.6, maxV: 1.3, body: '#f59e0b', belly: '#fde68a' },
  medium: { name: '中魚', score: 30, size: 34, minY: 190, maxY: 300, minV: 0.8, maxV: 1.6, body: '#3b82f6', belly: '#bfdbfe' },
  large: { name: '大魚', score: 50, size: 48, minY: 280, maxY: 390, minV: 0.5, maxV: 1.0, body: '#ef4444', belly: '#fecaca' },
  gold: { name: '金の魚', score: 100, size: 30, minY: 300, maxY: 395, minV: 1.8, maxV: 2.5, body: '#eab308', belly: '#fef08a' },
}

function pickKind(): FishKind {
  const r = Math.random()
  if (r < 0.45) return 'small'
  if (r < 0.75) return 'medium'
  if (r < 0.93) return 'large'
  return 'gold'
}

function spawnFish(fromLeft?: boolean): Fish {
  const kind = pickKind()
  const k = KINDS[kind]
  const dir = fromLeft ?? Math.random() < 0.5
  const speed = k.minV + Math.random() * (k.maxV - k.minV)
  return {
    x: dir ? -k.size : W + k.size,
    y: k.minY + Math.random() * (k.maxY - k.minY),
    vx: dir ? speed : -speed,
    kind,
    wob: Math.random() * Math.PI * 2,
  }
}

function beep(freq: number, dur = 0.08, vol = 0.05, type: OscillatorType = 'sine') {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = freq
    o.type = type
    g.gain.value = vol
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + dur)
    o.onended = () => void ctx.close()
  } catch { /* 音が出なくても遊べる */ }
}

type Phase = 'title' | 'playing' | 'done'
type LineState = 'idle' | 'sink' | 'reel' | 'reelEmpty'

type GState = {
  t: number
  fish: Fish[]
  boatX: number
  boatTarget: number
  line: LineState
  hookX: number
  hookY: number
  hooked: Fish | null
  spawnIn: number
  splash: number
  timeLeft: number
  lastTs: number
  bubbles: { x: number; y: number; r: number; v: number }[]
  timeUp: boolean
}

function freshState(): GState {
  return {
    t: 0,
    fish: Array.from({ length: 8 }, () => spawnFish()),
    boatX: W / 2,
    boatTarget: W / 2,
    line: 'idle',
    hookX: W / 2,
    hookY: SURFACE_Y,
    hooked: null,
    spawnIn: 0,
    splash: 0,
    timeLeft: TIME_LIMIT,
    lastTs: 0,
    bubbles: [],
    timeUp: false,
  }
}

export default function Fishing() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const g = useRef<GState>(freshState())
  const [phase, setPhase] = useState<Phase>('title')
  const [score, setScore] = useState(0)
  const [caught, setCaught] = useState(0)
  const [caughtList, setCaughtList] = useState<string[]>([])
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT)
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0 } catch { return 0 }
  })
  const [message, setMessage] = useState('ボートを動かして、魚のいるところで糸を垂らそう！')
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const scoreRef = useRef(score)
  scoreRef.current = score
  const caughtRef = useRef(caught)
  caughtRef.current = caught
  const caughtListRef = useRef(caughtList)
  caughtListRef.current = caughtList
  const bestRef = useRef(best)
  bestRef.current = best

  function startGame() {
    g.current = freshState()
    setScore(0)
    setCaught(0)
    setCaughtList([])
    setTimeLeft(TIME_LIMIT)
    setMessage('スタート！ 60秒でたくさん釣ろう')
    setPhase('playing')
    beep(660, 0.12, 0.06)
  }

  function endGame(total: number, count: number) {
    setPhase('done')
    if (total > bestRef.current) {
      setBest(total)
      try { localStorage.setItem(BEST_KEY, String(total)) } catch { /* 保存できなくても遊べる */ }
      setMessage(`終了！ ${count}匹・合計 ${total}点でベスト更新！`)
      ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, 0.06), i * 110))
    } else {
      setMessage(`終了！ ${count}匹・合計 ${total}点（ベスト ${bestRef.current}点）。もう一度挑戦しよう`)
      ;[392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.2, 0.06), i * 130))
    }
  }

  function cast() {
    const s = g.current
    if (phaseRef.current !== 'playing' || s.line !== 'idle') return
    s.line = 'sink'
    s.hookX = s.boatX
    s.hookY = SURFACE_Y + 4
    s.splash = 12
    beep(300, 0.15, 0.05, 'triangle')
    setTimeout(() => beep(180, 0.1, 0.04, 'triangle'), 90)
  }

  function moveBoatTo(clientX: number) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * W
    g.current.boatTarget = Math.max(24, Math.min(W - 24, x))
  }

  function draw(ctx: CanvasRenderingContext2D) {
    const s = g.current
    // 空
    const sky = ctx.createLinearGradient(0, 0, 0, SURFACE_Y)
    sky.addColorStop(0, '#bae6fd')
    sky.addColorStop(1, '#e0f2fe')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, SURFACE_Y)
    // 太陽
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath()
    ctx.arc(316, 26, 18, 0, Math.PI * 2)
    ctx.fill()
    // 雲
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    for (let i = 0; i < 2; i++) {
      const cx = ((s.t * 0.15 + i * 190) % (W + 80)) - 40
      const cy = 18 + i * 22
      ctx.beginPath()
      ctx.arc(cx, cy, 12, 0, Math.PI * 2)
      ctx.arc(cx + 14, cy + 3, 10, 0, Math.PI * 2)
      ctx.arc(cx - 14, cy + 4, 9, 0, Math.PI * 2)
      ctx.fill()
    }
    // 水（深くなるほど濃く）
    const water = ctx.createLinearGradient(0, SURFACE_Y, 0, H)
    water.addColorStop(0, '#38bdf8')
    water.addColorStop(0.5, '#0284c7')
    water.addColorStop(1, '#0c4a6e')
    ctx.fillStyle = water
    ctx.fillRect(0, SURFACE_Y, W, H - SURFACE_Y)
    // 水面の波
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 2
    for (let i = 0; i < 4; i++) {
      const wx = ((s.t * 0.4 + i * 95) % (W + 40)) - 20
      ctx.beginPath()
      ctx.moveTo(wx, SURFACE_Y + 4)
      ctx.quadraticCurveTo(wx + 10, SURFACE_Y - 2, wx + 20, SURFACE_Y + 4)
      ctx.stroke()
    }
    // 水底の水草
    ctx.strokeStyle = '#15803d'
    ctx.lineWidth = 3
    for (let i = 0; i < 6; i++) {
      const gx = 20 + i * 66
      const sway = Math.sin(s.t * 0.03 + i * 1.7) * 6
      ctx.beginPath()
      ctx.moveTo(gx, H)
      ctx.quadraticCurveTo(gx + sway, H - 26, gx + sway * 2, H - 44 - (i % 3) * 8)
      ctx.stroke()
    }
    // 泡
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    for (const b of s.bubbles) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      ctx.fill()
    }
    // 魚
    for (const f of s.fish) {
      const k = KINDS[f.kind]
      const dir = f.vx >= 0 ? 1 : -1
      const wiggle = Math.sin(s.t * 0.15 + f.wob) * 2
      const fy = f.y + wiggle
      const size = k.size
      // 尾
      ctx.fillStyle = k.body
      ctx.beginPath()
      ctx.moveTo(f.x - dir * size * 0.45, fy)
      ctx.lineTo(f.x - dir * size * 0.85, fy - size * 0.28)
      ctx.lineTo(f.x - dir * size * 0.85, fy + size * 0.28)
      ctx.closePath()
      ctx.fill()
      // 体
      ctx.beginPath()
      ctx.ellipse(f.x, fy, size * 0.5, size * 0.28, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = k.belly
      ctx.beginPath()
      ctx.ellipse(f.x, fy + size * 0.1, size * 0.36, size * 0.16, 0, 0, Math.PI * 2)
      ctx.fill()
      // 目
      ctx.fillStyle = '#0f172a'
      ctx.beginPath()
      ctx.arc(f.x + dir * size * 0.28, fy - size * 0.06, 2.2, 0, Math.PI * 2)
      ctx.fill()
      // 金の魚はキラキラ
      if (f.kind === 'gold') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        const tw = Math.sin(s.t * 0.3) > 0 ? 1 : 0.4
        ctx.globalAlpha = tw
        ctx.beginPath()
        ctx.arc(f.x - dir * size * 0.1, fy - size * 0.3, 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }
    // 釣り上げ中の魚（フックに付いている）
    if (s.hooked) {
      const f = s.hooked
      const k = KINDS[f.kind]
      const dir = f.vx >= 0 ? 1 : -1
      const wig = Math.sin(s.t * 0.5) * 5
      ctx.fillStyle = k.body
      ctx.beginPath()
      ctx.ellipse(s.hookX + wig, s.hookY + 8, k.size * 0.5, k.size * 0.28, 0.3 * dir, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#0f172a'
      ctx.beginPath()
      ctx.arc(s.hookX + wig + dir * k.size * 0.28, s.hookY + 6, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    // ボートと釣り人
    const bx = s.boatX
    const bob = Math.sin(s.t * 0.06) * 1.5
    ctx.fillStyle = '#92400e'
    ctx.beginPath()
    ctx.moveTo(bx - 34, SURFACE_Y + bob)
    ctx.lineTo(bx + 34, SURFACE_Y + bob)
    ctx.lineTo(bx + 26, SURFACE_Y + 12 + bob)
    ctx.lineTo(bx - 26, SURFACE_Y + 12 + bob)
    ctx.closePath()
    ctx.fill()
    // 釣り人
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath()
    ctx.arc(bx - 4, SURFACE_Y - 16 + bob, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#16a34a'
    ctx.fillRect(bx - 11, SURFACE_Y - 10 + bob, 14, 12)
    // 竿
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(bx + 4, SURFACE_Y - 6 + bob)
    ctx.lineTo(bx + 26, SURFACE_Y - 34 + bob)
    ctx.stroke()
    // 糸とフック
    if (s.line !== 'idle') {
      const rodTipX = bx + 26
      const rodTipY = SURFACE_Y - 34 + bob
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(rodTipX, rodTipY)
      ctx.lineTo(s.hookX, s.hookY)
      ctx.stroke()
      // フック
      ctx.strokeStyle = '#e5e7eb'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(s.hookX, s.hookY + 3, 4, 0.3, Math.PI * 0.9)
      ctx.stroke()
    }
    // 水しぶき
    if (s.splash > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${s.splash / 12 * 0.8})`
      ctx.lineWidth = 2
      for (let i = 0; i < 3; i++) {
        const sx = s.hookX - 10 + i * 10
        ctx.beginPath()
        ctx.moveTo(sx, SURFACE_Y)
        ctx.lineTo(sx, SURFACE_Y - 6 - (12 - s.splash))
        ctx.stroke()
      }
    }
  }

  function tick(dt: number) {
    const s = g.current
    s.t += 1
    if (s.splash > 0) s.splash -= 1
    // ボートは目標位置へなめらかに移動
    s.boatX += (s.boatTarget - s.boatX) * 0.12
    // 魚を泳がせる
    for (const f of s.fish) {
      f.x += f.vx
      const k = KINDS[f.kind]
      if (f.vx > 0 && f.x - k.size > W + 10) { f.x = -k.size; f.y = k.minY + Math.random() * (k.maxY - k.minY) }
      if (f.vx < 0 && f.x + k.size < -10) { f.x = W + k.size; f.y = k.minY + Math.random() * (k.maxY - k.minY) }
    }
    // 泡
    if (Math.random() < 0.1 && s.bubbles.length < 12) {
      s.bubbles.push({ x: 20 + Math.random() * (W - 40), y: H - 20, r: 1 + Math.random() * 2, v: 0.4 + Math.random() * 0.6 })
    }
    for (const b of s.bubbles) b.y -= b.v
    s.bubbles = s.bubbles.filter((b) => b.y > SURFACE_Y + 4)
    // 釣れた魚の補充
    if (s.spawnIn > 0) {
      s.spawnIn -= 1
      if (s.spawnIn === 0) s.fish.push(spawnFish())
    }
    if (phaseRef.current !== 'playing') return
    // 制限時間
    s.timeLeft -= dt
    if (s.timeLeft <= 0) {
      s.timeLeft = 0
      s.timeUp = true
    }
    setTimeLeft(Math.ceil(s.timeLeft))
    // 糸の動き
    if (s.line === 'sink') {
      s.hookY += 2.4
      // 魚に触れたか
      for (let i = 0; i < s.fish.length; i++) {
        const f = s.fish[i]
        const k = KINDS[f.kind]
        if (Math.abs(s.hookY - f.y) < 12 && Math.abs(s.hookX - f.x) < k.size / 2 + 5) {
          s.fish.splice(i, 1)
          s.hooked = f
          s.line = 'reel'
          s.spawnIn = 45
          beep(880, 0.15, 0.07)
          setMessage(`ヒット！ ${k.name}がかかった！`)
          break
        }
      }
      if (s.line === 'sink' && s.hookY >= BOTTOM_Y) {
        s.line = 'reelEmpty'
        setMessage('底に着いちゃった… 空振り！')
        beep(220, 0.15, 0.05)
      }
    } else if (s.line === 'reel') {
      s.hookY -= 3.2
      if (s.hookY <= SURFACE_Y + 2) {
        const f = s.hooked
        s.hooked = null
        s.line = 'idle'
        if (f) {
          const k = KINDS[f.kind]
          const total = scoreRef.current + k.score
          const count = caughtRef.current + 1
          setScore(total)
          setCaught(count)
          setCaughtList([...caughtListRef.current, k.name])
          setMessage(`${k.name}を釣った！ +${k.score}点`)
          beep(1046, 0.18, 0.07)
          setTimeout(() => beep(1318, 0.15, 0.06), 100)
          if (s.timeUp) endGame(total, count)
        }
      }
    } else if (s.line === 'reelEmpty') {
      s.hookY -= 3.2
      if (s.hookY <= SURFACE_Y + 2) {
        s.line = 'idle'
        if (s.timeUp) endGame(scoreRef.current, caughtRef.current)
      }
    }
    // 時間切れ（糸が出ていないときは即終了）
    if (s.timeUp && s.line === 'idle') {
      endGame(scoreRef.current, caughtRef.current)
    }
  }

  useEffect(() => {
    let raf = 0
    const loop = (ts: number) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const s = g.current
        const dt = s.lastTs ? Math.min((ts - s.lastTs) / 1000, 0.1) : 0.016
        s.lastTs = ts
        tick(dt)
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
    if (e.key === 'ArrowLeft') {
      g.current.boatTarget = Math.max(24, g.current.boatTarget - 18)
    } else if (e.key === 'ArrowRight') {
      g.current.boatTarget = Math.min(W - 24, g.current.boatTarget + 18)
    } else if (e.key === ' ') {
      cast()
    }
  }

  const lastCaught = caughtList.slice(-6)

  return (
    <div className="fishing" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="fishing-head">
        <span>残り <b>{timeLeft}</b>秒</span>
        <span>スコア <b>{score}</b>点</span>
        <span>釣った魚 {caught}匹</span>
        <span>ベスト {best}点</span>
      </div>
      <canvas
        ref={canvasRef}
        className="fishing-canvas"
        width={W}
        height={H}
        onPointerDown={(e) => { moveBoatTo(e.clientX); (e.target as HTMLElement).setPointerCapture?.(e.pointerId) }}
        onPointerMove={(e) => { if (e.buttons > 0) moveBoatTo(e.clientX) }}
      />
      <p className="fishing-msg">{message}</p>
      {phase === 'playing' && (
        <div className="fishing-btns">
          <button onClick={cast}>🎣 糸を垂らす</button>
        </div>
      )}
      {lastCaught.length > 0 && (
        <p className="fishing-caught">釣った魚：{lastCaught.join('・')}</p>
      )}
      {phase === 'title' && (
        <div className="fishing-btns">
          <button onClick={startGame}>スタート</button>
        </div>
      )}
      {phase === 'done' && (
        <div className="fishing-btns">
          <button onClick={startGame}>もう一度</button>
          <button onClick={() => setPhase('title')}>タイトルへ</button>
        </div>
      )}
      <p className="fishing-help">←→キーやドラッグでボートを動かし、魚の真上で「糸を垂らす」ボタンやSpaceキーで釣ろう。深いほど大きな魚（小魚10点／中魚30点／大魚50点／金の魚100点）。制限時間は60秒だよ。</p>
    </div>
  )
}
