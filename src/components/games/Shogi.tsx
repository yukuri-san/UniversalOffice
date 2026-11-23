import { useEffect, useRef, useState } from 'react'

/* ================= 将棋 =================
 * CPUと対戦する将棋。自分（先手 or 後手）対 CPU。
 * ・持ち駒の打ち込み（二歩・打ち歩詰め・段による制限つき）、成り／不成の選択に対応
 * ・王手／詰み／千日手（同一局面4回で引き分け）判定つき
 * ・難易度3段階（やさしい＝1手読み＋ランダム／ふつう＝2手読み／つよい＝3手読み）
 * ・先手・後手を選べる。後手のときは盤面が反転する
 * ・勝敗数を保存 */

const WINS_KEY = 'webx-shogi-wins'
const LOSES_KEY = 'webx-shogi-loses'
const DRAWS_KEY = 'webx-shogi-draws'

type Color = 's' | 'g' // s = 先手（下段・行8側）, g = 後手（上段・行0側）
type Phase = 'title' | 'playing' | 'done'
type Difficulty = 'easy' | 'normal' | 'hard'
type Hand = Record<string, number>
type Board = string[][]

interface GameState {
  board: Board
  turn: Color
  hands: Record<Color, Hand>
}

interface Move {
  from: [number, number] | null // null = 打ち駒
  drop?: string // 打つ駒（'P' | 'L' | 'N' | 'S' | 'G' | 'B' | 'R'）
  to: [number, number]
  promote?: boolean
}

const HAND_TYPES = ['P', 'L', 'N', 'S', 'G', 'B', 'R']
const KANJI: Record<string, string> = {
  K: '王', R: '飛', B: '角', G: '金', S: '銀', N: '桂', L: '香', P: '歩',
  '+R': '竜', '+B': '馬', '+S': '全', '+N': '圭', '+L': '杏', '+P': 'と',
}
const VALUE: Record<string, number> = {
  P: 100, L: 300, N: 320, S: 500, G: 550, B: 850, R: 950, K: 20000,
  '+P': 550, '+L': 550, '+N': 550, '+S': 550, '+B': 1150, '+R': 1250,
}
const FULL_NUM = '１２３４５６７８９'
const KANJI_NUM = '一二三四五六七八九'

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

function emptyHands(): Record<Color, Hand> {
  const h = (): Hand => ({ P: 0, L: 0, N: 0, S: 0, G: 0, B: 0, R: 0 })
  return { s: h(), g: h() }
}

export function initialState(): GameState {
  const board: Board = Array.from({ length: 9 }, () => Array(9).fill(''))
  const back = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L']
  for (let c = 0; c < 9; c++) {
    board[0][c] = back[c].toLowerCase()
    board[2][c] = 'p'
    board[6][c] = 'P'
    board[8][c] = back[c]
  }
  board[1][1] = 'r' // 後手の飛車（8二）
  board[1][7] = 'b' // 後手の角行（2二）
  board[7][1] = 'R' // 先手の飛車（8八）
  board[7][7] = 'B' // 先手の角行（2八）
  return { board, turn: 's', hands: emptyHands() }
}

const inBoard = (r: number, c: number) => r >= 0 && r < 9 && c >= 0 && c < 9
const isSente = (p: string) => p !== '' && p === p.toUpperCase()
const isGote = (p: string) => p !== '' && p === p.toLowerCase()
const other = (c: Color): Color => (c === 's' ? 'g' : 's')
const baseType = (p: string) => p.replace('+', '').toUpperCase()
const isPromoted = (p: string) => p.startsWith('+')
const canPromote = (p: string) => ['P', 'L', 'N', 'S', 'B', 'R'].includes(baseType(p)) && !isPromoted(p)
// 先手の成りゾーンは行0〜2、後手は行6〜8
const inZone = (color: Color, r: number) => (color === 's' ? r <= 2 : r >= 6)
const mustPromote = (p: string, color: Color, toR: number) => {
  const t = baseType(p)
  if (color === 's') {
    if (t === 'P' || t === 'L') return toR === 0
    if (t === 'N') return toR <= 1
  } else {
    if (t === 'P' || t === 'L') return toR === 8
    if (t === 'N') return toR >= 7
  }
  return false
}

