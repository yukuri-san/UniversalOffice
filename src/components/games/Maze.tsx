import { useEffect, useRef, useState } from 'react'

/* ================= 迷路ゲーム =================
 * 自動生成の迷路をスタートからゴールまで進むゲーム。
 * ・再帰バックトラッカー法で毎回ちがう迷路を生成。レベルが上がると迷路が大きくなる
 * ・矢印キー／WASD／スワイプ／画面の方向ボタンで1マスずつ移動。壁は通れない
 * ・ゴールでクリア。残り時間がボーナススコアになる。制限時間切れでゲームオーバー
 * ・スコアと到達レベルを保存 */

const CANVAS = 360
const BEST_SCORE_KEY = 'webx-maze-best'
const BEST_LEVEL_KEY = 'webx-maze-level'

// 壁のビットマスク：北=1 東=2 南=4 西=8
const DIRS = [
  { dx: 0, dy: -1, w: 1, ow: 4 },
  { dx: 1, dy: 0, w: 2, ow: 8 },
  { dx: 0, dy: 1, w: 4, ow: 1 },
  { dx: -1, dy: 0, w: 8, ow: 2 },
]

function sizeForLevel(level: number): number {
  return Math.min(21, 9 + (level - 1) * 2)
}

function limitForLevel(level: number): number {
  return Math.min(90, 30 + level * 10)
}

/** 再帰バックトラッカー法で迷路を生成する（全マスから壁を削っていく） */
function genMaze(size: number): Uint8Array {
  const cells = new Uint8Array(size * size).fill(15)
  const visited = new Uint8Array(size * size)
  const stack: [number, number][] = [[0, 0]]
  visited[0] = 1
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1]
    const opts = DIRS.filter((d) => {
      const nx = cx + d.dx
      const ny = cy + d.dy
      return nx >= 0 && ny >= 0 && nx < size && ny < size && !visited[ny * size + nx]
    })
    if (!opts.length) {
      stack.pop()
      continue
    }
    const d = opts[Math.floor(Math.random() * opts.length)]
    const nx = cx + d.dx
    const ny = cy + d.dy
    cells[cy * size + cx] &= ~d.w
    cells[ny * size + nx] &= ~d.ow
    visited[ny * size + nx] = 1
    stack.push([nx, ny])
  }
  return cells
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

type Phase = 'title' | 'playing' | 'clear' | 'done'

