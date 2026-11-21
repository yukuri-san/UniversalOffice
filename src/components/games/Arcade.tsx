import { useEffect, useRef, useState } from 'react'

/* ================= マッチ3 ================= */
const GEMS = ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠']
const MS = 8
type MB = number[][]
const mRand = () => Math.floor(Math.random() * GEMS.length)
function mInit(): MB {
  const b: MB = Array.from({ length: MS }, () => Array.from({ length: MS }, mRand))
  // 初期マッチを消す
  for (let r = 0; r < MS; r++) for (let c = 0; c < MS; c++) {
    while ((c >= 2 && b[r][c] === b[r][c - 1] && b[r][c] === b[r][c - 2]) || (r >= 2 && b[r][c] === b[r - 1][c] && b[r][c] === b[r - 2][c])) b[r][c] = mRand()
  }
  return b
}
function findMatches(b: MB): Set<string> {
  const s = new Set<string>()
  for (let r = 0; r < MS; r++) for (let c = 0; c < MS - 2; c++) {
    if (b[r][c] >= 0 && b[r][c] === b[r][c + 1] && b[r][c] === b[r][c + 2]) { s.add(`${r},${c}`); s.add(`${r},${c + 1}`); s.add(`${r},${c + 2}`) }
  }
  for (let c = 0; c < MS; c++) for (let r = 0; r < MS - 2; r++) {
    if (b[r][c] >= 0 && b[r][c] === b[r + 1][c] && b[r][c] === b[r + 2][c]) { s.add(`${r},${c}`); s.add(`${r + 1},${c}`); s.add(`${r + 2},${c}`) }
  }
  return s
}
export function Match3() {
  const [board, setBoard] = useState<MB>(mInit)
  const [sel, setSel] = useState<[number, number] | null>(null)
  const [score, setScore] = useState(0)
  const [busy, setBusy] = useState(false)
  const resolveBoard = (b: MB) => {
    let cur = b
    let chain = 0
    const stepFn = () => {
      const m = findMatches(cur)
      if (!m.size) { setBoard(cur); setBusy(false); return }
      chain++
      setScore((s) => s + m.size * 10 * chain)
      const nb = cur.map((row) => [...row])
      m.forEach((k) => { const [r, c] = k.split(',').map(Number); nb[r][c] = -1 })
      for (let c = 0; c < MS; c++) {
        const col = nb.map((row) => row[c]).filter((v) => v >= 0)
        while (col.length < MS) col.unshift(mRand())
        for (let r = 0; r < MS; r++) nb[r][c] = col[r]
      }
      cur = nb
      setBoard(cur)
      window.setTimeout(stepFn, 220)
    }
    stepFn()
  }
  const tap = (r: number, c: number) => {
    if (busy) return
    if (!sel) { setSel([r, c]); return }
    const [sr, sc] = sel
    if (Math.abs(sr - r) + Math.abs(sc - c) !== 1) { setSel([r, c]); return }
    const nb = board.map((row) => [...row])
    ;[nb[sr][sc], nb[r][c]] = [nb[r][c], nb[sr][sc]]
    setSel(null)
    if (!findMatches(nb).size) {
      setBoard(nb)
      setBusy(true)
      window.setTimeout(() => { setBoard(board); setBusy(false) }, 200)
      return
    }
    setBusy(true)
    resolveBoard(nb)
  }
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">スコア<b>{score}</b></span>
        <button className="btn accent" onClick={() => { setBoard(mInit()); setScore(0); setSel(null) }}>リスタート</button>
      </div>
      <div className="match3">
        {board.map((row, r) => row.map((v, c) => (
          <button key={`${r}-${c}`} className={`match3-cell${sel && sel[0] === r && sel[1] === c ? ' sel' : ''}`} onClick={() => tap(r, c)}>
            {v >= 0 ? GEMS[v] : ''}
          </button>
        )))}
      </div>
      <p className="game-help">隣り合う宝石を2つタップで入れ替え、3つ揃えると消えます。連鎖でボーナス。</p>
    </div>
  )
}