function findKing(board: Board, color: Color): [number, number] {
  const k = color === 's' ? 'K' : 'k'
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (board[r][c] === k) return [r, c]
  return [-1, -1]
}

// 駒の利き（王手を判定する）。歩・香・桂・銀・金・角・飛・玉＋成り駒に対応
function attacksFrom(board: Board, r: number, c: number, tr: number, tc: number): boolean {
  const p = board[r][c]
  if (p === '') return false
  const me: Color = isSente(p) ? 's' : 'g'
  const fwd = me === 's' ? -1 : 1
  const dr = tr - r
  const dc = tc - c
  const t = baseType(p)
  const pro = isPromoted(p)
  const goldMove = (): boolean => {
    const steps: [number, number][] = [
      [fwd, -1], [fwd, 0], [fwd, 1], [0, -1], [0, 1], [-fwd, 0],
    ]
    return steps.some(([a, b]) => dr === a && dc === b)
  }
  if (t === 'K') return Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && (dr !== 0 || dc !== 0)
  if (t === 'G' || (pro && (t === 'S' || t === 'N' || t === 'L' || t === 'P'))) return goldMove()
  if (t === 'P') return dr === fwd && dc === 0
  if (t === 'L') {
    if (dc !== 0 || dr * fwd <= 0) return false
    for (let i = 1; i < Math.abs(dr); i++) if (board[r + fwd * i][c] !== '') return false
    return true
  }
  if (t === 'N') return dr === fwd * 2 && Math.abs(dc) === 1
  if (t === 'S') {
    return (dr === fwd && Math.abs(dc) <= 1) || (dr === -fwd && Math.abs(dc) === 1)
  }
  if (t === 'B' || t === 'R') {
    const isDiag = Math.abs(dr) === Math.abs(dc) && dr !== 0
    const isOrth = (dr === 0 && dc !== 0) || (dc === 0 && dr !== 0)
    const slideClear = (): boolean => {
      const sr = Math.sign(dr), sc = Math.sign(dc)
      const n = Math.max(Math.abs(dr), Math.abs(dc))
      for (let i = 1; i < n; i++) if (board[r + sr * i][c + sc * i] !== '') return false
      return true
    }
    if (pro) {
      // 馬：ナナメは滑り、タテヨコは1マス／竜：タテヨコは滑り、ナナメは1マス
      if (t === 'B') {
        if (isDiag) return slideClear()
        if (isOrth && Math.abs(dr) + Math.abs(dc) === 1) return true
        return false
      }
      if (isOrth) return slideClear()
      if (isDiag && Math.abs(dr) === 1) return true
      return false
    }
    if (t === 'B' && isDiag) return slideClear()
    if (t === 'R' && isOrth) return slideClear()
    return false
  }
  return false
}

function isAttacked(board: Board, r: number, c: number, by: Color): boolean {
  for (let rr = 0; rr < 9; rr++) for (let cc = 0; cc < 9; cc++) {
    const p = board[rr][cc]
    if (p === '') continue
    if (by === 's' ? !isSente(p) : !isGote(p)) continue
    if (attacksFrom(board, rr, cc, r, c)) return true
  }
  return false
}

