import { useEffect, useRef, useState } from 'react'

export { Typing } from "./SushiTyping"
/* ================= 15パズル ================= */
function pInit(): number[] {
  const arr = Array.from({ length: 16 }, (_, i) => i)
  // 解けるシャッフル（空きマスを動かす方式）
  let blank = 15
  for (let k = 0; k < 120; k++) {
    const r = Math.floor(blank / 4), c = blank % 4
    const opts: number[] = []
    if (r > 0) opts.push(blank - 4)
    if (r < 3) opts.push(blank + 4)
    if (c > 0) opts.push(blank - 1)
    if (c < 3) opts.push(blank + 1)
    const pick = opts[Math.floor(Math.random() * opts.length)]
    ;[arr[blank], arr[pick]] = [arr[pick], arr[blank]]
    blank = pick
  }
  return arr
}
export function Puzzle15() {
  const [tiles, setTiles] = useState<number[]>(pInit)
  const [moves, setMoves] = useState(0)
  const won = tiles.every((v, i) => v === (i + 1) % 16)
  const tap = (i: number) => {
    const blank = tiles.indexOf(0)
    const r = Math.floor(i / 4), c = i % 4, br = Math.floor(blank / 4), bc = blank % 4
    if (Math.abs(r - br) + Math.abs(c - bc) !== 1) return
    const nb = [...tiles]
    ;[nb[i], nb[blank]] = [nb[blank], nb[i]]
    setTiles(nb); setMoves((m) => m + 1)
  }
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">手数<b>{moves}</b></span>
        {won && <span className="game-win">完成！🎉</span>}
        <button className="btn accent" onClick={() => { setTiles(pInit()); setMoves(0) }}>シャッフル</button>
      </div>
      <div className="puzzle15">
        {tiles.map((v, i) => (
          <button key={i} className={v === 0 ? 'p15 blank' : 'p15'} onClick={() => tap(i)}>{v || ''}</button>
        ))}
      </div>
      <p className="game-help">空きマスの隣をタップして 1〜15 を順番に並べよう。</p>
    </div>
  )
}

/* ================= ハノイの塔 ================= */
export function Hanoi() {
  const N = 4
  const [pegs, setPegs] = useState<number[][]>([[4, 3, 2, 1], [], []])
  const [sel, setSel] = useState<number | null>(null)
  const [moves, setMoves] = useState(0)
  const won = pegs[2].length === N
  const tapPeg = (i: number) => {
    if (sel === null) { if (pegs[i].length) setSel(i); return }
    if (sel === i) { setSel(null); return }
    const from = pegs[sel]
    const disk = from[from.length - 1]
    const to = pegs[i]
    if (to.length && to[to.length - 1] < disk) { setSel(null); return }
    const nb = pegs.map((p) => [...p])
    nb[sel].pop(); nb[i].push(disk)
    setPegs(nb); setMoves((m) => m + 1); setSel(null)
  }
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">手数<b>{moves}</b>（最少15）</span>
        {won && <span className="game-win">完成！🎉</span>}
        <button className="btn accent" onClick={() => { setPegs([[4, 3, 2, 1], [], []]); setMoves(0); setSel(null) }}>リセット</button>
      </div>
      <div className="hanoi">
        {pegs.map((peg, i) => (
          <button key={i} className={`hanoi-peg${sel === i ? ' sel' : ''}`} onClick={() => tapPeg(i)}>
            <div className="hanoi-disks">
              {[...peg].reverse().map((d) => (
                <div key={d} className="hanoi-disk" style={{ width: `${22 + d * 18}%`, background: ['#f87171', '#facc15', '#4ade80', '#60a5fa'][d - 1] }}>{d}</div>
              ))}
            </div>
            <div className="hanoi-base" />
          </button>
        ))}
      </div>
      <p className="game-help">棒をタップして円盤を持ち、置きたい棒をタップ。大きい円盤の上に小さい円盤しか置けません。右端に全部移せば完成。</p>
    </div>
  )
}

