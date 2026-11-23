import { useEffect, useRef, useState } from 'react'

/* ================= 七並べ =================
 * トランプの七並べ。自分＋CPU 3人の4人対戦。
 * ・52枚を13枚ずつ配り、♦7を持っている人からスタート
 * ・自分の番に出せるのは、場の7からつながる数字（各スートの並びの両端±1）と7
 * ・出せるカードがないときだけパス可。3回パスするとその場で負け
 * ・先に手札を0枚にした人の勝ち。勝利数・敗北数・最少パス勝利を保存 */

type Suit = '♠' | '♥' | '♦' | '♣'
type CardT = { suit: Suit; rank: number } // rank: 1-13

const SUITS: Suit[] = ['♠', '♥', '♦', '♣']
const SUIT_NAMES: Record<Suit, string> = { '♠': 'スペード', '♥': 'ハート', '♦': 'ダイヤ', '♣': 'クラブ' }

const PLAYERS = [
  { name: 'あなた', cpu: false },
  { name: 'ミオ', cpu: true },
  { name: 'ケン', cpu: true },
  { name: 'ユウ', cpu: true },
]

const WINS_KEY = 'webx-sevens-wins'
const LOSES_KEY = 'webx-sevens-loses'
const BEST_KEY = 'webx-sevens-best' // 勝利時の最少パス数

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

function rankLabel(rank: number): string {
  if (rank === 1) return 'A'
  if (rank === 11) return 'J'
  if (rank === 12) return 'Q'
  if (rank === 13) return 'K'
  return String(rank)
}

function cardName(c: CardT): string {
  return `${c.suit}${rankLabel(c.rank)}`
}

function makeDeck(): CardT[] {
  const deck: CardT[] = []
  for (const s of SUITS) for (let r = 1; r <= 13; r++) deck.push({ suit: s, rank: r })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function sortHand(hand: CardT[]): CardT[] {
  return [...hand].sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.rank - b.rank)
}

type Placed = boolean[][] // [suit][rank-1]

function emptyPlaced(): Placed {
  return SUITS.map(() => Array(13).fill(false))
}

interface Game {
  hands: CardT[][]
  placed: Placed
  turn: number
  passes: number[]
  phase: 'playing' | 'done'
  winner: number | null
  passLoser: number | null // 3回パスで負けた人
  log: string[]
}

function newGame(): Game {
  const deck = makeDeck()
  const hands: CardT[][] = [[], [], [], []]
  deck.forEach((c, i) => hands[i % 4].push(c))
  // ♦7を持っている人からスタート
  let start = 0
  hands.forEach((h, p) => {
    if (h.some((c) => c.suit === '♦' && c.rank === 7)) start = p
  })
  return {
    hands,
    placed: emptyPlaced(),
    turn: start,
    passes: [0, 0, 0, 0],
    phase: 'playing',
    winner: null,
    passLoser: null,
    log: [`${PLAYERS[start].name}（♦7持ち）からスタートです。`],
  }
}

/** そのスートで場に出ている数字の最小・最大。何も出ていなければ null */
function suitRange(placed: Placed, s: number): { lo: number; hi: number } | null {
  let lo = -1
  let hi = -1
  for (let r = 0; r < 13; r++) {
    if (placed[s][r]) {
      if (lo < 0) lo = r + 1
      hi = r + 1
    }
  }
  return lo < 0 ? null : { lo, hi }
}

/** 出せるカードかどうか */
function isPlayable(placed: Placed, c: CardT): boolean {
  const s = SUITS.indexOf(c.suit)
  if (placed[s][c.rank - 1]) return false
  if (c.rank === 7) return true
  const range = suitRange(placed, s)
  if (!range) return false
  return c.rank === range.lo - 1 || c.rank === range.hi + 1
}

function playableCards(placed: Placed, hand: CardT[]): CardT[] {
  return hand.filter((c) => isPlayable(placed, c))
}

function loadNum(key: string): number {
  try {
    return Number(localStorage.getItem(key) ?? '0') || 0
  } catch {
    return 0
  }
}

/** カードを1枚出す。勝敗が決まれば phase を done にする */
function applyPlay(prev: Game, player: number, card: CardT): Game {
  const placed = prev.placed.map((row) => [...row])
  placed[SUITS.indexOf(card.suit)][card.rank - 1] = true
  const hands = prev.hands.map((h, i) => (i === player ? h.filter((c) => c !== card) : h))
  const log = [...prev.log, `${PLAYERS[player].name} は ${cardName(card)} を出しました。`].slice(-4)
  if (hands[player].length === 0) {
    log.push(`🎉 ${PLAYERS[player].name} のあがり！`)
    return { ...prev, hands, placed, phase: 'done', winner: player, passLoser: null, log }
  }
  return { ...prev, hands, placed, turn: (player + 1) % 4, log }
}

