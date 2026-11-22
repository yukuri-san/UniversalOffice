import { useEffect, useRef, useState } from 'react'

// ================= 倉庫番 =================
// # 壁 / ' ' 床 / '.' 目標 / '$' 荷物 / '@' プレイヤー
// 全10ステージはプッシュ基準BFSソルバーで解けることを検証済み。
const LEVELS: string[][] = [
  [
    '#####',
    '#   #',
    '#.$@#',
    '#   #',
    '#####',
  ],
  [
    '######',
    '#    #',
    '# .. #',
    '# $$ #',
    '#  @ #',
    '######',
  ],
  [
    '#######',
    '#     #',
    '# ... #',
    '# $$$ #',
    '#  @  #',
    '#     #',
    '#######',
  ],
  [
    '########',
    '#      #',
    '# ..#  #',
    '# $$   #',
    '#  @   #',
    '#      #',
    '########',
  ],
  [
    '#########',
    '#   #   #',
    '# $ # $ #',
    '# . # . #',
    '#   #   #',
    '#   @   #',
    '#########',
  ],
  [
    '#########',
    '#       #',
    '# ....  #',
    '# $$    #',
    '#  $$   #',
    '#   @   #',
    '#       #',
    '#########',
  ],
  [
    '##########',
    '#        #',
    '# .#..#. #',
    '#  $$$$  #',
    '#   @    #',
    '#        #',
    '##########',
  ],
  [
    '#########',
    '#   @   #',
    '# $ # $ #',
    '# . # . #',
    '#   #   #',
    '#       #',
    '#########',
  ],
  [
    '##########',
    '#        #',
    '# ..##.. #',
    '# $$##$$ #',
    '#   @    #',
    '#        #',
    '##########',
  ],
  [
    '###########',
    '#    #    #',
    '# ...#... #',
    '# $$$#$$$ #',
    '#    @    #',
    '#         #',
    '###########',
  ],
]

const BEST_KEY = 'webx-sokoban-best'
const PROGRESS_KEY = 'webx-sokoban-progress'

type Pos = [number, number]
const pkey = (r: number, c: number) => `${r},${c}`

interface LevelData {
  rows: number
  cols: number
  walls: Set<string>
  targets: Set<string>
  boxes: Pos[]
  player: Pos
}

function parseLevel(rows: string[]): LevelData {
  const walls = new Set<string>()
  const targets = new Set<string>()
  const boxes: Pos[] = []
  let player: Pos = [1, 1]
  rows.forEach((row, r) => {
    ;[...row].forEach((ch, c) => {
      if (ch === '#') walls.add(pkey(r, c))
      else if (ch === '.') targets.add(pkey(r, c))
      else if (ch === '$') boxes.push([r, c])
      else if (ch === '@') player = [r, c]
      else if (ch === '*') { boxes.push([r, c]); targets.add(pkey(r, c)) }
      else if (ch === '+') { player = [r, c]; targets.add(pkey(r, c)) }
    })
  })
  return { rows: rows.length, cols: rows[0].length, walls, targets, boxes, player }
}

function loadBest(): Record<number, number> {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<number, number> } catch { return {} }
}

interface Snap { player: Pos; boxes: Pos[] }

