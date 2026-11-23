import { useEffect, useRef, useState } from 'react'

/* ================= 大富豪 =================
 * トランプの大富豪。自分＋CPU 3人の4人対戦。
 * ・54枚（52枚＋ジョーカー2枚）を配り、♦3を持っている人からスタート
 * ・強さは 3 < 4 < … < K < A < 2 < ジョーカー。同じ種類・同じ枚数でより強い札を出す
 * ・出せる組み合わせ：1枚／ペア／3枚／4枚／階段（同じスートの連番3枚以上）
 * ・4枚出しで革命（強さが逆転）、8を含む出しで8切り（場が流れて同じ人がリード）
 * ・ジョーカー単体には♠3単体で返せる（スペ3返し）
 * ・全員がパスすると場が流れ、最後に出した人がリード。先に手札をなくした順に順位がつく */

type Suit = '♠' | '♥' | '♦' | '♣'
type CardT = { suit: Suit; rank: number } | { suit: null; rank: 0 } // rank: 1-13、ジョーカーは suit null・rank 0

const SUITS: Suit[] = ['♠', '♥', '♦', '♣']
const SUIT_NAMES: Record<Suit, string> = { '♠': 'スペード', '♥': 'ハート', '♦': 'ダイヤ', '♣': 'クラブ' }

const PLAYERS = [
  { name: 'あなた', cpu: false },
  { name: 'ミオ', cpu: true },
  { name: 'ケン', cpu: true },
  { name: 'ユウ', cpu: true },
]

const TITLES = ['', '大富豪', '富豪', '貧民', '大貧民']

const WINS_KEY = 'webx-daifugo-wins'
const GAMES_KEY = 'webx-daifugo-games'

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
  ;[523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => beep(f, 0.22, 0.07), i * 120))
}

const isJoker = (c: CardT): boolean => c.suit === null

function rankLabel(rank: number): string {
  if (rank === 0) return 'JOKER'
  if (rank === 1) return 'A'
  if (rank === 11) return 'J'
  if (rank === 12) return 'Q'
  if (rank === 13) return 'K'
  return String(rank)
}

function cardName(c: CardT): string {
  if (isJoker(c)) return '🃏ジョーカー'
  return `${c.suit}${rankLabel(c.rank)}`
}

/** 大富豪の並び順（3=3 … K=13, A=14, 2=15）。階段の連番判定に使う */
function orderVal(rank: number): number {
  if (rank === 1) return 14
  if (rank === 2) return 15
  return rank
}

/** 1枚の基本の強さ（3=1 … K=11, A=12, 2=13, ジョーカー=14） */
function baseStrength(c: CardT): number {
  if (isJoker(c)) return 14
  if (c.rank === 1) return 12
  if (c.rank === 2) return 13
  return c.rank - 2
}

/** 革命中はジョーカー以外が逆転する（3=13 … 2=1、ジョーカー=14のまま） */
function strengthOf(c: CardT, revolution: boolean): number {
  if (isJoker(c)) return 14
  const b = baseStrength(c)
  return revolution ? 14 - b : b
}

