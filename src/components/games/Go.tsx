import { useEffect, useRef, useState } from 'react'

/* ================= 囲碁 =================
 * 9路盤の囲碁。CPU（ミオ）と対戦。
 * ・着手・取り石・自殺手禁止・単純コウ・両者連続パスで終局
 * ・中国ルール式の面地計算（盤上の石＋地、コミ6.5目）
 * ・難易度3段階、黒（先手）／白（後手）選択、待った・投了・パス付き
 * ・勝敗数を保存 */

type Color = 1 | 2 // 1=黒, 2=白
type Cell = 0 | Color
type Board = Cell[][]
type Diff = 'easy' | 'normal' | 'hard'
type Phase = 'setup' | 'playing' | 'over'

const SIZE = 9
const KOMI = 6.5
const OPP: Record<Color, Color> = { 1: 2, 2: 1 }
const DIFFS: { id: Diff; label: string }[] = [
  { id: 'easy', label: 'やさしい' },
  { id: 'normal', label: 'ふつう' },
  { id: 'hard', label: 'つよい' },
]
const HOSHI: [number, number][] = [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]]
const CELL = 40
const PAD = 20
const BOARD_PX = PAD * 2 + CELL * (SIZE - 1) // 360
const NEIGH: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

const emptyBoard = (): Board => Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(0))

function neighbors(x: number, y: number): [number, number][] {
  return NEIGH.map(([dx, dy]) => [x + dx, y + dy] as [number, number])
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE)
}

/** 連（同じ色のつながり）と呼吸点を求める */
function groupOf(b: Board, x: number, y: number): { stones: [number, number][]; libs: Set<string> } {
  const c = b[y][x]
  const stones: [number, number][] = []
  const libs = new Set<string>()
  const seen = new Set<string>()
  const stack: [number, number][] = [[x, y]]
  while (stack.length) {
    const [cx, cy] = stack.pop()!
    const k = `${cx},${cy}`
    if (seen.has(k)) continue
    seen.add(k)
    if (b[cy][cx] !== c) continue
    stones.push([cx, cy])
    for (const [nx, ny] of neighbors(cx, cy)) {
      if (b[ny][nx] === 0) libs.add(`${nx},${ny}`)
      else if (b[ny][nx] === c) stack.push([nx, ny])
    }
  }
  return { stones, libs }
}

/** 着手。違法（着手不可・自殺手・コウ）なら null */
function playMove(b: Board, color: Color, x: number, y: number, ko: string | null): { board: Board; captured: number; ko: string | null } | null {
  if (b[y][x] !== 0) return null
  if (ko === `${x},${y}`) return null
  const nb = b.map((row) => [...row]) as Board
  nb[y][x] = color
  const foe = OPP[color]
  let captured = 0
  let capturedSingle: [number, number] | null = null
  const checked = new Set<string>()
  for (const [nx, ny] of neighbors(x, y)) {
    if (nb[ny][nx] !== foe) continue
    const k = `${nx},${ny}`
    if (checked.has(k)) continue
    const g = groupOf(nb, nx, ny)
    g.stones.forEach(([sx, sy]) => checked.add(`${sx},${sy}`))
    if (g.libs.size === 0) {
      captured += g.stones.length
      if (g.stones.length === 1) capturedSingle = g.stones[0]
      for (const [sx, sy] of g.stones) nb[sy][sx] = 0
    }
  }
  const self = groupOf(nb, x, y)
  if (self.libs.size === 0) return null // 自殺手
  let newKo: string | null = null
  if (captured === 1 && self.stones.length === 1 && self.libs.size === 1 && capturedSingle) {
    newKo = `${capturedSingle[0]},${capturedSingle[1]}`
  }
  return { board: nb, captured, ko: newKo }
}

