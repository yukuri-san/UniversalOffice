import { useEffect, useRef, useState } from 'react'

/* ================= 花札こいこい =================
 * 花札のこいこい。自分 vs CPU（ミオ）の1対1。
 * ・48枚（12か月×4枚）を8枚ずつ配り、場に8枚
 * ・手札から1枚出し、同じ月の場札があれば取れる（2枚あるときは選ぶ）
 * ・山札から1枚めくり、同じく場札と合わせる
 * ・役ができたら「こいこい」（続けて得点2倍を狙う）か「あがり」（得点確定）を選ぶ
 * ・全12局（睦月〜師走）の合計点で勝敗を決める */

type Kind = 'bright' | 'seed' | 'ribbon' | 'chaff'
type YakuId = 'moon' | 'sake' | 'boar' | 'deer' | 'butterfly' | 'sakura'
interface CardT {
  id: number
  month: number // 0-11
  kind: Kind
  rain?: boolean
  red?: boolean
  blue?: boolean
  yaku?: YakuId
  name: string
  emoji: string
}

interface MonthDef {
  name: string
  emoji: string
  cards: { kind: Kind; name: string; emoji?: string; rain?: boolean; red?: boolean; blue?: boolean; yaku?: YakuId }[]
}

const MONTHS: MonthDef[] = [
  { name: '松', emoji: '🌲', cards: [
    { kind: 'bright', name: '鶴', emoji: '🕊️' },
    { kind: 'ribbon', name: '赤短', red: true },
    { kind: 'chaff', name: '松' },
    { kind: 'chaff', name: '松' },
  ] },
  { name: '梅', emoji: '🌸', cards: [
    { kind: 'bright', name: '鶯', emoji: '🐦' },
    { kind: 'ribbon', name: '赤短', red: true },
    { kind: 'chaff', name: '梅' },
    { kind: 'chaff', name: '梅' },
  ] },
  { name: '桜', emoji: '🌸', cards: [
    { kind: 'bright', name: '桜の幕', yaku: 'sakura' },
    { kind: 'ribbon', name: '赤短', red: true },
    { kind: 'chaff', name: '桜' },
    { kind: 'chaff', name: '桜' },
  ] },
  { name: '藤', emoji: '💜', cards: [
    { kind: 'seed', name: 'ほととぎす', emoji: '🐦' },
    { kind: 'ribbon', name: '短冊' },
    { kind: 'chaff', name: '藤' },
    { kind: 'chaff', name: '藤' },
  ] },
  { name: '菖蒲', emoji: '🌿', cards: [
    { kind: 'seed', name: '八橋', emoji: '🌉' },
    { kind: 'ribbon', name: '短冊' },
    { kind: 'chaff', name: '菖蒲' },
    { kind: 'chaff', name: '菖蒲' },
  ] },
  { name: '牡丹', emoji: '🌺', cards: [
    { kind: 'seed', name: '蝶', emoji: '🦋', yaku: 'butterfly' },
    { kind: 'ribbon', name: '青短', blue: true },
    { kind: 'chaff', name: '牡丹' },
    { kind: 'chaff', name: '牡丹' },
  ] },
  { name: '萩', emoji: '🍃', cards: [
    { kind: 'seed', name: '猪', emoji: '🐗', yaku: 'boar' },
    { kind: 'ribbon', name: '短冊' },
    { kind: 'chaff', name: '萩' },
    { kind: 'chaff', name: '萩' },
  ] },
  { name: '芒', emoji: '🌾', cards: [
    { kind: 'bright', name: '月', emoji: '🌕', yaku: 'moon' },
    { kind: 'seed', name: '雁', emoji: '🦆' },
    { kind: 'chaff', name: '芒' },
    { kind: 'chaff', name: '芒' },
  ] },
  { name: '菊', emoji: '🌼', cards: [
    { kind: 'seed', name: '盃', emoji: '🍶', yaku: 'sake' },
    { kind: 'ribbon', name: '青短', blue: true },
    { kind: 'chaff', name: '菊' },
    { kind: 'chaff', name: '菊' },
  ] },
  { name: '紅葉', emoji: '🍁', cards: [
    { kind: 'seed', name: '鹿', emoji: '🦌', yaku: 'deer' },
    { kind: 'ribbon', name: '青短', blue: true },
    { kind: 'chaff', name: '紅葉' },
    { kind: 'chaff', name: '紅葉' },
  ] },
  { name: '柳', emoji: '☔', cards: [
    { kind: 'bright', name: '雨', emoji: '🌧️', rain: true },
    { kind: 'seed', name: '燕', emoji: '🐦' },
    { kind: 'ribbon', name: '短冊' },
    { kind: 'chaff', name: '柳' },
  ] },
  { name: '桐', emoji: '🌳', cards: [
    { kind: 'bright', name: '鳳凰', emoji: '🦚' },
    { kind: 'chaff', name: '桐' },
    { kind: 'chaff', name: '桐' },
    { kind: 'chaff', name: '桐' },
  ] },
]