function makeDeck(): CardT[] {
  const deck: CardT[] = []
  for (const s of SUITS) for (let r = 1; r <= 13; r++) deck.push({ suit: s, rank: r })
  deck.push({ suit: null, rank: 0 })
  deck.push({ suit: null, rank: 0 })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function sortHand(hand: CardT[]): CardT[] {
  return [...hand].sort((a, b) => baseStrength(a) - baseStrength(b) || (a.suit === null ? 9 : SUITS.indexOf(a.suit)) - (b.suit === null ? 9 : SUITS.indexOf(b.suit)))
}

type ComboKind = 'single' | 'pair' | 'triple' | 'quad' | 'sequence'
interface Combo {
  kind: ComboKind
  cards: CardT[]
  strength: number
  rank: number // 代表ランク（0=ジョーカーのみ）
  jokers: number
}

function comboLabel(c: Combo): string {
  if (c.kind === 'single') return cardName(c.cards[0])
  if (c.kind === 'sequence') return `階段${c.cards.length}枚（${c.cards.map(cardName).join(' ')}）`
  const kindName = c.kind === 'pair' ? 'ペア' : c.kind === 'triple' ? '3枚' : '4枚'
  return `${rankLabel(c.rank)}の${kindName}（${c.cards.map(cardName).join(' ')}）`
}

/** 選んだカードが有効な組み合わせかどうかを判定する。ジョーカーは同じ数字の組のワイルドになる */
function analyzeCombo(cards: CardT[], revolution: boolean): Combo | null {
  if (cards.length === 0) return null
  const jokers = cards.filter(isJoker).length
  const plain = cards.filter((c) => !isJoker(c))
  // 階段：ジョーカーなし・同じスート・3枚以上の連番
  if (jokers === 0 && cards.length >= 3) {
    const suits = new Set(plain.map((c) => c.suit))
    if (suits.size === 1) {
      const vals = plain.map((c) => orderVal(c.rank)).sort((a, b) => a - b)
      let ok = true
      for (let i = 1; i < vals.length; i++) if (vals[i] !== vals[i - 1] + 1) ok = false
      if (ok) {
        const top = plain.reduce((a, b) => (orderVal(a.rank) > orderVal(b.rank) ? a : b))
        return { kind: 'sequence', cards: [...cards], strength: strengthOf(top, revolution), rank: top.rank, jokers: 0 }
      }
    }
  }
  // 同じ数字の組（ジョーカーはワイルド）
  const ranks = new Set(plain.map((c) => c.rank))
  if (ranks.size <= 1 && cards.length >= 1 && cards.length <= 4) {
    const rank = plain.length > 0 ? plain[0].rank : 0
    const kind: ComboKind = cards.length === 1 ? 'single' : cards.length === 2 ? 'pair' : cards.length === 3 ? 'triple' : 'quad'
    const rep: CardT = plain.length > 0 ? plain[0] : cards[0]
    return { kind, cards: [...cards], strength: rank === 0 ? 14 : strengthOf(rep, revolution), rank, jokers }
  }
  return null
}

/** 出した組み合わせが場の組み合わせに勝てるか */
function beats(cand: Combo, field: Combo, revolution: boolean): boolean {
  // スペ3返し：♠3単体はジョーカー単体に勝てる
  if (field.kind === 'single' && field.cards.length === 1 && isJoker(field.cards[0])
    && cand.kind === 'single' && cand.cards.length === 1 && !isJoker(cand.cards[0])
    && cand.cards[0].suit === '♠' && cand.cards[0].rank === 3) return true
  if (cand.kind !== field.kind) return false
  if (cand.kind === 'sequence' && cand.cards.length !== field.cards.length) return false
  return cand.strength > field.strength
}

interface Game {
  hands: CardT[][]
  turn: number
  field: Combo | null
  fieldBy: number | null
  passes: number
  revolution: boolean
  finished: (number | null)[] // 順位（1〜4）または未あがり null
  finishOrder: number[]
  phase: 'playing' | 'done'
  log: string[]
}

function newGame(): Game {
  const deck = makeDeck()
  const hands: CardT[][] = [[], [], [], []]
  deck.forEach((c, i) => hands[i % 4].push(c))
  // ♦3を持っている人からスタート
  let start = 0
  hands.forEach((h, p) => {
    if (h.some((c) => !isJoker(c) && c.suit === '♦' && c.rank === 3)) start = p
  })
  return {
    hands,
    turn: start,
    field: null,
    fieldBy: null,
    passes: 0,
    revolution: false,
    finished: [null, null, null, null],
    finishOrder: [],
    phase: 'playing',
    log: [`${PLAYERS[start].name}（♦3持ち）からスタートです。`],
  }
}

function loadNum(key: string): number {
  try {
    return Number(localStorage.getItem(key) ?? '0') || 0
  } catch {
    return 0
  }
}

/** まだあがっていない次のプレイヤー */
function nextUnfinished(prev: Game, from: number): number {
  for (let i = 1; i <= 4; i++) {
    const p = (from + i) % 4
    if (prev.finished[p] === null) return p
  }
  return from
}

/** カードを出す。あがり・革命・8切り・場の流れをまとめて処理する */
function applyPlay(prev: Game, player: number, combo: Combo): Game {
  const hands = prev.hands.map((h, i) => (i === player ? h.filter((c) => !combo.cards.includes(c)) : h))
  let revolution = prev.revolution
  const log = [...prev.log, `${PLAYERS[player].name} は ${comboLabel(combo)} を出しました。`]
  if (combo.kind === 'quad') {
    revolution = !revolution
    log.push('🌀 革命！ カードの強さが逆転しました。')
  }
  const hasEight = combo.cards.some((c) => !isJoker(c) && c.rank === 8)
  const finished = [...prev.finished]
  const finishOrder = [...prev.finishOrder]
  if (hands[player].length === 0) {
    const rank = finishOrder.length + 1
    finished[player] = rank
    finishOrder.push(player)
    log.push(`🎉 ${PLAYERS[player].name} は${rank}位（${TITLES[rank]}）であがり！`)
  }
  if (finishOrder.length >= 3) {
    // 残り1人が4位で確定
    const last = [0, 1, 2, 3].find((p) => finished[p] === null)
    if (last !== undefined) {
      finished[last] = 4
      finishOrder.push(last)
      log.push(`${PLAYERS[last].name} は4位（大貧民）です。`)
    }
    return { ...prev, hands, revolution, finished, finishOrder, phase: 'done', field: null, fieldBy: null, passes: 0, log: log.slice(-4) }
  }
  if (hasEight) {
    log.push('✂️ 8切り！ 場が流れて同じ人がリードします。')
    const turn = finished[player] !== null ? nextUnfinished(prev, player) : player
    return { ...prev, hands, revolution, finished, finishOrder, field: null, fieldBy: null, passes: 0, turn, log: log.slice(-4) }
  }
  return {
    ...prev,
    hands,
    revolution,
    finished,
    finishOrder,
    field: combo,
    fieldBy: player,
    passes: 0,
    turn: nextUnfinished(prev, player),
    log: log.slice(-4),
  }
}

/** パスする。残りの全員がパスしたら場が流れる */
function applyPass(prev: Game, player: number): Game {
  const passes = prev.passes + 1
  const log = [...prev.log, `${PLAYERS[player].name} はパスしました。`]
  const activeCount = prev.finished.filter((f) => f === null).length
  if (passes >= activeCount - 1 && prev.fieldBy !== null) {
    log.push('場が流れました。')
    return { ...prev, field: null, fieldBy: null, passes: 0, turn: nextUnfinished(prev, prev.fieldBy), log: log.slice(-4) }
  }
  return { ...prev, passes, turn: nextUnfinished(prev, player), log: log.slice(-4) }
}

/** 手札から指定した種類・枚数の組み合わせをすべて列挙する */
function enumerateCombos(hand: CardT[], kind: ComboKind, count: number, revolution: boolean): Combo[] {
  const out: Combo[] = []
  if (kind === 'single') {
    for (const c of hand) {
      const combo = analyzeCombo([c], revolution)
      if (combo) out.push(combo)
    }
    return out
  }
  if (kind === 'sequence') {
    for (const suit of SUITS) {
      const suited = hand.filter((c) => !isJoker(c) && c.suit === suit)
      const vals = [...new Map(suited.map((c) => [orderVal(c.rank), c])).values()].sort((a, b) => orderVal(a.rank) - orderVal(b.rank))
      for (let i = 0; i + count <= vals.length; i++) {
        const run = vals.slice(i, i + count)
        let ok = true
        for (let j = 1; j < run.length; j++) if (orderVal(run[j].rank) !== orderVal(run[j - 1].rank) + 1) ok = false
        if (ok) {
          const combo = analyzeCombo(run, revolution)
          if (combo) out.push(combo)
        }
      }
    }
    return out
  }
  // ペア／3枚／4枚：同じ数字＋ジョーカーをワイルドで補う
  const jokerCount = hand.filter(isJoker).length
  const jokers = hand.filter(isJoker)
  for (let r = 1; r <= 13; r++) {
    const naturals = hand.filter((c) => !isJoker(c) && c.rank === r)
    const need = count - naturals.length
    if (need >= 0 && need <= jokerCount && naturals.length > 0) {
      const cards = [...naturals.slice(0, count), ...jokers.slice(0, need)]
      const combo = analyzeCombo(cards, revolution)
      if (combo) out.push(combo)
    }
  }
  // ジョーカーだけの組（2枚のジョーカー＝最強ペア）
  if (jokerCount >= count) {
    const combo = analyzeCombo(jokers.slice(0, count), revolution)
    if (combo) out.push(combo)
  }
  return out
}

/** CPU の手を決める */
function chooseCpuMove(g: Game, p: number): { type: 'play'; combo: Combo } | { type: 'pass' } {
  const hand = g.hands[p]
  const rev = g.revolution
  // 手札全体が1つの組み合わせなら即出し（あがれる）
  const whole = analyzeCombo(hand, rev)
  if (whole && (!g.field || beats(whole, g.field, rev))) return { type: 'play', combo: whole }
  if (!g.field) {
    // リード：いちばん弱い1枚を出す（たまに弱いペアで）
    const singles = hand.map((c) => analyzeCombo([c], rev)!).sort((a, b) => a.strength - b.strength || a.jokers - b.jokers)
    if (Math.random() < 0.25) {
      const pairs = enumerateCombos(hand, 'pair', 2, rev).sort((a, b) => a.strength - b.strength)
      if (pairs.length > 0 && pairs[0].strength <= 6) return { type: 'play', combo: pairs[0] }
    }
    return { type: 'play', combo: singles[0] }
  }
  // フォロー：場に勝てるいちばん弱い組み合わせ
  const kind = g.field.kind
  const count = g.field.cards.length
  const beating = enumerateCombos(hand, kind, count, rev)
    .filter((c) => beats(c, g.field!, rev))
    .sort((a, b) => a.strength - b.strength || a.jokers - b.jokers)
  if (beating.length === 0) return { type: 'pass' }
  // その出しであがれるなら必ず出す
  if (hand.length - beating[0].cards.length === 0) return { type: 'play', combo: beating[0] }
  // たまに温存してパスする
  if (Math.random() < 0.2) return { type: 'pass' }
  return { type: 'play', combo: beating[0] }
}

export default function Daifugo() {
  const [g, setG] = useState<Game | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [cursor, setCursor] = useState(0)
  const [wins, setWins] = useState(() => loadNum(WINS_KEY))
  const [games, setGames] = useState(() => loadNum(GAMES_KEY))
  const recordedRef = useRef(false)

  const phase = g?.phase ?? 'title'
  const turn = g?.turn ?? 0
  const myHand = g ? sortHand(g.hands[0]) : []
  const selCards = selected.map((i) => myHand[i]).filter((c): c is CardT => c !== undefined)
  const selCombo = g ? analyzeCombo(selCards, g.revolution) : null
  const canPlaySel = !!g && g.phase === 'playing' && turn === 0 && selCombo !== null
    && (!g.field || beats(selCombo, g.field, g.revolution))
  const canPass = !!g && g.phase === 'playing' && turn === 0 && g.field !== null

  // 場に出ているときの自分の番：出せる組み合わせがあるか（ヒント用）
  const myBeatingCount = (() => {
    if (!g || g.phase !== 'playing' || turn !== 0 || !g.field) return 0
    return enumerateCombos(g.hands[0], g.field.kind, g.field.cards.length, g.revolution)
      .filter((c) => beats(c, g.field!, g.revolution)).length
  })()

  // 選択は局面が変わったらリセット
  useEffect(() => {
    setSelected([])
    setCursor(0)
  }, [g])

  // CPU の番：少し待ってから自動で出す／パスする
  useEffect(() => {
    if (!g || g.phase !== 'playing' || !PLAYERS[g.turn].cpu) return
    const t = setTimeout(() => {
      setG((prev) => {
        if (!prev || prev.phase !== 'playing' || !PLAYERS[prev.turn].cpu) return prev
        const p = prev.turn
        const move = chooseCpuMove(prev, p)
        if (move.type === 'pass') {
          beep(330, 0.08, 0.04)
          return applyPass(prev, p)
        }
        beep(520, 0.06, 0.04)
        return applyPlay(prev, p, move.combo)
      })
    }, 1000)
    return () => clearTimeout(t)
  }, [g])

  // 終了時の成績記録（1回だけ）
  useEffect(() => {
    if (!g || g.phase !== 'done' || recordedRef.current) return
    recordedRef.current = true
    const n = loadNum(GAMES_KEY) + 1
    try { localStorage.setItem(GAMES_KEY, String(n)) } catch { /* 保存できなくても遊べる */ }
    setGames(n)
    if (g.finished[0] === 1) {
      const w = loadNum(WINS_KEY) + 1
      try { localStorage.setItem(WINS_KEY, String(w)) } catch { /* 保存できなくても遊べる */ }
      setWins(w)
      fanfare()
    } else {
      beep(196, 0.3, 0.06)
    }
  }, [g])

  const start = () => {
    recordedRef.current = false
    setSelected([])
    setCursor(0)
    setG(newGame())
    beep(660, 0.1, 0.05)
  }

  const toggleSelect = (i: number) => {
    if (!g || g.phase !== 'playing' || turn !== 0) return
    setCursor(i)
    setSelected((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))
  }

  const playSelected = () => {
    if (!canPlaySel || !selCombo) return
    beep(620, 0.06, 0.04)
    const combo = selCombo
    setG((prev) => (prev ? applyPlay(prev, 0, combo) : prev))
  }

  const pass = () => {
    if (!canPass || !g) return
    beep(330, 0.08, 0.04)
    setG((prev) => (prev ? applyPass(prev, 0) : prev))
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!g || g.phase !== 'playing' || turn !== 0) return
    const n = myHand.length
    if (e.key === 'ArrowLeft' && n > 0) { e.preventDefault(); setCursor((s) => (s - 1 + n) % n) }
    else if (e.key === 'ArrowRight' && n > 0) { e.preventDefault(); setCursor((s) => (s + 1 + n) % n) }
    else if (e.key === ' ' && n > 0) { e.preventDefault(); toggleSelect(cursor) }
    else if (e.key === 'Enter') { e.preventDefault(); playSelected() }
    else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); pass() }
  }

  if (!g) {
    return (
      <div className="daifugo" tabIndex={0}>
        <h2>🃏 大富豪</h2>
        <p>トランプの大富豪。自分＋CPU 3人の4人対戦です。</p>
        <div className="daifugo-rules">
          <p>🃏 54枚（52枚＋ジョーカー2枚）を配ります。♦3を持っている人からスタート。</p>
          <p>💪 強さは 3 &lt; 4 &lt; … &lt; K &lt; A &lt; 2 &lt; ジョーカー。場と同じ種類・同じ枚数で、より強い札を出します。</p>
          <p>🃏 出せるのは1枚／ペア／3枚／4枚／階段（同じスートの連番3枚以上）。ジョーカーは同じ数字の組のワイルドになります。</p>
          <p>🌀 4枚出しで革命（強さが逆転）、8を含む出しで8切り（場が流れて同じ人がリード）。</p>
          <p>♠3単体はジョーカー単体に勝てます（スペ3返し）。全員パスすると場が流れ、最後に出した人がリードします。</p>
          <p>🏆 先に手札をなくした順に大富豪・富豪・貧民・大貧民が決まります。</p>
        </div>
        <p>通算成績： {wins} 回大富豪（{games} 戦）</p>
        <button className="daifugo-start" onClick={start}>ゲームスタート</button>
        <p className="daifugo-hint">キーボード：←→で手札を選び、Spaceで選択／解除、Enterで出す、Pでパス</p>
      </div>
    )
  }

  const myRank = g.finished[0]
  return (
    <div className="daifugo" tabIndex={0} onKeyDown={onKey}>
      <div className="daifugo-head">
        <span>🃏 大富豪</span>
        <span>通算 {wins} 回大富豪（{games} 戦）</span>
        {g.revolution && <span className="daifugo-rev">🌀 革命中（強さ逆転）</span>}
        <button onClick={start}>はじめから</button>
      </div>

      {phase === 'done' && (
        <div className="daifugo-result">
          <strong>{myRank === 1 ? '🎉 大富豪！ おめでとうございます！' : myRank === 2 ? '😊 富豪でした！' : myRank === 3 ? '😅 貧民でした…' : '😢 大貧民でした…'}</strong>
          <div className="daifugo-ranking">
            {g.finishOrder.map((p, i) => (
              <p key={p}>{i + 1}位：{PLAYERS[p].name}（{TITLES[i + 1]}）</p>
            ))}
          </div>
          <button className="daifugo-start" onClick={start}>もう一度遊ぶ</button>
        </div>
      )}

      <div className="daifugo-opps">
        {[1, 2, 3].map((p) => (
          <div key={p} className={`daifugo-opp${phase === 'playing' && turn === p ? ' active' : ''}`}>
            <div className="daifugo-opp-name">
              {PLAYERS[p].name}
              {g.finished[p] !== null ? ` 🏅${g.finished[p]}位` : phase === 'playing' && turn === p ? ' 👉考え中…' : ` 残り${g.hands[p].length}枚`}
            </div>
            <div className="daifugo-backs">
              {g.hands[p].slice(0, 10).map((_, i) => (
                <span key={i} className="daifugo-back">🂠</span>
              ))}
              {g.hands[p].length > 10 && <span className="daifugo-more">+{g.hands[p].length - 10}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="daifugo-field">
        <div className="daifugo-field-head">場 {g.field ? `（${PLAYERS[g.fieldBy ?? 0].name} の ${comboLabel(g.field)}）` : '（流れています）'}</div>
        {g.field ? (
          <div className="daifugo-cards">
            {g.field.cards.map((c, i) => (
              <span key={i} className={`daifugo-card mini${!isJoker(c) && (c.suit === '♥' || c.suit === '♦') ? ' red' : ''}`}>
                {isJoker(c) ? <><span className="daifugo-rank">JOKER</span><span className="daifugo-suit">🃏</span></> : <><span className="daifugo-rank">{rankLabel(c.rank)}</span><span className="daifugo-suit">{c.suit}</span></>}
              </span>
            ))}
          </div>
        ) : (
          <p className="daifugo-field-empty">好きな組み合わせを出せます</p>
        )}
      </div>

      {phase === 'playing' && turn === 0 && (
        <div className="daifugo-turn-msg">
          {g.field === null
            ? 'あなたの番です。好きな組み合わせを出してください。'
            : myBeatingCount > 0
              ? `あなたの番です。場より強い組み合わせを出してください。（出せる組み合わせ ${myBeatingCount}通り）`
              : '場に勝てる組み合わせがありません。パスしてください。'}
          <span className="daifugo-sel-info">
            {selCombo ? `選択中：${comboLabel(selCombo)}${!g.field || beats(selCombo, g.field, g.revolution) ? '' : '（場より弱いです）'}` : 'カードをタップして選んでください'}
          </span>
          <button className="daifugo-play" onClick={playSelected} disabled={!canPlaySel}>出す（Enter）</button>
          <button className="daifugo-pass" onClick={pass} disabled={!canPass}>パスする（P）</button>
        </div>
      )}
      {phase === 'playing' && turn !== 0 && (
        <p className="daifugo-wait">{PLAYERS[turn].name} の番です…</p>
      )}

      <div className="daifugo-myhand">
        <div className="daifugo-myhand-head">
          あなたの手札（{g.hands[0].length}枚）
          {myRank !== null && ` 🏅${myRank}位（${TITLES[myRank]}）であがり済み`}
        </div>
        <div className="daifugo-cards">
          {myHand.map((c, i) => (
            <button
              key={`${c.suit ?? 'J'}${c.rank}-${i}`}
              className={`daifugo-card${!isJoker(c) && (c.suit === '♥' || c.suit === '♦') ? ' red' : ''}${selected.includes(i) ? ' sel' : ''}${cursor === i ? ' cur' : ''}`}
              onClick={() => toggleSelect(i)}
              disabled={phase !== 'playing' || turn !== 0 || myRank !== null}
              aria-label={cardName(c)}
            >
              {isJoker(c) ? <><span className="daifugo-rank">JOKER</span><span className="daifugo-suit">🃏</span></> : <><span className="daifugo-rank">{rankLabel(c.rank)}</span><span className="daifugo-suit">{c.suit}</span></>}
            </button>
          ))}
          {g.hands[0].length === 0 && <span>手札はありません 🎉</span>}
        </div>
      </div>

      <div className="daifugo-log">
        {g.log.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  )
}
