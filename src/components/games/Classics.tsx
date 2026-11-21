import { useCallback, useEffect, useRef, useState } from 'react'

/* ================= 2048 ================= */
type Board = number[][]
const emptyBoard = (): Board => Array.from({ length: 4 }, () => [0, 0, 0, 0])
function addRandom(b: Board): Board {
  const cells: [number, number][] = []
  b.forEach((row, r) => row.forEach((v, c) => { if (!v) cells.push([r, c]) }))
  if (!cells.length) return b
  const [r, c] = cells[Math.floor(Math.random() * cells.length)]
  const nb = b.map((row) => [...row])
  nb[r][c] = Math.random() < 0.9 ? 2 : 4
  return nb
}
function slide(row: number[]): { row: number[]; gained: number } {
  const arr = row.filter((v) => v)
  let gained = 0
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i] === arr[i + 1]) { arr[i] *= 2; gained += arr[i]; arr.splice(i + 1, 1) }
  }
  while (arr.length < 4) arr.push(0)
  return { row: arr, gained }
}
const TILE_COLORS: Record<number, string> = { 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#edc22e' }
export function Game2048() {
  const [board, setBoard] = useState<Board>(() => addRandom(addRandom(emptyBoard())))
  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)
  const [won, setWon] = useState(false)
  const move = useCallback((dir: 'left' | 'right' | 'up' | 'down') => {
    setBoard((prev) => {
      let b = prev.map((row) => [...row])
      if (dir === 'right' || dir === 'down') b = b.map((row) => [...row].reverse())
      if (dir === 'up' || dir === 'down') b = b[0].map((_, c) => b.map((row) => row[c]))
      let gained = 0
      b = b.map((row) => { const s = slide(row); gained += s.gained; return s.row })
      if (dir === 'up' || dir === 'down') b = b[0].map((_, c) => b.map((row) => row[c]))
      if (dir === 'right' || dir === 'down') b = b.map((row) => [...row].reverse())
      if (JSON.stringify(b) === JSON.stringify(prev)) return prev
      if (gained) setScore((s) => s + gained)
      const nb = addRandom(b)
      if (nb.flat().includes(2048)) setWon(true)
      const canMove = ['left', 'right', 'up', 'down'].some(() => true) && (() => {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
          if (!nb[r][c]) return true
          if (c < 3 && nb[r][c] === nb[r][c + 1]) return true
          if (r < 3 && nb[r][c] === nb[r + 1][c]) return true
        }
        return false
      })()
      if (!canMove) setOver(true)
      return nb
    })
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        move(e.key === 'ArrowLeft' ? 'left' : e.key === 'ArrowRight' ? 'right' : e.key === 'ArrowUp' ? 'up' : 'down')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move])
  const reset = () => { setBoard(addRandom(addRandom(emptyBoard()))); setScore(0); setOver(false); setWon(false) }
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">スコア<b>{score}</b></span>
        {won && <span className="game-win">2048 達成！🎉</span>}
        {over && <span className="game-over">ゲームオーバー</span>}
        <button className="btn accent" onClick={reset}>リスタート</button>
      </div>
      <div className="g2048">
        {board.flat().map((v, i) => (
          <div key={i} className="g2048-cell" style={{ background: v ? TILE_COLORS[v] ?? '#3c3a32' : '#cdc1b4', color: v >= 8 ? '#f9f6f2' : '#776e65', fontSize: v >= 1024 ? 20 : 26 }}>
            {v || ''}
          </div>
        ))}
      </div>
      <div className="game-pad wide">
        <button className="btn" onClick={() => move('up')}>↑</button>
        <button className="btn" onClick={() => move('left')}>←</button>
        <button className="btn" onClick={() => move('down')}>↓</button>
        <button className="btn" onClick={() => move('right')}>→</button>
      </div>
      <p className="game-help">矢印キー／ボタンでタイルを滑らせ、同じ数字を合体。2048 を目指そう。</p>
    </div>
  )
}

