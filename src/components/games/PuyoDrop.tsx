import { useCallback, useEffect, useRef, useState } from 'react'

/* ================= ぷよドロップ =================
 * ぷよぷよ風の落下連鎖パズル。
 * ・2個1組のぷよが落ちてくる。←→で移動、↑で回転、↓でソフトドロップ、Spaceでハードドロップ
 * ・同じ色が4個以上つながると消える。消えたあと落ちてつながると連鎖
 * ・難易度で色数と落下速度が変わる（やさしい＝4色／ふつう＝5色／つよい＝6色）
 * ・レベルは消したぷよ15個ごとに上がり、落下が速くなる
 * ・ベストスコアとプレイ数を保存 */

const COLS = 6
const ROWS = 12
const EMPTY = -1
const COLOR_NAMES = ['赤', '青', '緑', '黄', '紫', '桃']

type Difficulty = 'easy' | 'normal' | 'hard'
type Phase = 'idle' | 'playing' | 'paused' | 'over'
type Pair = { a: number; b: number }
type Cur = { x: number; y: number; rot: number; a: number; b: number }

const DIFFS: Record<Difficulty, { label: string; colors: number; baseMs: number }> = {
  easy: { label: 'やさしい', colors: 4, baseMs: 900 },
  normal: { label: 'ふつう', colors: 5, baseMs: 700 },
  hard: { label: 'つよい', colors: 6, baseMs: 550 },
}

const BEST_KEY = 'webx-puyodrop-best'
const GAMES_KEY = 'webx-puyodrop-games'

function emptyBoard(): number[][] {
  return Array.from({ length: ROWS }, () => Array<number>(COLS).fill(EMPTY))
}

