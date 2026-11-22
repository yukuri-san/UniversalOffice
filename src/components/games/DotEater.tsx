import { useEffect, useRef, useState } from 'react'

// ================= ドットイーター =================
// 迷路を移動してドットを食べつくすアーケードゲーム。
// # 壁 / . ドット / o パワーエサ / ' ' 床 / P プレイヤー / G ゴーストの家
const LEVELS: string[][] = [
  [
    '###################',
    '#........#........#',
    '#o##.###.#.###.##o#',
    '#......#...#......#',
    '#.##.##.....##.##.#',
    '#......#...#......#',
    '####.###   ###.####',
    '#.....# GGG #.....#',
    '####.## ### ##.####',
    '#......#...#......#',
    '#.##.##.....##.##.#',
    '#......#...#......#',
    '#o##.##.#.#.##.##o#',
    '#........P........#',
    '###################',
  ],
  [
    '###################',
    '#o.......#.......o#',
    '#.##.###.#.###.##.#',
    '#......#...#......#',
    '##.#.### # ###.#.##',
    '#.....# GGG #.....#',
    '#.##.## ... ##.##.#',
    '#......#...#......#',
    '#.#####.....#####.#',
    '#......#...#......#',
    '#.##.##.....##.##.#',
    '#......#...#......#',
    '#o##.###.#.###.##o#',
    '#........P........#',
    '###################',
  ],
  [
    '###################',
    '#.................#',
    '#.###.###.###.###.#',
    '#o.....#...#.....o#',
    '###.#.###.###.#.###',
    '#.....# GGG #.....#',
    '#.###.##...##.###.#',
    '#......#...#......#',
    '#.##...#...#...##.#',
    '#o.....#...#.....o#',
    '####.###   ###.####',
    '#......#...#......#',
    '#.##.##.###.##.##.#',
    '#........P........#',
    '###################',
  ],
]

// レベルごとの速さ（1ティックのミリ秒）とゴーストの足止め間隔
const LEVEL_CFG = [
  { tickMs: 170, ghostSkip: 4, frightTicks: 42 },
  { tickMs: 150, ghostSkip: 6, frightTicks: 36 },
  { tickMs: 135, ghostSkip: 8, frightTicks: 30 },
]

const BEST_KEY = 'webx-doteater-best'

type Dir = { r: number; c: number }
const DIRS: Record<string, Dir> = {
  up: { r: -1, c: 0 },
  down: { r: 1, c: 0 },
  left: { r: 0, c: -1 },
  right: { r: 0, c: 1 },
}
const DIR_LIST: Dir[] = [DIRS.up, DIRS.down, DIRS.left, DIRS.right]

type GhostMode = 'house' | 'chase' | 'fright' | 'eaten'
interface Ghost {
  r: number
  c: number
  dir: Dir
  mode: GhostMode
  releaseAt: number
  color: string
  kind: 'chase' | 'ahead' | 'random' | 'shy'
}
type Status = 'ready' | 'playing' | 'paused' | 'dying' | 'levelclear' | 'gameover' | 'win'
interface GS {
  status: Status
  level: number
  score: number
  lives: number
  dots: Set<string>
  powers: Set<string>
  player: { r: number; c: number }
  dir: Dir
  nextDir: Dir
  ghosts: Ghost[]
  frightUntil: number
  ghostChain: number
  tick: number
  statusUntil: number
}

const pkey = (r: number, c: number) => `${r},${c}`

interface MazeData {
  rows: number
  cols: number
  walls: Set<string>
  dots: Set<string>
  powers: Set<string>
  player: { r: number; c: number }
  ghostSpawns: { r: number; c: number }[]
  door: { r: number; c: number }
  houseRow: number
  houseCenter: number
}

function parseMaze(rows: string[]): MazeData {
  const walls = new Set<string>()
  const dots = new Set<string>()
  const powers = new Set<string>()
  const ghostSpawns: { r: number; c: number }[] = []
  let player = { r: 1, c: 1 }
  let houseRow = -1
  let houseCenter = 9
  rows.forEach((row, r) => {
    ;[...row].forEach((ch, c) => {
      if (ch === '#') walls.add(pkey(r, c))
      else if (ch === '.') dots.add(pkey(r, c))
      else if (ch === 'o') powers.add(pkey(r, c))
      else if (ch === 'P') player = { r, c }
      else if (ch === 'G') {
        ghostSpawns.push({ r, c })
        houseRow = r
        houseCenter = c
      }
    })
  })
  // ドア＝家の1行上で中央に最も近い床マス
  let door = { r: houseRow - 1, c: houseCenter }
  let bestD = Infinity
  for (let c = 0; c < rows[0].length; c++) {
    const k = pkey(houseRow - 1, c)
    if (walls.has(k)) continue
    const d = Math.abs(c - houseCenter)
    if (d < bestD) { bestD = d; door = { r: houseRow - 1, c } }
  }
  return { rows: rows.length, cols: rows[0].length, walls, dots, powers, player, ghostSpawns, door, houseRow, houseCenter }
}