function pseudoMovesForPiece(state: GameState, r: number, c: number): Move[] {
  const { board, turn } = state
  const p = board[r][c]
  if (p === '') return []
  const me = turn
  const fwd = me === 's' ? -1 : 1
  const enemy = (q: string) => q !== '' && (me === 's' ? isGote(q) : isSente(q))
  const empty = (q: string) => q === ''
  const moves: Move[] = []
  const t = baseType(p)
  const pro = isPromoted(p)
  const step = (dr: number, dc: number) => {
    const rr = r + dr, cc = c + dc
    if (!inBoard(rr, cc)) return
    const q = board[rr][cc]
    if (empty(q) || enemy(q)) {
      moves.push({ from: [r, c], to: [rr, cc] })
      if (canPromote(p) && (inZone(me, r) || inZone(me, rr))) {
        moves.push({ from: [r, c], to: [rr, cc], promote: true })
      }
    }
  }
  const slide = (dr: number, dc: number) => {
    let rr = r + dr, cc = c + dc
    while (inBoard(rr, cc)) {
      const q = board[rr][cc]
      if (empty(q)) {
        moves.push({ from: [r, c], to: [rr, cc] })
        if (canPromote(p) && (inZone(me, r) || inZone(me, rr))) {
          moves.push({ from: [r, c], to: [rr, cc], promote: true })
        }
      } else {
        if (enemy(q)) {
          moves.push({ from: [r, c], to: [rr, cc] })
          if (canPromote(p) && (inZone(me, r) || inZone(me, rr))) {
            moves.push({ from: [r, c], to: [rr, cc], promote: true })
          }
        }
        break
      }
      rr += dr
      cc += dc
    }
  }
  const goldSteps: [number, number][] = [[fwd, -1], [fwd, 0], [fwd, 1], [0, -1], [0, 1], [-fwd, 0]]
  if (t === 'K') {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr !== 0 || dc !== 0) step(dr, dc)
    }
  } else if (t === 'G' || (pro && (t === 'S' || t === 'N' || t === 'L' || t === 'P'))) {
    goldSteps.forEach(([dr, dc]) => step(dr, dc))
  } else if (t === 'P') {
    step(fwd, 0)
  } else if (t === 'L') {
    slide(fwd, 0)
  } else if (t === 'N') {
    step(fwd * 2, -1)
    step(fwd * 2, 1)
  } else if (t === 'S') {
    step(fwd, -1); step(fwd, 0); step(fwd, 1); step(-fwd, -1); step(-fwd, 1)
  } else if (t === 'B') {
    slide(-1, -1); slide(-1, 1); slide(1, -1); slide(1, 1)
    if (pro) { step(-1, 0); step(1, 0); step(0, -1); step(0, 1) }
  } else if (t === 'R') {
    slide(-1, 0); slide(1, 0); slide(0, -1); slide(0, 1)
    if (pro) { step(-1, -1); step(-1, 1); step(1, -1); step(1, 1) }
  }
  // 成らなければならない手は不成の手を除く
  return moves.filter((m) => {
    if (!m.promote && canPromote(p) && mustPromote(p, me, m.to[0])) return false
    return true
  })
}

function dropMoves(state: GameState): Move[] {
  const { board, turn, hands } = state
  const hand = hands[turn]
  const moves: Move[] = []
  for (const type of HAND_TYPES) {
    if ((hand[type] ?? 0) <= 0) continue
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (board[r][c] !== '') continue
      if (type === 'P') {
        // 二歩：同じ筋に自陣の歩があってはならない
        let nifu = false
        for (let rr = 0; rr < 9; rr++) {
          if (board[rr][c] === (turn === 's' ? 'P' : 'p')) { nifu = true; break }
        }
        if (nifu) continue
        if ((turn === 's' && r === 0) || (turn === 'g' && r === 8)) continue
      }
      if (type === 'L' && ((turn === 's' && r === 0) || (turn === 'g' && r === 8))) continue
      if (type === 'N' && ((turn === 's' && r <= 1) || (turn === 'g' && r >= 7))) continue
      moves.push({ from: null, drop: type, to: [r, c] })
    }
  }
  return moves
}

export function applyMove(state: GameState, move: Move): GameState {
  const board = state.board.map((row) => [...row])
  const hands: Record<Color, Hand> = {
    s: { ...state.hands.s },
    g: { ...state.hands.g },
  }
  const me = state.turn
  const [tr, tc] = move.to
  if (move.from) {
    const [fr, fc] = move.from
    const p = board[fr][fc]
    const captured = board[tr][tc]
    board[fr][fc] = ''
    if (captured !== '' && baseType(captured) !== 'K') {
      const t = baseType(captured)
      hands[me][t] = (hands[me][t] ?? 0) + 1
    }
    let np = p
    if (move.promote) {
      const t = baseType(p)
      np = me === 's' ? `+${t}` : `+${t.toLowerCase()}`
    }
    board[tr][tc] = np
  } else if (move.drop) {
    const t = move.drop
    hands[me][t] = (hands[me][t] ?? 0) - 1
    board[tr][tc] = me === 's' ? t : t.toLowerCase()
  }
  return { board, turn: other(me), hands }
}