const ROUND_NAMES = ['睦月', '如月', '弥生', '卯月', '皐月', '水無月', '文月', '葉月', '長月', '神無月', '霜月', '師走']
const KIND_LABEL: Record<Kind, string> = { bright: '光', seed: '種', ribbon: '短', chaff: 'カス' }
const DIFF_NAMES = ['やさしい', 'ふつう', 'つよい']
const PLAYERS = ['あなた', 'ミオ']

const WINS_KEY = 'webx-koikoi-wins'
const LOSES_KEY = 'webx-koikoi-loses'
const DRAWS_KEY = 'webx-koikoi-draws'
const BEST_KEY = 'webx-koikoi-best' // 1試合の最高合計点

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

function loadNum(key: string): number {
  try {
    return Number(localStorage.getItem(key) ?? '0') || 0
  } catch {
    return 0
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildDeck(): CardT[] {
  const deck: CardT[] = []
  MONTHS.forEach((m, mi) => {
    m.cards.forEach((c, ci) => {
      deck.push({
        id: mi * 4 + ci,
        month: mi,
        kind: c.kind,
        rain: c.rain,
        red: c.red,
        blue: c.blue,
        yaku: c.yaku,
        name: c.name,
        emoji: c.emoji ?? m.emoji,
      })
    })
  })
  return shuffle(deck)
}

interface Yaku { name: string; points: number }

function calcYaku(caps: CardT[]): Yaku[] {
  const ys: Yaku[] = []
  const brights = caps.filter((c) => c.kind === 'bright')
  const nonRain = brights.filter((c) => !c.rain)
  const hasRain = brights.some((c) => c.rain)
  if (nonRain.length === 5) ys.push({ name: '五光', points: 10 })
  else if (nonRain.length === 4 && hasRain) ys.push({ name: '雨四光', points: 7 })
  else if (nonRain.length === 4) ys.push({ name: '四光', points: 8 })
  else if (nonRain.length === 3) ys.push({ name: '三光', points: 5 })
  const has = (y: YakuId) => caps.some((c) => c.yaku === y)
  if (has('moon') && has('sake')) ys.push({ name: '月見酒', points: 5 })
  if (has('sakura') && has('sake')) ys.push({ name: '花見酒', points: 5 })
  if (has('boar') && has('deer') && has('butterfly')) ys.push({ name: '猪鹿蝶', points: 5 })
  if (caps.filter((c) => c.kind === 'ribbon' && c.red).length === 3) ys.push({ name: '赤短', points: 5 })
  if (caps.filter((c) => c.kind === 'ribbon' && c.blue).length === 3) ys.push({ name: '青短', points: 5 })
  const seeds = caps.filter((c) => c.kind === 'seed').length
  if (seeds >= 5) ys.push({ name: `タネ（${seeds}枚）`, points: seeds - 4 })
  const ribs = caps.filter((c) => c.kind === 'ribbon').length
  if (ribs >= 5) ys.push({ name: `タン（${ribs}枚）`, points: ribs - 4 })
  const chaff = caps.filter((c) => c.kind === 'chaff').length
  if (chaff >= 10) ys.push({ name: `カス（${chaff}枚）`, points: chaff - 9 })
  return ys
}

function yakuPoints(ys: Yaku[]): number {
  return ys.reduce((s, y) => s + y.points, 0)
}

function cardValue(c: CardT): number {
  if (c.kind === 'bright') return 4
  if (c.kind === 'seed') return 3
  if (c.kind === 'ribbon') return 2
  return 1
}

function cardLabel(c: CardT): string {
  return `${MONTHS[c.month].name}の${c.name}`
}

interface Game {
  round: number
  parent: number
  deck: CardT[]
  field: CardT[]
  hands: CardT[][]
  caps: CardT[][]
  turn: number
  step: 'play' | 'draw'
  drawn: CardT | null
  yakuAtTurnStart: number[]
  koikoi: number[]
  total: number[]
  difficulty: number
  phase: 'playing' | 'yaku' | 'roundEnd' | 'done'
  pendingYaku: Yaku[]
  pendingPlayer: number
  roundWinner: number | null
  roundPoints: number
  roundMsg: string
  log: string[]
}

function startRound(round: number, parent: number, total: number[], difficulty: number): Game {
  const deck = buildDeck()
  const hands: CardT[][] = [deck.slice(0, 8), deck.slice(8, 16)]
  const field = deck.slice(16, 24)
  const rest = deck.slice(24)
  return {
    round,
    parent,
    deck: rest,
    field,
    hands,
    caps: [[], []],
    turn: parent,
    step: 'play',
    drawn: null,
    yakuAtTurnStart: [0, 0],
    koikoi: [0, 0],
    total,
    difficulty,
    phase: 'playing',
    pendingYaku: [],
    pendingPlayer: -1,
    roundWinner: null,
    roundPoints: 0,
    roundMsg: '',
    log: [`第${round + 1}局（${ROUND_NAMES[round]}）開始。親は${PLAYERS[parent]}です。`],
  }
}

/** 手番を次へ。両方手札が尽きていたら流局 */
function advanceTurn(prev: Game, player: number): Game {
  if (prev.hands[0].length === 0 && prev.hands[1].length === 0) {
    return {
      ...prev,
      phase: 'roundEnd',
      roundWinner: null,
      roundPoints: 0,
      roundMsg: '流局です。どちらもあがれませんでした。',
      log: [...prev.log, '手札が尽きて流局です。'].slice(-4),
    }
  }
  const next = (player + 1) % 2
  const yakuAtTurnStart = [...prev.yakuAtTurnStart]
  yakuAtTurnStart[next] = yakuPoints(calcYaku(prev.caps[next]))
  return { ...prev, turn: next, step: 'play', drawn: null, yakuAtTurnStart }
}

/** めくり終わり後の役チェック。役が増えていれば役選択へ、なければ手番交代 */
function afterAction(prev: Game, player: number): Game {
  const pts = yakuPoints(calcYaku(prev.caps[player]))
  if (pts > prev.yakuAtTurnStart[player]) {
    beep(880, 0.15, 0.06)
    return {
      ...prev,
      phase: 'yaku',
      pendingYaku: calcYaku(prev.caps[player]),
      pendingPlayer: player,
      log: [...prev.log, `${PLAYERS[player]} に役ができました！（${pts}点）`].slice(-4),
    }
  }
  return advanceTurn(prev, player)
}

/** 手札を1枚出す。target があれば場札と一緒に取る */
function playCard(prev: Game, player: number, card: CardT, target: CardT | null): Game {
  const hands = prev.hands.map((h, i) => (i === player ? h.filter((c) => c.id !== card.id) : h))
  let field = [...prev.field]
  let caps = prev.caps.map((cs) => [...cs])
  if (target) {
    field = field.filter((c) => c.id !== target.id)
    caps[player] = [...caps[player], card, target]
  } else {
    field = [...field, card]
  }
  const drawn = prev.deck[0] ?? null
  const deck = prev.deck.slice(1)
  const log = [...prev.log, `${PLAYERS[player]} は ${cardLabel(card)} を出しました。${target ? `${cardLabel(target)} と合わせて取りました。` : '場に出しました。'}`].slice(-4)
  return { ...prev, hands, field, caps, deck, drawn, step: 'draw', log }
}

/** めくった札を処理する */
function drawResolve(prev: Game, player: number, target: CardT | null): Game {
  const drawn = prev.drawn
  if (!drawn) return prev
  let field = [...prev.field]
  let caps = prev.caps.map((cs) => [...cs])
  if (target) {
    field = field.filter((c) => c.id !== target.id)
    caps[player] = [...caps[player], drawn, target]
  } else {
    field = [...field, drawn]
  }
  const log = [...prev.log, `${PLAYERS[player]} は ${cardLabel(drawn)} をめくりました。${target ? `${cardLabel(target)} と合わせて取りました。` : '場に出しました。'}`].slice(-4)
  return afterAction({ ...prev, field, caps, drawn: null, log }, player)
}

function doKoikoi(prev: Game, player: number): Game {
  const koikoi = [...prev.koikoi]
  koikoi[player]++
  const log = [...prev.log, `${PLAYERS[player]} は「こいこい！」と宣言しました。あがれば得点${2 ** koikoi[player]}倍です。`].slice(-4)
  return advanceTurn({ ...prev, koikoi, phase: 'playing', pendingYaku: [], pendingPlayer: -1, log }, player)
}

function doAgari(prev: Game, player: number): Game {
  const ys = calcYaku(prev.caps[player])
  const pts = yakuPoints(ys)
  const mult = 2 ** prev.koikoi[player]
  const gain = pts * mult
  const total = [...prev.total]
  total[player] += gain
  const names = ys.map((y) => y.name).join('・')
  return {
    ...prev,
    total,
    phase: 'roundEnd',
    roundWinner: player,
    roundPoints: gain,
    roundMsg: `${PLAYERS[player]} のあがり！ ${names} ${pts}点 × ${mult}倍 ＝ ${gain}点`,
    log: [...prev.log, `${PLAYERS[player]} があがりました！（${gain}点）`].slice(-4),
  }
}

/** CPU の手札選び。難易度で賢さが変わる */
function cpuChoose(hand: CardT[], field: CardT[], caps: CardT[], diff: number): { card: CardT; target: CardT | null } {
  const options: { card: CardT; target: CardT | null; score: number }[] = []
  for (const card of hand) {
    const ms = field.filter((f) => f.month === card.month)
    if (ms.length === 0) {
      options.push({ card, target: null, score: -cardValue(card) })
    } else {
      for (const t of ms) {
        const delta = yakuPoints(calcYaku([...caps, card, t])) - yakuPoints(calcYaku(caps))
        options.push({ card, target: t, score: delta * 10 + cardValue(t) + cardValue(card) * 0.5 })
      }
    }
  }
  if (diff === 0 || options.length === 0) return options[Math.floor(Math.random() * options.length)]
  const best = Math.max(...options.map((o) => o.score))
  const bestOpts = options.filter((o) => o.score === best)
  if (diff === 1 && Math.random() < 0.3) return options[Math.floor(Math.random() * options.length)]
  return bestOpts[Math.floor(Math.random() * bestOpts.length)]
}

function cpuKoikoi(points: number, diff: number): boolean {
  if (diff === 0) return false
  if (diff === 1) return points < 3
  return points < 5
}

function fieldMatches(field: CardT[], card: CardT): CardT[] {
  return field.filter((f) => f.month === card.month)
}

function sortHand(hand: CardT[]): CardT[] {
  return [...hand].sort((a, b) => a.month - b.month || a.id - b.id)
}

export default function KoiKoi() {
  const [g, setG] = useState<Game | null>(null)
  const [diff, setDiff] = useState(1)
  const [selHand, setSelHand] = useState(-1)
  const [wins, setWins] = useState(() => loadNum(WINS_KEY))
  const [loses, setLoses] = useState(() => loadNum(LOSES_KEY))
  const [draws, setDraws] = useState(() => loadNum(DRAWS_KEY))
  const [best, setBest] = useState(() => loadNum(BEST_KEY))
  const recordedRef = useRef(false)

  const phase = g?.phase ?? 'title'
  const myHand = g ? sortHand(g.hands[0]) : []
  const selCard = selHand >= 0 && selHand < myHand.length ? myHand[selHand] : null
  const playMatches = g && selCard && g.step === 'play' ? fieldMatches(g.field, selCard) : []
  const drawMatches = g && g.step === 'draw' && g.drawn ? fieldMatches(g.field, g.drawn) : []

  // CPU の番
  useEffect(() => {
    if (!g || g.phase !== 'playing' || g.turn !== 1) return
    const t = setTimeout(() => {
      setG((prev) => {
        if (!prev || prev.phase !== 'playing' || prev.turn !== 1) return prev
        if (prev.step === 'play') {
          const { card, target } = cpuChoose(prev.hands[1], prev.field, prev.caps[1], prev.difficulty)
          beep(520, 0.06, 0.04)
          return playCard(prev, 1, card, target)
        }
        if (!prev.drawn) return prev
        const { target } = cpuChoose([prev.drawn], prev.field, prev.caps[1], prev.difficulty)
        beep(620, 0.06, 0.04)
        return drawResolve(prev, 1, target)
      })
    }, 1100)
    return () => clearTimeout(t)
  }, [g])

  // CPU の役選択
  useEffect(() => {
    if (!g || g.phase !== 'yaku' || g.pendingPlayer !== 1) return
    const t = setTimeout(() => {
      setG((prev) => {
        if (!prev || prev.phase !== 'yaku' || prev.pendingPlayer !== 1) return prev
        const pts = yakuPoints(prev.pendingYaku)
        if (cpuKoikoi(pts, prev.difficulty)) return doKoikoi(prev, 1)
        return doAgari(prev, 1)
      })
    }, 1400)
    return () => clearTimeout(t)
  }, [g])

  // 試合終了時の成績記録（1回だけ）
  useEffect(() => {
    if (!g || g.phase !== 'done' || recordedRef.current) return
    recordedRef.current = true
    const myTotal = g.total[0]
    const cpuTotal = g.total[1]
    const save = (key: string, n: number) => {
      try { localStorage.setItem(key, String(n)) } catch { /* 保存できなくても遊べる */ }
    }
    if (myTotal > cpuTotal) {
      const n = loadNum(WINS_KEY) + 1
      save(WINS_KEY, n)
      setWins(n)
      fanfare()
    } else if (myTotal < cpuTotal) {
      const n = loadNum(LOSES_KEY) + 1
      save(LOSES_KEY, n)
      setLoses(n)
      beep(196, 0.3, 0.06)
    } else {
      const n = loadNum(DRAWS_KEY) + 1
      save(DRAWS_KEY, n)
      setDraws(n)
    }
    const prevBest = loadNum(BEST_KEY)
    if (myTotal > prevBest) {
      save(BEST_KEY, myTotal)
      setBest(myTotal)
    }
  }, [g])

  const start = () => {
    recordedRef.current = false
    setSelHand(-1)
    setG(startRound(0, 0, [0, 0], diff))
    beep(660, 0.1, 0.05)
  }

  const nextRound = () => {
    if (!g) return
    setSelHand(-1)
    if (g.round >= 11) {
      setG({ ...g, phase: 'done' })
      return
    }
    const parent = g.roundWinner ?? g.parent
    setG(startRound(g.round + 1, parent, g.total, g.difficulty))
    beep(660, 0.1, 0.05)
  }

  const playSelected = (target: CardT | null) => {
    if (!g || g.phase !== 'playing' || g.turn !== 0 || g.step !== 'play' || !selCard) return
    beep(620, 0.06, 0.04)
    setG((prev) => (prev ? playCard(prev, 0, selCard, target) : prev))
    setSelHand(-1)
  }

  const resolveDrawn = (target: CardT | null) => {
    if (!g || g.phase !== 'playing' || g.turn !== 0 || g.step !== 'draw' || !g.drawn) return
    beep(620, 0.06, 0.04)
    setG((prev) => (prev ? drawResolve(prev, 0, target) : prev))
  }

  const chooseKoikoi = () => {
    if (!g || g.phase !== 'yaku' || g.pendingPlayer !== 0) return
    beep(760, 0.1, 0.05)
    setG((prev) => (prev ? doKoikoi(prev, 0) : prev))
  }

  const chooseAgari = () => {
    if (!g || g.phase !== 'yaku' || g.pendingPlayer !== 0) return
    beep(880, 0.12, 0.06)
    setG((prev) => (prev ? doAgari(prev, 0) : prev))
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!g) return
    if (g.phase === 'yaku' && g.pendingPlayer === 0) {
      if (e.key === 'k' || e.key === 'K') { e.preventDefault(); chooseKoikoi() }
      else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); chooseAgari() }
      return
    }
    if (g.phase !== 'playing' || g.turn !== 0) return
    if (g.step === 'play') {
      const n = myHand.length
      if (e.key === 'ArrowLeft' && n > 0) { e.preventDefault(); setSelHand((s) => (s <= 0 ? n - 1 : s - 1)) }
      else if (e.key === 'ArrowRight' && n > 0) { e.preventDefault(); setSelHand((s) => (s + 1) % n) }
      else if (e.key === 'Enter' && selCard) {
        e.preventDefault()
        const ms = fieldMatches(g.field, selCard)
        if (ms.length === 0) playSelected(null)
        else {
          // 一番価値の高い場札を取る
          const best = ms.reduce((a, b) => (cardValue(b) >= cardValue(a) ? b : a))
          playSelected(best)
        }
      } else if ((e.key === 'd' || e.key === 'D') && selCard && playMatches.length === 0) {
        e.preventDefault()
        playSelected(null)
      }
    } else if (g.step === 'draw' && g.drawn) {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (drawMatches.length === 0) resolveDrawn(null)
        else {
          const best = drawMatches.reduce((a, b) => (cardValue(b) >= cardValue(a) ? b : a))
          resolveDrawn(best)
        }
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        resolveDrawn(null)
      }
    }
  }

  const renderCard = (c: CardT, extra?: string, onClick?: () => void, disabled?: boolean) => (
    <button
      key={c.id}
      className={`koikoi-card kind-${c.kind}${extra ? ` ${extra}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={cardLabel(c)}
    >
      <span className="koikoi-card-emoji">{c.emoji}</span>
      <span className="koikoi-card-month">{MONTHS[c.month].name}</span>
      <span className="koikoi-card-name">{c.name}</span>
      <span className="koikoi-card-kind">{KIND_LABEL[c.kind]}</span>
    </button>
  )

  const renderCaps = (caps: CardT[]) => {
    const byKind = (k: Kind) => caps.filter((c) => c.kind === k).length
    const ys = calcYaku(caps)
    return (
      <div className="koikoi-caps">
        <span>光 {byKind('bright')}枚</span>
        <span>種 {byKind('seed')}枚</span>
        <span>短 {byKind('ribbon')}枚</span>
        <span>カス {byKind('chaff')}枚</span>
        {ys.length > 0 && <span className="koikoi-yaku-list">役：{ys.map((y) => `${y.name}${y.points}点`).join('・')}</span>}
      </div>
    )
  }

  if (!g) {
    return (
      <div className="koikoi" tabIndex={0}>
        <h2>🎴 花札こいこい</h2>
        <p>花札のこいこい。CPUのミオと12局勝負です。</p>
        <div className="koikoi-rules">
          <p>🎴 48枚の花札を8枚ずつ配り、場に8枚出します。</p>
          <p>👉 手札から1枚出し、同じ月の場札があれば2枚とも取れます。</p>
          <p>🃏 次に山札を1枚めくり、同じく場札と合わせます。</p>
          <p>✨ 役ができたら「こいこい」（続けて得点2倍を狙う）か「あがり」（得点確定）を選べます。</p>
          <p>🏆 五光10点・四光8点・三光5点・月見酒／花見酒／猪鹿蝶／赤短／青短 各5点、タネ・タンは5枚で1点、カスは10枚で1点です。</p>
          <p>📅 全12局の合計点で勝敗が決まります。</p>
        </div>
        <div className="koikoi-diff">
          {DIFF_NAMES.map((d, i) => (
            <button key={d} className={diff === i ? 'koikoi-diff-on' : ''} onClick={() => setDiff(i)}>
              {d}
            </button>
          ))}
        </div>
        <p>通算成績： {wins} 勝 {loses} 敗 {draws} 分{best > 0 ? `（最高合計点：${best}点）` : ''}</p>
        <button className="koikoi-start" onClick={start}>ゲームスタート</button>
        <p className="koikoi-hint">キーボード：←→で手札を選び、Enterで出す・めくる、Dで捨てる、Kでこいこい、Aであがり</p>
      </div>
    )
  }

  const myYaku = calcYaku(g.caps[0])
  const cpuYaku = calcYaku(g.caps[1])
  const myTotal = g.total[0]
  const cpuTotal = g.total[1]

  if (phase === 'done') {
    return (
      <div className="koikoi" tabIndex={0}>
        <h2>🎴 花札こいこい</h2>
        <div className="koikoi-result">
          <p>全12局終了！</p>
          <p>あなた {myTotal}点 — ミオ {cpuTotal}点</p>
          {myTotal > cpuTotal ? <strong>🎉 あなたの勝ち！おめでとうございます！</strong>
            : myTotal < cpuTotal ? <strong>😢 ミオの勝ち…また挑戦してみましょう！</strong>
            : <strong>🤝 引き分けです！</strong>}
          <p>通算成績： {wins} 勝 {loses} 敗 {draws} 分{best > 0 ? `（最高合計点：${best}点）` : ''}</p>
        </div>
        <button className="koikoi-start" onClick={start}>もう一度遊ぶ</button>
      </div>
    )
  }

  return (
    <div className="koikoi" tabIndex={0} onKeyDown={onKey}>
      <div className="koikoi-head">
        <span>🎴 こいこい</span>
        <span>第{g.round + 1}局（{ROUND_NAMES[g.round]}） 親：{PLAYERS[g.parent]}</span>
        <span>あなた {myTotal}点 — ミオ {cpuTotal}点</span>
        <button onClick={start}>はじめから</button>
      </div>

      {phase === 'roundEnd' && (
        <div className="koikoi-result">
          <p>{g.roundMsg}</p>
          <p>現在： あなた {myTotal}点 — ミオ {cpuTotal}点</p>
          <button className="koikoi-start" onClick={nextRound}>
            {g.round >= 11 ? '結果を見る' : `第${g.round + 2}局（${ROUND_NAMES[g.round + 1]}）へ`}
          </button>
        </div>
      )}

      {phase === 'yaku' && g.pendingPlayer === 0 && (
        <div className="koikoi-yaku-choice">
          <p>🎉 役ができました！ {g.pendingYaku.map((y) => `${y.name}${y.points}点`).join('・')}（合計 {yakuPoints(g.pendingYaku)}点）</p>
          <div className="koikoi-yaku-btns">
            <button onClick={chooseKoikoi}>こいこい（K）— 続けて2倍を狙う</button>
            <button onClick={chooseAgari}>あがり（A）— {yakuPoints(g.pendingYaku) * 2 ** g.koikoi[0]}点で確定</button>
          </div>
        </div>
      )}
      {phase === 'yaku' && g.pendingPlayer === 1 && (
        <p className="koikoi-wait">ミオに役ができました…こいこいかあがりか考えています。</p>
      )}

      <div className="koikoi-opp">
        <div className="koikoi-opp-name">
          ミオ {phase === 'playing' && g.turn === 1 ? '👉 考え中…' : ` 手札${g.hands[1].length}枚`}
          {g.koikoi[1] > 0 && ` こいこい${g.koikoi[1]}回（あがり${2 ** g.koikoi[1]}倍）`}
          {cpuYaku.length > 0 && ` 役：${cpuYaku.map((y) => y.name).join('・')}`}
        </div>
        <div className="koikoi-backs">
          {g.hands[1].map((c) => (
            <span key={c.id} className="koikoi-back">🎴</span>
          ))}
        </div>
        {renderCaps(g.caps[1])}
      </div>

      <div className="koikoi-field-label">場の札（{g.field.length}枚）{g.step === 'draw' && g.drawn ? ' — めくった札と合わせてください' : ''}</div>
      <div className="koikoi-field">
        {g.field.map((c) => {
          const isMatch = (g.step === 'play' && selCard && playMatches.some((m) => m.id === c.id))
            || (g.step === 'draw' && g.drawn && drawMatches.some((m) => m.id === c.id))
          const clickable = phase === 'playing' && g.turn === 0 && isMatch
          return renderCard(
            c,
            isMatch ? 'match' : '',
            clickable
              ? () => { if (g.step === 'play') playSelected(c); else resolveDrawn(c) }
              : undefined,
            !clickable && phase === 'playing' && g.turn === 0,
          )
        })}
        {g.field.length === 0 && <span>場に札はありません</span>}
      </div>

      {g.step === 'draw' && g.drawn && phase === 'playing' && (
        <div className="koikoi-drawn">
          <span>めくった札：</span>
          {renderCard(g.drawn, 'drawn')}
          {drawMatches.length === 0 ? (
            <button onClick={() => resolveDrawn(null)}>場に出す（D）</button>
          ) : (
            <span>光っている場札をタップして取ってください（Enterでも取れます）</span>
          )}
        </div>
      )}

      {phase === 'playing' && g.turn === 0 && g.step === 'play' && (
        <div className="koikoi-turn-msg">
          あなたの番です。手札を選んでください。
          {selCard && playMatches.length === 0 && (
            <button onClick={() => playSelected(null)}>捨てる（D）— 同じ月の場札がありません</button>
          )}
          {selCard && playMatches.length > 0 && (
            <span>光っている場札をタップして取ってください（Enterでも取れます）</span>
          )}
        </div>
      )}
      {phase === 'playing' && g.turn === 1 && (
        <p className="koikoi-wait">ミオの番です…</p>
      )}

      <div className="koikoi-myhand">
        <div className="koikoi-myhand-head">
          あなたの手札（{g.hands[0].length}枚）
          {g.koikoi[0] > 0 && ` こいこい${g.koikoi[0]}回（あがり${2 ** g.koikoi[0]}倍）`}
          {myYaku.length > 0 && ` 役：${myYaku.map((y) => `${y.name}${y.points}点`).join('・')}`}
        </div>
        <div className="koikoi-cards">
          {myHand.map((c, i) => {
            const playable = phase === 'playing' && g.turn === 0 && g.step === 'play'
            return renderCard(
              c,
              selHand === i ? 'sel' : '',
              playable ? () => setSelHand(i) : undefined,
              !playable,
            )
          })}
          {g.hands[0].length === 0 && <span>手札はありません</span>}
        </div>
        {renderCaps(g.caps[0])}
      </div>

      <div className="koikoi-log">
        {g.log.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  )
}
