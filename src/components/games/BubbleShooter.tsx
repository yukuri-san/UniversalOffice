import { useEffect, useRef, useState } from 'react'

/* ================= バブルシューター =================
 * 上から下がるカラーボールを狙って撃ち、同じ色を3つ以上つなげて消す
 * パズルボブル風アーケードゲーム。
 * ・マウス／タッチで狙いを定め、クリック／タップで発射（←→キー＋Spaceも可）
 * ・3つ以上つながると消滅。宙に浮いたボールは落下してボーナス
 * ・消せない発射が6発続くと上から1段追加。ボールが下のラインを越えたら終了
 * ・全消しでレベルアップ（段数・色数が増加） */

const W = 360, H = 520
const R = 15
const COLS = 12
const ROW_DY = 26
const SHOOTER = { x: W / 2, y: 490 }
const DANGER_Y = 432
const PUSH_EVERY = 6
const BEST_KEY = 'webx-bubbleshooter-best'

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#06b6d4']

/** 1段。off=0 は左端が x=R、off=1 は左端が x=2R（半段ずらし）。
 * 段ごとの off を持つことで、上から段を追加しても既存のボールの
 * 横位置が変わらない（本家と同じ挙動）。 */
type GridRow = { off: 0 | 1; cells: (number | null)[] }
type Grid = GridRow[]

function rowLen(grid: Grid, row: number): number {
  return grid[row]?.cells.length ?? 0
}

function cellCenter(grid: Grid, row: number, col: number): { x: number; y: number } {
  const off = grid[row]?.off ?? 0
  return { x: (off === 0 ? R : R * 2) + col * R * 2, y: R + 3 + row * ROW_DY }
}

/** 隣接セル。隣の段が右にずれているかどうかで組み合わせが変わる */
function neighbors(grid: Grid, row: number, col: number): { r: number; c: number }[] {
  const off = grid[row]?.off ?? 0
  const deltas = off === 0
    ? [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]]
    : [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
  return deltas
    .map(([dr, dc]) => ({ r: row + dr, c: col + dc }))
    .filter(({ r, c }) => r >= 0 && r < grid.length && c >= 0 && c < rowLen(grid, r))
}

function countBubbles(grid: Grid): number {
  let n = 0
  for (const row of grid) for (const c of row.cells) if (c !== null) n++
  return n
}

function colorsOnBoard(grid: Grid): number[] {
  const s = new Set<number>()
  for (const row of grid) for (const c of row.cells) if (c !== null) s.add(c)
  return [...s].sort((a, b) => a - b)
}

function makeRow(off: 0 | 1, colorCount: number): GridRow {
  const len = off === 0 ? COLS : COLS - 1
  return { off, cells: Array.from({ length: len }, () => Math.floor(Math.random() * colorCount)) }
}

function makeBoard(rows: number, colorCount: number): Grid {
  const grid: Grid = []
  for (let r = 0; r < rows; r++) grid.push(makeRow((r % 2) as 0 | 1, colorCount))
  return grid
}

type Falling = { x: number; y: number; color: number; vy: number }
type Popping = { x: number; y: number; color: number; t: number }
type Flying = { x: number; y: number; dx: number; dy: number; color: number }
type Phase = 'ready' | 'playing' | 'clear' | 'over'

type GState = {
  grid: Grid
  level: number
  colorCount: number
  score: number
  aim: number // 真上を0とするラジアン（-1.35〜1.35）
  cur: number
  next: number
  flying: Flying | null
  falling: Falling[]
  popping: Popping[]
  shotsSincePop: number
  phase: Phase
}

function freshGame(): GState {
  const colorCount = 3
  return {
    grid: makeBoard(5, colorCount),
    level: 1,
    colorCount,
    score: 0,
    aim: 0,
    cur: Math.floor(Math.random() * colorCount),
    next: Math.floor(Math.random() * colorCount),
    flying: null,
    falling: [],
    popping: [],
    shotsSincePop: 0,
    phase: 'ready',
  }
}