function beep(freq: number, dur = 0.08, vol = 0.05) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = freq
    g.gain.value = vol
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
    o.stop(ctx.currentTime + dur)
  } catch {
    /* 音が出なくても遊べる */
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** rot に対する2個目のぷよの相対位置 */
function rotOffset(rot: number): [number, number] {
  if (rot === 0) return [0, -1]
  if (rot === 1) return [1, 0]
  if (rot === 2) return [0, 1]
  return [-1, 0]
}

export default function PuyoDrop() {
  const [diff, setDiff] = useState<Difficulty>('normal')
  const [phase, setPhase] = useState<Phase>('idle')
  const [board, setBoard] = useState<number[][]>(emptyBoard)
  const [cur, setCur] = useState<Cur | null>(null)
  const [nextPairs, setNextPairs] = useState<Pair[]>([])
  const [score, setScore] = useState(0)
  const [chain, setChain] = useState(0)
  const [level, setLevel] = useState(1)
  const [popped, setPopped] = useState(0)
  const [msg, setMsg] = useState('')
  const [popping, setPopping] = useState<Set<string>>(new Set())
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0) || 0)
  const [games, setGames] = useState(() => Number(localStorage.getItem(GAMES_KEY) ?? 0) || 0)

  const boardRef = useRef<number[][]>(emptyBoard())
  const curRef = useRef<Cur | null>(null)
  const nextRef = useRef<Pair[]>([])
  const scoreRef = useRef(0)
  const chainRef = useRef(0)
  const poppedRef = useRef(0)
  const levelRef = useRef(1)
  const phaseRef = useRef<Phase>('idle')
  const busyRef = useRef(false)
  const diffRef = useRef<Difficulty>('normal')
  const wrapRef = useRef<HTMLDivElement>(null)

  const sync = useCallback(() => {
    setBoard(boardRef.current.map((r) => [...r]))
    setCur(curRef.current ? { ...curRef.current } : null)
    setNextPairs([...nextRef.current])
    setScore(scoreRef.current)
    setChain(chainRef.current)
    setPopped(poppedRef.current)
    setLevel(levelRef.current)
  }, [])

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const randomPair = useCallback((): Pair => {
    const n = DIFFS[diffRef.current].colors
    return { a: Math.floor(Math.random() * n), b: Math.floor(Math.random() * n) }
  }, [])

  const canPlace = useCallback((x: number, y: number, rot: number): boolean => {
    const [dx, dy] = rotOffset(rot)
    const cells: [number, number][] = [[x, y], [x + dx, y + dy]]
    return cells.every(([cx, cy]) => cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS && boardRef.current[cy][cx] === EMPTY)
  }, [])

  const spawn = useCallback(() => {
    const pair = nextRef.current.shift() ?? randomPair()
    while (nextRef.current.length < 2) nextRef.current.push(randomPair())
    const c: Cur = { x: 2, y: 1, rot: 0, a: pair.a, b: pair.b }
    if (!canPlace(c.x, c.y, c.rot)) {
      curRef.current = null
      sync()
      setPhaseBoth('over')
      const g = games + 1
      setGames(g)
      localStorage.setItem(GAMES_KEY, String(g))
      if (scoreRef.current > best) {
        setBest(scoreRef.current)
        localStorage.setItem(BEST_KEY, String(scoreRef.current))
      }
      beep(196, 0.4, 0.06)
      beep(131, 0.5, 0.06)
      return
    }
    curRef.current = c
    sync()
  }, [best, canPlace, games, randomPair, setPhaseBoth, sync])

  const applyGravity = useCallback(() => {
    for (let x = 0; x < COLS; x++) {
      const col: number[] = []
      for (let y = ROWS - 1; y >= 0; y--) {
        if (boardRef.current[y][x] !== EMPTY) col.push(boardRef.current[y][x])
      }
      for (let y = ROWS - 1; y >= 0; y--) {
        boardRef.current[y][x] = col[ROWS - 1 - y] ?? EMPTY
      }
    }
  }, [])

  const findGroups = useCallback((): [number, number][][] => {
    const seen = new Set<string>()
    const groups: [number, number][][] = []
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = boardRef.current[y][x]
        if (c === EMPTY || seen.has(`${x},${y}`)) continue
        const stack: [number, number][] = [[x, y]]
        const group: [number, number][] = []
        seen.add(`${x},${y}`)
        while (stack.length > 0) {
          const [cx, cy] = stack.pop()!
          group.push([cx, cy])
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = cx + dx
            const ny = cy + dy
            if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
            if (boardRef.current[ny][nx] !== c || seen.has(`${nx},${ny}`)) continue
            seen.add(`${nx},${ny}`)
            stack.push([nx, ny])
          }
        }
        if (group.length >= 4) groups.push(group)
      }
    }
    return groups
  }, [])

  const resolve = useCallback(async () => {
    busyRef.current = true
    let ch = 0
    for (;;) {
      const groups = findGroups()
      if (groups.length === 0) break
      ch++
      chainRef.current = ch
      const cells = groups.flat()
      const gained = cells.length * 10 * ch + (ch - 1) * 50
      scoreRef.current += gained
      poppedRef.current += cells.length
      levelRef.current = Math.floor(poppedRef.current / 15) + 1
      setMsg(ch >= 2 ? `${ch}連鎖！ +${gained}` : `+${gained}`)
      setPopping(new Set(cells.map(([x, y]) => `${x},${y}`)))
      sync()
      beep(520 + ch * 80, 0.15, 0.06)
      await sleep(280)
      for (const [x, y] of cells) boardRef.current[y][x] = EMPTY
      setPopping(new Set())
      applyGravity()
      sync()
      await sleep(160)
      if (boardRef.current.every((r) => r.every((v) => v === EMPTY))) {
        scoreRef.current += 1000
        setMsg('全消しボーナス +1000！')
        sync()
        ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.2, 0.06), i * 110))
        await sleep(400)
      }
    }
    chainRef.current = 0
    setMsg('')
    busyRef.current = false
    sync()
    spawn()
  }, [applyGravity, findGroups, spawn, sync])

  const lockPiece = useCallback(() => {
    const c = curRef.current
    if (!c) return
    const [dx, dy] = rotOffset(c.rot)
    boardRef.current[c.y][c.x] = c.a
    boardRef.current[c.y + dy][c.x + dx] = c.b
    curRef.current = null
    sync()
    beep(220, 0.06, 0.04)
    void resolve()
  }, [resolve, sync])

  const stepDown = useCallback(() => {
    if (phaseRef.current !== 'playing' || busyRef.current) return
    const c = curRef.current
    if (!c) return
    if (canPlace(c.x, c.y + 1, c.rot)) {
      curRef.current = { ...c, y: c.y + 1 }
      sync()
    } else {
      lockPiece()
    }
  }, [canPlace, lockPiece, sync])

  const move = useCallback(
    (dx: number) => {
      if (phaseRef.current !== 'playing' || busyRef.current) return
      const c = curRef.current
      if (!c) return
      if (canPlace(c.x + dx, c.y, c.rot)) {
        curRef.current = { ...c, x: c.x + dx }
        sync()
        beep(440, 0.04, 0.03)
      }
    },
    [canPlace, sync],
  )

  const rotate = useCallback(() => {
    if (phaseRef.current !== 'playing' || busyRef.current) return
    const c = curRef.current
    if (!c) return
    const nr = (c.rot + 1) % 4
    for (const kx of [0, -1, 1]) {
      if (canPlace(c.x + kx, c.y, nr)) {
        curRef.current = { ...c, x: c.x + kx, rot: nr }
        sync()
        beep(500, 0.05, 0.04)
        return
      }
    }
  }, [canPlace, sync])

  const softDrop = useCallback(() => {
    if (phaseRef.current !== 'playing' || busyRef.current) return
    stepDown()
  }, [stepDown])

  const hardDrop = useCallback(() => {
    if (phaseRef.current !== 'playing' || busyRef.current) return
    const c = curRef.current
    if (!c) return
    let y = c.y
    while (canPlace(c.x, y + 1, c.rot)) y++
    curRef.current = { ...c, y }
    sync()
    beep(330, 0.06, 0.05)
    lockPiece()
  }, [canPlace, lockPiece, sync])

  const startGame = useCallback(() => {
    diffRef.current = diff
    boardRef.current = emptyBoard()
    scoreRef.current = 0
    chainRef.current = 0
    poppedRef.current = 0
    levelRef.current = 1
    nextRef.current = [randomPair(), randomPair()]
    setMsg('')
    setPopping(new Set())
    setPhaseBoth('playing')
    spawn()
    beep(660, 0.1, 0.05)
    wrapRef.current?.focus()
  }, [diff, randomPair, setPhaseBoth, spawn])

  const togglePause = useCallback(() => {
    if (phaseRef.current === 'playing') setPhaseBoth('paused')
    else if (phaseRef.current === 'paused') setPhaseBoth('playing')
  }, [setPhaseBoth])

  // 落下タイマー
  useEffect(() => {
    if (phase !== 'playing') return
    const ms = Math.max(250, Math.floor(DIFFS[diffRef.current].baseMs * Math.pow(0.92, level - 1)))
    const id = setInterval(stepDown, ms)
    return () => clearInterval(id)
  }, [phase, level, stepDown])

  // キーボード操作
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current === 'idle' || phaseRef.current === 'over') {
        if (e.key === 'Enter') startGame()
        return
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault()
        togglePause()
        return
      }
      if (phaseRef.current !== 'playing') return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        move(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        move(1)
      } else if (e.key === 'ArrowUp' || e.key === 'x' || e.key === 'X') {
        e.preventDefault()
        rotate()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        softDrop()
      } else if (e.key === ' ') {
        e.preventDefault()
        hardDrop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hardDrop, move, rotate, softDrop, startGame, togglePause])

  const curCells = new Map<string, number>()
  if (cur) {
    const [dx, dy] = rotOffset(cur.rot)
    curCells.set(`${cur.x},${cur.y}`, cur.a)
    curCells.set(`${cur.x + dx},${cur.y + dy}`, cur.b)
  }

  const renderPair = (p: Pair | undefined, size: 's' | 'l') =>
    p ? (
      <span className={`puyodrop-nextpair ${size}`}>
        <span className={`puyodrop-mini puyo-${p.a}`} title={COLOR_NAMES[p.a]} />
        <span className={`puyodrop-mini puyo-${p.b}`} title={COLOR_NAMES[p.b]} />
      </span>
    ) : null

  return (
    <div className="puyodrop" ref={wrapRef} tabIndex={0}>
      <h2>🫧 ぷよドロップ</h2>
      <div className="puyodrop-head">
        <span>スコア <b>{score}</b></span>
        <span>レベル <b>{level}</b></span>
        <span>消した数 <b>{popped}</b></span>
        <span>ベスト <b>{best}</b></span>
      </div>
      {chain >= 2 && <div className="puyodrop-chain">{chain}連鎖！</div>}
      {msg && <div className="puyodrop-msg">{msg}</div>}

      {phase === 'idle' && (
        <div className="puyodrop-rules">
          <p>2個1組のぷよが落ちてきます。同じ色を4個以上つなげて消そう！</p>
          <p>消えたあと落ちてつながると連鎖。連鎖するほど高得点！</p>
          <p>操作：←→ 移動／↑ 回転／↓ ゆっくり落とす／Space 一気に落とす／P 一時停止</p>
          <div className="puyodrop-diff">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button key={d} className={diff === d ? 'puyodrop-diff-on' : ''} onClick={() => setDiff(d)}>
                {DIFFS[d].label}（{DIFFS[d].colors}色）
              </button>
            ))}
          </div>
          <div className="puyodrop-start-row">
            <button className="puyodrop-start" onClick={startGame}>スタート</button>
          </div>
          <p className="puyodrop-best">ベストスコア：{best} ／ プレイ数：{games}回</p>
        </div>
      )}

      {(phase === 'playing' || phase === 'paused' || phase === 'over') && (
        <div className="puyodrop-main">
          <div className="puyodrop-board">
            {board.map((row, y) =>
              row.map((v, x) => {
                const curV = curCells.get(`${x},${y}`)
                const val = curV !== undefined ? curV : v
                const isPop = popping.has(`${x},${y}`)
                return (
                  <span key={`${x}-${y}`} className={`puyodrop-cell ${val >= 0 ? `puyo-${val}` : ''} ${isPop ? 'popping' : ''}`} />
                )
              }),
            )}
            {phase === 'paused' && <div className="puyodrop-overlay">一時停止中（Pで再開）</div>}
            {phase === 'over' && (
              <div className="puyodrop-overlay">
                ゲームオーバー
                <br />
                スコア {score}
                <br />
                <button onClick={startGame}>もう一度</button>
              </div>
            )}
          </div>
          <div className="puyodrop-side">
            <div className="puyodrop-next">
              <div>ネクスト</div>
              {renderPair(nextPairs[0], 'l')}
              <div className="puyodrop-next2">つぎ</div>
              {renderPair(nextPairs[1], 's')}
            </div>
            <div className="puyodrop-ctrl">
              <button onClick={() => move(-1)} aria-label="左">←</button>
              <button onClick={rotate} aria-label="回転">↻</button>
              <button onClick={() => move(1)} aria-label="右">→</button>
              <button onClick={softDrop} aria-label="下">↓</button>
              <button onClick={hardDrop} aria-label="一気に落とす">⤓</button>
              <button onClick={togglePause} aria-label="一時停止">{phase === 'paused' ? '▶' : '⏸'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
