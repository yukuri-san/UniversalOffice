import { useEffect, useRef, useState } from 'react'

const COLS = 10, ROWS = 20, CELL = 24
const SHAPES: Record<string, number[][]> = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
}
const COLORS: Record<string, string> = { I: '#22d3ee', O: '#facc15', T: '#c084fc', S: '#4ade80', Z: '#f87171', J: '#60a5fa', L: '#fb923c' }
const KEYS = Object.keys(SHAPES)

type Grid = (string | null)[][]
const emptyGrid = (): Grid => Array.from({ length: ROWS }, () => Array<string | null>(COLS).fill(null))
const rotate = (m: number[][]) => m[0].map((_, i) => m.map((row) => row[i]).reverse())
interface Piece { type: string; m: number[][]; x: number; y: number }
const newPiece = (): Piece => {
  const type = KEYS[Math.floor(Math.random() * KEYS.length)]
  const m = SHAPES[type].map((r) => [...r])
  return { type, m, x: Math.floor((COLS - m[0].length) / 2), y: 0 }
}

export default function Tetris() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [lines, setLines] = useState(0)
  const [level, setLevel] = useState(1)
  const [over, setOver] = useState(false)
  const [running, setRunning] = useState(false)
  const state = useRef<{ grid: Grid; piece: Piece; dropMs: number }>({ grid: emptyGrid(), piece: newPiece(), dropMs: 800 })
  const raf = useRef(0)
  const lastDrop = useRef(0)

  const collide = (p: Piece, m: number[][], x: number, y: number) => {
    for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue
      const gx = x + c, gy = y + r
      if (gx < 0 || gx >= COLS || gy >= ROWS) return true
      if (gy >= 0 && state.current.grid[gy][gx]) return true
    }
    return false
  }

  const lock = () => {
    const s = state.current
    const p = s.piece
    p.m.forEach((row, r) => row.forEach((v, c) => {
      if (v && p.y + r >= 0) s.grid[p.y + r][p.x + c] = p.type
    }))
    // line clear
    let cleared = 0
    s.grid = s.grid.filter((row) => { if (row.every((v) => v)) { cleared++; return false } return true })
    while (s.grid.length < ROWS) s.grid.unshift(Array<string | null>(COLS).fill(null))
    if (cleared > 0) {
      setScore((v) => v + [0, 100, 300, 500, 800][cleared] * level)
      setLines((v) => {
        const nv = v + cleared
        setLevel(Math.floor(nv / 10) + 1)
        s.dropMs = Math.max(120, 800 - (Math.floor(nv / 10)) * 70)
        return nv
      })
    }
    s.piece = newPiece()
    if (collide(s.piece, s.piece.m, s.piece.x, s.piece.y)) {
      setOver(true); setRunning(false)
    }
  }

  const step = () => {
    const s = state.current
    if (!collide(s.piece, s.piece.m, s.piece.x, s.piece.y + 1)) s.piece = { ...s.piece, y: s.piece.y + 1 }
    else lock()
  }

  const draw = () => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    const s = state.current
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, cv.width, cv.height)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    for (let i = 1; i < COLS; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, cv.height); ctx.stroke() }
    for (let i = 1; i < ROWS; i++) { ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(cv.width, i * CELL); ctx.stroke() }
    const cell = (x: number, y: number, color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2)
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, 5)
    }
    s.grid.forEach((row, y) => row.forEach((v, x) => { if (v) cell(x, y, COLORS[v]) }))
    const p = s.piece
    p.m.forEach((row, r) => row.forEach((v, c) => { if (v && p.y + r >= 0) cell(p.x + c, p.y + r, COLORS[p.type]) }))
  }

  useEffect(() => {
    if (!running) { draw(); return }
    const loop = (t: number) => {
      if (t - lastDrop.current > state.current.dropMs) { step(); lastDrop.current = t }
      draw()
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const start = () => {
    state.current = { grid: emptyGrid(), piece: newPiece(), dropMs: 800 }
    setScore(0); setLines(0); setLevel(1); setOver(false); setRunning(true)
    lastDrop.current = performance.now()
  }

  const move = (dx: number) => {
    const s = state.current
    if (!collide(s.piece, s.piece.m, s.piece.x + dx, s.piece.y)) s.piece = { ...s.piece, x: s.piece.x + dx }
    draw()
  }
  const rot = () => {
    const s = state.current
    const m = rotate(s.piece.m)
    if (!collide(s.piece, m, s.piece.x, s.piece.y)) s.piece = { ...s.piece, m }
    draw()
  }
  const soft = () => { step(); draw() }
  const hard = () => {
    const s = state.current
    let y = s.piece.y
    while (!collide(s.piece, s.piece.m, s.piece.x, y + 1)) y++
    s.piece = { ...s.piece, y }
    lock(); draw()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!running) return
    if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); soft() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); rot() }
    else if (e.key === ' ') { e.preventDefault(); hard() }
  }

  return (
    <div className="game-app" tabIndex={0} onKeyDown={onKey}>
      <div className="game-side">
        <div className="game-stat">スコア<b>{score}</b></div>
        <div className="game-stat">ライン<b>{lines}</b></div>
        <div className="game-stat">レベル<b>{level}</b></div>
        {over && <p className="game-over">ゲームオーバー</p>}
        <button className="btn accent" onClick={start}>{running ? 'リスタート' : 'スタート'}</button>
        <p className="game-help">←→ 移動／↓ ソフト／↑ 回転／Space ハードドロップ。画面下のボタンでも操作できます。</p>
      </div>
      <div className="game-main">
        <canvas ref={canvasRef} width={COLS * CELL} height={ROWS * CELL} className="game-canvas" />
        <div className="game-pad">
          <button className="btn" onClick={() => move(-1)}>←</button>
          <button className="btn" onClick={rot}>↻</button>
          <button className="btn" onClick={soft}>↓</button>
          <button className="btn" onClick={() => move(1)}>→</button>
          <button className="btn" onClick={hard}>⏬</button>
        </div>
      </div>
    </div>
  )
}