/** 面地計算（石＋地、白にコミ6.5目） */
function scoreBoard(b: Board): { black: number; white: number; blackTerr: number; whiteTerr: number; blackStones: number; whiteStones: number } {
  let blackStones = 0
  let whiteStones = 0
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (b[y][x] === 1) blackStones++
    else if (b[y][x] === 2) whiteStones++
  }
  const seen = new Set<string>()
  let blackTerr = 0
  let whiteTerr = 0
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (b[y][x] !== 0 || seen.has(`${x},${y}`)) continue
    const region: [number, number][] = []
    const border = new Set<Color>()
    const stack: [number, number][] = [[x, y]]
    while (stack.length) {
      const [cx, cy] = stack.pop()!
      const k = `${cx},${cy}`
      if (seen.has(k)) continue
      seen.add(k)
      if (b[cy][cx] !== 0) continue
      region.push([cx, cy])
      for (const [nx, ny] of neighbors(cx, cy)) {
        if (b[ny][nx] === 0) stack.push([nx, ny])
        else border.add(b[ny][nx] as Color)
      }
    }
    if (border.size === 1) {
      if (border.has(1)) blackTerr += region.length
      else whiteTerr += region.length
    }
  }
  return { black: blackStones + blackTerr, white: whiteStones + whiteTerr + KOMI, blackTerr, whiteTerr, blackStones, whiteStones }
}

/** CPUの1手の評価値 */
function evaluateMove(b: Board, color: Color, x: number, y: number, ko: string | null, diff: Diff): number {
  const res = playMove(b, color, x, y, ko)
  if (!res) return -Infinity
  const nb = res.board
  let s = Math.random() * (diff === 'easy' ? 6 : diff === 'normal' ? 2 : 0.5)
  s += res.captured * 12
  for (const [nx, ny] of neighbors(x, y)) {
    if (nb[ny][nx] === OPP[color]) {
      const g = groupOf(nb, nx, ny)
      if (g.libs.size === 1) s += 6 + g.stones.length * 2
      else if (g.libs.size === 2) s += 2
    }
  }
  const self = groupOf(nb, x, y)
  if (self.libs.size === 1) s -= 8
  else if (self.libs.size === 2) s -= 1
  const edge = Math.min(x, SIZE - 1 - x, y, SIZE - 1 - y)
  s += edge === 0 ? -1 : edge === 1 ? 1.5 : edge === 2 ? 1 : 0.3
  if (diff === 'hard') {
    let worst = 0
    for (let yy = 0; yy < SIZE; yy++) for (let xx = 0; xx < SIZE; xx++) {
      if (nb[yy][xx] !== 0) continue
      const r2 = playMove(nb, OPP[color], xx, yy, res.ko)
      if (r2) worst = Math.max(worst, r2.captured)
    }
    s -= worst * 10
  }
  return s
}

function chooseCpuMove(b: Board, color: Color, ko: string | null, diff: Diff): [number, number] | null {
  let best = -Infinity
  let bestMoves: [number, number][] = []
  let empty = 0
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (b[y][x] !== 0) continue
    empty++
    const s = evaluateMove(b, color, x, y, ko, diff)
    if (!Number.isFinite(s)) continue // 違法手（自殺手・コウ等）は候補にしない
    if (s > best) { best = s; bestMoves = [[x, y]] }
    else if (s === best) bestMoves.push([x, y])
  }
  if (bestMoves.length === 0) return null
  if (best < 2 && empty < 12) return null // 終盤のダメ詰めはパス
  return bestMoves[Math.floor(Math.random() * bestMoves.length)]
}

