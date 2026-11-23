/* ================= 囲碁エンジン（9路盤） =================
 * 純粋関数だけを集めたモジュール。React に依存しないので
 * esbuild でバンドルして node で直接テストできる。
 * ルール：着手・取り石（呼吸点0の連を取る）・自殺手禁止・
 * コウ（直前局面の再現禁止）・2回連続パスで終局。
 * 終局時の数え：石＋囲んだ地（中国式に近い簡易数え）、コミ6.5目。 */

export const GO_SIZE = 9
export const GO_KOMI = 6.5

export type GoStone = 0 | 1 | 2 // 0 空, 1 黒, 2 白
export type GoBoard = GoStone[][]
export type GoColor = 1 | 2
export type GoDifficulty = 'easy' | 'normal' | 'hard'

export function goEmptyBoard(): GoBoard {
  return Array.from({ length: GO_SIZE }, () => Array<GoStone>(GO_SIZE).fill(0))
}

export function goOther(c: GoColor): GoColor {
  return c === 1 ? 2 : 1
}

export function goBoardsEqual(a: GoBoard, b: GoBoard): boolean {
  for (let y = 0; y < GO_SIZE; y++) {
    for (let x = 0; x < GO_SIZE; x++) {
      if (a[y][x] !== b[y][x]) return false
    }
  }
  return true
}

