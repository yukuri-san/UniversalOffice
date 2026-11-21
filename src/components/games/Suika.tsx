import { useEffect, useRef, useState } from 'react'

// スイカゲーム風：同じ果物をくっつけて大きくする物理パズル（簡易物理 v1.0.1）
const W = 340, H = 436, WALL = 6
const LINE_Y = 52
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
  const [warn, setWarn] = useState(false)
  const balls = useRef<Ball[]>([])
  const nextType = useRef(0)
  const dropX = useRef(W / 2)
  const canDropAt = useRef(0)
  const idRef = useRef(1)
  const overRef = useRef(false)
  const overTimer = useRef(0)
  const raf = useRef(0)
  const [nextShown, setNextShown] = useState(0)

  const randNext = () => Math.floor(Math.random() * 5)

  const reset = () => {
    balls.current = []
    overRef.current = false
    overTimer.current = 0
    setOver(false); setScore(0); setStarted(true); setWarn(false)
    nextType.current = randNext(); setNextShown(nextType.current)
    canDropAt.current = 0
  }

  const drop = (x: number) => {
    if (!started || overRef.current) return
    const now = performance.now()
    if (now < canDropAt.current) return
    canDropAt.current = now + 500
    const t = nextType.current
    const r = FRUITS[t].r
    balls.current.push({ id: idRef.current++, x: Math.min(Math.max(x, WALL + r), W - WALL - r), y: r + 6, vx: 0, vy: 0, t, born: now })
    nextType.current = randNext(); setNextShown(nextType.current)
  }

  useEffect(() => {
    if (!started) return
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    let last = performance.now()
    const tick = (nowMs: number) => {
      const dt = Math.min((nowMs - last) / 16.7, 2.5)
      last = nowMs
      const bs = balls.current
      // 物理（サブステップで安定化）
      const SUB = 2
      for (let sub = 0; sub < SUB; sub++) {
        for (const b of bs) {
          b.vy = Math.min(b.vy + 0.32 * dt, 14)
          b.y += (b.vy * dt) / SUB
          b.x += (b.vx * dt) / SUB
          b.vx *= 0.995
          const r = FRUITS[b.t].r
          if (b.x < WALL + r) { b.x = WALL + r; b.vx = Math.abs(b.vx) * 0.3 }
          if (b.x > W - WALL - r) { b.x = W - WALL - r; b.vx = -Math.abs(b.vx) * 0.3 }
          if (b.y > H - WALL - r) { b.y = H - WALL - r; b.vy = 0; b.vx *= 0.9 }
          if (b.y < r + 2) { b.y = r + 2; b.vy = Math.abs(b.vy) * 0.2 }
        }
        for (let iter = 0; iter < 4; iter++) {
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
                // 触れている間は互いの速度を均す（跳ね返りを抑える）
                const rvx = (a.vx + b.vx) / 2, rvy = (a.vy + b.vy) / 2
                a.vx = rvx; b.vx = rvx
                if (ny > 0.5) { a.vy = Math.min(a.vy, rvy); }
                // 壁・床からはみ出さないよう戻す
                if (a.x < WALL + ra) a.x = WALL + ra
                if (a.x > W - WALL - ra) a.x = W - WALL - ra
                if (a.y > H - WALL - ra) a.y = H - WALL - ra
                if (b.x < WALL + rb) b.x = WALL + rb
                if (b.x > W - WALL - rb) b.x = W - WALL - rb
                if (b.y > H - WALL - rb) b.y = H - WALL - rb
              }
            }
          }
        }
      }
      // 合体：接触（中心距離が半径合計の105%以下）＋両方とも生まれてから250ms以上
      const now = performance.now()
      let merged = true
      while (merged) {
        merged = false
        outer: for (let i = 0; i < balls.current.length; i++) {
          for (let j = i + 1; j < balls.current.length; j++) {
            const a = balls.current[i], b = balls.current[j]
            if (a.t !== b.t || a.t >= FRUITS.length - 1) continue
            if (now - a.born < 250 || now - b.born < 250) continue
            const dist = Math.hypot(b.x - a.x, b.y - a.y)
            if (dist < (FRUITS[a.t].r + FRUITS[b.t].r) * 1.05) {
              const nt = a.t + 1
              const nb: Ball = { id: idRef.current++, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vx: (a.vx + b.vx) / 2, vy: Math.min(a.vy, b.vy), t: nt, born: now }
              balls.current = balls.current.filter((x) => x.id !== a.id && x.id !== b.id)
              balls.current.push(nb)
              setScore((s) => s + FRUITS[nt].score)
              merged = true
              break outer
            }
          }
        }
      }
      // ゲームオーバー：落下から1.2秒以上たった果物が、ラインより上で「ほぼ静止」したまま2秒続いたら
      const danger = balls.current.some((b) => now - b.born > 1200 && b.y - FRUITS[b.t].r < LINE_Y && Math.abs(b.vy) < 0.35 && Math.abs(b.vx) < 0.35)
      if (danger) {
        overTimer.current += 1
        if (overTimer.current === 1) setWarn(true)
        if (overTimer.current > 120 && !overRef.current) {
          overRef.current = true
          setOver(true); setWarn(false)
        }
      } else {
        overTimer.current = 0
        setWarn(false)
      }
      // draw
      ctx.fillStyle = '#fef9ec'; ctx.fillRect(0, 0, W, H)
      ctx.strokeStyle = '#d6c9a8'; ctx.lineWidth = WALL
      ctx.strokeRect(WALL / 2, WALL / 2, W - WALL, H - WALL)
      ctx.setLineDash([6, 6]); ctx.strokeStyle = overTimer.current > 0 ? '#dc2626' : '#f59e0b'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(WALL, LINE_Y); ctx.lineTo(W - WALL, LINE_Y); ctx.stroke(); ctx.setLineDash([])
      if (!overRef.current) {
        const t = nextType.current, r = FRUITS[t].r
        ctx.font = `${r * 2}px serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.globalAlpha = 0.75
        ctx.fillText(FRUITS[t].name, Math.min(Math.max(dropX.current, WALL + r), W - WALL - r), r + 6)
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
        {warn && !over && <span className="game-over">あふれそう…！</span>}
        {over && <span className="game-over">ゲームオーバー！</span>}
      </div>
      <canvas
        ref={canvasRef} width={W} height={H} className="game-canvas suika"
        onPointerMove={onMove}
        onPointerDown={(e) => { onMove(e); drop(dropX.current) }}
      />
      <p className="game-help">動かして位置を決め、クリック／タップで落下。同じ果物がくっつくと進化。線を超えたまま止まるとゲームオーバー。進化：🍒→🍓→🍇→🍊→🍎→🍐→🍑→🍍→🍈→🍉</p>
    </div>
  )
}
