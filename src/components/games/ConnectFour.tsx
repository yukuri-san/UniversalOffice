import { useEffect, useRef, useState } from 'react'

/* ================= コネクトフォー =================
 * 7×6 の盤にコマを落としていく四目並べ。タテ・ヨコ・ナナメに
 * 4つ並べた方が勝ち。プレイヤー（赤）対 CPU（黄）。
 * ・列をクリック／タップ、または ←→キーで列を選び Enter／Space／↓キーで落とす
 * ・難易度3段階（やさしい／ふつう／つよい）。先攻・後攻も選べる
 * ・勝敗数を保存 */

const COLS = 7
const ROWS = 6
const EMPTY = 0
const ME = 1
const CPU = 2
const WINS_KEY = 'webx-connect4-wins'
const LOSES_KEY = 'webx-connect4-loses'
const DRAWS_KEY = 'webx-connect4-draws'

type Cell = 0 | 1 | 2
type Phase = 'title' | 'playing' | 'done'
type Difficulty = 'easy' | 'normal' | 'hard'

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

function fanfare() {
  ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.2, 0.07), i * 120))
}

function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => EMPTY as Cell))
}

/** その列に落としたときの行。満杯なら -1 */
function dropRow(board: Cell[][], col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === EMPTY) return r
  }
  return -1
}

/** 4つ並びを見つけて、その4マスの座標を返す。無ければ null */
function findWin(board: Cell[][]): [number, number][] | null {
  const dirs: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]]
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c]
      if (v === EMPTY) continue
      for (const [dr, dc] of dirs) {
        const cells: [number, number][] = [[r, c]]
        let ok = true
        for (let i = 1; i < 4; i++) {
          const nr = r + dr * i
          const nc = c + dc * i
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== v) { ok = false; break }
          cells.push([nr, nc])
        }
        if (ok) return cells
      }
    }
  }
  return null
}

/** そのマスに置いたとき、その色が4つ並ぶかどうか */
function winsAt(board: Cell[][], row: number, col: number, who: Cell): boolean {
  const dirs: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]]
  for (const [dr, dc] of dirs) {
    let n = 1
    for (const s of [1, -1]) {
      let r = row + dr * s
      let c = col + dc * s
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === who) {
        n++
        r += dr * s
        c += dc * s
      }
    }
    if (n >= 4) return true
  }
  return false
}

/** 空き列の一覧 */
function validCols(board: Cell[][]): number[] {
  const cols: number[] = []
  for (let c = 0; c < COLS; c++) if (board[0][c] === EMPTY) cols.push(c)
  return cols
}

/** 置いたコマを含む4マスの窓のうち、相手が入っていない窓で自分のコマ数を数える */
function windowScore(board: Cell[][], row: number, col: number, who: Cell): number {
  let score = 0
  const dirs: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]]
  for (const [dr, dc] of dirs) {
    for (let start = -3; start <= 0; start++) {
      let mine = 0
      let blocked = false
      for (let i = 0; i < 4; i++) {
        const r = row + dr * (start + i)
        const c = col + dc * (start + i)
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) { blocked = true; break }
        const v = board[r][c]
        if (v !== EMPTY && v !== who) { blocked = true; break }
        if (v === who) mine++
      }
      if (!blocked) score += mine * mine
    }
  }
  return score
}

function pickCpuCol(board: Cell[][], diff: Difficulty): number {
  const cols = validCols(board)
  if (cols.length === 0) return -1
  const shuffled = [...cols].sort(() => Math.random() - 0.5)
  if (diff === 'easy') return shuffled[0]
  // 1. 自分が勝てる手
  for (const c of shuffled) {
    const r = dropRow(board, c)
    if (r >= 0 && winsAt(board, r, c, CPU)) return c
  }
  // 2. 相手の勝ちをふさぐ手
  for (const c of shuffled) {
    const r = dropRow(board, c)
    if (r >= 0 && winsAt(board, r, c, ME)) return c
  }
  if (diff === 'normal') {
    // 中央寄りを優先してランダム
    const pref = [...shuffled].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3))
    return pref[0]
  }
  // つよい：次の手で相手に勝ちを渡さない手を選び、窓スコア＋中央寄りで評価
  let bestCol = shuffled[0]
  let bestScore = -Infinity
  for (const c of shuffled) {
    const r = dropRow(board, c)
    if (r < 0) continue
    const next = board.map((row) => [...row])
    next[r][c] = CPU
    // 次の相手の手で勝たれてしまうなら大きく減点
    let givesWin = false
    for (const oc of validCols(next)) {
      const or = dropRow(next, oc)
      if (or >= 0 && winsAt(next, or, oc, ME)) { givesWin = true; break }
    }
    const score = windowScore(next, r, c, CPU) * 10 + (3 - Math.abs(c - 3)) * 2 - (givesWin ? 1000 : 0)
    if (score > bestScore) { bestScore = score; bestCol = c }
  }
  return bestCol
}

