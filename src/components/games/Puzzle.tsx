import { useMemo, useState } from 'react'

/* ================= マインスイーパ ================= */
const MW = 10, MH = 10, MINES = 14
interface MCell { mine: boolean; open: boolean; flag: boolean; n: number }
function genMines(firstR: number, firstC: number): MCell[][] {
  const cells: MCell[][] = Array.from({ length: MH }, () => Array.from({ length: MW }, () => ({ mine: false, open: false, flag: false, n: 0 })))
  let placed = 0
  while (placed < MINES) {
    const r = Math.floor(Math.random() * MH), c = Math.floor(Math.random() * MW)
    if (cells[r][c].mine || (Math.abs(r - firstR) <= 1 && Math.abs(c - firstC) <= 1)) continue
    cells[r][c].mine = true; placed++
  }
  for (let r = 0; r < MH; r++) for (let c = 0; c < MW; c++) {
    let n = 0
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc
      if (nr >= 0 && nr < MH && nc >= 0 && nc < MW && cells[nr][nc].mine) n++
    }
    cells[r][c].n = n
  }
  return cells
}
const NUM_COLORS = ['', '#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#b45309', '#0891b2', '#111827', '#4b5563']
export function Minesweeper() {
  const [cells, setCells] = useState<MCell[][] | null>(null)
  const [state, setState] = useState<'ready' | 'playing' | 'won' | 'lost'>('ready')
  const [flags, setFlags] = useState(0)
  const open = (r: number, c: number) => {
    let board = cells
    if (!board) { board = genMines(r, c); setState('playing') }
    if (board[r][c].flag || board[r][c].open) return
    const nb = board.map((row) => row.map((cell) => ({ ...cell })))
    if (nb[r][c].mine) {
      nb.forEach((row) => row.forEach((cell) => { if (cell.mine) cell.open = true }))
      setCells(nb); setState('lost'); return
    }
    const flood = (rr: number, cc: number) => {
      if (rr < 0 || rr >= MH || cc < 0 || cc >= MW) return
      const cell = nb[rr][cc]
      if (cell.open || cell.flag) return
      cell.open = true
      if (cell.n === 0) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) flood(rr + dr, cc + dc)
    }
    flood(r, c)
    const opened = nb.flat().filter((cell) => cell.open).length
    if (opened === MW * MH - MINES) setState('won')
    setCells(nb)
  }
  const toggleFlag = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault()
    if (!cells || cells[r][c].open || state === 'won' || state === 'lost') return
    const nb = cells.map((row) => row.map((cell) => ({ ...cell })))
    nb[r][c].flag = !nb[r][c].flag
    setFlags((f) => f + (nb[r][c].flag ? 1 : -1))
    setCells(nb)
  }
  const reset = () => { setCells(null); setState('ready'); setFlags(0) }
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">地雷<b>{MINES}</b></span>
        <span className="game-stat inline">旗<b>{flags}</b></span>
        {state === 'won' && <span className="game-win">クリア！🎉</span>}
        {state === 'lost' && <span className="game-over">地雷を踏んだ…</span>}
        <button className="btn accent" onClick={reset}>リスタート</button>
      </div>
      <div className="mine-grid">
        {(cells ?? Array.from({ length: MH }, () => Array.from({ length: MW }, () => ({ mine: false, open: false, flag: false, n: 0 } as MCell)))).map((row, r) =>
          row.map((cell, c) => (
            <button
              key={`${r}-${c}`}
              className={cell.open ? 'mine-cell open' : 'mine-cell'}
              style={{ color: cell.open && !cell.mine ? NUM_COLORS[cell.n] : undefined }}
              onClick={() => (state !== 'won' && state !== 'lost') && open(r, c)}
              onContextMenu={(e) => toggleFlag(e, r, c)}
            >
              {cell.open ? (cell.mine ? '💣' : cell.n || '') : cell.flag ? '🚩' : ''}
            </button>
          ))
        )}
      </div>
      <p className="game-help">クリックで開く／右クリック（長押し不可）で旗。最初のクリックは必ず安全です。</p>
    </div>
  )
}