/* ================= スネーク ================= */
const SW = 20, SH = 20, SC = 16
export function Snake() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)
  const [running, setRunning] = useState(false)
  const st = useRef({ snake: [{ x: 10, y: 10 }], dir: { x: 1, y: 0 }, food: { x: 15, y: 10 } })
  const dirRef = useRef({ x: 1, y: 0 })
  useEffect(() => {
    if (!running) return
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    const placeFood = () => {
      for (;;) {
        const f = { x: Math.floor(Math.random() * SW), y: Math.floor(Math.random() * SH) }
        if (!st.current.snake.some((s) => s.x === f.x && s.y === f.y)) { st.current.food = f; return }
      }
    }
    const id = window.setInterval(() => {
      const s = st.current
      s.dir = dirRef.current
      const head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y }
      if (head.x < 0 || head.y < 0 || head.x >= SW || head.y >= SH || s.snake.some((p) => p.x === head.x && p.y === head.y)) {
        setOver(true); setRunning(false); return
      }
      s.snake.unshift(head)
      if (head.x === s.food.x && head.y === s.food.y) { setScore((v) => v + 10); placeFood() }
      else s.snake.pop()
      ctx.fillStyle = '#052e16'; ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.fillStyle = '#f87171'; ctx.fillRect(s.food.x * SC + 2, s.food.y * SC + 2, SC - 4, SC - 4)
      s.snake.forEach((p, i) => {
        ctx.fillStyle = i === 0 ? '#4ade80' : '#22c55e'
        ctx.fillRect(p.x * SC + 1, p.y * SC + 1, SC - 2, SC - 2)
      })
    }, 110)
    return () => window.clearInterval(id)
  }, [running])
  const start = () => {
    st.current = { snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }], dir: { x: 1, y: 0 }, food: { x: 15, y: 10 } }
    dirRef.current = { x: 1, y: 0 }
    setScore(0); setOver(false); setRunning(true)
  }
  const turn = (x: number, y: number) => {
    const d = st.current.dir
    if (d.x === -x && d.y === -y) return
    dirRef.current = { x, y }
  }
  return (
    <div className="game-app col" tabIndex={0} onKeyDown={(e) => {
      if (e.key === 'ArrowUp') turn(0, -1); else if (e.key === 'ArrowDown') turn(0, 1)
      else if (e.key === 'ArrowLeft') turn(-1, 0); else if (e.key === 'ArrowRight') turn(1, 0)
    }}>
      <div className="game-bar">
        <span className="game-stat inline">スコア<b>{score}</b></span>
        {over && <span className="game-over">ゲームオーバー</span>}
        <button className="btn accent" onClick={start}>{running ? 'リスタート' : 'スタート'}</button>
      </div>
      <canvas ref={canvasRef} width={SW * SC} height={SH * SC} className="game-canvas" />
      <div className="game-pad">
        <button className="btn" onClick={() => turn(0, -1)}>↑</button>
        <button className="btn" onClick={() => turn(-1, 0)}>←</button>
        <button className="btn" onClick={() => turn(0, 1)}>↓</button>
        <button className="btn" onClick={() => turn(1, 0)}>→</button>
      </div>
    </div>
  )
}

/* ================= ブロック崩し ================= */
const BW = 360, BH = 420
export function Breakout() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [msg, setMsg] = useState('')
  const [running, setRunning] = useState(false)
  const st = useRef<{ px: number; bx: number; by: number; vx: number; vy: number; blocks: boolean[][] } | null>(null)
  const start = () => {
    st.current = {
      px: BW / 2 - 35, bx: BW / 2, by: BH - 60, vx: 3, vy: -3.4,
      blocks: Array.from({ length: 5 }, () => Array(8).fill(true)),
    }
    setScore(0); setLives(3); setMsg(''); setRunning(true)
  }
  useEffect(() => {
    if (!running || !st.current) return
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    let rafId = 0
    const colors = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#60a5fa']
    const tick = () => {
      const s = st.current; if (!s) return
      s.bx += s.vx; s.by += s.vy
      if (s.bx < 8 || s.bx > BW - 8) s.vx *= -1
      if (s.by < 8) s.vy *= -1
      if (s.by > BH - 24 && s.by < BH - 8 && s.bx > s.px - 8 && s.bx < s.px + 78) {
        s.vy = -Math.abs(s.vy)
        s.vx += ((s.bx - (s.px + 35)) / 35) * 1.4
      }
      if (s.by > BH) {
        setLives((l) => {
          if (l <= 1) { setMsg('ゲームオーバー'); setRunning(false); return 0 }
          return l - 1
        })
        s.bx = BW / 2; s.by = BH - 60; s.vy = -3.4
      }
      const bw = BW / 8, bh = 16
      for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
        if (!s.blocks[r][c]) continue
        const x = c * bw + 3, y = 36 + r * (bh + 5)
        if (s.bx > x - 6 && s.bx < x + bw - 3 + 6 && s.by > y - 6 && s.by < y + bh + 6) {
          s.blocks[r][c] = false; s.vy *= -1; setScore((v) => v + 10)
        }
      }
      if (s.blocks.every((row) => row.every((b) => !b))) { setMsg('クリア！🎉'); setRunning(false) }
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, BW, BH)
      for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
        if (!s.blocks[r][c]) continue
        ctx.fillStyle = colors[r]
        ctx.fillRect(c * bw + 3, 36 + r * (bh + 5), bw - 6, bh)
      }
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(s.px, BH - 18, 70, 10)
      ctx.beginPath(); ctx.arc(s.bx, s.by, 7, 0, Math.PI * 2); ctx.fillStyle = '#facc15'; ctx.fill()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [running])
  const onMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect || !st.current) return
    st.current.px = Math.min(Math.max(((e.clientX - rect.left) / rect.width) * BW - 35, 0), BW - 70)
  }
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">スコア<b>{score}</b></span>
        <span className="game-stat inline">残り<b>{lives}</b></span>
        {msg && <span className="game-over">{msg}</span>}
        <button className="btn accent" onClick={start}>{running ? 'リスタート' : 'スタート'}</button>
      </div>
      <canvas ref={canvasRef} width={BW} height={BH} className="game-canvas" onPointerMove={onMove} />
      <p className="game-help">マウス／指でバーを左右に動かしてボールを打ち返そう。</p>
    </div>
  )
}
