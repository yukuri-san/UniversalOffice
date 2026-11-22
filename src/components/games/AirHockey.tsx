import { useEffect, useRef, useState } from 'react'

/* ================= エアホッケー =================
 * CPU と対戦するエアホッケー。先に7点取った方が勝ち。
 * ・自分のマレット（下・赤）をドラッグしてパックを弾く。マウス／タッチ対応
 * ・キーボード操作：←→↑↓（またはWASD）でマレットを動かす
 * ・中央のゴールを狙う。自分のゴールに入れられると失点
 * ・難易度は3段階。勝利で連勝が伸び、最多連勝を保存 */

const W = 360, H = 560
const GOAL_W = 120
const GOAL_X0 = (W - GOAL_W) / 2
const GOAL_X1 = (W + GOAL_W) / 2
const PUCK_R = 12
const MALLET_R = 22
const WIN_SCORE = 7
const BEST_KEY = 'webx-airhockey-best'

type Diff = 'easy' | 'normal' | 'hard'
const DIFFS: { id: Diff; label: string; cpuSpeed: number; cpuHit: number }[] = [
  { id: 'easy', label: 'やさしい', cpuSpeed: 3.0, cpuHit: 6 },
  { id: 'normal', label: 'ふつう', cpuSpeed: 4.1, cpuHit: 8 },
  { id: 'hard', label: 'つよい', cpuSpeed: 5.2, cpuHit: 10 },
]

type Phase = 'title' | 'playing' | 'goal' | 'done'

type Vec = { x: number; y: number; vx: number; vy: number }

type GState = {
  puck: Vec
  me: Vec
  cpu: Vec
  keys: Set<string>
  pointer: { active: boolean; x: number; y: number }
  goalT: number
  serveDir: number
  serveT: number
  flash: number // ゴール時のフラッシュ残りフレーム
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function freshState(): GState {
  return {
    puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    me: { x: W / 2, y: H - 90, vx: 0, vy: 0 },
    cpu: { x: W / 2, y: 90, vx: 0, vy: 0 },
    keys: new Set(),
    pointer: { active: false, x: W / 2, y: H - 90 },
    goalT: 0,
    serveDir: 1,
    serveT: 0,
    flash: 0,
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

function goalJingle(win: boolean) {
  if (win) [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, 0.06), i * 110))
  else [392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.2, 0.06), i * 130))
}