export function Sokoban() {
  const [level, setLevel] = useState(0)
  const [data, setData] = useState<LevelData>(() => parseLevel(LEVELS[0]))
  const [player, setPlayer] = useState<Pos>(data.player)
  const [boxes, setBoxes] = useState<Pos[]>(data.boxes)
  const [moves, setMoves] = useState(0)
  const [pushes, setPushes] = useState(0)
  const [best, setBest] = useState<Record<number, number>>(loadBest)
  const [unlocked, setUnlocked] = useState(() => {
    const n = Number(localStorage.getItem(PROGRESS_KEY) ?? 0) || 0
    return Math.max(0, Math.min(LEVELS.length - 1, n))
  })
  const [won, setWon] = useState(false)
  const historyRef = useRef<Snap[]>([])
  const touchRef = useRef<{ x: number; y: number } | null>(null)
  const stateRef = useRef({ player, boxes, won, level })
  stateRef.current = { player, boxes, won, level }

  const loadLevel = (idx: number) => {
    const d = parseLevel(LEVELS[idx])
    setData(d)
    setPlayer(d.player)
    setBoxes(d.boxes)
    setMoves(0)
    setPushes(0)
    setWon(false)
    setLevel(idx)
    historyRef.current = []
  }

  const boxSet = new Set(boxes.map(([r, c]) => pkey(r, c)))
  const isClear = boxes.length > 0 && boxes.every(([r, c]) => data.targets.has(pkey(r, c)))

  // クリア時のベスト記録と次ステージ解放
  useEffect(() => {
    if (!isClear || won) return
    setWon(true)
    setBest((prev) => {
      const cur = prev[level]
      if (cur !== undefined && cur <= moves) return prev
      const next = { ...prev, [level]: moves }
      localStorage.setItem(BEST_KEY, JSON.stringify(next))
      return next
    })
    setUnlocked((prev) => {
      const next = Math.min(LEVELS.length - 1, Math.max(prev, level + 1))
      if (next !== prev) localStorage.setItem(PROGRESS_KEY, String(next))
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClear])

  const move = (dr: number, dc: number) => {
    const s = stateRef.current
    if (s.won) return
    const [pr, pc] = s.player
    const nr = pr + dr, nc = pc + dc
    const nk = pkey(nr, nc)
    if (data.walls.has(nk)) return
    const bi = s.boxes.findIndex(([r, c]) => r === nr && c === nc)
    let nextBoxes = s.boxes
    let pushed = false
    if (bi >= 0) {
      const br = nr + dr, bc = nc + dc
      const bk = pkey(br, bc)
      if (data.walls.has(bk)) return
      if (s.boxes.some(([r, c]) => r === br && c === bc)) return
      nextBoxes = s.boxes.map(([r, c], i) => (i === bi ? ([br, bc] as Pos) : ([r, c] as Pos)))
      pushed = true
    }
    historyRef.current.push({ player: s.player, boxes: s.boxes })
    if (historyRef.current.length > 500) historyRef.current.shift()
    setPlayer([nr, nc])
    setBoxes(nextBoxes)
    setMoves((m) => m + 1)
    if (pushed) setPushes((p) => p + 1)
  }

  const undo = () => {
    const prev = historyRef.current.pop()
    if (!prev) return
    setPlayer(prev.player)
    setBoxes(prev.boxes)
    setMoves((m) => Math.max(0, m - 1))
    setWon(false)
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      const k = e.key
      if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); move(-1, 0) }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); move(1, 0) }
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); move(0, -1) }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); move(0, 1) }
      else if (k === 'u' || k === 'U' || (k === 'z' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); undo() }
      else if (k === 'r' || k === 'R') { loadLevel(stateRef.current.level) }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // 荷物が壁だけの角に詰まったら警告（壁2方向に挟まれ、目標上でない荷物）
  const deadlocked = boxes.some(([r, c]) => {
    if (data.targets.has(pkey(r, c))) return false
    const up = data.walls.has(pkey(r - 1, c))
    const dn = data.walls.has(pkey(r + 1, c))
    const lf = data.walls.has(pkey(r, c - 1))
    const rt = data.walls.has(pkey(r, c + 1))
    return (up && lf) || (up && rt) || (dn && lf) || (dn && rt)
  })

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchRef.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current
    touchRef.current = null
    if (!s) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s.x, dy = t.clientY - s.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    if (Math.abs(dx) > Math.abs(dy)) move(0, dx > 0 ? 1 : -1)
    else move(dy > 0 ? 1 : -1, 0)
  }

  const cell = (r: number, c: number) => {
    const k = pkey(r, c)
    if (data.walls.has(k)) return { cls: 'sokoban-wall', ch: '🧱' }
    const bi = boxes.findIndex(([br, bc]) => br === r && bc === c)
    if (bi >= 0) {
      const onTarget = data.targets.has(k)
      return { cls: onTarget ? 'sokoban-boxdone' : 'sokoban-box', ch: '📦' }
    }
    if (player[0] === r && player[1] === c) {
      return { cls: data.targets.has(k) ? 'sokoban-target' : 'sokoban-floor', ch: '🙂' }
    }
    if (data.targets.has(k)) return { cls: 'sokoban-target', ch: '◎' }
    return { cls: 'sokoban-floor', ch: '' }
  }

  const bestForLevel = best[level]

  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">ステージ<b>{level + 1} / {LEVELS.length}</b></span>
        <span className="game-stat inline">手数<b>{moves}</b></span>
        <span className="game-stat inline">押し数<b>{pushes}</b></span>
        {bestForLevel !== undefined && <span className="game-stat inline">ベスト<b>{bestForLevel}手</b></span>}
        {won && <span className="game-win">クリア！🎉</span>}
      </div>
      <div className="game-bar">
        {LEVELS.map((_, i) => (
          <button
            key={i}
            className="btn"
            disabled={i > unlocked}
            style={i === level ? { background: '#2563eb', color: '#fff' } : undefined}
            onClick={() => loadLevel(i)}
          >
            {i > unlocked ? `🔒 ${i + 1}` : `${i + 1}`}
          </button>
        ))}
      </div>
      <div
        className="sokoban-board"
        style={{ gridTemplateColumns: `repeat(${data.cols}, 34px)` }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {Array.from({ length: data.rows }, (_, r) =>
          Array.from({ length: data.cols }, (_, c) => {
            const { cls, ch } = cell(r, c)
            return <div key={`${r}-${c}`} className={`sokoban-cell ${cls}`}>{ch}</div>
          }),
        )}
      </div>
      {deadlocked && !won && <div className="game-hint">⚠️ 荷物が角に詰まっています。「1手戻る」で戻れます。</div>}
      {won && (
        <div className="game-bar">
          {level + 1 < LEVELS.length ? (
            <button className="btn accent" onClick={() => loadLevel(level + 1)}>次のステージへ →</button>
          ) : (
            <span className="game-win">全ステージクリア！🎉</span>
          )}
          <button className="btn" onClick={() => loadLevel(level)}>もう一度</button>
        </div>
      )}
      <div className="sokoban-dpad">
        <span />
        <button className="btn" aria-label="上へ" onClick={() => move(-1, 0)}>▲</button>
        <span />
        <button className="btn" aria-label="左へ" onClick={() => move(0, -1)}>◀</button>
        <button className="btn" aria-label="1手戻る" onClick={undo}>↩️</button>
        <button className="btn" aria-label="右へ" onClick={() => move(0, 1)}>▶</button>
        <span />
        <button className="btn" aria-label="下へ" onClick={() => move(1, 0)}>▼</button>
        <span />
      </div>
      <div className="game-bar">
        <button className="btn" onClick={undo}>1手戻る (U)</button>
        <button className="btn" onClick={() => loadLevel(level)}>最初から (R)</button>
      </div>
      <p className="hint">荷物📦をすべて目標◎の上に押して並べるとクリア。矢印キー／WASD・画面のボタン・スワイプで移動できます。荷物は引けないので、詰まったら「1手戻る」で戻りましょう。</p>
    </div>
  )
}