/* ================= ポン ================= */
const PW = 360, PH = 320
export function Pong() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState({ you: 0, cpu: 0 })
  const [running, setRunning] = useState(false)
  const st = useRef({ py: PH / 2 - 35, cy: PH / 2 - 35, bx: PW / 2, by: PH / 2, vx: 3.4, vy: 2.2 })
  useEffect(() => {
    if (!running) return
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    let rafId = 0
    const tick = () => {
      const s = st.current
      s.bx += s.vx; s.by += s.vy
      if (s.by < 8 || s.by > PH - 8) s.vy *= -1
      // CPU
      const center = s.cy + 35
      if (s.by < center - 8) s.cy -= 2.6; else if (s.by > center + 8) s.cy += 2.6
      s.cy = Math.min(Math.max(s.cy, 0), PH - 70)
      // collisions
      if (s.bx < 22 && s.by > s.py && s.by < s.py + 70) { s.vx = Math.abs(s.vx) * 1.03; s.vy += ((s.by - (s.py + 35)) / 35) * 1.2 }
      if (s.bx > PW - 22 && s.by > s.cy && s.by < s.cy + 70) { s.vx = -Math.abs(s.vx) * 1.03; s.vy += ((s.by - (s.cy + 35)) / 35) * 1.2 }
      if (s.bx < 0) { setScore((v) => ({ ...v, cpu: v.cpu + 1 })); s.bx = PW / 2; s.by = PH / 2; s.vx = 3.4 }
      if (s.bx > PW) { setScore((v) => ({ ...v, you: v.you + 1 })); s.bx = PW / 2; s.by = PH / 2; s.vx = -3.4 }
      ctx.fillStyle = '#052e16'; ctx.fillRect(0, 0, PW, PH)
      ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(255,255,255,.4)'
      ctx.beginPath(); ctx.moveTo(PW / 2, 0); ctx.lineTo(PW / 2, PH); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = '#4ade80'; ctx.fillRect(8, s.py, 8, 70)
      ctx.fillStyle = '#f87171'; ctx.fillRect(PW - 16, s.cy, 8, 70)
      ctx.beginPath(); ctx.arc(s.bx, s.by, 7, 0, Math.PI * 2); ctx.fillStyle = '#fef08a'; ctx.fill()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [running])
  const onMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return
    st.current.py = Math.min(Math.max(((e.clientY - rect.top) / rect.height) * PH - 35, 0), PH - 70)
  }
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">あなた<b>{score.you}</b></span>
        <span className="game-stat inline">CPU<b>{score.cpu}</b></span>
        <button className="btn accent" onClick={() => { setScore({ you: 0, cpu: 0 }); st.current = { py: PH / 2 - 35, cy: PH / 2 - 35, bx: PW / 2, by: PH / 2, vx: 3.4, vy: 2.2 }; setRunning(true) }}>{running ? 'リセット' : 'スタート'}</button>
      </div>
      <canvas ref={canvasRef} width={PW} height={PH} className="game-canvas" onPointerMove={onMove} />
      <p className="game-help">マウス／指の上下で左のパドルを動かします。</p>
    </div>
  )
}

/* ================= フラッピー ================= */
const FW = 340, FH = 420
export function Flappy() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)
  const [running, setRunning] = useState(false)
  const st = useRef({ y: FH / 2, vy: 0, pipes: [] as { x: number; gapY: number }[], frame: 0 })
  const flap = () => { if (running) st.current.vy = -7.2 }
  useEffect(() => {
    if (!running) return
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    let rafId = 0
    const tick = () => {
      const s = st.current
      s.frame++
      s.vy += 0.38; s.y += s.vy
      if (s.frame % 95 === 0) s.pipes.push({ x: FW + 40, gapY: 90 + Math.random() * (FH - 220) })
      s.pipes.forEach((p) => { p.x -= 2.4 })
      if (s.pipes.length && s.pipes[0].x < -50) { s.pipes.shift(); setScore((v) => v + 1) }
      const gap = 118
      const hitPipe = s.pipes.some((p) => 54 > p.x - 26 && 54 < p.x + 52 && (s.y - 13 < p.gapY - gap / 2 || s.y + 13 > p.gapY + gap / 2))
      if (s.y > FH - 14 || s.y < 10 || hitPipe) { setOver(true); setRunning(false); return }
      ctx.fillStyle = '#7dd3fc'; ctx.fillRect(0, 0, FW, FH)
      ctx.fillStyle = '#22c55e'
      s.pipes.forEach((p) => {
        ctx.fillRect(p.x, 0, 52, p.gapY - gap / 2)
        ctx.fillRect(p.x, p.gapY + gap / 2, 52, FH - (p.gapY + gap / 2))
      })
      ctx.font = '26px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('🐤', 54, s.y)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [running])
  const start = () => { st.current = { y: FH / 2, vy: 0, pipes: [], frame: 0 }; setScore(0); setOver(false); setRunning(true) }
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">スコア<b>{score}</b></span>
        {over && <span className="game-over">ゲームオーバー</span>}
        <button className="btn accent" onClick={start}>{running ? 'リスタート' : 'スタート'}</button>
      </div>
      <canvas ref={canvasRef} width={FW} height={FH} className="game-canvas" onPointerDown={flap} />
      <p className="game-help">クリック／タップで羽ばたきます。パイプの隙間を通り抜けよう。</p>
    </div>
  )
}

/* ================= モグラたたき ================= */
export function WhackMole() {
  const [holes, setHoles] = useState<boolean[]>(Array(9).fill(false))
  const [score, setScore] = useState(0)
  const [time, setTime] = useState(30)
  const [running, setRunning] = useState(false)
  useEffect(() => {
    if (!running) return
    const pop = window.setInterval(() => {
      setHoles(() => {
        const next = Array(9).fill(false)
        const n = 1 + Math.floor(Math.random() * 2)
        for (let i = 0; i < n; i++) next[Math.floor(Math.random() * 9)] = true
        return next
      })
    }, 750)
    const count = window.setInterval(() => {
      setTime((t) => {
        if (t <= 1) { setRunning(false); return 0 }
        return t - 1
      })
    }, 1000)
    return () => { window.clearInterval(pop); window.clearInterval(count) }
  }, [running])
  const start = () => { setScore(0); setTime(30); setRunning(true) }
  const whack = (i: number) => {
    if (!running || !holes[i]) return
    setScore((s) => s + 10)
    setHoles((h) => h.map((v, j) => (j === i ? false : v)))
  }
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">スコア<b>{score}</b></span>
        <span className="game-stat inline">残り<b>{time}秒</b></span>
        {!running && time === 0 && <span className="game-over">終了！</span>}
        <button className="btn accent" onClick={start}>{running ? 'リスタート' : 'スタート'}</button>
      </div>
      <div className="mole-grid">
        {holes.map((up, i) => (
          <button key={i} className="mole-hole" onClick={() => whack(i)}>{up ? '🐹' : '🕳️'}</button>
        ))}
      </div>
    </div>
  )
}
