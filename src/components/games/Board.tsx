import { useEffect, useMemo, useState } from 'react'

/* ================= 神経衰弱 ================= */
const EMOJIS = ['🍎', '🍊', '🍇', '🍓', '🍑', '🍉', '🥝', '🍍']
interface MCard { id: number; emoji: string; open: boolean; done: boolean }
export function Memory() {
  const [cards, setCards] = useState<MCard[]>([])
  const [picked, setPicked] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const [lock, setLock] = useState(false)
  const start = () => {
    const deck = [...EMOJIS, ...EMOJIS].sort(() => Math.random() - 0.5)
    setCards(deck.map((emoji, i) => ({ id: i, emoji, open: false, done: false })))
    setPicked([]); setMoves(0); setLock(false)
  }
  useEffect(() => { start() }, [])
  const doneCount = cards.filter((c) => c.done).length / 2
  const pick = (id: number) => {
    if (lock) return
    const card = cards.find((c) => c.id === id)
    if (!card || card.open || card.done) return
    const nb = cards.map((c) => (c.id === id ? { ...c, open: true } : c))
    const np = [...picked, id]
    setCards(nb); setPicked(np)
    if (np.length === 2) {
      setMoves((m) => m + 1)
      const [a, b] = np.map((pid) => nb.find((c) => c.id === pid)!)
      if (a.emoji === b.emoji) {
        setCards((prev) => prev.map((c) => (c.id === a.id || c.id === b.id ? { ...c, done: true } : c)))
        setPicked([])
      } else {
        setLock(true)
        window.setTimeout(() => {
          setCards((prev) => prev.map((c) => (c.id === a.id || c.id === b.id ? { ...c, open: false } : c)))
          setPicked([]); setLock(false)
        }, 800)
      }
    }
  }
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">手数<b>{moves}</b></span>
        <span className="game-stat inline">ペア<b>{doneCount}/8</b></span>
        {doneCount === 8 && <span className="game-win">コンプリート！🎉</span>}
        <button className="btn accent" onClick={start}>シャッフル</button>
      </div>
      <div className="memory-grid">
        {cards.map((c) => (
          <button key={c.id} className={`memory-card${c.open || c.done ? ' open' : ''}`} onClick={() => pick(c.id)}>
            {c.open || c.done ? c.emoji : '❓'}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ================= リバーシ ================= */
type RB = ('B' | 'W' | null)[][]
const rInit = (): RB => {
  const b: RB = Array.from({ length: 8 }, () => Array(8).fill(null))
  b[3][3] = 'W'; b[3][4] = 'B'; b[4][3] = 'B'; b[4][4] = 'W'
  return b
}
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
function flips(b: RB, r: number, c: number, me: 'B' | 'W'): [number, number][] {
  if (b[r][c]) return []
  const opp = me === 'B' ? 'W' : 'B'
  const out: [number, number][] = []
  for (const [dr, dc] of DIRS) {
    const line: [number, number][] = []
    let rr = r + dr, cc = c + dc
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr][cc] === opp) { line.push([rr, cc]); rr += dr; cc += dc }
    if (line.length && rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr][cc] === me) out.push(...line)
  }
  return out
}
const allMoves = (b: RB, me: 'B' | 'W') => {
  const ms: { r: number; c: number; f: [number, number][] }[] = []
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const f = flips(b, r, c, me)
    if (f.length) ms.push({ r, c, f })
  }
  return ms
}
export function Reversi() {
  const [board, setBoard] = useState<RB>(rInit)
  const [turn, setTurn] = useState<'B' | 'W'>('B')
  const [msg, setMsg] = useState('あなたの番（黒）')
  const counts = useMemo(() => ({ B: board.flat().filter((v) => v === 'B').length, W: board.flat().filter((v) => v === 'W').length }), [board])
  const myMoves = turn === 'B' ? allMoves(board, 'B') : []
  useEffect(() => {
    if (turn !== 'W') return
    const id = window.setTimeout(() => {
      const ms = allMoves(board, 'W')
      if (!ms.length) {
        if (!allMoves(board, 'B').length) { setMsg(counts.B > counts.W ? '勝ち！🎉' : counts.B < counts.W ? '負け…' : '引き分け'); return }
        setMsg('CPU はパス。あなたの番（黒）'); setTurn('B'); return
      }
      // 角優先＋最大反転の簡易AI
      const scored = ms.map((m) => ({ m, s: m.f.length + ((m.r === 0 || m.r === 7) && (m.c === 0 || m.c === 7) ? 10 : 0) })).sort((a, b) => b.s - a.s)
      const pick = scored[0].m
      const nb = board.map((row) => [...row])
      nb[pick.r][pick.c] = 'W'
      pick.f.forEach(([r, c]) => { nb[r][c] = 'W' })
      setBoard(nb)
      if (!allMoves(nb, 'B').length && allMoves(nb, 'W').length) { setMsg('置ける場所がないのでパス'); setTurn('W') }
      else {
        const final = !allMoves(nb, 'B').length && !allMoves(nb, 'W').length
        const bc = nb.flat().filter((v) => v === 'B').length, wc = nb.flat().filter((v) => v === 'W').length
        setMsg(final ? (bc > wc ? '勝ち！🎉' : bc < wc ? '負け…' : '引き分け') : 'あなたの番（黒）')
        setTurn('B')
      }
    }, 500)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, board])
  const play = (r: number, c: number) => {
    if (turn !== 'B') return
    const f = flips(board, r, c, 'B')
    if (!f.length) return
    const nb = board.map((row) => [...row])
    nb[r][c] = 'B'
    f.forEach(([fr, fc]) => { nb[fr][fc] = 'B' })
    setBoard(nb); setTurn('W'); setMsg('CPU の番…')
  }
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">黒（あなた）<b>{counts.B}</b></span>
        <span className="game-stat inline">白（CPU）<b>{counts.W}</b></span>
        <button className="btn accent" onClick={() => { setBoard(rInit()); setTurn('B'); setMsg('あなたの番（黒）') }}>リスタート</button>
      </div>
      <p className="game-msg">{msg}</p>
      <div className="reversi">
        {board.map((row, r) => row.map((v, c) => {
          const can = turn === 'B' && myMoves.some((m) => m.r === r && m.c === c)
          return (
            <button key={`${r}-${c}`} className="reversi-cell" onClick={() => play(r, c)}>
              {v && <span className={v === 'B' ? 'stone black' : 'stone white'} />}
              {can && <span className="stone hint" />}
            </button>
          )
        }))}
      </div>
    </div>
  )
}