export default function Maze() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mazeRef = useRef<Uint8Array>(genMaze(9))
  const sizeRef = useRef(9)
  const playerRef = useRef({ x: 0, y: 0 })
  const visitedRef = useRef<Set<number>>(new Set([0]))
  const deadlineRef = useRef(0)
  const swipeRef = useRef<{ x: number; y: number } | null>(null)

  const [phase, setPhase] = useState<Phase>('title')
  const [level, setLevel] = useState(1)
  const [player, setPlayer] = useState({ x: 0, y: 0 })
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [message, setMessage] = useState('スタートからゴールを目指そう！')
  const [bestScore, setBestScore] = useState(() => {
    try { return Number(localStorage.getItem(BEST_SCORE_KEY) ?? 0) || 0 } catch { return 0 }
  })
  const [bestLevel, setBestLevel] = useState(() => {
    try { return Number(localStorage.getItem(BEST_LEVEL_KEY) ?? 0) || 0 } catch { return 0 }
  })
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const levelRef = useRef(level)
  levelRef.current = level
  const scoreRef = useRef(score)
  scoreRef.current = score

  const saveBest = (s: number, lv: number) => {
    if (s > bestScore) {
      setBestScore(s)
      try { localStorage.setItem(BEST_SCORE_KEY, String(s)) } catch { /* 保存できなくても遊べる */ }
    }
    if (lv > bestLevel) {
      setBestLevel(lv)
      try { localStorage.setItem(BEST_LEVEL_KEY, String(lv)) } catch { /* 保存できなくても遊べる */ }
    }
  }

  function setupLevel(lv: number) {
    const size = sizeForLevel(lv)
    sizeRef.current = size
    mazeRef.current = genMaze(size)
    playerRef.current = { x: 0, y: 0 }
    visitedRef.current = new Set([0])
    setPlayer({ x: 0, y: 0 })
    const limit = limitForLevel(lv)
    deadlineRef.current = Date.now() + limit * 1000
    setTimeLeft(limit)
    setLevel(lv)
    setMessage(`レベル${lv}：${size}×${size}の迷路。制限時間${limit}秒！`)
  }

  function startGame() {
    setScore(0)
    scoreRef.current = 0
    setupLevel(1)
    setPhase('playing')
  }

  function levelClear() {
    const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
    const bonus = 500 + left * 20
    const total = scoreRef.current + bonus
    setScore(total)
    scoreRef.current = total
    saveBest(total, levelRef.current)
    setPhase('clear')
    setMessage(`ゴール！ クリアボーナス ${bonus}点（残り${left}秒）`)
    ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.15, 0.06), i * 100))
  }

  function nextLevel() {
    setupLevel(levelRef.current + 1)
    setPhase('playing')
  }

  function timeUp() {
    if (phaseRef.current !== 'playing') return
    setPhase('done')
    saveBest(scoreRef.current, levelRef.current)
    const s = scoreRef.current
    setMessage(
      s > bestScore
        ? `時間切れ！ ${s}点でベスト更新！ レベル${levelRef.current}まで到達`
        : `時間切れ！ ${s}点（ベスト ${bestScore}点）。レベル${levelRef.current}まで到達`,
    )
    ;[392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.2, 0.06), i * 130))
  }

  function move(dx: number, dy: number) {
    if (phaseRef.current !== 'playing') return
    const p = playerRef.current
    const size = sizeRef.current
    const nx = p.x + dx
    const ny = p.y + dy
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) {
      beep(140, 0.05, 0.04)
      return
    }
    const walls = mazeRef.current[p.y * size + p.x]
    const bit = dx === 1 ? 2 : dx === -1 ? 8 : dy === 1 ? 4 : 1
    if (walls & bit) {
      beep(140, 0.05, 0.04)
      return
    }
    playerRef.current = { x: nx, y: ny }
    visitedRef.current.add(ny * size + nx)
    setPlayer({ x: nx, y: ny })
    if (nx === size - 1 && ny === size - 1) {
      beep(880, 0.12, 0.06)
      levelClear()
      return
    }
    beep(520, 0.03, 0.025)
  }

  // 制限時間のカウントダウン
  useEffect(() => {
    if (phase !== 'playing') return
    const id = window.setInterval(() => {
      const left = Math.max(0, (deadlineRef.current - Date.now()) / 1000)
      setTimeLeft(left)
      if (left <= 0) timeUp()
    }, 100)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // 迷路の描画
  useEffect(() => {
    let raf = 0
    const draw = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const size = sizeRef.current
        const cell = CANVAS / size
        const maze = mazeRef.current
        const p = playerRef.current
        ctx.clearRect(0, 0, CANVAS, CANVAS)
        ctx.fillStyle = '#fefce8'
        ctx.fillRect(0, 0, CANVAS, CANVAS)
        // 通ったマスの足あと
        ctx.fillStyle = 'rgba(37, 99, 235, 0.12)'
        for (const idx of visitedRef.current) {
          const vx = idx % size
          const vy = Math.floor(idx / size)
          ctx.fillRect(vx * cell + 1, vy * cell + 1, cell - 2, cell - 2)
        }
        // スタートとゴール
        ctx.fillStyle = 'rgba(22, 163, 74, 0.25)'
        ctx.fillRect(0, 0, cell, cell)
        ctx.fillStyle = 'rgba(245, 158, 11, 0.35)'
        ctx.fillRect((size - 1) * cell, (size - 1) * cell, cell, cell)
        ctx.fillStyle = '#b45309'
        ctx.font = `bold ${Math.max(12, cell * 0.6)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('★', (size - 0.5) * cell, (size - 0.5) * cell)
        // 壁
        ctx.strokeStyle = '#1f2937'
        ctx.lineWidth = Math.max(2, cell * 0.12)
        ctx.lineCap = 'square'
        ctx.beginPath()
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const w = maze[y * size + x]
            const x0 = x * cell
            const y0 = y * cell
            const x1 = x0 + cell
            const y1 = y0 + cell
            if (w & 1) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0) }
            if (w & 2) { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1) }
            if (w & 4) { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1) }
            if (w & 8) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1) }
          }
        }
        ctx.stroke()
        // プレイヤー
        ctx.fillStyle = '#2563eb'
        ctx.beginPath()
        ctx.arc((p.x + 0.5) * cell, (p.y + 0.5) * cell, cell * 0.32, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc((p.x + 0.5) * cell - cell * 0.1, (p.y + 0.5) * cell - cell * 0.08, cell * 0.07, 0, Math.PI * 2)
        ctx.arc((p.x + 0.5) * cell + cell * 0.12, (p.y + 0.5) * cell - cell * 0.08, cell * 0.07, 0, Math.PI * 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const k = e.key.toLowerCase()
    if (k === ' ' && phaseRef.current !== 'playing') {
      e.preventDefault()
      if (phaseRef.current === 'title' || phaseRef.current === 'done') startGame()
      else if (phaseRef.current === 'clear') nextLevel()
      return
    }
    const dir =
      e.key === 'ArrowUp' || k === 'w' ? { dx: 0, dy: -1 } :
      e.key === 'ArrowDown' || k === 's' ? { dx: 0, dy: 1 } :
      e.key === 'ArrowLeft' || k === 'a' ? { dx: -1, dy: 0 } :
      e.key === 'ArrowRight' || k === 'd' ? { dx: 1, dy: 0 } : null
    if (dir) {
      e.preventDefault()
      move(dir.dx, dir.dy)
    }
  }

  function onSwipeEnd(e: React.PointerEvent) {
    const s = swipeRef.current
    swipeRef.current = null
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0)
    else move(0, dy > 0 ? 1 : -1)
  }

  const lowTime = phase === 'playing' && timeLeft <= 10

  return (
    <div className="maze" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="maze-head">
        <span>レベル <b>{level}</b></span>
        <span className={lowTime ? 'maze-time-low' : ''}>残り {Math.ceil(timeLeft)}秒</span>
        <span>スコア <b>{score}</b>点</span>
        <span>ベスト {bestScore}点（Lv{bestLevel}）</span>
      </div>
      <canvas
        ref={canvasRef}
        className="maze-canvas"
        width={CANVAS}
        height={CANVAS}
        onPointerDown={(e) => { swipeRef.current = { x: e.clientX, y: e.clientY } }}
        onPointerUp={onSwipeEnd}
      />
      <p className="maze-msg">{message}</p>
      {phase === 'playing' && (
        <div className="maze-pad">
          <span />
          <button onPointerDown={(e) => { e.preventDefault(); move(0, -1) }} aria-label="上">↑</button>
          <span />
          <button onPointerDown={(e) => { e.preventDefault(); move(-1, 0) }} aria-label="左">←</button>
          <button onPointerDown={(e) => { e.preventDefault(); move(0, 1) }} aria-label="下">↓</button>
          <button onPointerDown={(e) => { e.preventDefault(); move(1, 0) }} aria-label="右">→</button>
        </div>
      )}
      {phase === 'title' && (
        <div className="maze-btns">
          <button onClick={startGame}>スタート</button>
        </div>
      )}
      {phase === 'clear' && (
        <div className="maze-btns">
          <button onClick={nextLevel}>次のレベルへ</button>
        </div>
      )}
      {phase === 'done' && (
        <div className="maze-btns">
          <button onClick={startGame}>もう一度</button>
          <button onClick={() => setPhase('title')}>タイトルへ</button>
        </div>
      )}
      <p className="maze-help">青い丸を動かして ★ のゴールを目指そう。レベルが上がるほど迷路が大きくなるよ。矢印キー／WASD／スワイプ／画面の方向ボタンで移動できるよ。ゴールでクリア、残り時間がボーナスになるよ。</p>
    </div>
  )
}