/* ================= ブラックジャック ================= */
interface BJCard { suit: string; rank: string; val: number }
function bjDeck(): BJCard[] {
  const suits = ['♠', '♥', '♦', '♣']
  const ranks: [string, number][] = [['A', 11], ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['9', 9], ['10', 10], ['J', 10], ['Q', 10], ['K', 10]]
  const deck = suits.flatMap((suit) => ranks.map(([rank, val]) => ({ suit, rank, val })))
  return deck.sort(() => Math.random() - 0.5)
}
const bjTotal = (hand: BJCard[]) => {
  let t = hand.reduce((s, c) => s + c.val, 0)
  let aces = hand.filter((c) => c.rank === 'A').length
  while (t > 21 && aces > 0) { t -= 10; aces-- }
  return t
}
export function Blackjack() {
  const [deck, setDeck] = useState<BJCard[]>([])
  const [you, setYou] = useState<BJCard[]>([])
  const [dealer, setDealer] = useState<BJCard[]>([])
  const [phase, setPhase] = useState<'idle' | 'play' | 'done'>('idle')
  const [msg, setMsg] = useState('スタートで配ります')
  const [coins, setCoins] = useState(100)
  const start = () => {
    const d = bjDeck()
    setYou([d[0], d[2]]); setDealer([d[1], d[3]]); setDeck(d.slice(4))
    setPhase('play'); setMsg('ヒットかスタンドを選んでください（賭け金10）')
  }
  const hit = () => {
    const ny = [...you, deck[0]]
    setYou(ny); setDeck(deck.slice(1))
    if (bjTotal(ny) > 21) { setPhase('done'); setMsg('バースト…負け（-10）'); setCoins((c) => c - 10) }
  }
  const stand = () => {
    let nd = [...dealer]
    let dk = [...deck]
    while (bjTotal(nd) < 17) { nd = [...nd, dk[0]]; dk = dk.slice(1) }
    setDealer(nd); setDeck(dk); setPhase('done')
    const y = bjTotal(you), dd = bjTotal(nd)
    if (dd > 21 || y > dd) { setMsg(`勝ち！（+10）あなた ${y} vs ディーラー ${dd}`); setCoins((c) => c + 10) }
    else if (y < dd) { setMsg(`負け（-10）あなた ${y} vs ディーラー ${dd}`); setCoins((c) => c - 10) }
    else setMsg(`引き分け あなた ${y} vs ディーラー ${dd}`)
  }
  const cardView = (c: BJCard, hidden = false) => (
    <span className="bj-card" style={{ color: c.suit === '♥' || c.suit === '♦' ? '#dc2626' : '#111827' }}>{hidden ? '🂠' : `${c.suit}${c.rank}`}</span>
  )
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">コイン<b>{coins}</b></span>
        <button className="btn accent" onClick={start}>{phase === 'idle' ? 'スタート' : 'もう一度'}</button>
      </div>
      <p className="game-msg">{msg}</p>
      <div className="bj-row"><span className="bj-label">ディーラー {phase === 'done' ? `(${bjTotal(dealer)})` : ''}</span>
        <div>{dealer.map((c, i) => <span key={i}>{cardView(c, phase === 'play' && i === 1)}</span>)}</div>
      </div>
      <div className="bj-row"><span className="bj-label">あなた ({you.length ? bjTotal(you) : 0})</span>
        <div>{you.map((c, i) => <span key={i}>{cardView(c)}</span>)}</div>
      </div>
      {phase === 'play' && (
        <div className="game-pad">
          <button className="btn accent" onClick={hit}>ヒット</button>
          <button className="btn" onClick={stand}>スタンド</button>
        </div>
      )}
    </div>
  )
}