function loadBest(): number {
  const n = Number(localStorage.getItem(BEST_KEY) ?? 0)
  return Number.isFinite(n) ? n : 0
}

const GHOST_DEFS = [
  { color: '#ef4444', kind: 'chase' as const, releaseAt: 0 },
  { color: '#f472b6', kind: 'ahead' as const, releaseAt: 0 },
  { color: '#22d3ee', kind: 'random' as const, releaseAt: 25 },
  { color: '#fb923c', kind: 'shy' as const, releaseAt: 50 },
]

function buildLevel(level: number, score: number, lives: number): GS {
  const maze = parseMaze(LEVELS[level])
  const ghosts: Ghost[] = []
  // 1体目（赤）はドアの外から開始、残り3体は家の中から順に解放
  ghosts.push({ r: maze.door.r, c: maze.door.c, dir: DIRS.left, mode: 'chase', releaseAt: 0, color: GHOST_DEFS[0].color, kind: GHOST_DEFS[0].kind })
  maze.ghostSpawns.forEach((s, i) => {
    const def = GHOST_DEFS[i + 1]
    ghosts.push({ r: s.r, c: s.c, dir: DIRS.up, mode: 'house', releaseAt: def.releaseAt, color: def.color, kind: def.kind })
  })
  return {
    status: 'ready',
    level,
    score,
    lives,
    dots: new Set(maze.dots),
    powers: new Set(maze.powers),
    player: { ...maze.player },
    dir: DIRS.left,
    nextDir: DIRS.left,
    ghosts,
    frightUntil: 0,
    ghostChain: 0,
    tick: 0,
    statusUntil: 0,
  }
}