export function goCountStones(board: GoBoard, color: GoColor): number {
  let n = 0
  for (let y = 0; y < GO_SIZE; y++) {
    for (let x = 0; x < GO_SIZE; x++) {
      if (board[y][x] === color) n++
    }
  }
  return n
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

export function goNeighbors(x: number, y: number): [number, number][] {
  const out: [number, number][] = []
  for (const [dx, dy] of DIRS) {
    const nx = x + dx
    const ny = y + dy
    if (nx >= 0 && nx < GO_SIZE && ny >= 0 && ny < GO_SIZE) out.push([nx, ny])
  }
  return out
}

/** (x, y) の石が属する連（同じ色のつながり）とその呼吸点。 */
export function goGroup(board: GoBoard, x: number, y: number): { stones: [number, number][]; liberties: [number, number][] } {
  const color = board[y][x]
  const stones: [number, number][] = []
  const liberties: [number, number][] = []
  const seenStone = new Set<string>()
  const seenLib = new Set<string>()
  const stack: [number, number][] = [[x, y]]
  seenStone.add(`${x},${y}`)
  while (stack.length > 0) {
    const [cx, cy] = stack.pop() as [number, number]
    stones.push([cx, cy])
    for (const [nx, ny] of goNeighbors(cx, cy)) {
      if (board[ny][nx] === 0) {
        const k = `${nx},${ny}`
        if (!seenLib.has(k)) {
          seenLib.add(k)
          liberties.push([nx, ny])
        }
      } else if (board[ny][nx] === color) {
        const k = `${nx},${ny}`
        if (!seenStone.has(k)) {
          seenStone.add(k)
          stack.push([nx, ny])
        }
      }
    }
  }
  return { stones, liberties }
}

/**
 * (x, y) に color を着手した新しい盤面を返す。
 * 着手不可（埋まっている・自殺手・コウ）のときは null。
 * prevBoard は相手の直前の着手前の盤面（コウ判定用）。パス直後は null。
 */
export function goApplyMove(board: GoBoard, x: number, y: number, color: GoColor, prevBoard: GoBoard | null): GoBoard | null {
  if (board[y][x] !== 0) return null
  const nb: GoBoard = board.map((row) => [...row])
  nb[y][x] = color
  const opp = goOther(color)
  let captured = 0
  for (const [nx, ny] of goNeighbors(x, y)) {
    if (nb[ny][nx] !== opp) continue
    const g = goGroup(nb, nx, ny)
    if (g.liberties.length === 0) {
      for (const [sx, sy] of g.stones) nb[sy][sx] = 0
      captured += g.stones.length
    }
  }
  if (captured === 0) {
    const g = goGroup(nb, x, y)
    if (g.liberties.length === 0) return null // 自殺手
  }
  if (prevBoard && goBoardsEqual(nb, prevBoard)) return null // コウ
  return nb
}

/** 合法手の一覧。 */
export function goLegalMoves(board: GoBoard, color: GoColor, prevBoard: GoBoard | null): [number, number][] {
  const out: [number, number][] = []
  for (let y = 0; y < GO_SIZE; y++) {
    for (let x = 0; x < GO_SIZE; x++) {
      if (board[y][x] === 0 && goApplyMove(board, x, y, color, prevBoard)) out.push([x, y])
    }
  }
  return out
}

export interface GoScore {
  blackStones: number
  whiteStones: number
  blackTerritory: number
  whiteTerritory: number
  black: number
  white: number // コミ込み
}

/** 終局時の数え。空点の領域が片方の色にだけ接していればその色の地。 */
export function goScore(board: GoBoard): GoScore {
  const blackStones = goCountStones(board, 1)
  const whiteStones = goCountStones(board, 2)
  let blackTerritory = 0
  let whiteTerritory = 0
  const seen = new Set<string>()
  for (let y = 0; y < GO_SIZE; y++) {
    for (let x = 0; x < GO_SIZE; x++) {
      if (board[y][x] !== 0 || seen.has(`${x},${y}`)) continue
      // 空点の領域を flood fill
      const region: [number, number][] = []
      const borders = new Set<GoStone>()
      const stack: [number, number][] = [[x, y]]
      seen.add(`${x},${y}`)
      while (stack.length > 0) {
        const [cx, cy] = stack.pop() as [number, number]
        region.push([cx, cy])
        for (const [nx, ny] of goNeighbors(cx, cy)) {
          if (board[ny][nx] === 0) {
            const k = `${nx},${ny}`
            if (!seen.has(k)) {
              seen.add(k)
              stack.push([nx, ny])
            }
          } else {
            borders.add(board[ny][nx])
          }
        }
      }
      if (borders.size === 1) {
        if (borders.has(1)) blackTerritory += region.length
        else whiteTerritory += region.length
      }
    }
  }
  return {
    blackStones,
    whiteStones,
    blackTerritory,
    whiteTerritory,
    black: blackStones + blackTerritory,
    white: whiteStones + whiteTerritory + GO_KOMI,
  }
}

/** 着手後の局面評価（CPU用）。取る石・相手をアタリにする・自軍の救出・形をみる。 */
export function goEvaluate(board: GoBoard, move: [number, number], color: GoColor, prevBoard: GoBoard | null): number {
  const nb = goApplyMove(board, move[0], move[1], color, prevBoard)
  if (!nb) return -9999
  const opp = goOther(color)
  let s = Math.random() * 2
  // 取った石
  const captured = goCountStones(board, opp) - goCountStones(nb, opp)
  s += captured * 12
  // 自軍の連の救出（呼吸点1だった隣の自軍が助かる）
  for (const [nx, ny] of goNeighbors(move[0], move[1])) {
    if (board[ny][nx] !== color) continue
    const before = goGroup(board, nx, ny)
    if (before.liberties.length === 1) {
      const after = goGroup(nb, nx, ny)
      if (after.liberties.length > 1) s += 6
    }
  }
  // 相手をアタリにする
  for (const [nx, ny] of goNeighbors(move[0], move[1])) {
    if (nb[ny][nx] !== opp) continue
    const g = goGroup(nb, nx, ny)
    if (g.liberties.length === 1) s += g.stones.length > 1 ? 6 : 3
  }
  // 自分の連の呼吸点
  const mine = goGroup(nb, move[0], move[1])
  if (mine.liberties.length === 1) s -= captured > 0 ? 2 : 8 // 自殺気味のアタリ
  else if (mine.liberties.length === 2) s -= 1
  // 位置：中央寄り・3〜4路目を好む
  const cx = Math.abs(move[0] - 4) + Math.abs(move[1] - 4)
  s += (8 - cx) * 0.25
  if (move[0] >= 2 && move[0] <= 6 && move[1] >= 2 && move[1] <= 6) s += 0.5
  return s
}

/** CPUの着手。合法手がなければ null（パス）。 */
export function goChooseMove(board: GoBoard, color: GoColor, prevBoard: GoBoard | null, difficulty: GoDifficulty): [number, number] | null {
  const moves = goLegalMoves(board, color, prevBoard)
  if (moves.length === 0) return null
  if (difficulty === 'easy') {
    const caps = moves.filter((m) => {
      const nb = goApplyMove(board, m[0], m[1], color, prevBoard)
      return nb !== null && goCountStones(board, goOther(color)) - goCountStones(nb, goOther(color)) > 0
    })
    const pool = caps.length > 0 && Math.random() < 0.5 ? caps : moves
    return pool[Math.floor(Math.random() * pool.length)]
  }
  let best: [number, number] = moves[0]
  let bestScore = -Infinity
  for (const m of moves) {
    let total = goEvaluate(board, m, color, prevBoard)
    if (difficulty === 'hard') {
      const nb = goApplyMove(board, m[0], m[1], color, prevBoard)
      if (nb) {
        const opp = goOther(color)
        const replies = goLegalMoves(nb, opp, board)
        let oppBest = -Infinity
        for (const om of replies) {
          oppBest = Math.max(oppBest, goEvaluate(nb, om, opp, board))
        }
        if (oppBest > -Infinity) total -= 0.6 * oppBest
      }
    }
    if (total > bestScore) {
      bestScore = total
      best = m
    }
  }
  return best
}