/* ================= 数独 ================= */
function solveSudoku(grid: number[][]): boolean {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (grid[r][c] !== 0) continue
    for (let n = 1; n <= 9; n++) {
      const ok = !grid[r].includes(n) && !grid.some((row) => row[c] === n) &&
        !(() => { const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (grid[br + i][bc + j] === n) return true; return false })()
      if (ok) { grid[r][c] = n; if (solveSudoku(grid)) return true; grid[r][c] = 0 }
    }
    return false
  }
  return true
}
function makePuzzle(holes: number): { puzzle: number[][]; solution: number[][] } {
  const grid = Array.from({ length: 9 }, () => Array(9).fill(0))
  // 対角ブロックを埋めてから解く（生成を速くする）
  for (const b of [0, 3, 6]) {
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) grid[b + i][b + j] = nums[i * 3 + j]
  }
  solveSudoku(grid)
  const solution = grid.map((row) => [...row])
  const puzzle = grid.map((row) => [...row])
  const positions = Array.from({ length: 81 }, (_, i) => i).sort(() => Math.random() - 0.5)
  for (let k = 0; k < holes; k++) {
    const p = positions[k]
    puzzle[Math.floor(p / 9)][p % 9] = 0
  }
  return { puzzle, solution }
}
export function Sudoku() {
  const [holes, setHoles] = useState(36)
  const [game, setGame] = useState(() => makePuzzle(36))
  const [input, setInput] = useState<number[][]>(() => game.puzzle.map((row) => [...row]))
  const [sel, setSel] = useState<[number, number]>([0, 0])
  const [done, setDone] = useState(false)
  const start = (h: number) => {
    const g = makePuzzle(h)
    setGame(g); setInput(g.puzzle.map((row) => [...row])); setDone(false); setHoles(h)
  }
  const put = (n: number) => {
    const [r, c] = sel
    if (game.puzzle[r][c] !== 0) return
    const nb = input.map((row) => [...row])
    nb[r][c] = n
    setInput(nb)
    if (nb.every((row, i) => row.every((v, j) => v === game.solution[i][j]))) setDone(true)
  }
  const wrongCount = useMemo(() => input.flat().filter((v, i) => {
    const r = Math.floor(i / 9), c = i % 9
    return game.puzzle[r][c] === 0 && v !== 0 && v !== game.solution[r][c]
  }).length, [input, game])
  return (
    <div className="game-app col">
      <div className="game-bar">
        <select value={holes} onChange={(e) => start(Number(e.target.value))}>
          <option value={28}>かんたん</option>
          <option value={36}>ふつう</option>
          <option value={46}>むずかしい</option>
        </select>
        <button className="btn accent" onClick={() => start(holes)}>新しい問題</button>
        {done && <span className="game-win">完成！🎉</span>}
        {!done && wrongCount > 0 && <span className="game-over">間違い {wrongCount} 件</span>}
      </div>
      <div className="sudoku">
        {input.map((row, r) => row.map((v, c) => {
          const fixed = game.puzzle[r][c] !== 0
          const wrong = !fixed && v !== 0 && v !== game.solution[r][c]
          return (
            <button
              key={`${r}-${c}`}
              className={`sudoku-cell${sel[0] === r && sel[1] === c ? ' sel' : ''}${(c + 1) % 3 === 0 && c < 8 ? ' br' : ''}${(r + 1) % 3 === 0 && r < 8 ? ' bb' : ''}`}
              style={{ color: fixed ? '#111827' : wrong ? '#dc2626' : '#2563eb', fontWeight: fixed ? 700 : 400 }}
              onClick={() => setSel([r, c])}
            >
              {v || ''}
            </button>
          )
        }))}
      </div>
      <div className="game-pad wide">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} className="btn" onClick={() => put(n)}>{n}</button>)}
        <button className="btn" onClick={() => put(0)}>消</button>
      </div>
    </div>
  )
}
