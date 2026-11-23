import { useEffect, useRef, useState } from 'react'

/* ================= チェッカー =================
 * 8×8 の盤で遊ぶチェッカー（ドラフツ）。自分のコマ（赤）対 CPU（黒）。
 * ・コマはナナメ前に1マス進む。相手のコマを飛び越えて空きマスに
 *   着地すると取れる（連続ジャンプ可）。取れる手があるときは取る手が必須
 * ・一番奥まで進むとキングになり、ナナメ4方向に動ける
 * ・相手のコマを全部取るか、相手が動けなくなれば勝ち
 * ・難易度3段階（やさしい／ふつう／つよい）。先攻・後攻も選べる
 * ・勝敗数を保存 */

const SIZE = 8
const EMPTY = 0
const ME = 1
const CPU = -1
const WINS_KEY = 'webx-checkers-wins'
const LOSES_KEY = 'webx-checkers-loses'
const DRAWS_KEY = 'webx-checkers-draws'

type Piece = 0 | 1 | 2 | -1 | -2
type Side = 1 | -1
type Board = Piece[][]
type Phase = 'title' | 'playing' | 'done'
type Difficulty = 'easy' | 'normal' | 'hard'

interface Move {
  from: [number, number]
  to: [number, number]
  caps: [number, number][]
  path: [number, number][]
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

function fanfare() {
  ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.2, 0.07), i * 120))
}

function loadNum(key: string): number {
  try {
    return Number(localStorage.getItem(key) ?? 0) || 0
  } catch {
    return 0
  }
}

function inBoard(r: number, c: number): boolean {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE
}

function isKing(p: Piece): boolean {
  return p === 2 || p === -2
}

function sideOf(p: Piece): Side | 0 {
  if (p > 0) return 1
  if (p < 0) return -1
  return 0
}

function initialBoard(): Board {
  const b: Board = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => EMPTY as Piece))
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 0) continue
      if (r < 3) b[r][c] = -1
      else if (r > 4) b[r][c] = 1
    }
  }
  return b
}

function cloneBoard(b: Board): Board {
  return b.map((row) => [...row])
}

/** そのコマの連続ジャンプ（取り手）をすべて列挙する */
function findCaptures(board: Board, r: number, c: number, side: Side): Move[] {
  const piece = board[r][c]
  const king = isKing(piece)
  const dirs: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
  const results: Move[] = []
  const captured = new Set<string>()
  const path: [number, number][] = [[r, c]]

  function dfs(br: number, bc: number, b: Board) {
    let jumped = false
    for (const [dr, dc] of dirs) {
      const mr = br + dr
      const mc = bc + dc
      const lr = br + dr * 2
      const lc = bc + dc * 2
      if (!inBoard(lr, lc) || !inBoard(mr, mc)) continue
      const mid = b[mr][mc]
      if (sideOf(mid) !== -side || captured.has(`${mr}-${mc}`)) continue
      if (b[lr][lc] !== EMPTY) continue
      // ふつうのコマが奥の端まで来たらそこで止まる（キングに成る）
      const reachEnd = !king && ((side === 1 && lr === 0) || (side === -1 && lr === SIZE - 1))
      const nb = cloneBoard(b)
      nb[mr][mc] = EMPTY
      nb[br][bc] = EMPTY
      nb[lr][lc] = piece
      captured.add(`${mr}-${mc}`)
      path.push([lr, lc])
      if (reachEnd) {
        results.push({ from: [r, c], to: [lr, lc], caps: [...captured].map((s) => s.split('-').map(Number) as [number, number]), path: [...path] })
      } else {
        dfs(lr, lc, nb)
      }
      path.pop()
      captured.delete(`${mr}-${mc}`)
      jumped = true
    }
    if (!jumped && path.length > 1) {
      results.push({ from: [r, c], to: [br, bc], caps: [...captured].map((s) => s.split('-').map(Number) as [number, number]), path: [...path] })
    }
  }

  dfs(r, c, board)
  return results
}

/** 取れる手があれば取り手だけ、無ければふつうの手を返す（取る手は必須） */
function genMoves(board: Board, side: Side): Move[] {
  const caps: Move[] = []
  const quiet: Move[] = []
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = board[r][c]
      if (sideOf(p) !== side) continue
      const seqs = findCaptures(board, r, c, side)
      if (seqs.length > 0) {
        caps.push(...seqs)
        continue
      }
      const fwd = side === 1 ? -1 : 1
      const dirs: [number, number][] = isKing(p)
        ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
        : [[fwd, 1], [fwd, -1]]
      for (const [dr, dc] of dirs) {
        const nr = r + dr
        const nc = c + dc
        if (inBoard(nr, nc) && board[nr][nc] === EMPTY) {
          quiet.push({ from: [r, c], to: [nr, nc], caps: [], path: [[r, c], [nr, nc]] })
        }
      }
    }
  }
  return caps.length > 0 ? caps : quiet
}

