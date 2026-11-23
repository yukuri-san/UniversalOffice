import { useEffect, useRef, useState } from 'react'

/* ================= チェス =================
 * CPUと対戦するチェス。自分（白 or 黒）対 CPU。
 * ・キャスリング／アンパッサン／プロモーション（自動でクイーン）に対応
 * ・チェック／チェックメイト／ステイルメイト判定つき
 * ・難易度3段階（やさしい＝1手読み＋ランダム／ふつう＝2手読み／つよい＝3手読み）
 * ・先攻（白）・後攻（黒）を選べる。後攻のときは盤面が反転する
 * ・勝敗数を保存 */

const WINS_KEY = 'webx-chess-wins'
const LOSES_KEY = 'webx-chess-loses'
const DRAWS_KEY = 'webx-chess-draws'

type Color = 'w' | 'b'
type Board = string[][]
type Phase = 'title' | 'playing' | 'done'
type Difficulty = 'easy' | 'normal' | 'hard'

interface Move {
  from: [number, number]
  to: [number, number]
  promo?: boolean
  castle?: 'K' | 'Q' | 'k' | 'q'
  ep?: boolean
}

interface GameState {
  board: Board
  turn: Color
  castling: { K: boolean; Q: boolean; k: boolean; q: boolean }
  ep: [number, number] | null
  halfmove: number
}

const GLYPH: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
}
const VALUE: Record<string, number> = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 }
const FILES = 'abcdefgh'

const PST: Record<string, number[]> = {
  P: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  N: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  B: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  R: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  Q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  K: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
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

function saveNum(key: string, v: number) {
  try {
    localStorage.setItem(key, String(v))
  } catch { /* 保存できなくても遊べる */ }
}

function initialState(): GameState {
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(''))
  for (let c = 0; c < 8; c++) {
    board[0][c] = back[c].toLowerCase()
    board[1][c] = 'p'
    board[6][c] = 'P'
    board[7][c] = back[c]
  }
  return { board, turn: 'w', castling: { K: true, Q: true, k: true, q: true }, ep: null, halfmove: 0 }
}

const inBoard = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8
const isWhite = (p: string) => p !== '' && p === p.toUpperCase()
const isBlack = (p: string) => p !== '' && p === p.toLowerCase()
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')

function findKing(board: Board, color: Color): [number, number] {
  const k = color === 'w' ? 'K' : 'k'
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === k) return [r, c]
  return [-1, -1]
}

function isAttacked(board: Board, r: number, c: number, by: Color): boolean {
  // ポーン
  const dir = by === 'w' ? 1 : -1
  const pawn = by === 'w' ? 'P' : 'p'
  for (const dc of [-1, 1]) {
    const rr = r + dir, cc = c + dc
    if (inBoard(rr, cc) && board[rr][cc] === pawn) return true
  }
  // ナイト
  const knight = by === 'w' ? 'N' : 'n'
  for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
    const rr = r + dr, cc = c + dc
    if (inBoard(rr, cc) && board[rr][cc] === knight) return true
  }
  // キング
  const king = by === 'w' ? 'K' : 'k'
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue
    const rr = r + dr, cc = c + dc
    if (inBoard(rr, cc) && board[rr][cc] === king) return true
  }
  // スライダー（ルーク／クイーン：タテヨコ、ビショップ／クイーン：ナナメ）
  const rook = by === 'w' ? 'R' : 'r'
  const bishop = by === 'w' ? 'B' : 'b'
  const queen = by === 'w' ? 'Q' : 'q'
  const dirs: [number, number, string[]][] = [
    [-1, 0, [rook, queen]], [1, 0, [rook, queen]], [0, -1, [rook, queen]], [0, 1, [rook, queen]],
    [-1, -1, [bishop, queen]], [-1, 1, [bishop, queen]], [1, -1, [bishop, queen]], [1, 1, [bishop, queen]],
  ]
  for (const [dr, dc, pieces] of dirs) {
    let rr = r + dr, cc = c + dc
    while (inBoard(rr, cc)) {
      const p = board[rr][cc]
      if (p !== '') {
        if (pieces.includes(p)) return true
        break
      }
      rr += dr
      cc += dc
    }
  }
  return false
}