/* ================= 五目並べ ================= */
type GB = ('B' | 'W' | null)[][]
const gInit = (): GB => Array.from({ length: 12 }, () => Array(12).fill(null))
function gWin(b: GB, r: number, c: number, me: 'B' | 'W'): boolean {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1
    for (const sgn of [1, -1]) {
      let rr = r + dr * sgn, cc = c + dc * sgn
      while (rr >= 0 && rr < 12 && cc >= 0 && cc < 12 && b[rr][cc] === me) { n++; rr += dr * sgn; cc += dc * sgn }
    }
    if (n >= 5) return true
  }
  return false
}
function gScore(b: GB, r: number, c: number, me: 'B' | 'W'): number {
  // そのマスに打った場合の強さ（自他の連続を評価）
  let best = 0
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1, open = 0
    for (const sgn of [1, -1]) {
      let rr = r + dr * sgn, cc = c + dc * sgn
      while (rr >= 0 && rr < 12 && cc >= 0 && cc < 12 && b[rr][cc] === me) { n++; rr += dr * sgn; cc += dc * sgn }
      if (rr >= 0 && rr < 12 && cc >= 0 && cc < 12 && !b[rr][cc]) open++
    }
    best = Math.max(best, n * 10 + open)
  }
  return best
}
export function Gomoku() {
  const [board, setBoard] = useState<GB>(gInit)
  const [over, setOver] = useState('')
  const [busy, setBusy] = useState(false)
  const play = (r: number, c: number) => {
    if (board[r][c] || over || busy) return
    const nb = board.map((row) => [...row])
    nb[r][c] = 'B'
    if (gWin(nb, r, c, 'B')) { setBoard(nb); setOver('あなたの勝ち！🎉'); return }
    setBoard(nb); setBusy(true)
    window.setTimeout(() => {
      // CPU: 勝ち手 > 防ぎ手 > 最善手
      let bestPos: [number, number] | null = null
      let bestVal = -1
      for (let rr = 0; rr < 12; rr++) for (let cc = 0; cc < 12; cc++) {
        if (nb[rr][cc]) continue
        // 近くに石があるマスだけ評価
        let near = false
        for (let dr = -2; dr <= 2 && !near; dr++) for (let dc = -2; dc <= 2; dc++) {
          const ar = rr + dr, ac = cc + dc
          if (ar >= 0 && ar < 12 && ac >= 0 && ac < 12 && nb[ar][ac]) { near = true; break }
        }
        if (!near) continue
        const val = Math.max(gScore(nb, rr, cc, 'W') * 2, gScore(nb, rr, cc, 'B') * 1.6)
        if (val > bestVal) { bestVal = val; bestPos = [rr, cc] }
      }
      if (bestPos) {
        nb[bestPos[0]][bestPos[1]] = 'W'
        if (gWin(nb, bestPos[0], bestPos[1], 'W')) setOver('CPU の勝ち…')
      }
      setBoard([...nb.map((row) => [...row])])
      setBusy(false)
    }, 350)
  }
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-msg">あなた＝黒、CPU＝白。先に5つ並べれば勝ち</span>
        {over && <span className="game-win">{over}</span>}
        <button className="btn accent" onClick={() => { setBoard(gInit()); setOver('') }}>リスタート</button>
      </div>
      <div className="gomoku">
        {board.map((row, r) => row.map((v, c) => (
          <button key={`${r}-${c}`} className="gomoku-cell" onClick={() => play(r, c)}>
            {v && <span className={v === 'B' ? 'stone black' : 'stone white'} />}
          </button>
        )))}
      </div>
    </div>
  )
}