function tone(freq: number, dur = 0.12, vol = 0.08) {
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

type Snap = { board: Board; ko: string | null; capB: number; capW: number; turn: Color; passes: number; lastMove: [number, number] | null; moves: number }
type Result = { winner: Color; text: string; black: number; white: number; blackTerr: number; whiteTerr: number; blackStones: number; whiteStones: number }

function loadNum(key: string): number {
  try { return Number(window.localStorage.getItem(key) ?? 0) || 0 } catch { return 0 }
}

export default function Go() {
  const [phase, setPhase] = useState<Phase>('setup')
  const [diff, setDiff] = useState<Diff>('normal')
  const [playerColor, setPlayerColor] = useState<Color>(1)
  const [board, setBoard] = useState<Board>(emptyBoard)
  const [ko, setKo] = useState<string | null>(null)
  const [turn, setTurn] = useState<Color>(1)
  const [capB, setCapB] = useState(0) // 黒が取った石
  const [capW, setCapW] = useState(0) // 白が取った石
  const [passes, setPasses] = useState(0)
  const [lastMove, setLastMove] = useState<[number, number] | null>(null)
  const [moves, setMoves] = useState(0)
  const [history, setHistory] = useState<Snap[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [msg, setMsg] = useState('')
  const [cursor, setCursor] = useState<[number, number]>([4, 4])
  const [hover, setHover] = useState<[number, number] | null>(null)
  const [wins, setWins] = useState(() => loadNum('webx-go-wins'))
  const [loses, setLoses] = useState(() => loadNum('webx-go-loses'))
  const [draws, setDraws] = useState(() => loadNum('webx-go-draws'))
  const boardRef = useRef<HTMLDivElement>(null)

  const cpuColor: Color = OPP[playerColor]
  const est = scoreBoard(board)

  const saveStats = (w: number, l: number, d: number) => {
    try {
      window.localStorage.setItem('webx-go-wins', String(w))
      window.localStorage.setItem('webx-go-loses', String(l))
      window.localStorage.setItem('webx-go-draws', String(d))
    } catch { /* 保存できなくても遊べる */ }
  }

  const finishGame = (b: Board, cb: number, cw: number, resigned: Color | null) => {
    const sc = scoreBoard(b)
    let winner: Color
    let text: string
    if (resigned) {
      winner = OPP[resigned]
      text = resigned === playerColor ? '投了しました。ミオの勝ちです。' : 'ミオが投了しました。あなたの勝ちです！'
    } else {
      winner = sc.black > sc.white ? 1 : 2
      const diffScore = Math.abs(sc.black - sc.white).toFixed(1)
      text = winner === 1 ? `黒の ${diffScore}目勝ちです。` : `白の ${diffScore}目勝ちです。`
    }
    setResult({ winner, text, black: sc.black, white: sc.white, blackTerr: sc.blackTerr, whiteTerr: sc.whiteTerr, blackStones: sc.blackStones, whiteStones: sc.whiteStones })
    setPhase('over')
    setMsg(text)
    if (winner === playerColor) {
      const w = wins + 1
      setWins(w); saveStats(w, loses, draws)
      tone(880, 0.2); window.setTimeout(() => tone(1174, 0.25), 180)
    } else {
      const l = loses + 1
      setLoses(l); saveStats(wins, l, draws)
      tone(330, 0.25)
    }
    void cb; void cw
  }

  const pushSnap = () => {
    setHistory((h) => [...h, { board, ko, capB, capW, turn, passes, lastMove, moves }])
  }

  const applyMove = (color: Color, x: number, y: number): boolean => {
    const res = playMove(board, color, x, y, ko)
    if (!res) return false
    pushSnap()
    setBoard(res.board)
    setKo(res.ko)
    if (color === 1) setCapB((c) => c + res.captured)
    else setCapW((c) => c + res.captured)
    setPasses(0)
    setLastMove([x, y])
    setMoves((m) => m + 1)
    setTurn(OPP[color])
    setMsg(res.captured > 0 ? `${color === 1 ? '黒' : '白'}が${res.captured}子取りました。` : '')
    tone(res.captured > 0 ? 660 : 520, 0.1)
    return true
  }

  const applyPass = (color: Color) => {
    pushSnap()
    const np = passes + 1
    setPasses(np)
    setKo(null)
    setLastMove(null)
    setTurn(OPP[color])
    setMsg(`${color === 1 ? '黒' : '白'}がパスしました。`)
    tone(300, 0.12)
    if (np >= 2) finishGame(board, capB, capW, null)
  }

  const place = (x: number, y: number) => {
    if (phase !== 'playing' || turn !== playerColor) return
    if (!applyMove(playerColor, x, y)) {
      setMsg('そこには打てません。（着手禁止・自殺手・コウ）')
      tone(180, 0.15)
    }
  }

  const doPass = () => {
    if (phase !== 'playing' || turn !== playerColor) return
    applyPass(playerColor)
  }

  const undo = () => {
    if (phase !== 'playing' || history.length === 0) return
    const n = history.length >= 2 && turn === playerColor ? 2 : 1
    const target = history[history.length - n]
    setHistory(history.slice(0, history.length - n))
    setBoard(target.board); setKo(target.ko); setCapB(target.capB); setCapW(target.capW)
    setTurn(target.turn); setPasses(target.passes); setLastMove(target.lastMove); setMoves(target.moves)
    setResult(null)
    setMsg('1手前に戻しました。')
    tone(300, 0.1)
  }

  const resign = () => {
    if (phase !== 'playing') return
    finishGame(board, capB, capW, playerColor)
  }

  const startGame = () => {
    setBoard(emptyBoard()); setKo(null); setTurn(1)
    setCapB(0); setCapW(0); setPasses(0); setLastMove(null); setMoves(0)
    setHistory([]); setResult(null); setCursor([4, 4]); setHover(null)
    setMsg(playerColor === 1 ? 'あなたの番です。黒からどうぞ。' : 'ミオ（黒）から打ちます。')
    setPhase('playing')
    tone(520, 0.1)
  }

  // CPUの手番
  const cpuMoveRef = useRef<() => void>(() => {})
  cpuMoveRef.current = () => {
    if (phase !== 'playing' || turn !== cpuColor) return
    const mv = chooseCpuMove(board, cpuColor, ko, diff)
    if (!mv) { applyPass(cpuColor); return }
    applyMove(cpuColor, mv[0], mv[1])
  }
  useEffect(() => {
    if (phase !== 'playing' || turn !== cpuColor) return
    const t = window.setTimeout(() => cpuMoveRef.current(), 600)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turn, board])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (phase !== 'playing') return
    const [cx, cy] = cursor
    if (e.key === 'ArrowLeft') { setCursor([Math.max(0, cx - 1), cy]); e.preventDefault() }
    else if (e.key === 'ArrowRight') { setCursor([Math.min(SIZE - 1, cx + 1), cy]); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setCursor([cx, Math.max(0, cy - 1)]); e.preventDefault() }
    else if (e.key === 'ArrowDown') { setCursor([cx, Math.min(SIZE - 1, cy + 1)]); e.preventDefault() }
    else if (e.key === 'Enter' || e.key === ' ') { place(cx, cy); e.preventDefault() }
    else if (e.key === 'p' || e.key === 'P') { doPass() }
    else if (e.key === 'u' || e.key === 'U') { undo() }
  }

  const myStone = playerColor === 1 ? '黒' : '白'
  const cpuStone = playerColor === 1 ? '白' : '黒'

  return (
    <div className="go" ref={boardRef} tabIndex={0} onKeyDown={onKeyDown} onMouseLeave={() => setHover(null)}>
      <h2>囲碁</h2>
      <div className="go-head">
        <span>勝ち <b>{wins}</b></span>
        <span>負け <b>{loses}</b></span>
        <span>引き分け <b>{draws}</b></span>
        <span>手数 <b>{moves}</b></span>
      </div>

      {phase === 'setup' && (
        <div className="go-setup">
          <p>9路盤の囲碁でCPUのミオと対戦します。相手の石を囲んで取り、自分の地を広げましょう。両方が続けてパスすると終局し、石と地の合計（白はコミ6.5目込み）で勝敗が決まります。</p>
          <div className="go-row">
            <span>あなたの石：</span>
            <button className={`btn${playerColor === 1 ? ' accent' : ''}`} onClick={() => setPlayerColor(1)}>● 黒（先手）</button>
            <button className={`btn${playerColor === 2 ? ' accent' : ''}`} onClick={() => setPlayerColor(2)}>○ 白（後手）</button>
          </div>
          <div className="go-row">
            <span>難易度：</span>
            {DIFFS.map((d) => (
              <button key={d.id} className={`btn${diff === d.id ? ' accent' : ''}`} onClick={() => setDiff(d.id)}>{d.label}</button>
            ))}
          </div>
          <button className="btn accent go-start" onClick={startGame}>対局開始</button>
          <div className="go-rules">
            <b>ルール</b>
            <ul>
              <li>空いている交点に交互に石を置きます。相手の石の呼吸点（隣の空点）をすべてふさぐと取れます。</li>
              <li>自分の石が呼吸点0になる自殺手は打てません。1子のコウはすぐの取り返しができません。</li>
              <li>打つ手がないときはパス。両方続けてパスすると終局です。</li>
              <li>終局時は盤上の石＋囲った地の合計で計算し、白にコミ6.5目を加えます。</li>
            </ul>
          </div>
        </div>
      )}

      {phase !== 'setup' && (
        <>
          <div className="go-head">
            <span>あなた：{myStone}（{DIFFS.find((d) => d.id === diff)?.label}）</span>
            <span>ミオ：{cpuStone}</span>
            <span>アゲハマ 黒 <b>{capB}</b> / 白 <b>{capW}</b></span>
            <span>推定 黒 <b>{est.black}</b> / 白 <b>{est.white.toFixed(1)}</b></span>
          </div>
          <div className="go-msg">{phase === 'over' ? msg : turn === playerColor ? `あなたの番です（${myStone}）。` : `ミオが考えています…（${cpuStone}）。`}</div>

          <div className="go-boardwrap">
            <div className="go-board" style={{ width: BOARD_PX, height: BOARD_PX }}>
              <svg className="go-lines" viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`} width={BOARD_PX} height={BOARD_PX}>
                {Array.from({ length: SIZE }, (_, i) => (
                  <g key={i}>
                    <line x1={PAD + i * CELL} y1={PAD} x2={PAD + i * CELL} y2={PAD + (SIZE - 1) * CELL} />
                    <line x1={PAD} y1={PAD + i * CELL} x2={PAD + (SIZE - 1) * CELL} y2={PAD + i * CELL} />
                  </g>
                ))}
                {HOSHI.map(([hx, hy]) => (
                  <circle key={`${hx},${hy}`} cx={PAD + hx * CELL} cy={PAD + hy * CELL} r={4} />
                ))}
              </svg>
              {board.map((row, y) => row.map((v, x) => v === 0 ? null : (
                <div
                  key={`${x},${y}`}
                  className={`go-stone ${v === 1 ? 'b' : 'w'}${lastMove && lastMove[0] === x && lastMove[1] === y ? ' last' : ''}`}
                  style={{ left: PAD + x * CELL - 17, top: PAD + y * CELL - 17 }}
                />
              )))}
              {phase === 'playing' && turn === playerColor && hover && board[hover[1]][hover[0]] === 0 && (
                <div
                  className={`go-stone ghost ${playerColor === 1 ? 'b' : 'w'}`}
                  style={{ left: PAD + hover[0] * CELL - 17, top: PAD + hover[1] * CELL - 17 }}
                />
              )}
              <div className="go-clicks">
                {board.map((row, y) => row.map((_, x) => (
                  <button
                    key={`${x},${y}`}
                    className={`go-click${cursor[0] === x && cursor[1] === y && phase === 'playing' ? ' cursor' : ''}`}
                    aria-label={`${x + 1}路${y + 1}路`}
                    onClick={() => place(x, y)}
                    onMouseEnter={() => setHover([x, y])}
                  />
                )))}
              </div>
            </div>
          </div>

          {phase === 'playing' && (
            <div className="go-row">
              <button className="btn" onClick={doPass} disabled={turn !== playerColor}>パス（P）</button>
              <button className="btn" onClick={undo} disabled={history.length === 0}>待った（U）</button>
              <button className="btn" onClick={resign}>投了</button>
              <button className="btn" onClick={() => { setPhase('setup'); setBoard(emptyBoard()); setResult(null) }}>最初から</button>
            </div>
          )}

          {phase === 'over' && result && (
            <div className="go-result">
              <div className="go-win">{result.winner === playerColor ? 'あなたの勝ちです！🎉' : 'ミオの勝ちです。'}</div>
              <div>{result.text}</div>
              <div>黒 {result.black}目（石 {result.blackStones}＋地 {result.blackTerr}）／ 白 {result.white.toFixed(1)}目（石 {result.whiteStones}＋地 {result.whiteTerr}＋コミ6.5）</div>
              <div>アゲハマ 黒 {capB}子／白 {capW}子</div>
              <button className="btn accent" onClick={() => { setPhase('setup'); setBoard(emptyBoard()); setResult(null) }}>もう一度</button>
            </div>
          )}
          <div className="go-hint">キーボード：矢印キーでカーソル移動、Enterで着手、Pでパス、Uで待った</div>
        </>
      )}
    </div>
  )
}