function pseudoMoves(state: GameState, r: number, c: number): Move[] {
  const { board, turn, castling, ep } = state
  const p = board[r][c]
  if (p === '') return []
  const me = turn
  const enemy = (q: string) => q !== '' && (me === 'w' ? isBlack(q) : isWhite(q))
  const empty = (q: string) => q === ''
  const moves: Move[] = []
  const add = (to: [number, number], extra?: Partial<Move>) => moves.push({ from: [r, c], to, ...extra })
  const type = p.toUpperCase()
  const dir = me === 'w' ? -1 : 1
  const startRow = me === 'w' ? 6 : 1
  const promoRow = me === 'w' ? 0 : 7
  if (type === 'P') {
    const one = r + dir
    if (inBoard(one, c) && empty(board[one][c])) {
      add([one, c], one === promoRow ? { promo: true } : undefined)
      const two = r + dir * 2
      if (r === startRow && empty(board[two][c])) add([two, c])
    }
    for (const dc of [-1, 1]) {
      const cc = c + dc
      if (!inBoard(one, cc)) continue
      if (enemy(board[one][cc])) add([one, cc], one === promoRow ? { promo: true } : undefined)
      if (ep && ep[0] === one && ep[1] === cc) add([one, cc], { ep: true })
    }
  } else if (type === 'N') {
    for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
      const rr = r + dr, cc = c + dc
      if (inBoard(rr, cc) && (empty(board[rr][cc]) || enemy(board[rr][cc]))) add([rr, cc])
    }
  } else if (type === 'K') {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const rr = r + dr, cc = c + dc
      if (inBoard(rr, cc) && (empty(board[rr][cc]) || enemy(board[rr][cc]))) add([rr, cc])
    }
    // キャスリング
    if (me === 'w' && r === 7 && c === 4) {
      if (castling.K && board[7][5] === '' && board[7][6] === '' && board[7][7] === 'R'
        && !isAttacked(board, 7, 4, 'b') && !isAttacked(board, 7, 5, 'b') && !isAttacked(board, 7, 6, 'b')) add([7, 6], { castle: 'K' })
      if (castling.Q && board[7][3] === '' && board[7][2] === '' && board[7][1] === '' && board[7][0] === 'R'
        && !isAttacked(board, 7, 4, 'b') && !isAttacked(board, 7, 3, 'b') && !isAttacked(board, 7, 2, 'b')) add([7, 2], { castle: 'Q' })
    }
    if (me === 'b' && r === 0 && c === 4) {
      if (castling.k && board[0][5] === '' && board[0][6] === '' && board[0][7] === 'r'
        && !isAttacked(board, 0, 4, 'w') && !isAttacked(board, 0, 5, 'w') && !isAttacked(board, 0, 6, 'w')) add([0, 6], { castle: 'k' })
      if (castling.q && board[0][3] === '' && board[0][2] === '' && board[0][1] === '' && board[0][0] === 'r'
        && !isAttacked(board, 0, 4, 'w') && !isAttacked(board, 0, 3, 'w') && !isAttacked(board, 0, 2, 'w')) add([0, 2], { castle: 'q' })
    }
  } else {
    const dirs: [number, number][] = []
    if (type === 'B' || type === 'Q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1])
    if (type === 'R' || type === 'Q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1])
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc
      while (inBoard(rr, cc)) {
        const q = board[rr][cc]
        if (empty(q)) { add([rr, cc]) } else { if (enemy(q)) add([rr, cc]); break }
        rr += dr
        cc += dc
      }
    }
  }
  return moves
}

