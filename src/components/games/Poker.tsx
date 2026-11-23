import { useEffect, useRef, useState } from 'react'

/* ================= ポーカー（テキサスホールデム） =================
 * 自分＋CPU 3人の4人対戦。
 * ・手札2枚＋コミュニティカード5枚のうちベスト5枚で役を競う
 * ・プリフロップ→フロップ→ターン→リバー→ショーダウンのベットラウンド
 * ・ブラインドは5ハンドごとに上がる（10/20 → 20/40 → …）
 * ・フォールド／チェック／コール／レイズ／オールイン、キーボード操作可
 * ・勝利数と最大ポットを保存 */

type Suit = '♠' | '♥' | '♦' | '♣'
interface CardT { r: number; s: Suit } // r: 2〜14（11=J, 12=Q, 13=K, 14=A）

const SUITS: Suit[] = ['♠', '♥', '♦', '♣']
const NAMES = ['ミオ', 'ケン', 'ユウ']
const WINS_KEY = 'webx-poker-wins'
const BEST_KEY = 'webx-poker-best'
const HANDS_KEY = 'webx-poker-hands'

const HAND_NAMES = ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ']

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
  ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.22, 0.07), i * 120))
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function makeDeck(): CardT[] {
  const d: CardT[] = []
  for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push({ r, s })
  return shuffle(d)
}

function rankLabel(r: number): string {
  if (r === 14) return 'A'
  if (r === 13) return 'K'
  if (r === 12) return 'Q'
  if (r === 11) return 'J'
  return String(r)
}
function isRed(s: Suit): boolean { return s === '♥' || s === '♦' }

/* ---- 5枚の役評価 ---- */
interface Eval { cat: number; tb: number[] }
function eval5(cards: CardT[]): Eval {
  const ranks = cards.map(c => c.r).sort((a, b) => b - a)
  const flush = cards.every(c => c.s === cards[0].s)
  const uniq = [...new Set(ranks)].sort((a, b) => b - a)
  let straightHigh = 0
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0]
    else if (uniq[0] === 14 && uniq[1] === 5) straightHigh = 5 // A-2-3-4-5
  }
  const counts = new Map<number, number>()
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const byCount = (n: number) => groups.filter(g => g[1] === n).map(g => g[0]).sort((a, b) => b - a)
  if (flush && straightHigh) return { cat: 8, tb: [straightHigh] }
  const fours = byCount(4)
  if (fours.length) return { cat: 7, tb: [fours[0], ...byCount(1)] }
  const threes = byCount(3)
  const pairs = byCount(2)
  if (threes.length && pairs.length) return { cat: 6, tb: [threes[0], pairs[0]] }
  if (flush) return { cat: 5, tb: ranks }
  if (straightHigh) return { cat: 4, tb: [straightHigh] }
  if (threes.length) return { cat: 3, tb: [threes[0], ...byCount(1)] }
  if (pairs.length >= 2) return { cat: 2, tb: [pairs[0], pairs[1], ...byCount(1)] }
  if (pairs.length === 1) return { cat: 1, tb: [pairs[0], ...byCount(1)] }
  return { cat: 0, tb: ranks }
}