export default function BubbleShooter() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gRef = useRef<GState>(freshGame())
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0) || 0)
  const [phase, setPhase] = useState<Phase>('ready')
  const [curColor, setCurColor] = useState(gRef.current.cur)
  const [nextColor, setNextColor] = useState(gRef.current.next)
  const [pushLeft, setPushLeft] = useState(PUSH_EVERY)
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  const syncHud = (g: GState) => {
    setScore(g.score)
    setLevel(g.level)
    setCurColor(g.cur)
    setNextColor(g.next)
    setPushLeft(PUSH_EVERY - g.shotsSincePop)
  }

  const setPhaseAll = (p: Phase) => {
    gRef.current.phase = p
    setPhase(p)
  }

  const pickColor = (g: GState): number => {
    const onBoard = colorsOnBoard(g.grid)
    const pool = onBoard.length > 0 ? onBoard : Array.from({ length: g.colorCount }, (_, i) => i)
    return pool[Math.floor(Math.random() * pool.length)]
  }

  const startGame = () => {
    const g = freshGame()
    g.phase = 'playing'
    gRef.current = g
    setPhaseAll('playing')
    syncHud(g)
  }

  const nextLevel = () => {
    const g = gRef.current
    g.level += 1
    g.colorCount = Math.min(3 + (g.level - 1), COLORS.length)
    g.grid = makeBoard(Math.min(5 + (g.level - 1), 8), g.colorCount)
    g.flying = null
    g.shotsSincePop = 0
    g.cur = pickColor(g)
    g.next = pickColor(g)
    setPhaseAll('playing')
    syncHud(g)
  }

  const gameOver = () => {
    const g = gRef.current
    g.phase = 'over'
    setPhaseAll('over')
    if (g.score > best) {
      setBest(g.score)
      localStorage.setItem(BEST_KEY, String(g.score))
    }
  }

  /** 浮いたボール（天井につながっていないもの）を落下させる */
  const dropFloating = (g: GState): number => {
    const connected = new Set<string>()
    const stack: { r: number; c: number }[] = []
    for (let c = 0; c < rowLen(g.grid, 0); c++) {
      if (g.grid[0]?.cells[c] != null) stack.push({ r: 0, c })
    }
    while (stack.length > 0) {
      const { r, c } = stack.pop()!
      const key = `${r},${c}`
      if (connected.has(key) || g.grid[r]?.cells[c] == null) continue
      connected.add(key)
      for (const n of neighbors(g.grid, r, c)) stack.push(n)
    }
    let dropped = 0
    for (let r = 0; r < g.grid.length; r++) {
      for (let c = 0; c < rowLen(g.grid, r); c++) {
        if (g.grid[r].cells[c] !== null && !connected.has(`${r},${c}`)) {
          const p = cellCenter(g.grid, r, c)
          g.falling.push({ x: p.x, y: p.y, color: g.grid[r].cells[c]!, vy: 1 })
          g.grid[r].cells[c] = null
          dropped++
        }
      }
    }
    return dropped
  }

  /** 置いたボールと同色の連結を調べ、3つ以上なら消す。消した数を返す */
  const popMatches = (g: GState, r0: number, c0: number): number => {
    const color = g.grid[r0]?.cells[c0]
    if (color == null) return 0
    const group: { r: number; c: number }[] = []
    const seen = new Set<string>()
    const stack = [{ r: r0, c: c0 }]
    while (stack.length > 0) {
      const { r, c } = stack.pop()!
      const key = `${r},${c}`
      if (seen.has(key) || g.grid[r]?.cells[c] !== color) continue
      seen.add(key)
      group.push({ r, c })
      for (const n of neighbors(g.grid, r, c)) stack.push(n)
    }
    if (group.length < 3) return 0
    for (const { r, c } of group) {
      const p = cellCenter(g.grid, r, c)
      g.popping.push({ x: p.x, y: p.y, color, t: 0 })
      g.grid[r].cells[c] = null
    }
    return group.length
  }

  /** 飛んでいるボールがくっつく空きセル（天井または既存ボールに隣接）を探す */
  const nearestEmptyCell = (g: GState, x: number, y: number): { r: number; c: number } | null => {
    let best: { r: number; c: number } | null = null
    let bd = Infinity
    for (let r = 0; r < g.grid.length; r++) {
      for (let c = 0; c < rowLen(g.grid, r); c++) {
        if (g.grid[r].cells[c] !== null) continue
        if (r > 0 && !neighbors(g.grid, r, c).some((n) => g.grid[n.r]?.cells[n.c] != null)) continue
        const p = cellCenter(g.grid, r, c)
        const d = (p.x - x) ** 2 + (p.y - y) ** 2
        if (d < bd) { bd = d; best = { r, c } }
      }
    }
    return best
  }

  const attachFlying = (g: GState) => {
    const f = g.flying
    if (!f) return
    const cell = nearestEmptyCell(g, f.x, f.y)
    g.flying = null
    if (!cell) { gameOver(); return }
    // 盤面より下にくっつく場合は段を足す
    while (g.grid.length <= cell.r) {
      const prevOff = g.grid[g.grid.length - 1]?.off ?? 0
      const off = (1 - prevOff) as 0 | 1
      g.grid.push({ off, cells: Array.from({ length: off === 0 ? COLS : COLS - 1 }, () => null) })
    }
    g.grid[cell.r].cells[cell.c] = f.color
    const popped = popMatches(g, cell.r, cell.c)
    let gained = popped * 10
    let fell = 0
    if (popped > 0) {
      fell = dropFloating(g)
      gained += fell * 20
      g.shotsSincePop = 0
    } else {
      g.shotsSincePop += 1
    }
    g.score += gained
    // 次の玉
    g.cur = g.next
    g.next = pickColor(g)
    // 上から1段追加の圧力（既存の段の off は変えないので横位置は維持される）
    if (g.shotsSincePop >= PUSH_EVERY) {
      g.shotsSincePop = 0
      const newOff = (1 - (g.grid[0]?.off ?? 0)) as 0 | 1
      g.grid.unshift(makeRow(newOff, g.colorCount))
    }
    // 敗北判定：ボールが危険ラインを越えた
    for (let r = 0; r < g.grid.length; r++) {
      for (let c = 0; c < rowLen(g.grid, r); c++) {
        if (g.grid[r].cells[c] !== null && cellCenter(g.grid, r, c).y > DANGER_Y - R) {
          gameOver()
          syncHud(g)
          return
        }
      }
    }
    // 全消しでレベルクリア
    if (countBubbles(g.grid) === 0) {
      g.score += 500
      setPhaseAll('clear')
      syncHud(g)
      window.setTimeout(() => {
        if (phaseRef.current === 'clear') nextLevel()
      }, 1400)
      return
    }
    syncHud(g)
  }

  const shoot = () => {
    const g = gRef.current
    if (g.phase !== 'playing' || g.flying) return
    const speed = 9
    g.flying = {
      x: SHOOTER.x,
      y: SHOOTER.y - R - 2,
      dx: Math.sin(g.aim) * speed,
      dy: -Math.cos(g.aim) * speed,
      color: g.cur,
    }
  }

  const aimAt = (clientX: number, clientY: number) => {
    const g = gRef.current
    const canvas = canvasRef.current
    if (!canvas || g.phase !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * W
    const y = ((clientY - rect.top) / rect.height) * H
    const dx = x - SHOOTER.x
    const dy = SHOOTER.y - y
    if (dy <= 4) return
    g.aim = Math.max(-1.35, Math.min(1.35, Math.atan2(dx, dy)))
  }

  // キーボード：←→で狙い、Spaceで発射
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable="true"]')) return
      const g = gRef.current
      if (g.phase !== 'playing') return
      if (e.key === 'ArrowLeft') { g.aim = Math.max(-1.35, g.aim - 0.08); e.preventDefault() }
      else if (e.key === 'ArrowRight') { g.aim = Math.min(1.35, g.aim + 0.08); e.preventDefault() }
      else if (e.key === ' ') { shoot(); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ゲームループ：描画と飛翔ボールの更新
  useEffect(() => {
    let raf = 0
    const drawBubble = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1) => {
      ctx.save()
      ctx.globalAlpha = alpha
      const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r)
      grad.addColorStop(0, '#ffffff')
      grad.addColorStop(0.25, color)
      grad.addColorStop(1, color)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.beginPath()
      ctx.arc(x - r * 0.35, y - r * 0.42, r * 0.22, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    const loop = () => {
      const g = gRef.current
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        ctx.clearRect(0, 0, W, H)
        // 背景
        const bg = ctx.createLinearGradient(0, 0, 0, H)
        bg.addColorStop(0, '#0f172a')
        bg.addColorStop(1, '#1e293b')
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, W, H)
        // 危険ライン
        ctx.strokeStyle = 'rgba(239,68,68,0.7)'
        ctx.setLineDash([6, 5])
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(0, DANGER_Y)
        ctx.lineTo(W, DANGER_Y)
        ctx.stroke()
        ctx.setLineDash([])
        // ボード
        for (let r = 0; r < g.grid.length; r++) {
          for (let c = 0; c < rowLen(g.grid, r); c++) {
            const color = g.grid[r].cells[c]
            if (color === null) continue
            const p = cellCenter(g.grid, r, c)
            drawBubble(ctx, p.x, p.y, R - 1, COLORS[color])
          }
        }
        // 消滅アニメーション
        g.popping = g.popping.filter((p) => p.t < 1)
        for (const p of g.popping) {
          p.t += 0.08
          drawBubble(ctx, p.x, p.y, (R - 1) * (1 + p.t * 0.7), COLORS[p.color], 1 - p.t)
        }
        // 落下ボール
        g.falling = g.falling.filter((f) => f.y < H + 20)
        for (const f of g.falling) {
          f.vy = Math.min(f.vy + 0.35, 9)
          f.y += f.vy
          drawBubble(ctx, f.x, f.y, R - 1, COLORS[f.color])
        }
        // 飛翔ボール
        const f = g.flying
        if (f) {
          f.x += f.dx
          f.y += f.dy
          if (f.x < R) { f.x = R; f.dx = Math.abs(f.dx) }
          if (f.x > W - R) { f.x = W - R; f.dx = -Math.abs(f.dx) }
          // 天井に到達
          if (f.y <= R + 3) { attachFlying(g) }
          else {
            // 既存ボールに接触
            let hit = false
            outer: for (let r = 0; r < g.grid.length; r++) {
              for (let c = 0; c < rowLen(g.grid, r); c++) {
                if (g.grid[r].cells[c] === null) continue
                const p = cellCenter(g.grid, r, c)
                if ((p.x - f.x) ** 2 + (p.y - f.y) ** 2 < (R * 2 - 2) ** 2) { hit = true; break outer }
              }
            }
            if (hit) attachFlying(g)
          }
          if (g.flying) drawBubble(ctx, f.x, f.y, R - 1, COLORS[f.color])
        }
        // 照準ガイド（壁で1回反射する破線）
        if (g.phase === 'playing' && !g.flying) {
          let gx = SHOOTER.x, gy = SHOOTER.y - R - 2
          let dx = Math.sin(g.aim), dy = -Math.cos(g.aim)
          ctx.strokeStyle = 'rgba(255,255,255,0.5)'
          ctx.setLineDash([4, 6])
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(gx, gy)
          for (let i = 0; i < 200; i++) {
            gx += dx * 4
            gy += dy * 4
            if (gx < R) { gx = R; dx = Math.abs(dx) }
            if (gx > W - R) { gx = W - R; dx = -Math.abs(dx) }
            if (gy <= R + 3) break
            let near = false
            for (let r = 0; r < g.grid.length && !near; r++) {
              for (let c = 0; c < rowLen(g.grid, r); c++) {
                if (g.grid[r].cells[c] === null) continue
                const p = cellCenter(g.grid, r, c)
                if ((p.x - gx) ** 2 + (p.y - gy) ** 2 < (R * 2) ** 2) { near = true; break }
              }
            }
            if (near) break
          }
          ctx.lineTo(gx, gy)
          ctx.stroke()
          ctx.setLineDash([])
        }
        // 発射台の玉
        if (g.phase === 'playing' && !g.flying) {
          drawBubble(ctx, SHOOTER.x, SHOOTER.y - R - 2, R - 1, COLORS[g.cur])
        }
        // 発射台
        ctx.fillStyle = '#475569'
        ctx.beginPath()
        ctx.arc(SHOOTER.x, SHOOTER.y, 20, Math.PI, 0)
        ctx.fill()
        ctx.fillStyle = '#334155'
        ctx.fillRect(SHOOTER.x - 20, SHOOTER.y, 40, 6)
        // オーバーレイ
        if (g.phase === 'ready' || g.phase === 'over' || g.phase === 'clear') {
          ctx.fillStyle = 'rgba(2,6,23,0.72)'
          ctx.fillRect(0, 0, W, H)
          ctx.fillStyle = '#f8fafc'
          ctx.textAlign = 'center'
          if (g.phase === 'ready') {
            ctx.font = 'bold 24px sans-serif'
            ctx.fillText('バブルシューター', W / 2, 220)
            ctx.font = '15px sans-serif'
            ctx.fillText('同じ色を3つ以上つなげて消そう', W / 2, 255)
            ctx.fillText('狙ってクリック／タップで発射', W / 2, 280)
          } else if (g.phase === 'clear') {
            ctx.font = 'bold 26px sans-serif'
            ctx.fillText('レベルクリア！', W / 2, 230)
            ctx.font = '16px sans-serif'
            ctx.fillText('ボーナス +500', W / 2, 265)
          } else {
            ctx.font = 'bold 26px sans-serif'
            ctx.fillText('ゲームオーバー', W / 2, 220)
            ctx.font = '16px sans-serif'
            ctx.fillText(`スコア ${g.score}`, W / 2, 260)
          }
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="bubble-game">
      <div className="bubble-hud">
        <span>スコア <b>{score}</b></span>
        <span>レベル <b>{level}</b></span>
        <span>ベスト <b>{best}</b></span>
        <span>次の玉 <span className="bubble-dot" style={{ background: COLORS[nextColor] }} /></span>
        <span>追加まで <b>{pushLeft}</b>発</span>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="bubble-canvas"
        onPointerMove={(e) => aimAt(e.clientX, e.clientY)}
        onPointerDown={(e) => { aimAt(e.clientX, e.clientY); shoot() }}
      />
      <div className="bubble-controls">
        {phase === 'ready' && <button onClick={startGame}>スタート</button>}
        {phase === 'over' && <button onClick={startGame}>もう一度</button>}
        {phase === 'playing' && <button onClick={shoot}>発射</button>}
        {phase === 'playing' && <span className="bubble-hint">←→キーで狙い・Spaceで発射</span>}
      </div>
    </div>
  )
}