function applyMove(state: GameState, move: Move): GameState {
  const board = state.board.map((row) => [...row])
  const [fr, fc] = move.from
  const [tr, tc] = move.to
  const p = board[fr][fc]
  const castling = { ...state.castling }
  if (p === 'K') { castling.K = false; castling.Q = false }
  if (p === 'k') { castling.k = false; castling.q = false }
  if (p === 'R' && fr === 7 && fc === 0) castling.Q = false
  if (p === 'R' && fr === 7 && fc === 7) castling.K = false
  if (p === 'r' && fr === 0 && fc === 0) castling.q = false
  if (p === 'r' && fr === 0 && fc === 7) castling.k = false
  if (board[tr][tc] === 'R' && tr === 7 && tc === 0) castling.Q = false
  if (board[tr][tc] === 'R' && tr === 7 && tc === 7) castling.K = false
  if (board[tr][tc] === 'r' && tr === 0 && tc === 0) castling.q = false
  if (board[tr][tc] === 'r' && tr === 0 && tc === 7) castling.k = false
  board[fr][fc] = ''
  if (move.ep) board[fr][tc] = ''
  const captured = board[tr][tc] !== '' || move.ep
  board[tr][tc] = move.promo ? (state.turn === 'w' ? 'Q' : 'q') : p
  if (move.castle === 'K') { board[7][7] = ''; board[7][5] = 'R' }
  if (move.castle === 'Q') { board[7][0] = ''; board[7][3] = 'R' }
  if (move.castle === 'k') { board[0][7] = ''; board[0][5] = 'r' }
  if (move.castle === 'q') { board[0][0] = ''; board[0][3] = 'r' }
  const isPawnDouble = p.toUpperCase() === 'P' && Math.abs(tr - fr) === 2
  const ep: [number, number] | null = isPawnDouble ? [(fr + tr) / 2, fc] : null
  const halfmove = p.toUpperCase() === 'P' || captured ? 0 : state.halfmove + 1
  return { board, turn: other(state.turn), castling, ep, halfmove }
}

function legalMoves(state: GameState, color: Color): Move[] {
  const out: Move[] = []
  const s = { ...state, turn: color }
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = state.board[r][c]
    if (p === '') continue
    if (color === 'w' ? !isWhite(p) : !isBlack(p)) continue
    for (const m of pseudoMoves(s, r, c)) {
      const next = applyMove(s, m)
      const [kr, kc] = findKing(next.board, color)
      if (kr >= 0 && !isAttacked(next.board, kr, kc, other(color))) out.push(m)
    }
  }
  return out
}

function inCheck(state: GameState, color: Color): boolean {
  const [r, c] = findKing(state.board, color)
  return r >= 0 && isAttacked(state.board, r, c, other(color))
}

function evaluate(board: Board): number {
  let score = 0
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c]
    if (p === '') continue
    const t = p.toUpperCase()
    const idx = isWhite(p) ? r * 8 + c : (7 - r) * 8 + c
    const v = VALUE[t] + (PST[t]?.[idx] ?? 0)
    score += isWhite(p) ? v : -v
  }
  return score
}

function orderMoves(state: GameState, moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const ca = state.board[a.to[0]][a.to[1]]
    const cb = state.board[b.to[0]][b.to[1]]
    const va = ca === '' ? 0 : VALUE[ca.toUpperCase()]
    const vb = cb === '' ? 0 : VALUE[cb.toUpperCase()]
    return vb - va
  })
}