export function legalMoves(state: GameState, color: Color, checkUchifuzume = true): Move[] {
  const out: Move[] = []
  const s = { ...state, turn: color }
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const p = state.board[r][c]
    if (p === '') continue
    if (color === 's' ? !isSente(p) : !isGote(p)) continue
    for (const m of pseudoMovesForPiece(s, r, c)) {
      const next = applyMove(s, m)
      const [kr, kc] = findKing(next.board, color)
      if (kr >= 0 && !isAttacked(next.board, kr, kc, other(color))) out.push(m)
    }
  }
  for (const m of dropMoves(s)) {
    const next = applyMove(s, m)
    const [kr, kc] = findKing(next.board, color)
    if (kr < 0 || isAttacked(next.board, kr, kc, other(color))) continue
    // 打ち歩詰め：歩を打って王手し、相手に合法手が無ければその打ち歩は反則
    if (checkUchifuzume && m.drop === 'P') {
      const opp = other(color)
      const [okr, okc] = findKing(next.board, opp)
      if (okr >= 0 && isAttacked(next.board, okr, okc, color) && legalMoves(next, opp, false).length === 0) continue
    }
    out.push(m)
  }
  return out
}

export function inCheck(state: GameState, color: Color): boolean {
  const [r, c] = findKing(state.board, color)
  return r >= 0 && isAttacked(state.board, r, c, other(color))
}

function evaluate(state: GameState): number {
  let score = 0
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const p = state.board[r][c]
    if (p === '') continue
    const t = baseType(p)
    let v = VALUE[isPromoted(p) ? `+${t}` : t] ?? 100
    // 前進ボーナス
    const adv = isSente(p) ? (8 - r) : r
    if (t === 'P' || t === 'S' || t === 'N' || t === 'L') v += adv * 4
    score += isSente(p) ? v : -v
  }
  for (const color of ['s', 'g'] as Color[]) {
    for (const t of HAND_TYPES) {
      const v = (VALUE[t] ?? 0) * (state.hands[color][t] ?? 0)
      score += color === 's' ? v : -v
    }
  }
  return score
}

function orderMoves(state: GameState, moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const ca = state.board[a.to[0]][a.to[1]]
    const cb = state.board[b.to[0]][b.to[1]]
    const va = ca === '' ? 0 : VALUE[isPromoted(ca) ? `+${baseType(ca)}` : baseType(ca)] ?? 0
    const vb = cb === '' ? 0 : VALUE[isPromoted(cb) ? `+${baseType(cb)}` : baseType(cb)] ?? 0
    return vb - va
  })
}

let nodeCount = 0
const NODE_BUDGET = 150000