/** パスする。3回目ならその人が負けで終了 */
function applyPass(prev: Game, player: number): Game {
  const passes = prev.passes.map((n, i) => (i === player ? n + 1 : n))
  const log = [...prev.log, `${PLAYERS[player].name} はパスしました。（${passes[player]}回目）`].slice(-4)
  if (passes[player] >= 3) {
    log.push(`😱 ${PLAYERS[player].name} は3回パスしたので負けです。`)
    return { ...prev, passes, phase: 'done', winner: player === 0 ? null : 0, passLoser: player, log }
  }
  return { ...prev, passes, turn: (player + 1) % 4, log }
}

export default function Sevens() {
  const [g, setG] = useState<Game | null>(null)
  const [sel, setSel] = useState(0)
  const [wins, setWins] = useState(() => loadNum(WINS_KEY))
  const [loses, setLoses] = useState(() => loadNum(LOSES_KEY))
  const [best, setBest] = useState(() => loadNum(BEST_KEY))
  const recordedRef = useRef(false)

  const phase = g?.phase ?? 'title'
  const turn = g?.turn ?? 0
  const myHand = g ? sortHand(g.hands[0]) : []
  const myPlayable = g ? playableCards(g.placed, g.hands[0]) : []
  const canPass = phase === 'playing' && turn === 0 && g !== null && myPlayable.length === 0

  // CPU の番：少し待ってから自動で出す／パスする
  useEffect(() => {
    if (!g || g.phase !== 'playing' || !PLAYERS[g.turn].cpu) return
    const t = setTimeout(() => {
      setG((prev) => {
        if (!prev || prev.phase !== 'playing' || !PLAYERS[prev.turn].cpu) return prev
        const p = prev.turn
        const playable = playableCards(prev.placed, prev.hands[p])
        if (playable.length === 0) {
          beep(330, 0.08, 0.04)
          return applyPass(prev, p)
        }
        // 7以外を優先して出す（7は温存したほうが手が広がりやすい）
        const nonSeven = playable.filter((c) => c.rank !== 7)
        const pick = nonSeven.length > 0
          ? nonSeven[Math.floor(Math.random() * nonSeven.length)]
          : playable[Math.floor(Math.random() * playable.length)]
        beep(520, 0.06, 0.04)
        return applyPlay(prev, p, pick)
      })
    }, 1000)
    return () => clearTimeout(t)
  }, [g])

  // 終了時の成績記録（1回だけ）
  useEffect(() => {
    if (!g || g.phase !== 'done' || recordedRef.current) return
    recordedRef.current = true
    const iWin = g.winner === 0
    if (iWin) {
      const n = loadNum(WINS_KEY) + 1
      try { localStorage.setItem(WINS_KEY, String(n)) } catch { /* 保存できなくても遊べる */ }
      setWins(n)
      const myPasses = g.passes[0]
      const prevBest = loadNum(BEST_KEY)
      if (prevBest === 0 || myPasses < prevBest) {
        try { localStorage.setItem(BEST_KEY, String(myPasses)) } catch { /* 保存できなくても遊べる */ }
        setBest(myPasses)
      }
      fanfare()
    } else {
      const n = loadNum(LOSES_KEY) + 1
      try { localStorage.setItem(LOSES_KEY, String(n)) } catch { /* 保存できなくても遊べる */ }
      setLoses(n)
      beep(196, 0.3, 0.06)
    }
  }, [g])

  const start = () => {
    recordedRef.current = false
    setSel(0)
    setG(newGame())
    beep(660, 0.1, 0.05)
  }

  const playCard = (card: CardT) => {
    if (!g || g.phase !== 'playing' || turn !== 0) return
    if (!isPlayable(g.placed, card)) return
    beep(620, 0.06, 0.04)
    setG((prev) => (prev ? applyPlay(prev, 0, card) : prev))
    setSel(0)
  }

  const pass = () => {
    if (!canPass || !g) return
    beep(330, 0.08, 0.04)
    setG((prev) => (prev ? applyPass(prev, 0) : prev))
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!g || g.phase !== 'playing' || turn !== 0) return
    const n = myHand.length
    if (e.key === 'ArrowLeft' && n > 0) { e.preventDefault(); setSel((s) => (s - 1 + n) % n) }
    else if (e.key === 'ArrowRight' && n > 0) { e.preventDefault(); setSel((s) => (s + 1) % n) }
    else if ((e.key === 'Enter' || e.key === ' ') && n > 0) { e.preventDefault(); playCard(myHand[sel]) }
    else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); pass() }
  }

  if (!g) {
    return (
      <div className="sevens" tabIndex={0}>
        <h2>🃏 七並べ</h2>
        <p>トランプの七並べ。自分＋CPU 3人の4人対戦です。</p>
        <div className="sevens-rules">
          <p>🃏 52枚を13枚ずつ配ります。♦7を持っている人からスタート。</p>
          <p>👉 場の7からつながる数字（各スートの並びの両端の±1）と7が出せます。</p>
          <p>✋ 出せるカードがないときだけパスできます。3回パスするとその場で負けです。</p>
          <p>🏆 先に手札を0枚にした人の勝ちです。</p>
        </div>
        <p>通算成績： {wins} 勝 {loses} 敗{best > 0 ? `（最少パス勝利：${best}回）` : ''}</p>
        <button className="sevens-start" onClick={start}>ゲームスタート</button>
        <p className="sevens-hint">キーボード：←→で手札を選び、Enter／Spaceで出す、Pでパス</p>
      </div>
    )
  }

  const iWin = g.winner === 0
  return (
    <div className="sevens" tabIndex={0} onKeyDown={onKey}>
      <div className="sevens-head">
        <span>🃏 七並べ</span>
        <span>通算 {wins} 勝 {loses} 敗{best > 0 ? `・最少パス ${best}回` : ''}</span>
        <button onClick={start}>はじめから</button>
      </div>

      {phase === 'done' && (
        <div className="sevens-result">
          {iWin ? (
            <><strong>🎉 あなたの勝ち！</strong><p>{g.passLoser !== null ? `${PLAYERS[g.passLoser].name} が3回パスしました。` : '先に手札をなくしました。'}おめでとうございます！{g.passes[0] === 0 ? '（ノーパス勝利！）' : `パス ${g.passes[0]}回での勝利でした。`}</p></>
          ) : (
            <><strong>😢 あなたの負け…</strong><p>{g.passLoser === 0 ? '3回パスしてしまいました。' : `${PLAYERS[g.winner ?? 1].name} が先にあがりました。`}また挑戦してみましょう！</p></>
          )}
          <button className="sevens-start" onClick={start}>もう一度遊ぶ</button>
        </div>
      )}

      <div className="sevens-opps">
        {[1, 2, 3].map((p) => (
          <div key={p} className={`sevens-opp${phase === 'playing' && turn === p ? ' active' : ''}`}>
            <div className="sevens-opp-name">
              {PLAYERS[p].name}
              {phase === 'playing' && turn === p ? ' 👉考え中…' : ` 残り${g.hands[p].length}枚`}
              {` パス${g.passes[p]}回`}
            </div>
            <div className="sevens-backs">
              {g.hands[p].slice(0, 10).map((_, i) => (
                <span key={i} className="sevens-back">🂠</span>
              ))}
              {g.hands[p].length > 10 && <span className="sevens-more">+{g.hands[p].length - 10}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="sevens-board">
        {SUITS.map((suit, s) => (
          <div key={suit} className="sevens-row">
            <span className={`sevens-suit-label${suit === '♥' || suit === '♦' ? ' red' : ''}`} title={SUIT_NAMES[suit]}>{suit}</span>
            {Array.from({ length: 13 }, (_, r) => {
              const placed = g.placed[s][r]
              return (
                <span key={r} className={`sevens-cell${placed ? ' placed' : ''}${suit === '♥' || suit === '♦' ? ' red' : ''}`}>
                  {placed ? rankLabel(r + 1) : <span className="sevens-cell-num">{rankLabel(r + 1)}</span>}
                </span>
              )
            })}
          </div>
        ))}
      </div>

      {phase === 'playing' && turn === 0 && (
        <div className="sevens-turn-msg">
          {myPlayable.length > 0
            ? `あなたの番です。光っているカードが出せます。（${myPlayable.length}枚出せる）`
            : '出せるカードがありません。パスしてください。'}
          <button className="sevens-pass" onClick={pass} disabled={!canPass}>パスする（P）</button>
        </div>
      )}
      {phase === 'playing' && turn !== 0 && (
        <p className="sevens-wait">{PLAYERS[turn].name} の番です…</p>
      )}

      <div className="sevens-myhand">
        <div className="sevens-myhand-head">あなたの手札（{g.hands[0].length}枚） パス {g.passes[0]}回</div>
        <div className="sevens-cards">
          {myHand.map((c, i) => {
            const playable = phase === 'playing' && turn === 0 && isPlayable(g.placed, c)
            return (
              <button
                key={`${c.suit}${c.rank}`}
                className={`sevens-card${c.suit === '♥' || c.suit === '♦' ? ' red' : ''}${playable ? ' playable' : ''}${sel === i ? ' sel' : ''}`}
                onClick={() => { setSel(i); playCard(c) }}
                disabled={!playable}
                aria-label={cardName(c)}
              >
                <span className="sevens-rank">{rankLabel(c.rank)}</span>
                <span className="sevens-suit">{c.suit}</span>
              </button>
            )
          })}
          {g.hands[0].length === 0 && <span>手札はありません 🎉</span>}
        </div>
      </div>

      <div className="sevens-log">
        {g.log.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  )
}