function minimax(state: GameState, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (depth === 0) return evaluate(state.board)
  const moves = orderMoves(state, legalMoves(state, state.turn))
  if (moves.length === 0) {
    return inCheck(state, state.turn) ? (maximizing ? -100000 - depth : 100000 + depth) : 0
  }
  if (maximizing) {
    let best = -Infinity
    for (const m of moves) {
      best = Math.max(best, minimax(applyMove(state, m), depth - 1, alpha, beta, false))
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best
  }
  let best = Infinity
  for (const m of moves) {
    best = Math.min(best, minimax(applyMove(state, m), depth - 1, alpha, beta, true))
    beta = Math.min(beta, best)
    if (beta <= alpha) break
  }
  return best
}

function bestMove(state: GameState, depth: number): Move | null {
  const moves = orderMoves(state, legalMoves(state, state.turn))
  if (moves.length === 0) return null
  const maximizing = state.turn === 'w'
  let best: Move | null = null
  let bestScore = maximizing ? -Infinity : Infinity
  for (const m of moves) {
    const s = minimax(applyMove(state, m), depth - 1, -Infinity, Infinity, !maximizing)
    if (maximizing ? s > bestScore : s < bestScore) { bestScore = s; best = m }
  }
  return best
}

function moveText(state: GameState, move: Move): string {
  const [fr, fc] = move.from
  const [tr, tc] = move.to
  const p = state.board[fr][fc]
  const piece = p.toUpperCase() === 'P' ? '' : p.toUpperCase()
  const cap = state.board[tr][tc] !== '' || move.ep ? 'x' : ''
  const dest = `${FILES[tc]}${8 - tr}`
  if (move.castle === 'K' || move.castle === 'k') return 'O-O'
  if (move.castle === 'Q' || move.castle === 'q') return 'O-O-O'
  const src = piece === '' && cap ? FILES[fc] : ''
  return `${piece}${src}${cap}${dest}${move.promo ? '=Q' : ''}`
}

function capturedPieces(board: Board, color: Color): string[] {
  const start: Record<string, number> = { P: 8, N: 2, B: 2, R: 2, Q: 1 }
  const have: Record<string, number> = { P: 0, N: 0, B: 0, R: 0, Q: 0 }
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c]
    if (p === '') continue
    if (color === 'w' ? isWhite(p) : isBlack(p)) {
      const t = p.toUpperCase()
      if (t !== 'K') have[t] = (have[t] ?? 0) + 1
    }
  }
  const out: string[] = []
  for (const t of ['Q', 'R', 'B', 'N', 'P']) {
    for (let i = 0; i < (start[t] ?? 0) - (have[t] ?? 0); i++) out.push(color === 'w' ? t : t.toLowerCase())
  }
  return out
}