export function DotEater() {
  const mazeRef = useRef<MazeData>(parseMaze(LEVELS[0]))
  const gsRef = useRef<GS>(buildLevel(0, 0, 3))
  const [, setVer] = useState(0)
  const [best, setBest] = useState(loadBest)
  const touchRef = useRef<{ x: number; y: number } | null>(null)
  const bump = () => setVer((v) => v + 1)

  const gs = gsRef.current
  const maze = mazeRef.current
  const cfg = LEVEL_CFG[gs.level]

  const saveBest = (score: number) => {
    if (score > best) {
      setBest(score)
      localStorage.setItem(BEST_KEY, String(score))
    }
  }

  const startLevel = (level: number, score: number, lives: number) => {
    mazeRef.current = parseMaze(LEVELS[level])
    gsRef.current = buildLevel(level, score, lives)
    gsRef.current.status = 'playing'
    bump()
  }

  const resetGame = () => {
    startLevel(0, 0, 3)
  }

  const setDir = (d: Dir) => {
    const g = gsRef.current
    g.nextDir = d
    if (g.status === 'ready') {
      g.status = 'playing'
      bump()
    }
  }

  const togglePause = () => {
    const g = gsRef.current
    if (g.status === 'playing') { g.status = 'paused'; bump() }
    else if (g.status === 'paused') { g.status = 'playing'; bump() }
  }

  const inHouseZone = (r: number, c: number) => {
    const m = mazeRef.current
    return r >= m.houseRow - 1 && r <= m.houseRow + 1 && Math.abs(c - m.houseCenter) <= 2
  }

  const walkable = (r: number, c: number, forGhostOut: boolean) => {
    const m = mazeRef.current
    if (r < 0 || c < 0 || r >= m.rows || c >= m.cols) return false
    if (m.walls.has(pkey(r, c))) return false
    if (forGhostOut && inHouseZone(r, c)) return false
    return true
  }

  const ghostTarget = (g: Ghost): { r: number; c: number } => {
    const s = gsRef.current
    const m = mazeRef.current
    if (g.mode === 'house' || g.mode === 'eaten') return m.door
    const p = s.player
    if (g.kind === 'chase') return p
    if (g.kind === 'ahead') return { r: p.r + s.dir.r * 4, c: p.c + s.dir.c * 4 }
    if (g.kind === 'random') return { r: Math.floor(Math.random() * m.rows), c: Math.floor(Math.random() * m.cols) }
    // shy：プレイヤーから遠いときだけ追い、近いときは隅へ逃げる
    const d = Math.abs(p.r - g.r) + Math.abs(p.c - g.c)
    return d > 8 ? p : { r: 1, c: 1 }
  }

  const moveGhost = (g: Ghost) => {
    const m = mazeRef.current
    const out = g.mode !== 'house' && g.mode !== 'eaten'
    const options = DIR_LIST.filter((d) => {
      if (d.r === -g.dir.r && d.c === -g.dir.c) return false
      return walkable(g.r + d.r, g.c + d.c, out)
    })
    if (options.length === 0) {
      // 行き止まりなら反転を許可
      const back = { r: -g.dir.r, c: -g.dir.c }
      if (walkable(g.r + back.r, g.c + back.c, out)) { g.dir = back; g.r += back.r; g.c += back.c }
      return
    }
    let chosen: Dir
    if (g.mode === 'fright') {
      chosen = options[Math.floor(Math.random() * options.length)]
    } else {
      const t = ghostTarget(g)
      let bestD = Infinity
      chosen = options[0]
      for (const d of options) {
        const dd = Math.abs(g.r + d.r - t.r) + Math.abs(g.c + d.c - t.c)
        if (dd < bestD || (dd === bestD && Math.random() < 0.5)) { bestD = dd; chosen = d }
      }
    }
    g.dir = chosen
    g.r += chosen.r
    g.c += chosen.c
    if (g.mode === 'house' && g.r <= m.houseRow - 1) g.mode = 'chase'
    if (g.mode === 'eaten' && g.r === m.door.r && g.c === m.door.c) g.mode = 'chase'
  }

  const tick = () => {
    const g = gsRef.current
    if (g.status === 'dying' || g.status === 'levelclear') {
      if (g.tick >= g.statusUntil) {
        if (g.status === 'dying') {
          if (g.lives <= 0) { g.status = 'gameover'; saveBest(g.score) }
          else startLevel(g.level, g.score, g.lives)
        } else if (g.level + 1 < LEVELS.length) {
          startLevel(g.level + 1, g.score + 500, g.lives)
        } else {
          g.status = 'win'
          saveBest(g.score + 500)
        }
      }
      bump()
      return
    }
    if (g.status !== 'playing') return
    const m = mazeRef.current
    g.tick += 1
    const cfgNow = LEVEL_CFG[g.level]

    // プレイヤーの移動（次の方向へ曲がれれば曲がる）
    const tryDir = (d: Dir) => walkable(g.player.r + d.r, g.player.c + d.c, false)
    if (tryDir(g.nextDir)) g.dir = g.nextDir
    if (tryDir(g.dir)) {
      g.player = { r: g.player.r + g.dir.r, c: g.player.c + g.dir.c }
    }

    // ドット・パワーエサを食べる
    const pk = pkey(g.player.r, g.player.c)
    if (g.dots.delete(pk)) g.score += 10
    if (g.powers.delete(pk)) {
      g.score += 50
      g.frightUntil = g.tick + cfgNow.frightTicks
      g.ghostChain = 0
      for (const gh of g.ghosts) if (gh.mode === 'chase') gh.mode = 'fright'
    }

    // ゴーストの解放と移動（家の中のゴーストは解放時刻まで待機）
    for (const gh of g.ghosts) {
      if (gh.mode === 'house' && g.tick < gh.releaseAt) continue
      const isBlinky = gh === g.ghosts[0]
      const skip = !isBlinky && g.tick % cfgNow.ghostSkip === 0
      if (!skip) moveGhost(gh)
    }

    // イジケ状態の終了
    if (g.frightUntil > 0 && g.tick >= g.frightUntil) {
      g.frightUntil = 0
      for (const gh of g.ghosts) if (gh.mode === 'fright') gh.mode = 'chase'
    }

    // 衝突判定
    for (const gh of g.ghosts) {
      if (gh.r === g.player.r && gh.c === g.player.c) {
        if (gh.mode === 'fright') {
          const pts = 200 * 2 ** g.ghostChain
          g.score += pts
          g.ghostChain += 1
          gh.mode = 'eaten'
        } else if (gh.mode === 'chase') {
          g.lives -= 1
          g.status = 'dying'
          g.statusUntil = g.tick + 8
          bump()
          return
        }
      }
    }

    // クリア判定
    if (g.dots.size === 0 && g.powers.size === 0) {
      g.status = 'levelclear'
      g.statusUntil = g.tick + 10
    }
    bump()
  }

  useEffect(() => {
    if (gs.status !== 'playing' && gs.status !== 'dying' && gs.status !== 'levelclear') return
    const id = window.setInterval(tick, cfg.tickMs)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.status, gs.level])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      const k = e.key
      if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); setDir(DIRS.up) }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); setDir(DIRS.down) }
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); setDir(DIRS.left) }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); setDir(DIRS.right) }
      else if (k === 'p' || k === 'P') togglePause()
      else if (k === ' ') { e.preventDefault(); const s = gsRef.current; if (s.status === 'ready' || s.status === 'paused') { s.status = 'playing'; bump() } else if (s.status === 'playing') togglePause() }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? DIRS.right : DIRS.left)
    else setDir(dy > 0 ? DIRS.down : DIRS.up)
  }

  const cell = (r: number, c: number) => {
    const k = pkey(r, c)
    if (maze.walls.has(k)) return { cls: 'doteater-wall', ch: '' }
    const gh = gs.ghosts.find((x) => x.r === r && x.c === c)
    if (gh) {
      if (gh.mode === 'eaten') return { cls: 'doteater-floor', ch: '👀' }
      if (gh.mode === 'fright') return { cls: 'doteater-floor doteater-fright', ch: '👻' }
      return { cls: 'doteater-floor', ch: '👻', color: gh.color }
    }
    if (gs.player.r === r && gs.player.c === c) {
      return { cls: 'doteater-floor', ch: gs.status === 'dying' ? '💥' : '😋' }
    }
    if (gs.powers.has(k)) return { cls: 'doteater-floor doteater-power', ch: '●' }
    if (gs.dots.has(k)) return { cls: 'doteater-floor doteater-dot', ch: '•' }
    return { cls: 'doteater-floor', ch: '' }
  }

  const statusText =
    gs.status === 'ready' ? '矢印キー／WASD・画面のボタン・スワイプで移動。スタートで開始！'
    : gs.status === 'paused' ? '一時停止中です。Pキー／ボタンで再開。'
    : gs.status === 'dying' ? 'やられた！'
    : gs.status === 'levelclear' ? 'ステージクリア！ボーナス+500'
    : gs.status === 'gameover' ? 'ゲームオーバー'
    : gs.status === 'win' ? '全ステージクリア！🎉'
    : gs.frightUntil > gs.tick ? 'イジケ中！ゴーストを食べよう！' : 'ドットをすべて食べるとクリア'

  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">ステージ<b>{gs.level + 1} / {LEVELS.length}</b></span>
        <span className="game-stat inline">スコア<b>{gs.score}</b></span>
        <span className="game-stat inline">残機<b>{'❤️'.repeat(Math.max(0, gs.lives)) || '—'}</b></span>
        <span className="game-stat inline">ベスト<b>{best}</b></span>
        <span className="game-stat inline">残りドット<b>{gs.dots.size + gs.powers.size}</b></span>
      </div>
      <div
        className="doteater-board"
        style={{ gridTemplateColumns: `repeat(${maze.cols}, 24px)` }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {Array.from({ length: maze.rows }, (_, r) =>
          Array.from({ length: maze.cols }, (_, c) => {
            const { cls, ch, color } = cell(r, c)
            return <div key={`${r}-${c}`} className={`doteater-cell ${cls}`} style={color ? { color } : undefined}>{ch}</div>
          }),
        )}
      </div>
      <div className="game-hint">{statusText}</div>
      {(gs.status === 'gameover' || gs.status === 'win') && (
        <div className="game-bar">
          <span className="game-win">スコア {gs.score} ／ ベスト {Math.max(best, gs.score)}</span>
          <button className="btn accent" onClick={resetGame}>もう一度遊ぶ</button>
        </div>
      )}
      {gs.status === 'levelclear' && <div className="game-bar"><span className="game-win">次のステージへ…</span></div>}
      <div className="sokoban-dpad">
        <span />
        <button className="btn" aria-label="上へ" onClick={() => setDir(DIRS.up)}>▲</button>
        <span />
        <button className="btn" aria-label="左へ" onClick={() => setDir(DIRS.left)}>◀</button>
        <button className="btn" aria-label="一時停止" onClick={togglePause}>⏸</button>
        <button className="btn" aria-label="右へ" onClick={() => setDir(DIRS.right)}>▶</button>
        <span />
        <button className="btn" aria-label="下へ" onClick={() => setDir(DIRS.down)}>▼</button>
        <span />
      </div>
      <div className="game-bar">
        {gs.status === 'ready' && <button className="btn accent" onClick={() => { gsRef.current.status = 'playing'; bump() }}>スタート</button>}
        {(gs.status === 'playing' || gs.status === 'paused') && (
          <button className="btn" onClick={togglePause}>{gs.status === 'paused' ? '再開 (P)' : '一時停止 (P)'}</button>
        )}
        <button className="btn" onClick={resetGame}>はじめから</button>
      </div>
      <p className="hint">迷路のドットをすべて食べるとステージクリア。大きなエサ（●）を食べると一定時間ゴーストが青くなり、食べるとボーナス！ゴーストは4体で性格が違います。矢印キー／WASD・画面のボタン・スワイプで移動できます。</p>
    </div>
  )
}
