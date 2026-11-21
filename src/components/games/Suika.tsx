import { useEffect, useRef, useState } from 'react'

// スイカゲーム風：同じ果物をくっつけて大きくする物理パズル（簡易物理）
const W = 340, H = 480, WALL = 6
const FRUITS = [
  { name: '🍒', r: 13, score: 1, color: '#ef4444' },
  { name: '🍓', r: 20, score: 3, color: '#f43f5e' },
  { name: '🍇', r: 28, score: 6, color: '#a855f7' },
  { name: '🍊', r: 37, score: 10, color: '#f97316' },
  { name: '🍎', r: 47, score: 15, color: '#dc2626' },
  { name: '🍐', r: 58, score: 21, color: '#84cc16' },
  { name: '🍑', r: 70, score: 28, color: '#fb923c' },
  { name: '🍍', r: 84, score: 36, color: '#eab308' },
  { name: '🍈', r: 99, score: 45, color: '#4ade80' },
  { name: '🍉', r: 116, score: 55, color: '#16a34a' },
]
interface Ball { id: number; x: number; y: number; vx: number; vy: number; t: number; born: number }

export default function Suika() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)
  const [started, setStarted] = useState(false)
  const balls = useRef<Ball[]>([])
  const nextType = useRef(0)
  const dropX = useRef(W / 2)
  const canDropAt = useRef(0)
  const idRef = useRef(1)
  const overRef = useRef(false)
  const raf = useRef(0)
  const [nextShown, setNextShown] = useState(0)

  const randNext = () => Math.floor(Math.random() * 5) // 最初の5種から落ちる

  const reset = () => {
    balls.current = []
    overRef.current = false
    setOver(false); setScore(0); setStarted(true)
    nextType.current = randNext(); setNextShown(nextType.current)
    canDropAt.current = 0
  }

  const drop = (x: number) => {
    if (!started || overRef.current) return
    const now = performance.now()
    if (now < canDropAt.current) return
    canDropAt.current = now + 450
    const t = nextType.current
    const r = FRUITS[t].r
    balls.current.push({ id: idRef.current++, x: Math.min(Math.max(x, WALL + r), W - WALL - r), y: r + 4, vx: 0, vy: 0, t, born: now })
    nextType.current = randNext(); setNextShown(nextType.current)
  }

  useEffect(() => {
    if (!started) return
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    const tick = () => {
      const bs = balls.current
      // physics
      for (const b of bs) {
        b.vy += 0.35
        b.x += b.vx; b.y += b.vy
        b.vx *= 0.99
        const r = FRUITS[b.t].r
        if (b.x < WALL + r) { b.x = WALL + r; b.vx = Math.abs(b.vx) * 0.4 }
        if (b.x > W - WALL - r) { b.x = W - WALL - r; b.vx = -Math.abs(b.vx) * 0.4 }
        if (b.y > H - WALL - r) { b.y = H - WALL - r; b.vy = 0; b.vx *= 0.92 }
      }
      // collisions (数回反復して安定させる)
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < bs.length; i++) {
          for (let j = i + 1; j < bs.length; j++) {
            const a = bs[i], b = bs[j]
            const ra = FRUITS[a.t].r, rb = FRUITS[b.t].r
            const dx = b.x - a.x, dy = b.y - a.y
            const dist = Math.hypot(dx, dy) || 0.01
            const min = ra + rb
            if (dist < min) {
              const push = (min - dist) / 2
              const nx = dx / dist, ny = dy / dist
              a.x -= nx * push; a.y -= ny * push
              b.x += nx * push; b.y += ny * push
              a.vx -= nx * 0.08; b.vx += nx * 0.08
              if (a.y + ra > H - WALL) a.y = H - WALL - ra
              if (b.y + rb > H - WALL) b.y = H - WALL - rb
            }
          }
        }
      }
      // merge
      const now = performance.now()
      outer: for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i], b = bs[j]
          if (a.t !== b.t || a.t >= FRUITS.length - 1) continue
          if (now - a.born < 120 || now - b.born < 120) continue
          const dist = Math.hypot(b.x - a.x, b.y - a.y)
          if (dist < (FRUITS[a.t].r + FRUITS[b.t].r) * 0.82) {
            const nt = a.t + 1
            const nb: Ball = { id: idRef.current++, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vx: 0, vy: -1, t: nt, born: now }
            balls.current = bs.filter((x) => x.id !== a.id && x.id !== b.id)
            balls.current.push(nb)
            setScore((s) => s + FRUITS[nt].score)
            break outer
          }
        }
      }
      // game over: 上のラインを超えた状態が続く
      const top = balls.current.some((b) => now - b.born > 900 && b.y - FRUITS[b.t].r < 46 && Math.abs(b.vy) < 0.6)
      if (top && !overRef.current) {
        overRef.current = true
        setOver(true)
      }
      // draw
      ctx.fillStyle = '#fef9ec'; ctx.fillRect(0, 0, W, H)
      ctx.strokeStyle = '#d6c9a8'; ctx.lineWidth = WALL
      ctx.strokeRect(WALL / 2, WALL / 2, W - WALL, H - WALL)
      ctx.setLineDash([6, 6]); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(WALL, 46); ctx.lineTo(W - WALL, 46); ctx.stroke(); ctx.setLineDash([])
      // drop guide
      if (!overRef.current) {
        const t = nextType.current, r = FRUITS[t].r
        ctx.font = `${r * 2}px serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.globalAlpha = 0.75
        ctx.fillText(FRUITS[t].name, Math.min(Math.max(dropX.current, WALL + r), W - WALL - r), r + 4)
        ctx.globalAlpha = 1
      }
      for (const b of balls.current) {
        const f = FRUITS[b.t]
        ctx.beginPath(); ctx.arc(b.x, b.y, f.r, 0, Math.PI * 2)
        ctx.fillStyle = f.color + '2e'; ctx.fill()
        ctx.font = `${f.r * 1.9}px serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(f.name, b.x, b.y + 2)
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [started])

  const onMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return
    dropX.current = ((e.clientX - rect.left) / rect.width) * W
  }

  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">スコア<b>{score}</b></span>
        <span className="game-stat inline">次<b>{FRUITS[nextShown].name}</b></span>
        <button className="btn accent" onClick={reset}>{started ? 'リスタート' : 'スタート'}</button>
        {over && <span className="game-over">ゲームオーバー！</span>}
      </div>
      <canvas
        ref={canvasRef} width={W} height={H} className="game-canvas suika"
        onPointerMove={onMove}
        onPointerDown={(e) => { onMove(e); drop(dropX.current) }}
      />
      <p className="game-help">動かして位置を決め、クリック／タップで落下。同じ果物同士がくっつくと進化します。赤い線を超えるとゲームオーバー。</p>
      <p className="game-help">進化：🍒→🍓→🍇→🍊→🍎→🍐→🍑→🍍→🍈→🍉</p>
    </div>
  )
}