function loadNum(key: string): number {
  try { return Number(localStorage.getItem(key) ?? 0) || 0 } catch { return 0 }
}

export default function ConnectFour() {
  const [phase, setPhase] = useState<Phase>('title')
  const [board, setBoard] = useState<Cell[][]>(() => emptyBoard())
  const [turn, setTurn] = useState<Cell>(ME)
  const [cursor, setCursor] = useState(3)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [first, setFirst] = useState<Cell>(ME)
  const [winCells, setWinCells] = useState<[number, number][] | null>(null)
  const [lastMove, setLastMove] = useState<[number, number] | null>(null)
  const [message, setMessage] = useState('難易度と先攻・後攻を選んで「スタート」！')
  const [wins, setWins] = useState(() => loadNum(WINS_KEY))
  const [loses, setLoses] = useState(() => loadNum(LOSES_KEY))
  const [draws, setDraws] = useState(() => loadNum(DRAWS_KEY))
  const cpuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boardRef = useRef(board)
  boardRef.current = board
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const turnRef = useRef(turn)
  turnRef.current = turn
  const diffRef = useRef(difficulty)
  diffRef.current = difficulty

  useEffect(() => {
    return () => {
      if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current)
    }
  }, [])

  function saveResult(result: 'win' | 'lose' | 'draw') {
    if (result === 'win') {
      const v = wins + 1
      setWins(v)
      try { localStorage.setItem(WINS_KEY, String(v)) } catch { /* 保存できなくても遊べる */ }
    } else if (result === 'lose') {
      const v = loses + 1
      setLoses(v)
      try { localStorage.setItem(LOSES_KEY, String(v)) } catch { /* 保存できなくても遊べる */ }
    } else {
      const v = draws + 1
      setDraws(v)
      try { localStorage.setItem(DRAWS_KEY, String(v)) } catch { /* 保存できなくても遊べる */ }
    }
  }

  /** 1手を盤に反映し、勝敗判定まで行う。次に手番が来る人の色を返す */
  function applyMove(next: Cell[][], who: Cell): Cell {
    const win = findWin(next)
    if (win) {
      setWinCells(win)
      setPhase('done')
      if (who === ME) {
        fanfare()
        setMessage('4つ並んだ！ あなたの勝ち！')
        saveResult('win')
      } else {
        beep(220, 0.3, 0.07)
        setMessage('CPUの4つ並び…。あなたの負け。')
        saveResult('lose')
      }
      return who
    }
    if (next.every((row) => row.every((v) => v !== EMPTY))) {
      setPhase('done')
      beep(330, 0.2, 0.06)
      setMessage('盤がいっぱい！ 引き分け。')
      saveResult('draw')
      return who
    }
    return who === ME ? CPU : ME
  }

  function drop(col: number, who: Cell) {
    const b = boardRef.current
    const r = dropRow(b, col)
    if (r < 0) return false
    const next = b.map((row) => [...row])
    next[r][col] = who
    setBoard(next)
    setLastMove([r, col])
    beep(who === ME ? 660 : 440, 0.08, 0.06)
    const nextTurn = applyMove(next, who)
    setTurn(nextTurn)
    const ended = findWin(next) !== null || next.every((row) => row.every((v) => v !== EMPTY))
    if (!ended && nextTurn === CPU) {
      setMessage('CPUが考え中…')
      if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current)
      cpuTimerRef.current = setTimeout(() => {
        const c = pickCpuCol(boardRef.current, diffRef.current)
        if (c >= 0 && phaseRef.current === 'playing') drop(c, CPU)
      }, 600)
    } else if (!ended && nextTurn === ME) {
      setMessage('あなたの番。列を選んでコマを落とそう')
    }
    return true
  }

  function startGame() {
    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current)
    setBoard(emptyBoard())
    setWinCells(null)
    setLastMove(null)
    setTurn(first)
    setCursor(3)
    setPhase('playing')
    if (first === ME) {
      setMessage('あなたの番。列を選んでコマを落とそう')
      beep(660, 0.12, 0.06)
    } else {
      setMessage('CPUが考え中…')
      cpuTimerRef.current = setTimeout(() => {
        const c = pickCpuCol(emptyBoard(), diffRef.current)
        if (c >= 0) drop(c, CPU)
      }, 600)
    }
  }

  function onColumnClick(col: number) {
    if (phaseRef.current !== 'playing' || turnRef.current !== ME) return
    setCursor(col)
    drop(col, ME)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === ' ') e.preventDefault()
    if (phase === 'title' && e.key === ' ') { startGame(); return }
    if (phase === 'done' && e.key === ' ') { startGame(); return }
    if (phase !== 'playing' || turn !== ME) return
    if (e.key === 'ArrowLeft') { setCursor((c) => Math.max(0, c - 1)); e.preventDefault() }
    else if (e.key === 'ArrowRight') { setCursor((c) => Math.min(COLS - 1, c + 1)); e.preventDefault() }
    else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      drop(cursor, ME)
      e.preventDefault()
    }
  }

  const winSet = new Set((winCells ?? []).map(([r, c]) => `${r}-${c}`))
  const diffLabel = difficulty === 'easy' ? 'やさしい' : difficulty === 'normal' ? 'ふつう' : 'つよい'

  return (
    <div className="connect4" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="connect4-head">
        <span>勝ち <b>{wins}</b></span>
        <span>負け <b>{loses}</b></span>
        <span>引き分け <b>{draws}</b></span>
        <span>難易度 {diffLabel}</span>
      </div>
      {phase === 'title' && (
        <div className="connect4-setup">
          <div className="connect4-setup-row">
            <span>難易度</span>
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button key={d} className={difficulty === d ? 'selected' : ''} onClick={() => setDifficulty(d)}>
                {d === 'easy' ? 'やさしい' : d === 'normal' ? 'ふつう' : 'つよい'}
              </button>
            ))}
          </div>
          <div className="connect4-setup-row">
            <span>先攻・後攻</span>
            <button className={first === ME ? 'selected' : ''} onClick={() => setFirst(ME)}>先攻（あなた）</button>
            <button className={first === CPU ? 'selected' : ''} onClick={() => setFirst(CPU)}>後攻（CPU）</button>
          </div>
        </div>
      )}
      <div className="connect4-board" role="grid" aria-label="コネクトフォーの盤">
        <div className="connect4-drop-row">
          {Array.from({ length: COLS }, (_, c) => (
            <button
              key={c}
              className={`connect4-drop${cursor === c && phase === 'playing' && turn === ME ? ' active' : ''}`}
              onClick={() => onColumnClick(c)}
              disabled={phase !== 'playing' || turn !== ME}
              aria-label={`${c + 1}列目に落とす`}
            >
              {cursor === c && phase === 'playing' && turn === ME ? '🔴' : '▼'}
            </button>
          ))}
        </div>
        {board.map((row, r) => (
          <div key={r} className="connect4-row">
            {row.map((v, c) => {
              const isWin = winSet.has(`${r}-${c}`)
              const isLast = lastMove !== null && lastMove[0] === r && lastMove[1] === c
              return (
                <button
                  key={c}
                  className={`connect4-cell${v === ME ? ' me' : ''}${v === CPU ? ' cpu' : ''}${isWin ? ' win' : ''}${isLast ? ' last' : ''}`}
                  onClick={() => onColumnClick(c)}
                  disabled={phase !== 'playing' || turn !== ME}
                  aria-label={`${r + 1}行目${c + 1}列目${v === ME ? ' 赤' : v === CPU ? ' 黄' : ' 空き'}`}
                >
                  {v === ME ? '●' : v === CPU ? '●' : ''}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <p className="connect4-msg">{message}</p>
      <div className="connect4-btns">
        {phase === 'title' && <button onClick={startGame}>スタート</button>}
        {phase === 'playing' && <button onClick={startGame}>はじめから</button>}
        {phase === 'done' && (
          <>
            <button onClick={startGame}>もう一度</button>
            <button onClick={() => setPhase('title')}>タイトルへ</button>
          </>
        )}
      </div>
      <p className="connect4-help">7×6の盤にコマを上から落としていく四目並べ。タテ・ヨコ・ナナメのどれかで4つ並べた方が勝ち。列をクリック／タップするか、←→キーで列を選んでEnter／Space／↓キーで落とすよ。「つよい」のCPUは勝ち手を狙い、あなたの勝ちをふさぎ、次に勝たれない手を選ぶよ。</p>
    </div>
  )
}