export default function Chess() {
  const [phase, setPhase] = useState<Phase>('title')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [playerColor, setPlayerColor] = useState<Color>('w')
  const [gs, setGs] = useState<GameState>(initialState)
  const [states, setStates] = useState<GameState[]>([])
  const [moveList, setMoveList] = useState<string[]>([])
  const [sel, setSel] = useState<[number, number] | null>(null)
  const [targets, setTargets] = useState<Move[]>([])
  const [cursor, setCursor] = useState<[number, number]>([6, 4])
  const [result, setResult] = useState<string | null>(null)
  const [lastMove, setLastMove] = useState<Move | null>(null)
  const [thinking, setThinking] = useState(false)
  const [wins, setWins] = useState(() => loadNum(WINS_KEY))
  const [loses, setLoses] = useState(() => loadNum(LOSES_KEY))
  const [draws, setDraws] = useState(() => loadNum(DRAWS_KEY))
  const cpuColor: Color = other(playerColor)
  const timerRef = useRef<number | null>(null)

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current) }, [])

  const endGame = (res: 'win' | 'lose' | 'draw', text: string) => {
    setPhase('done')
    setResult(text)
    if (res === 'win') { const v = wins + 1; setWins(v); saveNum(WINS_KEY, v); fanfare() }
    else if (res === 'lose') { const v = loses + 1; setLoses(v); saveNum(LOSES_KEY, v); beep(220, 0.3, 0.07) }
    else { const v = draws + 1; setDraws(v); saveNum(DRAWS_KEY, v); beep(440, 0.2, 0.06) }
  }

  const checkEnd = (next: GameState): boolean => {
    const side = next.turn
    const moves = legalMoves(next, side)
    if (moves.length > 0) {
      if (inCheck(next, side)) beep(880, 0.12, 0.06)
      return false
    }
    if (inCheck(next, side)) {
      const playerWon = side === cpuColor
      endGame(playerWon ? 'win' : 'lose', playerWon ? 'チェックメイト！あなたの勝ちです🎉' : 'チェックメイト…CPUの勝ちです')
    } else {
      endGame('draw', 'ステイルメイトで引き分けです')
    }
    return true
  }

  const doMove = (move: Move) => {
    const text = moveText(gs, move)
    const captured = gs.board[move.to[0]][move.to[1]] !== '' || move.ep
    const next = applyMove(gs, move)
    setStates((s) => [...s, gs])
    setMoveList((m) => [...m, text])
    setGs(next)
    setSel(null)
    setTargets([])
    setLastMove(move)
    beep(captured ? 300 : 520, 0.07, 0.06)
    checkEnd(next)
  }

  // CPU の手番
  useEffect(() => {
    if (phase !== 'playing' || gs.turn !== cpuColor || result) return
    setThinking(true)
    timerRef.current = window.setTimeout(() => {
      const depth = difficulty === 'easy' ? 1 : difficulty === 'normal' ? 2 : 3
      const moves = orderMoves(gs, legalMoves(gs, cpuColor))
      if (moves.length === 0) { setThinking(false); return }
      let move: Move | null = null
      if (difficulty === 'easy' && Math.random() < 0.4) {
        move = moves[Math.floor(Math.random() * moves.length)]
      } else {
        move = bestMove(gs, depth)
      }
      if (!move) { setThinking(false); return }
      const text = moveText(gs, move)
      const captured = gs.board[move.to[0]][move.to[1]] !== '' || move.ep
      const next = applyMove(gs, move)
      setStates((s) => [...s, gs])
      setMoveList((m) => [...m, text])
      setGs(next)
      setLastMove(move)
      setThinking(false)
      beep(captured ? 300 : 480, 0.07, 0.05)
      checkEnd(next)
    }, 450)
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, gs, cpuColor, difficulty, result])

  const startGame = (color: Color) => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setPlayerColor(color)
    setGs(initialState())
    setStates([])
    setMoveList([])
    setSel(null)
    setTargets([])
    setLastMove(null)
    setResult(null)
    setThinking(false)
    setCursor(color === 'w' ? [6, 4] : [1, 4])
    setPhase('playing')
    beep(660, 0.1, 0.06)
  }

  const selectCell = (r: number, c: number) => {
    if (phase !== 'playing' || gs.turn !== playerColor || thinking) return
    const p = gs.board[r][c]
    const mine = p !== '' && (playerColor === 'w' ? isWhite(p) : isBlack(p))
    if (sel) {
      const target = targets.find((m) => m.to[0] === r && m.to[1] === c)
      if (target) { doMove(target); return }
    }
    if (mine) {
      setSel([r, c])
      setTargets(legalMoves(gs, playerColor).filter((m) => m.from[0] === r && m.from[1] === c))
      beep(700, 0.04, 0.04)
    } else {
      setSel(null)
      setTargets([])
    }
  }

  const undo = () => {
    if (states.length === 0 || thinking) return
    // プレイヤーとCPUの2手分戻す（CPU手番直後なら1手分）
    const steps = gs.turn === playerColor && states.length >= 2 ? 2 : 1
    const idx = states.length - steps
    const prev = states[idx]
    if (!prev) return
    setGs(prev)
    setStates(states.slice(0, idx))
    setMoveList(moveList.slice(0, moveList.length - steps))
    setSel(null)
    setTargets([])
    setLastMove(null)
    setResult(null)
    setPhase('playing')
    beep(500, 0.06, 0.05)
  }

  const resign = () => {
    if (phase !== 'playing') return
    endGame('lose', '投了しました。CPUの勝ちです')
  }

  const onKey = (e: React.KeyboardEvent) => {
    const [r, c] = cursor
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const dr = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
      const dc = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
      // 盤面表示は後攻のとき反転するので、見た目の上下に合わせる
      const sgn = playerColor === 'w' ? 1 : -1
      setCursor([Math.min(7, Math.max(0, r + dr * sgn)), Math.min(7, Math.max(0, c + dc))])
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      selectCell(r, c)
    } else if (e.key === 'Escape') {
      setSel(null)
      setTargets([])
    }
  }

  const rows = playerColor === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
  const cols = playerColor === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
  const myCaptured = capturedPieces(gs.board, cpuColor)
  const cpuCaptured = capturedPieces(gs.board, playerColor)
  const inChk = phase === 'playing' && inCheck(gs, gs.turn)
  const kingPos = findKing(gs.board, gs.turn)

  if (phase === 'title') {
    return (
      <div className="chess" onKeyDown={onKey} tabIndex={0}>
        <h2 className="chess-title">♞ チェス</h2>
        <p className="chess-desc">CPUと対戦するチェスです。キャスリング・アンパッサン・プロモーション対応。チェックメイトで勝ちです。</p>
        <div className="chess-setup">
          <div className="chess-setup-row">
            <span>難易度：</span>
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button key={d} className={difficulty === d ? 'selected' : ''} onClick={() => setDifficulty(d)}>
                {d === 'easy' ? 'やさしい' : d === 'normal' ? 'ふつう' : 'つよい'}
              </button>
            ))}
          </div>
          <div className="chess-setup-row">
            <button onClick={() => startGame('w')}>🤍 白（先攻）ではじめる</button>
            <button onClick={() => startGame('b')}>🖤 黒（後攻）ではじめる</button>
          </div>
          <div className="chess-record">勝ち {wins} ・ 負け {loses} ・ 引き分け {draws}</div>
          <div className="chess-hint">駒をタップして選び、光ったマスへ動かします。矢印キー＋Enterでも遊べます。プロモーションは自動でクイーンになります。</div>
        </div>
      </div>
    )
  }

  return (
    <div className="chess" onKeyDown={onKey} tabIndex={0}>
      <div className="chess-head">
        <span>{thinking ? 'CPUが考え中…' : gs.turn === playerColor ? 'あなたの番です' : 'CPUの番です'}</span>
        {inChk && <span className="chess-check">チェック！</span>}
        <span>勝 {wins}・負 {loses}・分 {draws}</span>
      </div>
      <div className="chess-captured">
        <span>取った駒：</span>
        {myCaptured.map((p, i) => <span key={i} className="chess-cap">{GLYPH[p]}</span>)}
        {myCaptured.length === 0 && <span>—</span>}
      </div>
      <div className="chess-board">
        {rows.map((r) => (
          <div key={r} className="chess-row">
            {cols.map((c) => {
              const p = gs.board[r][c]
              const isDark = (r + c) % 2 === 1
              const isSel = sel?.[0] === r && sel?.[1] === c
              const isTarget = targets.some((m) => m.to[0] === r && m.to[1] === c)
              const isLast = lastMove !== null && ((lastMove.from[0] === r && lastMove.from[1] === c) || (lastMove.to[0] === r && lastMove.to[1] === c))
              const isKingCheck = inChk && kingPos[0] === r && kingPos[1] === c
              const isCursor = cursor[0] === r && cursor[1] === c
              return (
                <button
                  key={c}
                  className={`chess-cell${isDark ? ' dark' : ''}${isSel ? ' sel' : ''}${isTarget ? ' target' : ''}${isLast ? ' last' : ''}${isKingCheck ? ' check' : ''}${isCursor ? ' cursor' : ''}`}
                  onClick={() => { setCursor([r, c]); selectCell(r, c) }}
                  aria-label={`${FILES[c]}${8 - r}${p ? ` ${p}` : ''}`}
                >
                  {p !== '' && <span className={isWhite(p) ? 'chess-white' : 'chess-black'}>{GLYPH[p]}</span>}
                  {isTarget && p === '' && <span className="chess-dot">●</span>}
                  {c === cols[0] && <span className="chess-coord-r">{8 - r}</span>}
                  {r === rows[rows.length - 1] && <span className="chess-coord-f">{FILES[c]}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div className="chess-captured">
        <span>取られた駒：</span>
        {cpuCaptured.map((p, i) => <span key={i} className="chess-cap">{GLYPH[p]}</span>)}
        {cpuCaptured.length === 0 && <span>—</span>}
      </div>
      {result && <div className="chess-result">{result}</div>}
      <div className="chess-actions">
        <button onClick={undo} disabled={states.length === 0 || thinking}>↩ 待った</button>
        <button onClick={resign} disabled={phase !== 'playing'}>🏳 投了</button>
        <button onClick={() => startGame(playerColor)}>🔄 最初から</button>
        <button onClick={() => setPhase('title')}>🏠 タイトルへ</button>
      </div>
      {moveList.length > 0 && (
        <div className="chess-history">
          {moveList.map((m, i) => (
            <span key={i} className="chess-move">{i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}{m}</span>
          ))}
        </div>
      )}
    </div>
  )
}
