import { useEffect, useRef, useState } from 'react'

/* ================= カラーカード =================
 * UNO風のカードゲーム。自分＋CPU 3人の4人対戦。
 * ・108枚のデッキ（4色×数字0〜9＋スキップ／リバース／ドロー2、ワイルド／ワイルドドロー4）
 * ・場のカードと同じ色・数字・記号、またはワイルドを出せる
 * ・スキップ＝次の人を1回休み、リバース＝進行方向が逆転、ドロー2／ドロー4＝次の人が引いて1回休み
 * ・出せるカードがないときは1枚引く。引いたカードが出せる場合は出せる（出さずにパスも可）
 * ・先に手札を0枚にした人の勝ち。勝つと残りの手札の合計点がスコアになる
 * ・ベストスコアと勝利数を保存 */

type Color = 'red' | 'blue' | 'green' | 'yellow'
type Kind = 'num' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4'
type CardT = { color: Color | 'wild'; kind: Kind; num: number } // 数字カード以外 num は -1

const PLAYERS = [
  { name: 'あなた', cpu: false },
  { name: 'ミオ', cpu: true },
  { name: 'ケン', cpu: true },
  { name: 'ユウ', cpu: true },
]

const COLOR_LABEL: Record<Color, string> = { red: '赤', blue: '青', green: '緑', yellow: '黄' }
const COLOR_EMOJI: Record<Color, string> = { red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡' }

const BEST_KEY = 'webx-colorcard-best'
const WINS_KEY = 'webx-colorcard-wins'

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

function cardPoints(c: CardT): number {
  if (c.kind === 'num') return c.num
  if (c.kind === 'wild' || c.kind === 'wild4') return 50
  return 20
}

function cardLabel(c: CardT): string {
  if (c.kind === 'wild') return 'ワイルド'
  if (c.kind === 'wild4') return 'ワイルド・ドロー4'
  const col = COLOR_LABEL[c.color as Color]
  if (c.kind === 'num') return `${col}${c.num}`
  if (c.kind === 'skip') return `${col}スキップ`
  if (c.kind === 'reverse') return `${col}リバース`
  return `${col}ドロー2`
}

function cardFace(c: CardT): string {
  if (c.kind === 'wild') return '🌈'
  if (c.kind === 'wild4') return '+4'
  if (c.kind === 'num') return String(c.num)
  if (c.kind === 'skip') return '🚫'
  if (c.kind === 'reverse') return '🔄'
  return '+2'
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
  const colors: Color[] = ['red', 'blue', 'green', 'yellow']
  const deck: CardT[] = []
  for (const col of colors) {
    deck.push({ color: col, kind: 'num', num: 0 })
    for (let n = 1; n <= 9; n++) {
      deck.push({ color: col, kind: 'num', num: n })
      deck.push({ color: col, kind: 'num', num: n })
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      deck.push({ color: col, kind, num: -1 })
      deck.push({ color: col, kind, num: -1 })
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', kind: 'wild', num: -1 })
    deck.push({ color: 'wild', kind: 'wild4', num: -1 })
  }
  return shuffle(deck)
}

type Phase = 'title' | 'playing' | 'done'

interface GState {
  hands: CardT[][]
  deck: CardT[]
  discard: CardT[] // 場の山札（捨て札）。末尾が場のカード
  color: Color // 現在の色（ワイルドで指定された色を含む）
  turn: number
  dir: 1 | -1
  phase: Phase
  log: string[]
  winner: number | null
  drawnThisTurn: boolean // 今の番で1枚引いたかどうか
  pendingWild: CardT | null // 人間がワイルドを出した直後の色選択待ち
  score: number // 勝ったときのスコア
}

function topCard(g: GState): CardT {
  return g.discard[g.discard.length - 1]
}

/** 出せるカードかどうか */
function canPlay(g: GState, c: CardT): boolean {
  if (c.kind === 'wild' || c.kind === 'wild4') return true
  const top = topCard(g)
  if (c.color === g.color) return true
  if (c.kind === 'num' && top.kind === 'num' && c.num === top.num) return true
  if (c.kind !== 'num' && c.kind === top.kind) return true
  return false
}

/** 山札が尽きたら捨て札（場のカード以外）をシャッフルして山札にする */
function drawFromDeck(g: GState): { deck: CardT[]; discard: CardT[]; card: CardT | null } {
  let deck = [...g.deck]
  let discard = [...g.discard]
  if (deck.length === 0) {
    const top = discard[discard.length - 1]
    deck = shuffle(discard.slice(0, -1))
    discard = [top]
  }
  if (deck.length === 0) return { deck, discard, card: null }
  const card = deck[deck.length - 1]
  deck = deck.slice(0, -1)
  return { deck, discard, card }
}

/** n 枚引かせる（ドロー2／ドロー4用）。山札・捨て札も更新して返す */
function drawN(g: GState, player: number, n: number): { hands: CardT[][]; deck: CardT[]; discard: CardT[] } {
  let deck = [...g.deck]
  let discard = [...g.discard]
  const hands = g.hands.map((h) => [...h])
  for (let i = 0; i < n; i++) {
    const r = drawFromDeck({ ...g, deck, discard })
    deck = r.deck
    discard = r.discard
    if (!r.card) break
    hands[player] = [...hands[player], r.card]
  }
  return { hands, deck, discard }
}

/** 次の番のプレイヤー（dir 方向に steps 進む） */
function advTurn(g: GState, steps = 1): number {
  return (((g.turn + g.dir * steps) % 4) + 4) % 4
}

function pushLog(log: string[], line: string): string[] {
  return [...log, line].slice(-6)
}

function newGame(): GState {
  const deck = makeDeck()
  const hands: CardT[][] = [[], [], [], []]
  let d = [...deck]
  for (let r = 0; r < 7; r++) for (let p = 0; p < 4; p++) hands[p].push(d.pop()!)
  // 場のカードは数字カードになるまでめくる
  let first = d.pop()!
  while (first.kind !== 'num') {
    d.unshift(first)
    d = shuffle(d)
    first = d.pop()!
  }
  return {
    hands,
    deck: d,
    discard: [first],
    color: first.color as Color,
    turn: 0,
    dir: 1,
    phase: 'playing',
    log: ['カードを配りました。7枚ずつ持っています。', `場のカードは ${cardLabel(first)} です。${COLOR_EMOJI[first.color as Color]}の色から始めます。`],
    winner: null,
    drawnThisTurn: false,
    pendingWild: null,
    score: 0,
  }
}

/**
 * カードを出す遷移（純粋関数）。
 * ワイルド系は chosenColor が無い場合、色選択待ち状態（pendingWild）を返す。
 * chosenColor がある場合（またはワイルド以外）は効果を適用して番を進める。
 */
function applyPlay(g: GState, player: number, cardIdx: number, chosenColor?: Color): GState {
  const card = g.hands[player][cardIdx]
  if (!card || !canPlay(g, card)) return g
  const hands = g.hands.map((h) => [...h])
  hands[player] = hands[player].filter((_, i) => i !== cardIdx)
  const discard = [...g.discard, card]
  let log = pushLog(g.log, `${PLAYERS[player].name} は ${cardLabel(card)} を出しました。`)
  // 手札が0枚＝あがり
  if (hands[player].length === 0) {
    const score = [0, 1, 2, 3].filter((p) => p !== player).reduce((s, p) => s + hands[p].reduce((t, c) => t + cardPoints(c), 0), 0)
    log = pushLog(log, `🎉 ${PLAYERS[player].name} のあがり！ スコア ${score}点です。`)
    return { ...g, hands, discard, phase: 'done', winner: player, log, score, drawnThisTurn: false, pendingWild: null }
  }
  // ワイルド系：色が未指定なら色選択待ち
  if ((card.kind === 'wild' || card.kind === 'wild4') && !chosenColor) {
    return { ...g, hands, discard, log, drawnThisTurn: false, pendingWild: card }
  }
  const color: Color = chosenColor ?? (card.color as Color)
  let dir = g.dir
  let turn = g.turn
  let next = { ...g, hands, discard, color, dir, log, drawnThisTurn: false, pendingWild: null }
  if (card.kind === 'reverse') {
    dir = (g.dir * -1) as 1 | -1
    next = { ...next, dir }
    log = pushLog(log, '🔄 進行方向が逆転しました！')
    next = { ...next, log }
    turn = advTurn({ ...next, dir }, 1)
  } else if (card.kind === 'skip') {
    log = pushLog(log, `🚫 ${PLAYERS[advTurn(g, 1)].name} は1回休みです。`)
    next = { ...next, log }
    turn = advTurn(g, 2)
  } else if (card.kind === 'draw2' || card.kind === 'wild4') {
    const n = card.kind === 'draw2' ? 2 : 4
    const victim = advTurn(g, 1)
    const drawn = drawN({ ...next, hands }, victim, n)
    log = pushLog(log, `😱 ${PLAYERS[victim].name} は ${n}枚引いて1回休みです。`)
    next = { ...next, hands: drawn.hands, deck: drawn.deck, discard: drawn.discard, log }
    turn = advTurn(g, 2)
  } else {
    turn = advTurn(g, 1)
  }
  if (chosenColor) {
    log = pushLog(next.log, `🌈 色は ${COLOR_EMOJI[chosenColor]}${COLOR_LABEL[chosenColor]} に変わりました。`)
    next = { ...next, log }
  }
  return { ...next, turn }
}

/** 1枚引く遷移（純粋関数） */
function applyDraw(g: GState, player: number): GState {
  const r = drawFromDeck(g)
  if (!r.card) return g
  const hands = g.hands.map((h) => [...h])
  hands[player] = [...hands[player], r.card]
  const log = pushLog(g.log, `${PLAYERS[player].name} は1枚引きました。`)
  return { ...g, hands, deck: r.deck, discard: r.discard, log, drawnThisTurn: true }
}

/** パスの遷移（純粋関数） */
function applyPass(g: GState): GState {
  return { ...g, turn: advTurn(g, 1), drawnThisTurn: false }
}

/** CPU の手札でワイルドの色を決める（いちばん多い色） */
function cpuChooseColor(hand: CardT[]): Color {
  const count: Record<Color, number> = { red: 0, blue: 0, green: 0, yellow: 0 }
  for (const c of hand) if (c.color !== 'wild') count[c.color as Color]++
  let best: Color = 'red'
  let bestN = -1
  for (const col of ['red', 'blue', 'green', 'yellow'] as const) {
    if (count[col] > bestN) { bestN = count[col]; best = col }
  }
  return best
}

/** CPU の出すカードを選ぶ（数字＜アクション＜ワイルドの順で温存気味に） */
function cpuPickCard(g: GState, player: number): number {
  const hand = g.hands[player]
  const playable = hand.map((c, i) => ({ c, i })).filter(({ c }) => canPlay(g, c))
  if (playable.length === 0) return -1
  const num = playable.find(({ c }) => c.kind === 'num')
  if (num) return num.i
  const action = playable.find(({ c }) => c.kind === 'skip' || c.kind === 'reverse' || c.kind === 'draw2')
  if (action) return action.i
  return playable[0].i
}

function loadNum(key: string): number {
  try {
    return Number(localStorage.getItem(key) ?? '0') || 0
  } catch {
    return 0
  }
}

const COLOR_BG: Record<Color, string> = { red: '#dc2626', blue: '#2563eb', green: '#16a34a', yellow: '#ca8a04' }

export default function ColorCard() {
  const [g, setG] = useState<GState | null>(null)
  const [sel, setSel] = useState(0)
  const [best, setBest] = useState(() => loadNum(BEST_KEY))
  const [wins, setWins] = useState(() => loadNum(WINS_KEY))
  const recordedRef = useRef(false)

  const phase = g?.phase ?? 'title'
  const turn = g?.turn ?? 0
  const isMyTurn = !!g && g.phase === 'playing' && g.turn === 0 && !g.pendingWild
  const myHand = g ? g.hands[0] : []

  // CPU の番：少し待ってから自動で行動
  useEffect(() => {
    if (!g || g.phase !== 'playing' || !PLAYERS[g.turn].cpu || g.pendingWild) return
    const t = setTimeout(() => {
      setG((prev) => {
        if (!prev || prev.phase !== 'playing' || !PLAYERS[prev.turn].cpu || prev.pendingWild) return prev
        const p = prev.turn
        const idx = cpuPickCard(prev, p)
        if (idx >= 0) {
          const card = prev.hands[p][idx]
          beep(card.kind === 'wild' || card.kind === 'wild4' ? 880 : 520, 0.07, 0.05)
          const color = card.kind === 'wild' || card.kind === 'wild4'
            ? cpuChooseColor(prev.hands[p].filter((_, i) => i !== idx))
            : undefined
          return applyPlay(prev, p, idx, color)
        }
        // 出せないので1枚引く
        const after = applyDraw(prev, p)
        beep(330, 0.06, 0.04)
        const drawnIdx = after.hands[p].length - 1
        const drawn = after.hands[p][drawnIdx]
        if (drawn && canPlay(after, drawn)) {
          // 引いたカードが出せる場合はすぐ出す
          const color = drawn.kind === 'wild' || drawn.kind === 'wild4'
            ? cpuChooseColor(after.hands[p].filter((_, i) => i !== drawnIdx))
            : undefined
          return applyPlay(after, p, drawnIdx, color)
        }
        return applyPass(after)
      })
    }, 1100)
    return () => clearTimeout(t)
  }, [g])

  // 終了時の記録（1回だけ）
  useEffect(() => {
    if (!g || g.phase !== 'done' || g.winner === null || recordedRef.current) return
    recordedRef.current = true
    if (g.winner === 0) {
      const w = loadNum(WINS_KEY) + 1
      try { localStorage.setItem(WINS_KEY, String(w)) } catch { /* 保存できなくても遊べる */ }
      setWins(w)
      if (g.score > loadNum(BEST_KEY)) {
        try { localStorage.setItem(BEST_KEY, String(g.score)) } catch { /* 保存できなくても遊べる */ }
        setBest(g.score)
      }
      fanfare()
    } else {
      beep(196, 0.3, 0.06)
    }
  }, [g])

  const start = () => {
    recordedRef.current = false
    setSel(0)
    setG(newGame())
    beep(660, 0.1, 0.05)
  }

  const playCard = (idx: number) => {
    if (!g || !isMyTurn) return
    const card = g.hands[0][idx]
    if (!card || !canPlay(g, card)) return
    beep(card.kind === 'wild' || card.kind === 'wild4' ? 880 : 620, 0.07, 0.05)
    setG((prev) => (prev ? applyPlay(prev, 0, idx) : prev))
    setSel(0)
  }

  const chooseColor = (color: Color) => {
    if (!g || !g.pendingWild) return
    beep(740, 0.08, 0.05)
    setG((prev) => {
      if (!prev || !prev.pendingWild) return prev
      // ワイルドを出した直後の状態から、色と効果を適用する
      const card = prev.pendingWild
      let next: GState = { ...prev, color, pendingWild: null, drawnThisTurn: false }
      let log = pushLog(next.log, `🌈 色は ${COLOR_EMOJI[color]}${COLOR_LABEL[color]} に変わりました。`)
      next = { ...next, log }
      if (card.kind === 'wild4') {
        const victim = advTurn(prev, 1)
        const drawn = drawN(next, victim, 4)
        log = pushLog(next.log, `😱 ${PLAYERS[victim].name} は 4枚引いて1回休みです。`)
        next = { ...next, hands: drawn.hands, deck: drawn.deck, discard: drawn.discard, log }
        next = { ...next, turn: advTurn(prev, 2) }
      } else {
        next = { ...next, turn: advTurn(prev, 1) }
      }
      return next
    })
  }

  const drawCard = () => {
    if (!g || !isMyTurn || g.drawnThisTurn) return
    beep(440, 0.06, 0.04)
    setG((prev) => (prev ? applyDraw(prev, 0) : prev))
  }

  const pass = () => {
    if (!g || !isMyTurn || !g.drawnThisTurn) return
    beep(380, 0.06, 0.04)
    setG((prev) => (prev ? applyPass(prev) : prev))
    setSel(0)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!g || g.phase !== 'playing') return
    if (g.pendingWild) {
      const map: Record<string, Color> = { '1': 'red', '2': 'blue', '3': 'green', '4': 'yellow' }
      const c = map[e.key]
      if (c) { e.preventDefault(); chooseColor(c) }
      return
    }
    if (turn !== 0) return
    const n = myHand.length
    if (e.key === 'ArrowLeft') { e.preventDefault(); setSel((s) => (s - 1 + n) % n) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setSel((s) => (s + 1) % n) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playCard(sel) }
    else if (e.key === 'd' || e.key === 'D') { e.preventDefault(); drawCard() }
    else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); pass() }
  }

  if (!g) {
    return (
      <div className="colorcard" tabIndex={0}>
        <h2>🌈 カラーカード</h2>
        <p>UNO風のカードゲーム。自分＋CPU 3人の4人対戦です。</p>
        <div className="colorcard-rules">
          <p>🎴 場のカードと同じ色・数字・記号、またはワイルドを出せます。</p>
          <p>🚫 スキップ＝次の人が1回休み ／ 🔄 リバース＝進行方向が逆転</p>
          <p>😱 ドロー2・ドロー4＝次の人が引いて1回休み ／ 🌈 ワイルド＝好きな色に変えられる</p>
          <p>🃏 出せるカードがないときは1枚引く。引いたカードが出せる場合は出せる（パスも可）。</p>
          <p>🏆 先に手札を0枚にした人の勝ち！ スコアは残りの手札の合計点です。</p>
        </div>
        <p>通算成績： {wins} 勝 ／ ベストスコア {best}点</p>
        <button className="colorcard-start" onClick={start}>ゲームスタート</button>
        <p className="colorcard-hint">キーボード：←→でカードを選び、Enter／Spaceで出す、Dで引く、Pでパス</p>
      </div>
    )
  }

  const top = topCard(g)
  const playableCount = myHand.filter((c) => canPlay(g, c)).length

  return (
    <div className="colorcard" tabIndex={0} onKeyDown={onKey}>
      <div className="colorcard-head">
        <span>🌈 カラーカード</span>
        <span>{wins} 勝 ／ ベスト {best}点</span>
        <button onClick={start}>はじめから</button>
      </div>

      {phase === 'done' && (
        <div className="colorcard-result">
          {g.winner === 0 ? (
            <><strong>🎉 あなたの勝ち！</strong><p>スコア {g.score}点です。おめでとうございます！</p></>
          ) : (
            <><strong>😢 {PLAYERS[g.winner ?? 0].name} の勝ち…</strong><p>あなたの手札は {g.hands[0].length}枚残っていました。また挑戦してみましょう！</p></>
          )}
          <button className="colorcard-start" onClick={start}>もう一度遊ぶ</button>
        </div>
      )}

      <div className="colorcard-opps">
        {[1, 2, 3].map((p) => {
          const isTurn = phase === 'playing' && turn === p
          return (
            <div key={p} className={`colorcard-opp${isTurn ? ' turn' : ''}`}>
              <div className="colorcard-opp-name">
                {PLAYERS[p].name}
                {g.hands[p].length === 1 ? ' ⚠️あと1枚！' : ` 残り${g.hands[p].length}枚`}
                {isTurn ? ' 🎯考え中…' : ''}
              </div>
              <div className="colorcard-backs">
                {g.hands[p].slice(0, 10).map((_, i) => (
                  <span key={i} className="colorcard-back">🂠</span>
                ))}
                {g.hands[p].length > 10 && <span className="colorcard-more">+{g.hands[p].length - 10}</span>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="colorcard-field">
        <div className="colorcard-deck">
          <div className="colorcard-back big">🂠</div>
          <span>山札 {g.deck.length}枚</span>
        </div>
        <div className="colorcard-top">
          <span
            className="colorcard-card"
            style={{ background: top.color === 'wild' ? '#111827' : COLOR_BG[top.color as Color] }}
          >
            <span className="colorcard-face">{cardFace(top)}</span>
            <span className="colorcard-card-label">{cardLabel(top)}</span>
          </span>
          <span>現在の色： {COLOR_EMOJI[g.color]}{COLOR_LABEL[g.color]}</span>
          <span>進行方向： {g.dir === 1 ? '➡️ 時計回り' : '⬅️ 反時計回り'}</span>
        </div>
      </div>

      {g.pendingWild && (
        <div className="colorcard-colorpick">
          <p>🌈 ワイルドを出しました！ 色を選んでください（キー 1〜4 でも選べます）</p>
          <div className="colorcard-colorbtns">
            {(['red', 'blue', 'green', 'yellow'] as const).map((c, i) => (
              <button
                key={c}
                style={{ background: COLOR_BG[c] }}
                onClick={() => chooseColor(c)}
              >{COLOR_EMOJI[c]} {COLOR_LABEL[c]}（{i + 1}）</button>
            ))}
          </div>
        </div>
      )}

      {phase === 'playing' && turn === 0 && !g.pendingWild && (
        <div className="colorcard-actions">
          <span>{playableCount > 0 ? `出せるカードが ${playableCount}枚あります` : g.drawnThisTurn ? '引いたカードを出すか、パスしてください' : '出せるカードがありません。1枚引いてください'}</span>
          <button onClick={drawCard} disabled={g.drawnThisTurn}>1枚引く（D）</button>
          <button onClick={pass} disabled={!g.drawnThisTurn}>パス（P）</button>
        </div>
      )}
      {phase === 'playing' && turn !== 0 && (
        <p className="colorcard-wait">{PLAYERS[turn].name} の番です…</p>
      )}

      <div className="colorcard-myhand">
        <div className="colorcard-myhand-head">
          あなたの手札（{g.hands[0].length}枚）
          {g.hands[0].length === 1 && ' ⚠️あと1枚！'}
          {g.hands[0].length === 0 && ' 🎉あがり！'}
        </div>
        <div className="colorcard-cards">
          {myHand.map((c, i) => {
            const playable = phase === 'playing' && turn === 0 && !g.pendingWild && canPlay(g, c)
            return (
              <button
                key={i}
                className={`colorcard-card${sel === i ? ' sel' : ''}${playable ? ' playable' : ''}`}
                style={{ background: c.color === 'wild' ? '#111827' : COLOR_BG[c.color as Color] }}
                onClick={() => { setSel(i); playCard(i) }}
                disabled={!playable}
                aria-label={cardLabel(c)}
              >
                <span className="colorcard-face">{cardFace(c)}</span>
                <span className="colorcard-card-label">{cardLabel(c)}</span>
              </button>
            )
          })}
          {g.hands[0].length === 0 && <span>手札はありません 🎉</span>}
        </div>
      </div>

      <div className="colorcard-log">
        {g.log.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  )
}