function minimax(state: GameState, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (nodeCount++ > NODE_BUDGET) return evaluate(state)
  if (depth === 0) return evaluate(state)
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

export function bestMove(state: GameState, depth: number): Move | null {
  const moves = orderMoves(state, legalMoves(state, state.turn))
  if (moves.length === 0) return null
  nodeCount = 0
  const maximizing = state.turn === 's'
  let best: Move | null = null
  let bestScore = maximizing ? -Infinity : Infinity
  for (const m of moves) {
    const s = minimax(applyMove(state, m), depth - 1, -Infinity, Infinity, !maximizing)
    if (maximizing ? s > bestScore : s < bestScore) { bestScore = s; best = m }
  }
  return best
}

export function positionKey(state: GameState): string {
  return state.board.map((row) => row.join(',')).join('/') + '|' + state.turn + '|' +
    HAND_TYPES.map((t) => state.hands.s[t]).join('') + '/' + HAND_TYPES.map((t) => state.hands.g[t]).join('')
}

function moveText(state: GameState, move: Move, prevTo: [number, number] | null): string {
  const [tr, tc] = move.to
  const mark = state.turn === 's' ? '▲' : '△'
  const same = prevTo !== null && prevTo[0] === tr && prevTo[1] === tc
  const dest = same ? '同　' : `${FULL_NUM[8 - tc]}${KANJI_NUM[8 - tr]}`
  if (move.from) {
    const p = state.board[move.from[0]][move.from[1]]
    const kanji = KANJI[isPromoted(p) ? `+${baseType(p)}` : baseType(p)] ?? '?'
    const suffix = move.promote ? '成' : canPromote(p) && (inZone(state.turn, move.from[0]) || inZone(state.turn, tr)) ? '不成' : ''
    return `${mark}${dest}${kanji}${suffix}`
  }
  const kanji = KANJI[move.drop ?? 'P'] ?? '?'
  return `${mark}${dest}${kanji}打`
}

function pieceKanji(p: string, color: Color): string {
  if (baseType(p) === 'K') return color === 's' ? '王' : '玉'
  return KANJI[isPromoted(p) ? `+${baseType(p)}` : baseType(p)] ?? '?'
}

export default function Shogi() {
  const [phase, setPhase] = useState<Phase>('title')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [playerColor, setPlayerColor] = useState<Color>('s')
  const [gs, setGs] = useState<GameState>(initialState)
  const [states, setStates] = useState<GameState[]>([])
  const [posKeys, setPosKeys] = useState<string[]>([])
  const [moveList, setMoveList] = useState<string[]>([])
  const [sel, setSel] = useState<[number, number] | null>(null)
  const [selHand, setSelHand] = useState<string | null>(null)
  const [targets, setTargets] = useState<Move[]>([])
  const [pending, setPending] = useState<Move | null>(null)
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

  const checkEnd = (next: GameState, keys: string[]): boolean => {
    // 千日手：同一局面が4回目
    const key = positionKey(next)
    const count = keys.filter((k) => k === key).length + 1
    if (count >= 4) {
      endGame('draw', '千日手で引き分けです')
      return true
    }
    const side = next.turn
    const moves = legalMoves(next, side)
    if (moves.length > 0) {
      if (inCheck(next, side)) beep(880, 0.12, 0.06)
      return false
    }
    if (inCheck(next, side)) {
      const playerWon = side === cpuColor
      endGame(playerWon ? 'win' : 'lose', playerWon ? '詰み！あなたの勝ちです🎉' : '詰まされました…CPUの勝ちです')
    } else {
      endGame(side === playerColor ? 'lose' : 'win', side === playerColor ? '動ける手がなくなりました（ステイルメイト）。あなたの負けです' : 'CPUに動ける手がなくなりました。あなたの勝ちです🎉')
    }
    return true
  }

  const applyAndRecord = (move: Move, keys: string[]) => {
    const prevTo = lastMove ? lastMove.to : null
    const text = moveText(gs, move, prevTo)
    const captured = move.from ? gs.board[move.to[0]][move.to[1]] !== '' : false
    const next = applyMove(gs, move)
    setStates((s) => [...s, gs])
    setPosKeys((k) => [...k, positionKey(next)])
    setMoveList((m) => [...m, text])
    setGs(next)
    setSel(null)
    setSelHand(null)
    setTargets([])
    setPending(null)
    setLastMove(move)
    beep(captured ? 300 : 520, 0.07, 0.06)
    checkEnd(next, keys)
  }

  const doMove = (move: Move) => {
    // 成り／不成の選択が必要な手は保留して聞く
    if (move.from && !move.promote) {
      const p = gs.board[move.from[0]][move.from[1]]
      if (canPromote(p) && !mustPromote(p, gs.turn, move.to[0]) && (inZone(gs.turn, move.from[0]) || inZone(gs.turn, move.to[0]))) {
        setPending(move)
        return
      }
    }
    applyAndRecord(move, posKeys)
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
      // CPU は成れるとき成る（必須の手は既に成りのみ生成される）
      if (move.from && !move.promote) {
        const p = gs.board[move.from[0]][move.from[1]]
        if (canPromote(p) && (inZone(gs.turn, move.from[0]) || inZone(gs.turn, move.to[0]))) {
          move = { ...move, promote: true }
        }
      }
      const prevTo = lastMove ? lastMove.to : null
      const text = moveText(gs, move, prevTo)
      const captured = move.from ? gs.board[move.to[0]][move.to[1]] !== '' : false
      const next = applyMove(gs, move)
      setStates((s) => [...s, gs])
      setPosKeys((k) => [...k, positionKey(next)])
      setMoveList((m) => [...m, text])
      setGs(next)
      setLastMove(move)
      setThinking(false)
      beep(captured ? 300 : 480, 0.07, 0.05)
      checkEnd(next, posKeys)
    }, 450)
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, gs, cpuColor, difficulty, result])

  const startGame = (color: Color) => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setPlayerColor(color)
    setGs(initialState())
    setStates([])
    setPosKeys([positionKey(initialState())])
    setMoveList([])
    setSel(null)
    setSelHand(null)
    setTargets([])
    setPending(null)
    setLastMove(null)
    setResult(null)
    setThinking(false)
    setCursor(color === 's' ? [6, 4] : [1, 4])
    setPhase('playing')
    beep(660, 0.1, 0.06)
  }

  const legalForPlayer = () => legalMoves(gs, playerColor)

  const selectCell = (r: number, c: number) => {
    if (phase !== 'playing' || gs.turn !== playerColor || thinking || pending) return
    if (selHand) {
      const target = targets.find((m) => m.from === null && m.to[0] === r && m.to[1] === c)
      if (target) { doMove(target); return }
      setSelHand(null)
      setTargets([])
      return
    }
    const p = gs.board[r][c]
    const mine = p !== '' && (playerColor === 's' ? isSente(p) : isGote(p))
    if (sel) {
      // 成りが必須の手は成りの手しか生成されないため、不成を優先し無ければ成りを選ぶ
      const target = targets.find((m) => m.from !== null && m.to[0] === r && m.to[1] === c && !m.promote)
        ?? targets.find((m) => m.from !== null && m.to[0] === r && m.to[1] === c)
      if (target) { doMove(target); return }
    }
    if (mine) {
      setSel([r, c])
      setTargets(legalForPlayer().filter((m) => m.from !== null && m.from[0] === r && m.from[1] === c))
      beep(700, 0.04, 0.04)
    } else {
      setSel(null)
      setTargets([])
    }
  }

  const selectHand = (type: string) => {
    if (phase !== 'playing' || gs.turn !== playerColor || thinking || pending) return
    if (selHand === type) {
      setSelHand(null)
      setTargets([])
      return
    }
    setSel(null)
    setSelHand(type)
    setTargets(legalForPlayer().filter((m) => m.from === null && m.drop === type))
    beep(700, 0.04, 0.04)
  }

  const undo = () => {
    if (states.length === 0 || thinking) return
    const steps = gs.turn === playerColor && states.length >= 2 ? 2 : 1
    const idx = states.length - steps
    const prev = states[idx]
    if (!prev) return
    setGs(prev)
    setStates(states.slice(0, idx))
    setPosKeys(posKeys.slice(0, idx + 1))
    setMoveList(moveList.slice(0, moveList.length - steps))
    setSel(null)
    setSelHand(null)
    setTargets([])
    setPending(null)
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
      const sgn = playerColor === 's' ? 1 : -1
      setCursor([Math.min(8, Math.max(0, r + dr * sgn)), Math.min(8, Math.max(0, c + dc))])
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      selectCell(r, c)
    } else if (e.key === 'Escape') {
      setSel(null)
      setSelHand(null)
      setTargets([])
      setPending(null)
    }
  }

  const rows = playerColor === 's' ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1, 0]
  const cols = playerColor === 's' ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1, 0]
  const inChk = phase === 'playing' && inCheck(gs, gs.turn)
  const kingPos = findKing(gs.board, gs.turn)
  const myHand = gs.hands[playerColor]
  const cpuHand = gs.hands[cpuColor]

  const handRow = (hand: Hand, color: Color, clickable: boolean) => (
    <div className="shogi-hand">
      <span>持ち駒：</span>
      {HAND_TYPES.map((t) => {
        const n = hand[t] ?? 0
        if (n <= 0) return null
        return (
          <button
            key={t}
            className={`shogi-hand-piece${clickable && selHand === t ? ' sel' : ''}`}
            disabled={!clickable}
            onClick={() => selectHand(t)}
          >
            {KANJI[t]}×{n}
          </button>
        )
      })}
      {HAND_TYPES.every((t) => (hand[t] ?? 0) <= 0) && <span>—</span>}
      {color === cpuColor && <span className="shogi-hand-label">（CPU）</span>}
    </div>
  )

  if (phase === 'title') {
    return (
      <div className="shogi" onKeyDown={onKey} tabIndex={0}>
        <h2 className="shogi-title">☖ 将棋</h2>
        <p className="shogi-desc">CPUと対戦する将棋です。取った駒は持ち駒として打てます。成り・不成も選べます。王手をかけて玉を詰ませれば勝ちです。</p>
        <div className="shogi-setup">
          <div className="shogi-setup-row">
            <span>難易度：</span>
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button key={d} className={difficulty === d ? 'selected' : ''} onClick={() => setDifficulty(d)}>
                {d === 'easy' ? 'やさしい' : d === 'normal' ? 'ふつう' : 'つよい'}
              </button>
            ))}
          </div>
          <div className="shogi-setup-row">
            <button onClick={() => startGame('s')}>▲ 先手ではじめる</button>
            <button onClick={() => startGame('g')}>△ 後手ではじめる</button>
          </div>
          <div className="shogi-record">勝ち {wins} ・ 負け {loses} ・ 引き分け {draws}</div>
          <div className="shogi-hint">駒をタップして選び、光ったマスへ動かします。持ち駒をタップしてから空きマスをタップすると打てます（二歩・打ち歩詰めなどの反則は自動で防ぎます）。矢印キー＋Enterでも遊べます。</div>
        </div>
      </div>
    )
  }

  return (
    <div className="shogi" onKeyDown={onKey} tabIndex={0}>
      <div className="shogi-head">
        <span>{thinking ? 'CPUが考え中…' : gs.turn === playerColor ? 'あなたの番です' : 'CPUの番です'}</span>
        {inChk && <span className="shogi-check">王手！</span>}
        <span>勝 {wins}・負 {loses}・分 {draws}</span>
      </div>
      {handRow(cpuHand, cpuColor, false)}
      <div className="shogi-board">
        {rows.map((r) => (
          <div key={r} className="shogi-row">
            {cols.map((c) => {
              const p = gs.board[r][c]
              const isSel = sel?.[0] === r && sel?.[1] === c
              const isTarget = targets.some((m) => m.to[0] === r && m.to[1] === c)
              const isLast = lastMove !== null && ((lastMove.from !== null && lastMove.from[0] === r && lastMove.from[1] === c) || (lastMove.to[0] === r && lastMove.to[1] === c))
              const isKingCheck = inChk && kingPos[0] === r && kingPos[1] === c
              const isCursor = cursor[0] === r && cursor[1] === c
              const gotePiece = p !== '' && isGote(p)
              return (
                <button
                  key={c}
                  className={`shogi-cell${isSel ? ' sel' : ''}${isTarget ? ' target' : ''}${isLast ? ' last' : ''}${isKingCheck ? ' check' : ''}${isCursor ? ' cursor' : ''}`}
                  onClick={() => { setCursor([r, c]); selectCell(r, c) }}
                  aria-label={`${9 - c}筋${9 - r}段${p ? ` ${pieceKanji(p, isSente(p) ? 's' : 'g')}` : ''}`}
                >
                  {p !== '' && <span className={gotePiece ? 'shogi-gote' : 'shogi-sente'}>{pieceKanji(p, isSente(p) ? 's' : 'g')}</span>}
                  {isTarget && p === '' && <span className="shogi-dot">●</span>}
                  {c === cols[0] && <span className="shogi-coord-r">{KANJI_NUM[8 - r]}</span>}
                  {r === rows[rows.length - 1] && <span className="shogi-coord-f">{FULL_NUM[8 - c]}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {handRow(myHand, playerColor, phase === 'playing' && gs.turn === playerColor && !thinking)}
      {pending && (
        <div className="shogi-promote">
          <span>成りますか？</span>
          <button onClick={() => applyAndRecord({ ...pending, promote: true }, posKeys)}>成る</button>
          <button onClick={() => applyAndRecord({ ...pending, promote: false }, posKeys)}>不成</button>
        </div>
      )}
      {result && <div className="shogi-result">{result}</div>}
      <div className="shogi-actions">
        <button onClick={undo} disabled={states.length === 0 || thinking}>↩ 待った</button>
        <button onClick={resign} disabled={phase !== 'playing'}>🏳 投了</button>
        <button onClick={() => startGame(playerColor)}>🔄 最初から</button>
        <button onClick={() => setPhase('title')}>🏠 タイトルへ</button>
      </div>
      {moveList.length > 0 && (
        <div className="shogi-history">
          {moveList.map((m, i) => (
            <span key={i} className="shogi-move">{i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}{m}</span>
          ))}
        </div>
      )}
    </div>
  )
}
