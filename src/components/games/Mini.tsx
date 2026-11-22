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

/* ================= インベーダー ================= */
const IW = 360, IH = 240
const INVADER_BEST_KEY = 'webx-invader-best'
const INVADER_STARS = Array.from({ length: 26 }, (_, i) => ({ x: (i * 53 + 17) % IW, y: (i * 37 + 11) % (IH - 40), r: 1 + (i % 2) * 0.7 }))
const INVADER_ROW_COLORS = ['#f87171', '#fbbf24', '#4ade80', '#60a5fa', '#c084fc']
const INVADER_ROW_POINTS = [30, 20, 20, 10, 10]
type InvEnemy = { col: number; row: number; alive: boolean }
function invFormation(wave: number): InvEnemy[] {
  const rows = Math.min(4 + Math.floor((wave - 1) / 3), 5)
  const list: InvEnemy[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < 8; c++) list.push({ col: c, row: r, alive: true })
  return list
}
export function Invader() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [wave, setWave] = useState(1)
  const [lives, setLives] = useState(3)
  const [best, setBest] = useState(() => Number(localStorage.getItem(INVADER_BEST_KEY) ?? 0) || 0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'clear' | 'over'>('idle')
  const [msg, setMsg] = useState('スタートで出撃！')
  const st = useRef({
    px: IW / 2, keys: new Set<string>(),
    bullets: [] as { x: number; y: number }[],
    ebullets: [] as { x: number; y: number }[],
    enemies: [] as InvEnemy[],
    fx: 0, fy: 0, dir: 1, step: 0, frame: 0, cool: 0, invuln: 0,
    wave: 1, score: 0, lives: 3, total: 0, killed: 0,
  })
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const fire = () => {
    const s = st.current
    if (phaseRef.current !== 'playing' || s.cool > 0) return
    s.cool = 14
    s.bullets.push({ x: s.px, y: IH - 40 })
  }
  const beginWave = (w: number) => {
    const s = st.current
    s.enemies = invFormation(w); s.total = s.enemies.length; s.killed = 0
    s.bullets = []; s.ebullets = []; s.fx = 0; s.fy = 0; s.dir = 1; s.step = 0; s.cool = 0; s.invuln = 0
    s.wave = w
    setWave(w); setPhase('playing'); setMsg(`ウェーブ ${w}！`)
  }
  const start = () => {
    const s = st.current
    s.px = IW / 2; s.score = 0; s.lives = 3
    setScore(0); setLives(3)
    beginWave(1)
  }
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') {
        st.current.keys.add(e.code); e.preventDefault()
      }
      if (e.code === 'Space') { e.preventDefault(); fire() }
      if (e.code === 'Enter' && phaseRef.current !== 'playing') start()
    }
    const up = (e: KeyboardEvent) => { st.current.keys.delete(e.code) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (phase !== 'playing') return
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    let rafId = 0
    const playerY = IH - 26
    const enemyPos = (e: InvEnemy, s: typeof st.current) => ({ x: 30 + e.col * 36 + s.fx, y: 22 + e.row * 24 + s.fy })
    const tick = () => {
      const s = st.current
      s.frame++; s.cool = Math.max(0, s.cool - 1); s.invuln = Math.max(0, s.invuln - 1)
      // 自機の移動
      if (s.keys.has('ArrowLeft') || s.keys.has('KeyA')) s.px -= 4.5
      if (s.keys.has('ArrowRight') || s.keys.has('KeyD')) s.px += 4.5
      s.px = Math.max(18, Math.min(IW - 18, s.px))
      // 敵の移動（残りが少ないほど速く、ウェーブが進むほど速く）
      const alive = s.enemies.filter((e) => e.alive)
      const interval = Math.max(9, 34 - s.killed - (s.wave - 1) * 2)
      s.step++
      if (s.step >= interval) {
        s.step = 0
        const xs = alive.map((e) => enemyPos(e, s).x)
        const minX = Math.min(...xs), maxX = Math.max(...xs)
        if ((s.dir > 0 && maxX + 8 > IW - 16) || (s.dir < 0 && minX - 8 < 8)) { s.dir *= -1; s.fy += 14 } else { s.fx += s.dir * 8 }
      }
      // 敵の弾
      if (s.frame % 52 === 0 && alive.length) {
        const bottom = alive.filter((e) => !alive.some((o) => o.col === e.col && o.row > e.row))
        const pick = bottom[Math.floor(Math.random() * bottom.length)]
        const p = enemyPos(pick, s)
        s.ebullets.push({ x: p.x, y: p.y + 12 })
      }
      // 自弾
      s.bullets = s.bullets.map((b) => ({ ...b, y: b.y - 7 })).filter((b) => b.y > -10)
      s.ebullets = s.ebullets.map((b) => ({ ...b, y: b.y + 2.6 + s.wave * 0.2 })).filter((b) => b.y < IH + 10)
      // 自弾と敵の当たり判定
      s.bullets = s.bullets.filter((b) => {
        const hit = s.enemies.find((e) => {
          if (!e.alive) return false
          const p = enemyPos(e, s)
          return Math.abs(b.x - p.x) < 16 && Math.abs(b.y - p.y) < 12
        })
        if (hit) {
          hit.alive = false; s.killed++
          s.score += INVADER_ROW_POINTS[hit.row] ?? 10
          setScore(s.score)
        }
        return !hit
      })
      // 敵弾と自機の当たり判定
      if (s.invuln === 0) {
        const hit = s.ebullets.some((b) => Math.abs(b.x - s.px) < 15 && Math.abs(b.y - playerY) < 13)
        if (hit) {
          s.ebullets = []
          s.lives--; setLives(s.lives)
          s.invuln = 90
          if (s.lives <= 0) {
            if (s.score > best) { localStorage.setItem(INVADER_BEST_KEY, String(s.score)); setBest(s.score) }
            setMsg(`ゲームオーバー… スコア ${s.score}`)
            setPhase('over')
            return
          }
        }
      }
      // 敵が最下段まで到達したらゲームオーバー
      if (alive.some((e) => enemyPos(e, s).y > IH - 56)) {
        if (s.score > best) { localStorage.setItem(INVADER_BEST_KEY, String(s.score)); setBest(s.score) }
        setMsg(`敵に侵攻された… スコア ${s.score}`)
        setPhase('over')
        return
      }
      // 全滅でウェーブクリア
      if (s.killed >= s.total) {
        s.score += 50; setScore(s.score)
        setMsg(`ウェーブ ${s.wave} クリア！ +50`)
        setPhase('clear')
        return
      }
      // 描画
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, IW, IH)
      ctx.fillStyle = '#64748b'
      INVADER_STARS.forEach((star) => { ctx.fillRect(star.x, star.y, star.r, star.r) })
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      s.enemies.forEach((e) => {
        if (!e.alive) return
        const p = enemyPos(e, s)
        ctx.font = '20px serif'
        ctx.fillStyle = INVADER_ROW_COLORS[e.row] ?? '#c084fc'
        ctx.fillText('👾', p.x, p.y)
      })
      ctx.fillStyle = '#fde047'
      s.bullets.forEach((b) => ctx.fillRect(b.x - 2, b.y - 8, 4, 10))
      ctx.fillStyle = '#f87171'
      s.ebullets.forEach((b) => { ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill() })
      if (s.invuln === 0 || Math.floor(s.frame / 6) % 2 === 0) {
        ctx.font = '26px serif'
        ctx.fillText('🚀', s.px, playerY)
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [phase, best])
  const dragMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'playing') return
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return
    st.current.px = Math.max(18, Math.min(IW - 18, ((e.clientX - rect.left) / rect.width) * IW))
  }
  const holdKey = (code: string) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); st.current.keys.add(code) },
    onPointerUp: () => { st.current.keys.delete(code) },
    onPointerLeave: () => { st.current.keys.delete(code) },
  })
  return (
    <div className="game-app col">
      <div className="game-bar">
        <span className="game-stat inline">スコア<b>{score}</b></span>
        <span className="game-stat inline">ウェーブ<b>{wave}</b></span>
        <span className="game-stat inline">残機<b>{'🚀'.repeat(Math.max(0, lives)) || '—'}</b></span>
        <span className="game-stat inline">ベスト<b>{best}</b></span>
        {phase === 'idle' && <button className="btn accent" onClick={start}>スタート</button>}
        {phase === 'clear' && <button className="btn accent" onClick={() => beginWave(wave + 1)}>次のウェーブへ</button>}
        {(phase === 'over' || phase === 'playing') && <button className="btn accent" onClick={start}>リスタート</button>}
      </div>
      <p className="game-msg">{msg}</p>
      <canvas
        ref={canvasRef} width={IW} height={IH} className="game-canvas"
        onPointerDown={(e) => { dragMove(e); fire() }}
        onPointerMove={(e) => { if (e.buttons > 0) dragMove(e) }}
      />
      <div className="game-pad wide">
        <button className="btn" {...holdKey('ArrowLeft')}>◀</button>
        <button className="btn accent" onPointerDown={(e) => { e.preventDefault(); fire() }}>🔥 発射</button>
        <button className="btn" {...holdKey('ArrowRight')}>▶</button>
      </div>
      <p className="game-help">←→／A Dで移動、Spaceで発射。敵を全滅させると次のウェーブへ。敵弾に3回当たるか、敵が最下段まで来るとゲームオーバー。</p>
    </div>
  )
}