export default function AirHockey() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const g = useRef<GState>(freshState())
  const [phase, setPhase] = useState<Phase>('title')
  const [myScore, setMyScore] = useState(0)
  const [cpuScore, setCpuScore] = useState(0)
  const [diff, setDiff] = useState<Diff>('normal')
  const [streak, setStreak] = useState(0)
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0 } catch { return 0 }
  })
  const [message, setMessage] = useState('マレットをドラッグしてパックを弾こう')
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const diffRef = useRef(diff)
  diffRef.current = diff
  const scoreRef = useRef({ me: 0, cpu: 0 })

  function resetPositions(serveDir: number) {
    const s = g.current
    s.puck = { x: W / 2, y: H / 2, vx: 0, vy: 0 }
    s.me = { x: W / 2, y: H - 90, vx: 0, vy: 0 }
    s.cpu = { x: W / 2, y: 90, vx: 0, vy: 0 }
    s.serveDir = serveDir
    s.serveT = 45
    s.goalT = 0
  }

  function startGame() {
    g.current = freshState()
    scoreRef.current = { me: 0, cpu: 0 }
    setMyScore(0)
    setCpuScore(0)
    resetPositions(Math.random() < 0.5 ? 1 : -1)
    setMessage('スタート！先に7点取った方が勝ち')
    setPhase('playing')
  }

  function endGame(won: boolean) {
    setPhase('done')
    if (won) {
      const ns = streak + 1
      setStreak(ns)
      if (ns > best) {
        setBest(ns)
        try { localStorage.setItem(BEST_KEY, String(ns)) } catch { /* 保存できなくても遊べる */ }
      }
      setMessage(`勝ち！ ${WIN_SCORE}点先取で勝利。連勝 ${ns}！`)
      goalJingle(true)
    } else {
      setStreak(0)
      setMessage(`負け… ${WIN_SCORE}点先取で敗北。もう一度挑戦しよう`)
      goalJingle(false)
    }
  }

  function onGoal(byMe: boolean) {
    const s = g.current
    if (byMe) {
      scoreRef.current.me += 1
      setMyScore(scoreRef.current.me)
      setMessage('ゴール！ +1点')
    } else {
      scoreRef.current.cpu += 1
      setCpuScore(scoreRef.current.cpu)
      setMessage('失点… ゴールを守ろう')
    }
    beep(byMe ? 880 : 220, 0.25, 0.07)
    s.flash = 18
    s.puck.vx = 0
    s.puck.vy = 0
    if (scoreRef.current.me >= WIN_SCORE) { endGame(true); return }
    if (scoreRef.current.cpu >= WIN_SCORE) { endGame(false); return }
    setPhase('goal')
    resetPositions(byMe ? -1 : 1)
  }

  /** マレットとパックの衝突。マレットの速度をパックへ伝える */
  function collide(m: Vec, puck: Vec) {
    const dx = puck.x - m.x
    const dy = puck.y - m.y
    const dist = Math.hypot(dx, dy)
    const min = MALLET_R + PUCK_R
    if (dist === 0 || dist >= min) return
    const nx = dx / dist
    const ny = dy / dist
    puck.x = m.x + nx * min
    puck.y = m.y + ny * min
    const relVx = puck.vx - m.vx
    const relVy = puck.vy - m.vy
    const dot = relVx * nx + relVy * ny
    if (dot < 0) {
      // 反射＋マレットの速度を上乗せ
      puck.vx = relVx - 2 * dot * nx + m.vx * 1.1
      puck.vy = relVy - 2 * dot * ny + m.vy * 1.1
      const sp = Math.hypot(puck.vx, puck.vy)
      const max = 14
      if (sp > max) { puck.vx = (puck.vx / sp) * max; puck.vy = (puck.vy / sp) * max }
      beep(440 + Math.min(300, sp * 18), 0.05, 0.04)
    }
  }

  function step() {
    const s = g.current
    const d = DIFFS.find((x) => x.id === diffRef.current) ?? DIFFS[1]

    // --- 自分のマレット ---
    const prevMeX = s.me.x
    const prevMeY = s.me.y
    if (s.pointer.active) {
      s.me.x = clamp(s.pointer.x, MALLET_R, W - MALLET_R)
      s.me.y = clamp(s.pointer.y, H / 2 + MALLET_R + 4, H - MALLET_R)
    } else {
      const sp = 6
      if (s.keys.has('ArrowLeft') || s.keys.has('a')) s.me.x -= sp
      if (s.keys.has('ArrowRight') || s.keys.has('d')) s.me.x += sp
      if (s.keys.has('ArrowUp') || s.keys.has('w')) s.me.y -= sp
      if (s.keys.has('ArrowDown') || s.keys.has('s')) s.me.y += sp
      s.me.x = clamp(s.me.x, MALLET_R, W - MALLET_R)
      s.me.y = clamp(s.me.y, H / 2 + MALLET_R + 4, H - MALLET_R)
    }
    s.me.vx = (s.me.x - prevMeX) * 0.9
    s.me.vy = (s.me.y - prevMeY) * 0.9

    // --- CPUのマレット ---
    const prevCpuX = s.cpu.x
    const prevCpuY = s.cpu.y
    let tx: number, ty: number
    if (s.puck.y < H / 2 + 20 && s.puck.vy < 6) {
      // パックを追う（少し先読み）
      tx = clamp(s.puck.x + s.puck.vx * 2, MALLET_R, W - MALLET_R)
      ty = clamp(s.puck.y + s.puck.vy * 2, MALLET_R, H / 2 - MALLET_R - 4)
    } else {
      // ゴール前で守る
      tx = clamp(s.puck.x * 0.6 + W * 0.2, MALLET_R, W - MALLET_R)
      ty = 78
    }
    const cdx = tx - s.cpu.x
    const cdy = ty - s.cpu.y
    const cd = Math.hypot(cdx, cdy)
    if (cd > 1) {
      const cs = Math.min(d.cpuSpeed, cd)
      s.cpu.x += (cdx / cd) * cs
      s.cpu.y += (cdy / cd) * cs
    }
    // パックが近くて打ち頃なら強く弾く
    const pdx = s.puck.x - s.cpu.x
    const pdy = s.puck.y - s.cpu.y
    const pd = Math.hypot(pdx, pdy)
    if (pd < MALLET_R + PUCK_R + 26 && s.puck.y < H / 2) {
      s.cpu.x += (pdx / (pd || 1)) * d.cpuHit * 0.35
      s.cpu.y += (pdy / (pd || 1)) * d.cpuHit * 0.35
      s.cpu.x = clamp(s.cpu.x, MALLET_R, W - MALLET_R)
      s.cpu.y = clamp(s.cpu.y, MALLET_R, H / 2 - MALLET_R - 4)
    }
    s.cpu.vx = (s.cpu.x - prevCpuX) * 0.9
    s.cpu.vy = (s.cpu.y - prevCpuY) * 0.9

    // --- サーブ待ち ---
    if (s.serveT > 0) {
      s.serveT -= 1
      if (s.serveT === 0) {
        s.puck.vx = (Math.random() - 0.5) * 4
        s.puck.vy = 3.5 * s.serveDir
      }
      return
    }

    // --- パック ---
    s.puck.x += s.puck.vx
    s.puck.y += s.puck.vy
    s.puck.vx *= 0.996
    s.puck.vy *= 0.996
    if (Math.abs(s.puck.vx) < 0.05) s.puck.vx = 0
    if (Math.abs(s.puck.vy) < 0.05) s.puck.vy = 0

    // 左右の壁
    if (s.puck.x < PUCK_R) { s.puck.x = PUCK_R; s.puck.vx = Math.abs(s.puck.vx) * 0.92 }
    if (s.puck.x > W - PUCK_R) { s.puck.x = W - PUCK_R; s.puck.vx = -Math.abs(s.puck.vx) * 0.92 }
    // 上下の壁（ゴール口以外は跳ね返る）
    const inGoalX = s.puck.x > GOAL_X0 + 4 && s.puck.x < GOAL_X1 - 4
    if (s.puck.y < PUCK_R) {
      if (inGoalX) { onGoal(true); return }
      s.puck.y = PUCK_R; s.puck.vy = Math.abs(s.puck.vy) * 0.92
    }
    if (s.puck.y > H - PUCK_R) {
      if (inGoalX) { onGoal(false); return }
      s.puck.y = H - PUCK_R; s.puck.vy = -Math.abs(s.puck.vy) * 0.92
    }

    collide(s.me, s.puck)
    collide(s.cpu, s.puck)
    if (s.flash > 0) s.flash -= 1
  }

  function draw(ctx: CanvasRenderingContext2D) {
    const s = g.current
    // テーブル
    ctx.fillStyle = '#e0f2fe'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(W / 2, H / 2, 52, 0, Math.PI * 2)
    ctx.stroke()
    // ゴール口
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(GOAL_X0, 0, GOAL_W, 6)
    ctx.fillRect(GOAL_X0, H - 6, GOAL_W, 6)
    ctx.fillStyle = '#f87171'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('CPUのゴール', W / 2, 22)
    ctx.fillText('あなたのゴール', W / 2, H - 10)
    // パック
    ctx.fillStyle = '#0f172a'
    ctx.beginPath()
    ctx.arc(s.puck.x, s.puck.y, PUCK_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.arc(s.puck.x, s.puck.y, PUCK_R - 5, 0, Math.PI * 2)
    ctx.fill()
    // マレット描画
    const drawMallet = (m: Vec, outer: string, inner: string) => {
      ctx.fillStyle = outer
      ctx.beginPath()
      ctx.arc(m.x, m.y, MALLET_R, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = inner
      ctx.beginPath()
      ctx.arc(m.x, m.y, MALLET_R - 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = outer
      ctx.beginPath()
      ctx.arc(m.x, m.y, 5, 0, Math.PI * 2)
      ctx.fill()
    }
    drawMallet(s.cpu, '#2563eb', '#dbeafe')
    drawMallet(s.me, '#dc2626', '#fee2e2')
    // ゴールフラッシュ
    if (s.flash > 0) {
      ctx.fillStyle = `rgba(250, 204, 21, ${s.flash / 18 * 0.5})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        if (phaseRef.current === 'playing') step()
        else if (phaseRef.current === 'goal') {
          g.current.goalT += 1
          if (g.current.goalT > 50) setPhase('playing')
        }
        draw(ctx)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function canvasPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: W / 2, y: H - 90 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (phaseRef.current !== 'playing') return
    const p = canvasPos(e)
    g.current.pointer = { active: true, x: p.x, y: p.y }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!g.current.pointer.active) return
    const p = canvasPos(e)
    g.current.pointer.x = p.x
    g.current.pointer.y = p.y
  }

  function onPointerUp() {
    g.current.pointer.active = false
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault()
    if (e.key === ' ' && phaseRef.current === 'title') { startGame(); return }
    if (e.key === ' ' && phaseRef.current === 'done') { startGame(); return }
    g.current.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key)
  }

  function onKeyUp(e: React.KeyboardEvent<HTMLDivElement>) {
    g.current.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key)
  }

  return (
    <div className="airhockey" tabIndex={0} onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
      <div className="airhockey-head">
        <span>あなた <b>{myScore}</b></span>
        <span>：</span>
        <span><b>{cpuScore}</b> CPU</span>
        <span>先に{WIN_SCORE}点</span>
        <span>連勝 {streak}（最多 {best}）</span>
      </div>
      <canvas
        ref={canvasRef}
        className="airhockey-canvas"
        width={W}
        height={H}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <p className="airhockey-msg">{message}</p>
      {phase === 'title' && (
        <div className="airhockey-btns">
          <span>難易度：</span>
          {DIFFS.map((d) => (
            <button key={d.id} className={diff === d.id ? 'airhockey-diff-sel' : ''} onClick={() => setDiff(d.id)}>
              {d.label}
            </button>
          ))}
          <button onClick={startGame}>スタート</button>
        </div>
      )}
      {phase === 'done' && (
        <div className="airhockey-btns">
          <button onClick={startGame}>もう一度</button>
          <button onClick={() => setPhase('title')}>タイトルへ</button>
        </div>
      )}
      <p className="airhockey-help">マレットをドラッグ（マウス／タッチ）または ←→↑↓キーで動かしてパックを弾こう。中央のゴールに入れれば得点。自分のゴールは守ろう。</p>
    </div>
  )
}