/** 手を盤に適用する（取る・キング昇格つき） */
function applyMove(board: Board, move: Move, side: Side): Board {
  const b = cloneBoard(board)
  const [fr, fc] = move.from
  const [tr, tc] = move.to
  const piece = b[fr][fc]
  b[fr][fc] = EMPTY
  for (const [cr, cc] of move.caps) b[cr][cc] = EMPTY
  let np: Piece = piece
  if (!isKing(piece)) {
    if (side === 1 && tr === 0) np = 2
    if (side === -1 && tr === SIZE - 1) np = -2
  }
  b[tr][tc] = np
  return b
}

function countPieces(board: Board, side: Side): number {
  let n = 0
  for (const row of board) for (const v of row) if (sideOf(v) === side) n++
  return n
}

/** CPU側から見た評価値（コマの価値＋前進＋中央） */
function evaluate(board: Board): number {
  let s = 0
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = board[r][c]
      if (p === EMPTY) continue
      let v = isKing(p) ? 300 : 100
      v += isKing(p) ? 0 : (p < 0 ? r * 6 : (SIZE - 1 - r) * 6)
      if (c >= 2 && c <= 5) v += 8
      s += p < 0 ? v : -v
    }
  }
  return s
}

function minimax(board: Board, side: Side, depth: number, alpha: number, beta: number): number {
  const moves = genMoves(board, side)
  if (moves.length === 0) return side === CPU ? -100000 - depth : 100000 + depth
  if (depth === 0) return evaluate(board)
  if (side === CPU) {
    let best = -Infinity
    for (const m of moves) {
      const v = minimax(applyMove(board, m, side), -side as Side, depth - 1, alpha, beta)
      best = Math.max(best, v)
      alpha = Math.max(alpha, v)
      if (beta <= alpha) break
    }
    return best
  }
  let best = Infinity
  for (const m of moves) {
    const v = minimax(applyMove(board, m, side), -side as Side, depth - 1, alpha, beta)
    best = Math.min(best, v)
    beta = Math.min(beta, v)
    if (beta <= alpha) break
  }
  return best
}

function pickCpuMove(board: Board, diff: Difficulty): Move | null {
  const moves = genMoves(board, CPU)
  if (moves.length === 0) return null
  if (diff === 'easy') return moves[Math.floor(Math.random() * moves.length)]
  if (diff === 'normal') {
    let best: Move | null = null
    let bestScore = -Infinity
    for (const m of moves) {
      const nb = applyMove(board, m, CPU)
      let s = evaluate(nb) + m.caps.length * 60 + Math.random() * 20
      if (m.to[0] === SIZE - 1) s += 40
      if (s > bestScore) { bestScore = s; best = m }
    }
    return best
  }
  let best: Move | null = null
  let bestScore = -Infinity
  for (const m of moves) {
    const v = minimax(applyMove(board, m, CPU), ME, 3, -Infinity, Infinity)
    if (v > bestScore) { bestScore = v; best = m }
  }
  return best
}