/* ================= スロット ================= */
const SLOT_SYMBOLS = ['🍒', '🍋', '🍇', '🔔', '⭐', '💎', '7️⃣']
export function Slot() {
  const [reels, setReels] = useState(['🍒', '🍋', '🍇'])
  const [coins, setCoins] = useState(100)
  const [msg, setMsg] = useState('スピン（10コイン）')
  const [spinning, setSpinning] = useState(false)
  const timer = useRef<number | null>(null)
  const spin = () => {
    if (spinning || coins < 10) return
    setCoins((c) => c - 10)
    setSpinning(true); setMsg('…')
    timer.current = window.setInterval(() => {
      setReels([0, 1, 2].map(() => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]))
    }, 80)
    window.setTimeout(() => {
      if (timer.current) window.clearInterval(timer.current)
      const final = [0, 1, 2].map(() => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)])
      setReels(final); setSpinning(false)
      if (final[0] === final[1] && final[1] === final[2]) {
        const win = final[0] === '7️⃣' ? 777 : final[0] === '💎' ? 300 : 100
        setCoins((c) => c + win); setMsg(`大当たり！ +${win} 🎉`)
      } else if (final[0] === final[1] || final[1] === final[2] || final[0] === final[2]) {
        setCoins((c) => c + 20); setMsg('2つ揃い +20')
      } else setMsg('はずれ')
    }, 900)
  }
  return (
    <div className="game-app col center">
      <div className="slot-reels">{reels.map((r, i) => <span key={i} className="slot-reel">{r}</span>)}</div>
      <div className="game-bar center">
        <span className="game-stat inline">コイン<b>{coins}</b></span>
        <span className="game-msg">{msg}</span>
      </div>
      <button className="btn accent" onClick={spin} disabled={spinning || coins < 10}>スピン</button>
      {coins < 10 && <button className="btn" onClick={() => setCoins(100)}>コインを補充</button>}
    </div>
  )
}

/* ================= ランナー ================= */
const RW = 360, RH = 160
export function Runner() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)
  const [running, setRunning] = useState(false)
  const st = useRef({ y: 0, vy: 0, obs: [] as number[], frame: 0, speed: 3.4 })
  const jump = () => {
    const s = st.current
    if (running && s.y === 0) s.vy = -10.5
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); jump() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])
  useEffect(() => {
    if (!running) return
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    let rafId = 0
    const ground = RH - 26
    const tick = () => {
      const s = st.current
      s.frame++
      s.speed = 3.4 + s.frame / 900
      if (s.frame % 78 === 0) s.obs.push(RW + 30)
      s.obs = s.obs.map((x) => x - s.speed).filter((x) => x > -30)
      s.vy += 0.55; s.y += s.vy
      if (s.y > 0) { s.y = 0; s.vy = 0 }
      const dinoY = ground - 30 + s.y
      if (s.obs.some((x) => x > 28 && x < 62 && s.y > -26)) { setOver(true); setRunning(false); return }
      setScore(Math.floor(s.frame / 6))
      ctx.fillStyle = '#fef3c7'; ctx.fillRect(0, 0, RW, RH)
      ctx.fillStyle = '#92400e'; ctx.fillRect(0, ground, RW, 2)
      ctx.font = '30px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('🦖', 46, dinoY)
      ctx.font = '24px serif'
      s.obs.forEach((x) => ctx.fillText('🌵', x, ground - 14))
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [running])
  const start = () => { st.current = { y: 0, vy: 0, obs: [], frame: 0, speed: 3.4 }; setScore(0); setOver(false); setRunning(true) }
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">スコア<b>{score}</b></span>
        {over && <span className="game-over">ゲームオーバー</span>}
        <button className="btn accent" onClick={start}>{running ? 'リスタート' : 'スタート'}</button>
      </div>
      <canvas ref={canvasRef} width={RW} height={RH} className="game-canvas" onPointerDown={jump} />
      <p className="game-help">クリック／タップ／Spaceでジャンプ。サボテンを避け続けよう。</p>
    </div>
  )
}