function compareEval(a: Eval, b: Eval): number {
  if (a.cat !== b.cat) return a.cat - b.cat
  for (let i = 0; i < Math.max(a.tb.length, b.tb.length); i++) {
    const d = (a.tb[i] ?? 0) - (b.tb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/* 7枚以下からベスト5枚を評価（5枚未満はペア／ハイカードのみの簡易評価） */
function evalBest(cards: CardT[]): Eval {
  if (cards.length < 5) {
    const ranks = cards.map(c => c.r).sort((a, b) => b - a)
    const counts = new Map<number, number>()
    for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1)
    const pairs = [...counts.entries()].filter(([, n]) => n === 2).map(([r]) => r).sort((a, b) => b - a)
    if (pairs.length) return { cat: 1, tb: [pairs[0], ...ranks.filter(r => r !== pairs[0])] }
    return { cat: 0, tb: ranks }
  }
  let best: Eval | null = null
  const n = cards.length
  for (let a = 0; a < n - 4; a++) for (let b = a + 1; b < n - 3; b++) for (let c = b + 1; c < n - 2; c++)
    for (let d = c + 1; d < n - 1; d++) for (let e = d + 1; e < n; e++) {
      const ev = eval5([cards[a], cards[b], cards[c], cards[d], cards[e]])
      if (!best || compareEval(ev, best) > 0) best = ev
    }
  return best as Eval
}

function handName(ev: Eval): string {
  if (ev.cat === 8 && ev.tb[0] === 14) return 'ロイヤルストレートフラッシュ'
  return HAND_NAMES[ev.cat]
}

/* ---- プリフロップの手札の強さ（0〜1の目安） ---- */
function preflopStrength(hand: CardT[]): number {
  const [a, b] = hand.map(c => c.r).sort((x, y) => y - x)
  if (a === b) return 0.55 + (a / 14) * 0.4
  let s = ((a + b) / 28) * 0.55
  if (hand[0].s === hand[1].s) s += 0.08
  if (a - b === 1) s += 0.05
  return Math.min(0.95, s)
}

function strengthOf(hand: CardT[], community: CardT[]): number {
  if (community.length === 0) return preflopStrength(hand)
  const ev = evalBest([...hand, ...community])
  const kicker = (ev.tb[0] ?? 2) / 14
  return Math.min(0.98, ev.cat / 8 * 0.85 + kicker * 0.12)
}

interface PState {
  name: string
  cpu: boolean
  chips: number
  hand: CardT[]
  bet: number
  folded: boolean
  allIn: boolean
  out: boolean
}

type Street = 'preflop' | 'flop' | 'turn' | 'river'
type Phase = 'title' | 'betting' | 'showdown' | 'over' | 'champion'

interface GState {
  phase: Phase
  street: Street
  players: PState[]
  deck: CardT[]
  community: CardT[]
  pot: number
  curBet: number
  dealer: number
  turn: number
  actionsLeft: number
  handNo: number
  log: string[]
  winners: number[] | null
  showEvals: (Eval | null)[]
  wins: number
  bestPot: number
  handsPlayed: number
}

const BLIND_BASE = 10

function loadNum(key: string): number {
  try { return Number(localStorage.getItem(key) ?? 0) || 0 } catch { return 0 }
}

function initialState(): GState {
  return {
    phase: 'title', street: 'preflop',
    players: [
      { name: 'あなた', cpu: false, chips: 1000, hand: [], bet: 0, folded: false, allIn: false, out: false },
      ...NAMES.map(n => ({ name: n, cpu: true, chips: 1000, hand: [], bet: 0, folded: false, allIn: false, out: false })),
    ],
    deck: [], community: [], pot: 0, curBet: 0, dealer: 3, turn: 0, actionsLeft: 0, handNo: 0,
    log: ['ポーカーへようこそ。スタートを押してね。'],
    winners: null, showEvals: [],
    wins: loadNum(WINS_KEY), bestPot: loadNum(BEST_KEY), handsPlayed: loadNum(HANDS_KEY),
  }
}

function blindsFor(handNo: number): { sb: number; bb: number } {
  const level = Math.floor((handNo - 1) / 5)
  const sb = BLIND_BASE * (level + 1)
  return { sb, bb: sb * 2 }
}

function nextAlive(players: PState[], from: number): number {
  for (let i = 1; i <= players.length; i++) {
    const idx = (from + i) % players.length
    if (!players[idx].out) return idx
  }
  return from
}
function activeIdx(players: PState[]): number[] {
  return players.map((p, i) => ({ p, i })).filter(({ p }) => !p.folded && !p.out).map(({ i }) => i)
}
function canBetIdx(players: PState[]): number[] {
  return activeIdx(players).filter(i => !players[i].allIn)
}
function nextCanBet(players: PState[], from: number): number {
  const list = canBetIdx(players)
  if (!list.length) return -1
  for (let i = 1; i <= players.length; i++) {
    const idx = (from + i) % players.length
    if (list.includes(idx)) return idx
  }
  return list[0]
}

function startHand(prev: GState): GState {
  const players = prev.players.map(p => ({ ...p, hand: [] as CardT[], bet: 0, folded: false, allIn: false }))
  const alive = players.filter(p => !p.out)
  if (alive.length < 2) return prev
  const handNo = prev.handNo + 1
  const dealer = nextAlive(players, prev.dealer)
  const deck = makeDeck()
  players.forEach(p => { if (!p.out) p.hand = [deck.pop() as CardT, deck.pop() as CardT] })
  const { sb, bb } = blindsFor(handNo)
  const sbIdx = nextAlive(players, dealer)
  const bbIdx = nextAlive(players, sbIdx)
  const post = (idx: number, amt: number) => {
    const p = players[idx]
    const pay = Math.min(amt, p.chips)
    p.chips -= pay
    p.bet += pay
    if (p.chips === 0) p.allIn = true
    return pay
  }
  const pot = post(sbIdx, sb) + post(bbIdx, bb)
  const canBet = canBetIdx(players)
  const log = [...prev.log, `第${handNo}ハンド開始。ブラインド ${sb}/${bb}。ディーラーは${players[dealer].name}。`].slice(-6)
  return {
    ...prev, phase: 'betting', street: 'preflop', players, deck, community: [],
    pot, curBet: bb, dealer, turn: nextCanBet(players, bbIdx),
    actionsLeft: canBet.length, handNo,
    log, winners: null, showEvals: [],
  }
}

function finishHand(s: GState, winners: number[], reason: string): GState {
  const players = s.players.map(p => ({ ...p }))
  const share = Math.floor(s.pot / winners.length)
  let rest = s.pot - share * winners.length
  winners.forEach((w, k) => {
    players[w].chips += share + (k === 0 ? rest : 0)
  })
  const humanWon = winners.includes(0)
  const wins = s.wins + (humanWon ? 1 : 0)
  const bestPot = Math.max(s.bestPot, s.pot)
  const handsPlayed = s.handsPlayed + 1
  try {
    localStorage.setItem(WINS_KEY, String(wins))
    localStorage.setItem(BEST_KEY, String(bestPot))
    localStorage.setItem(HANDS_KEY, String(handsPlayed))
  } catch { /* 保存できなくても遊べる */ }
  const outNames: string[] = []
  players.forEach(p => {
    if (!p.out && p.chips === 0) { p.out = true; outNames.push(p.name) }
  })
  const log = [...s.log, reason, ...outNames.map(n => `${n}はチップが尽きて脱落。`)].slice(-6)
  let phase: Phase = 'showdown'
  if (players[0].out) phase = 'over'
  else if (players.filter(p => !p.out).length === 1) phase = 'champion'
  if (humanWon) fanfare()
  return { ...s, phase, players, pot: 0, winners, wins, bestPot, handsPlayed, log }
}

function showdown(s: GState): GState {
  const act = activeIdx(s.players)
  const evals: (Eval | null)[] = s.players.map((p, i) =>
    act.includes(i) ? evalBest([...p.hand, ...s.community]) : null)
  let best = evals[act[0]] as Eval
  let winners = [act[0]]
  for (const i of act.slice(1)) {
    const cmp = compareEval(evals[i] as Eval, best)
    if (cmp > 0) { best = evals[i] as Eval; winners = [i] }
    else if (cmp === 0) winners.push(i)
  }
  const desc = act.map(i => `${s.players[i].name}：${handName(evals[i] as Eval)}`).join('／')
  const names = winners.map(w => s.players[w].name).join('・')
  return finishHand({ ...s, showEvals: evals }, winners, `ショーダウン！ ${desc} → ${names}が${s.pot}チップ獲得！`)
}

function advanceStreet(s: GState): GState {
  const players = s.players.map(p => ({ ...p, bet: 0 }))
  const order: Street[] = ['preflop', 'flop', 'turn', 'river']
  const nextStreet = order[order.indexOf(s.street) + 1]
  const deck = [...s.deck]
  const community = [...s.community]
  if (nextStreet === 'flop') community.push(deck.pop() as CardT, deck.pop() as CardT, deck.pop() as CardT)
  else community.push(deck.pop() as CardT)
  const base: GState = {
    ...s, players, deck, community, street: nextStreet, curBet: 0,
    turn: nextCanBet(players, s.dealer), actionsLeft: canBetIdx(players).length,
    log: [...s.log, nextStreet === 'flop' ? 'フロップが開いた。' : nextStreet === 'turn' ? 'ターンが開いた。' : 'リバーが開いた。'].slice(-6),
  }
  // ベットできる人が1人以下なら残りのカードを全部開いてショーダウンへ
  if (canBetIdx(players).length <= 1) {
    let d = [...base.deck]
    let c = [...base.community]
    while (c.length < 5) c.push(d.pop() as CardT)
    return showdown({ ...base, deck: d, community: c })
  }
  return base
}

type Action = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise'; to: number } | { type: 'allin' }

function applyAction(prev: GState, idx: number, action: Action): GState {
  if (prev.phase !== 'betting') return prev
  const players = prev.players.map(p => ({ ...p }))
  const p = players[idx]
  if (p.folded || p.allIn || p.out) return prev
  let { pot, curBet, actionsLeft } = prev
  const log = [...prev.log]
  if (action.type === 'fold') {
    p.folded = true
    log.push(`${p.name}はフォールド。`)
    actionsLeft -= 1
  } else if (action.type === 'check') {
    if (p.bet !== curBet) return prev
    log.push(`${p.name}はチェック。`)
    actionsLeft -= 1
  } else {
    let pay = 0
    let newTotal = p.bet
    if (action.type === 'call') {
      pay = Math.min(curBet - p.bet, p.chips)
      newTotal = p.bet + pay
      log.push(`${p.name}は${pay}チップをコール。`)
    } else if (action.type === 'raise') {
      const target = Math.min(action.to, p.bet + p.chips)
      pay = target - p.bet
      newTotal = target
      log.push(`${p.name}は${newTotal}チップにレイズ！`)
    } else {
      pay = p.chips
      newTotal = p.bet + pay
      log.push(`${p.name}はオールイン！（${newTotal}チップ）`)
    }
    p.chips -= pay
    p.bet = newTotal
    pot += pay
    if (p.chips === 0) p.allIn = true
    if (newTotal > curBet) {
      curBet = newTotal
      actionsLeft = canBetIdx(players).filter(i => i !== idx).length
    } else {
      actionsLeft -= 1
    }
  }
  let s: GState = { ...prev, players, pot, curBet, actionsLeft, log: log.slice(-6) }
  const act = activeIdx(players)
  if (act.length === 1) {
    const w = act[0]
    return finishHand(s, [w], `全員フォールド。${players[w].name}が${s.pot}チップ獲得！`)
  }
  if (actionsLeft <= 0) {
    if (s.street === 'river') return showdown(s)
    return advanceStreet(s)
  }
  const nt = nextCanBet(players, idx)
  return { ...s, turn: nt === -1 ? idx : nt }
}

function cpuDecide(s: GState, idx: number): Action {
  const p = s.players[idx]
  const toCall = s.curBet - p.bet
  const str = strengthOf(p.hand, s.community) + (Math.random() * 0.24 - 0.12)
  if (toCall === 0) {
    if (str > 0.72 && Math.random() < 0.45 && p.chips > s.curBet) {
      const target = Math.min(s.curBet * 2 + 20, p.bet + p.chips)
      return { type: 'raise', to: target }
    }
    return { type: 'check' }
  }
  if (toCall >= p.chips) return { type: 'allin' }
  const costRatio = toCall / (s.pot + toCall + 1)
  if (str < 0.3 && costRatio > 0.08 && Math.random() < 0.75) return { type: 'fold' }
  if (str > 0.82 && Math.random() < 0.5 && p.chips > toCall + 40) {
    const target = Math.min(Math.max(s.curBet * 2, s.curBet + 40), p.bet + p.chips)
    return { type: 'raise', to: target }
  }
  return { type: 'call' }
}

function nextHandAfterShowdown(prev: GState): GState {
  return startHand({ ...prev, phase: 'betting' })
}

export default function Poker() {
  const [gs, setGs] = useState<GState>(initialState)
  const timer = useRef<number | null>(null)

  const humanTurn = gs.phase === 'betting' && gs.turn === 0 && !gs.players[0].folded && !gs.players[0].allIn && !gs.players[0].out

  useEffect(() => {
    if (gs.phase !== 'betting') return
    const cur = gs.players[gs.turn]
    if (!cur || !cur.cpu || cur.folded || cur.allIn || cur.out) return
    timer.current = window.setTimeout(() => {
      setGs(prev => {
        const now = prev.players[prev.turn]
        if (prev.phase !== 'betting' || !now || !now.cpu) return prev
        return applyAction(prev, prev.turn, cpuDecide(prev, prev.turn))
      })
    }, 900)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [gs])

  const me = gs.players[0]
  const toCall = gs.curBet - me.bet
  const canRaise = me.chips > toCall
  const myEval = gs.community.length >= 3 ? evalBest([...me.hand, ...gs.community]) : null
  const { sb, bb } = blindsFor(Math.max(1, gs.handNo))

  const doAction = (a: Action) => {
    beep(660, 0.06, 0.04)
    setGs(prev => applyAction(prev, 0, a))
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!humanTurn) return
    const k = e.key.toLowerCase()
    if (k === 'f') doAction({ type: 'fold' })
    else if (k === 'c') doAction(toCall === 0 ? { type: 'check' } : { type: 'call' })
    else if (k === 'r' && canRaise) doAction({ type: 'raise', to: Math.min(gs.curBet * 2 + 20, me.bet + me.chips) })
    else if (k === 'a') doAction({ type: 'allin' })
  }

  const start = () => {
    beep(880, 0.1, 0.05)
    setGs(prev => startHand({ ...prev, handNo: prev.handNo }))
  }

  const cardView = (c: CardT | null, faceDown = false, small = false) => {
    if (faceDown || !c) return <span className={`poker-card${small ? ' small' : ''} back`}>🂠</span>
    return (
      <span className={`poker-card${small ? ' small' : ''} ${isRed(c.s) ? 'red' : 'black'}`}>
        <b>{rankLabel(c.r)}</b>{c.s}
      </span>
    )
  }

  if (gs.phase === 'title') {
    return (
      <div className="poker" tabIndex={0}>
        <h2>♠ ポーカー ♥</h2>
        <p>テキサスホールデム。CPU 3人とチップ1000で対戦！</p>
        <div className="poker-rules">
          <p>・手札2枚＋場の5枚からベスト5枚で役を競う</p>
          <p>・プリフロップ→フロップ→ターン→リバーでベット</p>
          <p>・ブラインド {sb}/{bb}（5ハンドごとにアップ）</p>
          <p>・操作：F＝フォールド／C＝チェック・コール／R＝レイズ／A＝オールイン</p>
        </div>
        <p>勝利 {gs.wins}回 ／ 最大ポット {gs.bestPot} ／ プレイ {gs.handsPlayed}ハンド</p>
        <button className="poker-btn big" onClick={start}>スタート</button>
      </div>
    )
  }

  if (gs.phase === 'over') {
    return (
      <div className="poker" tabIndex={0}>
        <h2>ゲームオーバー</h2>
        <p>チップが尽きてしまった…。また挑戦してね！</p>
        <p>勝利 {gs.wins}回 ／ 最大ポット {gs.bestPot} ／ プレイ {gs.handsPlayed}ハンド</p>
        <button className="poker-btn big" onClick={() => setGs(initialState())}>最初から</button>
      </div>
    )
  }

  if (gs.phase === 'champion') {
    return (
      <div className="poker" tabIndex={0}>
        <h2>🏆 優勝！</h2>
        <p>CPU 3人全員のチップを奪い取った！おめでとう！</p>
        <p>勝利 {gs.wins}回 ／ 最大ポット {gs.bestPot} ／ プレイ {gs.handsPlayed}ハンド</p>
        <button className="poker-btn big" onClick={() => setGs(initialState())}>もう一度</button>
      </div>
    )
  }

  const streetLabel: Record<Street, string> = { preflop: 'プリフロップ', flop: 'フロップ', turn: 'ターン', river: 'リバー' }

  return (
    <div className="poker" tabIndex={0} onKeyDown={onKey}>
      <div className="poker-head">
        <span>第{gs.handNo}ハンド・{streetLabel[gs.street]}</span>
        <span>ポット：{gs.pot}</span>
        <span>ブラインド {sb}/{bb}</span>
        <span>🏆{gs.wins}勝</span>
      </div>

      <div className="poker-table">
        <div className="poker-cpus">
          {gs.players.slice(1).map((p, k) => {
            const i = k + 1
            const isTurn = gs.phase === 'betting' && gs.turn === i
            const won = gs.winners?.includes(i)
            const show = gs.phase === 'showdown' && !p.folded
            return (
              <div key={p.name} className={`poker-player ${isTurn ? 'turn' : ''} ${p.folded ? 'folded' : ''}`}>
                <div className="poker-pname">{p.name}{gs.dealer === i ? ' 🎩' : ''}{won ? ' 👑' : ''}</div>
                <div className="poker-cards">
                  {show ? p.hand.map((c, j) => <span key={j}>{cardView(c, false, true)}</span>)
                    : p.hand.map((_, j) => <span key={j}>{cardView(null, true, true)}</span>)}
                </div>
                <div>チップ {p.chips}{p.allIn ? '（オールイン）' : ''}</div>
                <div>ベット {p.bet}</div>
                {gs.phase === 'showdown' && gs.showEvals[i] && !p.folded && <div>役：{handName(gs.showEvals[i] as Eval)}</div>}
              </div>
            )
          })}
        </div>

        <div className="poker-community">
          <div className="poker-clabel">コミュニティカード</div>
          <div className="poker-cards">
            {[0, 1, 2, 3, 4].map(j => (
              <span key={j}>{gs.community[j] ? cardView(gs.community[j]) : <span className="poker-card empty">?</span>}</span>
            ))}
          </div>
          <div>現在のベット：{gs.curBet}</div>
        </div>

        <div className={`poker-player me ${humanTurn ? 'turn' : ''} ${me.folded ? 'folded' : ''}`}>
          <div className="poker-pname">あなた{gs.dealer === 0 ? ' 🎩' : ''}{gs.winners?.includes(0) ? ' 👑' : ''}</div>
          <div className="poker-cards">{me.hand.map((c, j) => <span key={j}>{cardView(c)}</span>)}</div>
          <div>チップ {me.chips}{me.allIn ? '（オールイン）' : ''} ／ ベット {me.bet}</div>
          {myEval && <div>今の役：{handName(myEval)}</div>}
          {gs.phase === 'showdown' && gs.showEvals[0] && !me.folded && <div>役：{handName(gs.showEvals[0] as Eval)}</div>}
        </div>
      </div>

      {gs.phase === 'betting' && (
        <div className="poker-actions">
          {humanTurn ? (
            <>
              <button className="poker-btn" onClick={() => doAction({ type: 'fold' })}>フォールド (F)</button>
              {toCall === 0
                ? <button className="poker-btn" onClick={() => doAction({ type: 'check' })}>チェック (C)</button>
                : <button className="poker-btn" onClick={() => doAction({ type: 'call' })}>コール {toCall} (C)</button>}
              {canRaise && (
                <button className="poker-btn" onClick={() => doAction({ type: 'raise', to: Math.min(gs.curBet * 2 + 20, me.bet + me.chips) })}>
                  レイズ {Math.min(gs.curBet * 2 + 20, me.bet + me.chips)} (R)
                </button>
              )}
              {me.chips > 0 && <button className="poker-btn danger" onClick={() => doAction({ type: 'allin' })}>オールイン (A)</button>}
            </>
          ) : (
            <div className="poker-wait">
              {gs.players[gs.turn] ? `${gs.players[gs.turn].name}が考え中…` : '進行中…'}
            </div>
          )}
        </div>
      )}

      {gs.phase === 'showdown' && (
        <div className="poker-actions">
          <button className="poker-btn big" onClick={() => setGs(prev => nextHandAfterShowdown(prev))}>次のハンドへ</button>
        </div>
      )}

      <div className="poker-log">
        {gs.log.slice(-4).map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  )
}