export default function Checkers() {
  const [board, setBoard] = useState<Board>(initialBoard)
  const [turn, setTurn] = useState<Side>(ME)
  const [phase, setPhase] = useState<Phase>('title')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [first, setFirst] = useState<Side>(ME)
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [targets, setTargets] = useState<Move[]>([])
  const [cursor, setCursor] = useState<[number, number]>([5, 1])
  const [message, setMessage] = useState('チェッカーでCPUと対戦しよう。赤があなた、黒がCPUだよ。')
  const [wins, setWins] = useState(() => loadNum(WINS_KEY))
  const [loses, setLoses] = useState(() => loadNum(LOSES_KEY))
  const [draws, setDraws] = useState(() => loadNum(DRAWS_KEY))
  const boardRef = useRef(board)
  const turnRef = useRef(turn)
  const phaseRef = useRef(phase)
  const diffRef = useRef(difficulty)
  const quietRef = useRef(0)
  const cpuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { diffRef.current = difficulty }, [difficulty])

  function saveResult(kind: 'win' | 'lose' | 'draw') {
    try {
      if (kind === 'win') {
        const v = wins + 1
        setWins(v)
        localStorage.setItem(WINS_KEY, String(v))
      } else if (kind === 'lose') {
        const v = loses + 1
        setLoses(v)
        localStorage.setItem(LOSES_KEY, String(v))
      } else {
        const v = draws + 1
        setDraws(v)
        localStorage.setItem(DRAWS_KEY, String(v))
      }
    } catch { /* 保存できなくても遊べる */ }
  }

  function finishIfOver(b: Board, movedSide: Side): boolean {
    const other = -movedSide as Side
    const otherPieces = countPieces(b, other)
    if (otherPieces === 0) {
      setPhase('done')
      if (movedSide === ME) {
        fanfare()
        setMessage('相手のコマを全部取った！ あなたの勝ち！')
        saveResult('win')
      } else {
        beep(220, 0.3, 0.07)
        setMessage('コマを全部取られた…。あなたの負け。')
        saveResult('lose')
      }
      return true
    }
    if (genMoves(b, other).length === 0) {
      setPhase('done')
      if (movedSide === ME) {
        fanfare()
        setMessage('相手が動けなくなった！ あなたの勝ち！')
        saveResult('win')
      } else {
        beep(220, 0.3, 0.07)
        setMessage('動けるマスがない…。あなたの負け。')
        saveResult('lose')
      }
      return true
    }
    if (quietRef.current >= 60) {
      setPhase('done')
      beep(330, 0.2, 0.06)
      setMessage('60手取らずが続いたので引き分け。')
      saveResult('draw')
      return true
    }
    return false
  }

  function doMove(move: Move, who: Side) {
    const b = boardRef.current
    const next = applyMove(b, move, who)
    if (move.caps.length > 0) {
      quietRef.current = 0
      beep(who === ME ? 880 : 520, 0.12, 0.07)
    } else {
      quietRef.current += 1
      beep(who === ME ? 660 : 440, 0.08, 0.06)
    }
    boardRef.current = next
    setBoard(next)
    setSelected(null)
    setTargets([])
    if (finishIfOver(next, who)) return
    const nextTurn = -who as Side
    turnRef.current = nextTurn
    setTurn(nextTurn)
    if (nextTurn === CPU) {
      setMessage('CPUが考え中…')
      if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current)
      cpuTimerRef.current = setTimeout(() => {
        const m = pickCpuMove(boardRef.current, diffRef.current)
        if (m && phaseRef.current === 'playing') doMove(m, CPU)
      }, 600)
    } else {
      const moves = genMoves(next, ME)
      const must = moves.length > 0 && moves[0].caps.length > 0
      setMessage(must ? 'あなたの番。取る手があるよ！ 取れるコマを選んでね' : 'あなたの番。コマを選んでナナメに進もう')
    }
  }

  function startGame() {
    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current)
    const b = initialBoard()
    boardRef.current = b
    quietRef.current = 0
    setBoard(b)
    setSelected(null)
    setTargets([])
    setCursor([5, 1])
    setTurn(first)
    turnRef.current = first
    phaseRef.current = 'playing'
    setPhase('playing')
    if (first === ME) {
      setMessage('あなたの番。コマを選んでナナメに進もう')
      beep(660, 0.12, 0.06)
    } else {
      setMessage('CPUが考え中…')
      cpuTimerRef.current = setTimeout(() => {
        const m = pickCpuMove(boardRef.current, diffRef.current)
        if (m) doMove(m, CPU)
      }, 600)
    }
  }

  function myMoves(): Move[] {
    if (phaseRef.current !== 'playing' || turnRef.current !== ME) return []
    return genMoves(boardRef.current, ME)
  }

  function selectAt(r: number, c: number) {
    if (phaseRef.current !== 'playing' || turnRef.current !== ME) return
    const moves = myMoves()
    const dest = moves.find((m) => m.to[0] === r && m.to[1] === c && selected && m.from[0] === selected[0] && m.from[1] === selected[1])
    if (dest) {
      doMove(dest, ME)
      return
    }
    const p = boardRef.current[r][c]
    if (sideOf(p) === ME) {
      const ms = moves.filter((m) => m.from[0] === r && m.from[1] === c)
      if (ms.length > 0) {
        setSelected([r, c])
        setTargets(ms)
        beep(520, 0.05, 0.04)
      } else {
        setSelected(null)
        setTargets([])
        const must = moves.length > 0 && moves[0].caps.length > 0
        setMessage(must ? 'そのコマは今は動けないよ。取る手を探してね' : 'そのコマは今は動けないよ')
      }
      return
    }
    setSelected(null)
    setTargets([])
  }

  function onCellClick(r: number, c: number) {
    setCursor([r, c])
    selectAt(r, c)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === ' ') e.preventDefault()
    if (phase === 'title' && e.key === ' ') { startGame(); return }
    if (phase === 'done' && e.key === ' ') { startGame(); return }
    if (phase !== 'playing' || turn !== ME) return
    const [cr, cc] = cursor
    if (e.key === 'ArrowLeft') { setCursor([cr, Math.max(0, cc - 1)]); e.preventDefault() }
    else if (e.key === 'ArrowRight') { setCursor([cr, Math.min(SIZE - 1, cc + 1)]); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setCursor([Math.max(0, cr - 1), cc]); e.preventDefault() }
    else if (e.key === 'ArrowDown') { setCursor([Math.min(SIZE - 1, cr + 1), cc]); e.preventDefault() }
    else if (e.key === 'Enter' || e.key === ' ') { selectAt(cr, cc); e.preventDefault() }
    else if (e.key === 'Escape') { setSelected(null); setTargets([]) }
  }

  const targetSet = new Set(targets.map((m) => `${m.to[0]}-${m.to[1]}`))
  const pathSet = new Set(targets.flatMap((m) => m.path.slice(1, -1).map(([r, c]) => `${r}-${c}`)))
  const diffLabel = difficulty === 'easy' ? 'やさしい' : difficulty === 'normal' ? 'ふつう' : 'つよい'
  const myCount = countPieces(board, ME)
  const cpuCount = countPieces(board, CPU)

  return (
    <div className="checkers" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="checkers-head">
        <span>勝ち <b>{wins}</b></span>
        <span>負け <b>{loses}</b></span>
        <span>引き分け <b>{draws}</b></span>
        <span>難易度 {diffLabel}</span>
        <span>コマ 赤 {myCount} / 黒 {cpuCount}</span>
      </div>
      {phase === 'title' && (
        <div className="checkers-setup">
          <div className="checkers-setup-row">
            <span>難易度</span>
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button key={d} className={difficulty === d ? 'selected' : ''} onClick={() => setDifficulty(d)}>
                {d === 'easy' ? 'やさしい' : d === 'normal' ? 'ふつう' : 'つよい'}
              </button>
            ))}
          </div>
          <div className="checkers-setup-row">
            <span>先攻・後攻</span>
            <button className={first === ME ? 'selected' : ''} onClick={() => setFirst(ME)}>先攻（あなた）</button>
            <button className={first === CPU ? 'selected' : ''} onClick={() => setFirst(CPU)}>後攻（CPU）</button>
          </div>
        </div>
      )}
      <div className="checkers-board" role="grid" aria-label="チェッカーの盤">
        {board.map((row, r) => (
          <div key={r} className="checkers-row">
            {row.map((v, c) => {
              const dark = (r + c) % 2 === 1
              const isSel = selected !== null && selected[0] === r && selected[1] === c
              const isTarget = targetSet.has(`${r}-${c}`)
              const isPath = pathSet.has(`${r}-${c}`)
              const isCursor = cursor[0] === r && cursor[1] === c && phase === 'playing' && turn === ME
              return (
                <button
                  key={c}
                  className={`checkers-cell${dark ? ' dark' : ''}${isSel ? ' selected' : ''}${isTarget ? ' target' : ''}${isPath ? ' path' : ''}${isCursor ? ' cursor' : ''}`}
                  onClick={() => onCellClick(r, c)}
                  disabled={phase !== 'playing' || turn !== ME}
                  aria-label={`${r + 1}行目${c + 1}列目${v === 1 ? ' 赤のコマ' : v === 2 ? ' 赤のキング' : v === -1 ? ' 黒のコマ' : v === -2 ? ' 黒のキング' : ' 空き'}`}
                >
                  {v === 1 && <span className="checkers-piece me">●</span>}
                  {v === 2 && <span className="checkers-piece me king">♛</span>}
                  {v === -1 && <span className="checkers-piece cpu">●</span>}
                  {v === -2 && <span className="checkers-piece cpu king">♛</span>}
                  {isTarget && <span className="checkers-dot">・</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <p className="checkers-msg">{message}</p>
      <div className="checkers-btns">
        {phase === 'title' && <button onClick={startGame}>スタート</button>}
        {phase === 'playing' && <button onClick={startGame}>はじめから</button>}
        {phase === 'done' && (
          <>
            <button onClick={startGame}>もう一度</button>
            <button onClick={() => setPhase('title')}>タイトルへ</button>
          </>
        )}
      </div>
      <p className="checkers-help">8×8の盤で遊ぶチェッカー。コマはナナメ前に1マス進むよ。相手のコマを飛び越えて空きマスに着地すると取れて、連続ジャンプもできるよ。取れる手があるときは取る手が必須だよ。一番奥まで進むとキングになってナナメ4方向に動けるよ。コマをクリック／タップして選んで、光ったマスへ進もう。←→↑↓キーでカーソルを動かしてEnter／Spaceでも選べるよ。「つよい」のCPUは4手先まで読むよ。</p>
    </div>
  )
}
