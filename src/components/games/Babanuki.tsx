import { useEffect, useRef, useState } from 'react'

/* ================= ババ抜き =================
 * トランプのババ抜き（オールドメイド）。自分＋CPU 3人の4人対戦。
 * ・ジョーカー1枚入りの53枚を全員に配り、最初に手札のペアをすべて捨てる
 * ・自分の番になったら次のプレイヤーの伏せ札から1枚引く
 * ・引いた札が手札とペアになれば自動で捨てる。手札が0枚になったらあがり
 * ・最後までジョーカーを持っていた人がババ（負け）
 * ・勝敗数を保存 */

type Suit = '♠' | '♥' | '♦' | '♣'
type CardT = { suit: Suit | 'JOKER'; rank: number } // rank: 1-13、ジョーカーは 0

const PLAYERS = [
  { name: 'あなた', cpu: false },
  { name: 'ミオ', cpu: true },
  { name: 'ケン', cpu: true },
  { name: 'ユウ', cpu: true },
]

const WINS_KEY = 'webx-babanuki-wins'
const LOSES_KEY = 'webx-babanuki-loses'

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
  if (rank === 0) return 'JOKER'
  if (rank === 1) return 'A'
  if (rank === 11) return 'J'
  if (rank === 12) return 'Q'
  if (rank === 13) return 'K'
  return String(rank)
}

function cardName(c: CardT): string {
  return c.suit === 'JOKER' ? 'ジョーカー' : `${c.suit}${rankLabel(c.rank)}`
}

function makeDeck(): CardT[] {
  const suits: Suit[] = ['♠', '♥', '♦', '♣']
  const deck: CardT[] = []
  for (const s of suits) for (let r = 1; r <= 13; r++) deck.push({ suit: s, rank: r })
  deck.push({ suit: 'JOKER', rank: 0 })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

/** 手札からペアを捨てる。残った手札と捨てたペア数を返す */
function discardPairs(hand: CardT[]): { kept: CardT[]; pairs: number } {
  const byRank = new Map<number, CardT[]>()
  for (const c of hand) {
    const arr = byRank.get(c.rank) ?? []
    arr.push(c)
    byRank.set(c.rank, arr)
  }
  const kept: CardT[] = []
  let pairs = 0
  for (const [, arr] of byRank) {
    pairs += Math.floor(arr.length / 2)
    if (arr.length % 2 === 1) kept.push(arr[0])
  }
  return { kept, pairs }
}

function sortHand(hand: CardT[]): CardT[] {
  return [...hand].sort((a, b) => a.rank - b.rank || a.suit.localeCompare(b.suit))
}

type Phase = 'title' | 'playing' | 'done'

interface GState {
  hands: CardT[][]
  turn: number
  finished: number[] // あがった順のプレイヤー番号
  phase: Phase
  log: string[]
  pairs: number[] // 各プレイヤーが捨てたペア数
  loser: number | null // ババになったプレイヤー番号
}

/** まだ手札を持っているプレイヤーのうち、from の次（時計回り）を返す */
function nextActive(g: GState, from: number): number {
  for (let k = 1; k <= 4; k++) {
    const i = (from + k) % 4
    if (g.hands[i].length > 0) return i
  }
  return from
}

function newGame(): GState {
  const deck = makeDeck()
  const hands: CardT[][] = [[], [], [], []]
  deck.forEach((c, i) => hands[i % 4].push(c))
  const pairs = [0, 0, 0, 0]
  for (let p = 0; p < 4; p++) {
    const r = discardPairs(hands[p])
    hands[p] = r.kept
    pairs[p] = r.pairs
  }
  const finished: number[] = []
  for (let p = 0; p < 4; p++) if (hands[p].length === 0) finished.push(p)
  const log = ['カードを配りました。最初のペアを捨てました。']
  for (let p = 0; p < 4; p++) {
    if (pairs[p] > 0) log.push(`${PLAYERS[p].name} は ${pairs[p]} ペア捨てました。`)
  }
  return { hands, turn: 0, finished, phase: 'playing', log, pairs, loser: null }
}

/** drawer が target の手札から cardIdx 枚目を引く遷移（純粋関数） */
function applyDraw(g: GState, drawer: number, cardIdx: number): GState {
  const target = nextActive(g, drawer)
  if (target === drawer || g.hands[target].length === 0) return g
  const idx = Math.min(cardIdx, g.hands[target].length - 1)
  const drawn = g.hands[target][idx]
  const hands = g.hands.map((h) => [...h])
  hands[target] = hands[target].filter((_, i) => i !== idx)
  const pairs = [...g.pairs]
  let log = [...g.log]
  log.push(`${PLAYERS[drawer].name} は ${PLAYERS[target].name} から1枚引きました。`)
  const before = hands[drawer].length
  hands[drawer] = [...hands[drawer], drawn]
  const r = discardPairs(hands[drawer])
  hands[drawer] = r.kept
  pairs[drawer] += r.pairs
  if (r.pairs > 0) log.push(`${PLAYERS[drawer].name} は ${cardName(drawn)} でペアができて ${r.pairs} ペア捨てました。`)
  void before
  const finished = [...g.finished]
  if (hands[drawer].length === 0 && !finished.includes(drawer)) {
    finished.push(drawer)
    log.push(`🎉 ${PLAYERS[drawer].name} があがり！ ${finished.length}位です。`)
  }
  const active = [0, 1, 2, 3].filter((p) => hands[p].length > 0)
  let phase: Phase = 'playing'
  let loser: number | null = null
  if (active.length === 1) {
    phase = 'done'
    loser = active[0]
    log.push(`😱 ${PLAYERS[loser].name} がジョーカーを持っていました。ババです！`)
  }
  const turn = phase === 'playing' ? nextActive({ ...g, hands }, drawer) : g.turn
  return { hands, turn, finished, phase, log: log.slice(-6), pairs, loser }
}

function loadNum(key: string): number {
  try {
    return Number(localStorage.getItem(key) ?? '0') || 0
  } catch {
    return 0
  }
}

export default function Babanuki() {
  const [g, setG] = useState<GState | null>(null)
  const [sel, setSel] = useState(0)
  const [wins, setWins] = useState(() => loadNum(WINS_KEY))
  const [loses, setLoses] = useState(() => loadNum(LOSES_KEY))
  const recordedRef = useRef(false)

  const phase = g?.phase ?? 'title'
  const turn = g?.turn ?? 0
  const target = g ? nextActive(g, turn) : 1
  const myRank = g && g.finished.includes(0) ? g.finished.indexOf(0) + 1 : null
  const isBaba = g?.loser === 0

  // CPU の番：少し待ってから自動で引く
  useEffect(() => {
    if (!g || g.phase !== 'playing' || !PLAYERS[g.turn].cpu) return
    const t = setTimeout(() => {
      setG((prev) => {
        if (!prev || prev.phase !== 'playing' || !PLAYERS[prev.turn].cpu) return prev
        const tgt = nextActive(prev, prev.turn)
        const idx = Math.floor(Math.random() * prev.hands[tgt].length)
        beep(440, 0.06, 0.04)
        return applyDraw(prev, prev.turn, idx)
      })
    }, 1100)
    return () => clearTimeout(t)
  }, [g])

  // 終了時の勝敗記録（1回だけ）
  useEffect(() => {
    if (!g || g.phase !== 'done' || recordedRef.current) return
    recordedRef.current = true
    if (g.loser === 0) {
      const n = loadNum(LOSES_KEY) + 1
      try { localStorage.setItem(LOSES_KEY, String(n)) } catch { /* 保存できなくても遊べる */ }
      setLoses(n)
      beep(196, 0.3, 0.06)
    } else {
      const n = loadNum(WINS_KEY) + 1
      try { localStorage.setItem(WINS_KEY, String(n)) } catch { /* 保存できなくても遊べる */ }
      setWins(n)
      fanfare()
    }
  }, [g])

  const start = () => {
    recordedRef.current = false
    setSel(0)
    setG(newGame())
    beep(660, 0.1, 0.05)
  }

  const drawFrom = (idx: number) => {
    if (!g || g.phase !== 'playing' || turn !== 0) return
    beep(520, 0.06, 0.04)
    setG((prev) => (prev ? applyDraw(prev, 0, idx) : prev))
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!g || g.phase !== 'playing' || turn !== 0) return
    const n = g.hands[target].length
    if (n === 0) return
    if (e.key === 'ArrowLeft') { e.preventDefault(); setSel((s) => (s - 1 + n) % n) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setSel((s) => (s + 1) % n) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drawFrom(sel) }
  }

  if (!g) {
    return (
      <div className="babanuki" tabIndex={0}>
        <h2>👻 ババ抜き</h2>
        <p>ジョーカー入りのトランプで遊ぶババ抜き。自分＋CPU 3人の4人対戦です。</p>
        <div className="babanuki-rules">
          <p>🃏 カードを配ったら、最初のペアは自動で捨てます。</p>
          <p>👉 自分の番になったら、次の人の伏せ札から1枚引いてください。</p>
          <p>✨ 引いた札が手札とペアになれば自動で捨てます。</p>
          <p>🏆 手札が0枚になったらあがり。最後にジョーカーを持っていた人がババ（負け）です。</p>
        </div>
        <p>通算成績： {wins} 勝 {loses} 敗（ババ）</p>
        <button className="babanuki-start" onClick={start}>ゲームスタート</button>
        <p className="babanuki-hint">キーボード：←→で引く札を選び、Enter／Spaceで引く</p>
      </div>
    )
  }

  const myHand = sortHand(g.hands[0])
  return (
    <div className="babanuki" tabIndex={0} onKeyDown={onKey}>
      <div className="babanuki-head">
        <span>👻 ババ抜き</span>
        <span>通算 {wins} 勝 {loses} 敗</span>
        <button onClick={start}>はじめから</button>
      </div>

      {phase === 'done' && (
        <div className="babanuki-result">
          {isBaba ? (
            <><strong>😱 ババです…</strong><p>ジョーカーがあなたの手札に残ってしまいました。また挑戦してみましょう！</p></>
          ) : (
            <><strong>🎉 {myRank}位であがり！</strong><p>ババは {PLAYERS[g.loser ?? 0].name} でした。おめでとうございます！</p></>
          )}
          <button className="babanuki-start" onClick={start}>もう一度遊ぶ</button>
        </div>
      )}

      <div className="babanuki-opps">
        {[1, 2, 3].map((p) => {
          const finishedRank = g.finished.includes(p) ? g.finished.indexOf(p) + 1 : null
          const isTarget = phase === 'playing' && target === p
          return (
            <div key={p} className={`babanuki-opp${isTarget ? ' target' : ''}${g.loser === p ? ' baba' : ''}`}>
              <div className="babanuki-opp-name">
                {PLAYERS[p].name}
                {finishedRank ? ` 🎉${finishedRank}位` : g.loser === p ? ' 😱ババ' : ` 残り${g.hands[p].length}枚`}
              </div>
              <div className="babanuki-backs">
                {g.hands[p].slice(0, 10).map((_, i) => (
                  <span key={i} className="babanuki-back">🂠</span>
                ))}
                {g.hands[p].length > 10 && <span className="babanuki-more">+{g.hands[p].length - 10}</span>}
              </div>
              {isTarget && phase === 'playing' && turn === 0 && (
                <div className="babanuki-target-msg">👉 この人から1枚引いてください</div>
              )}
              {isTarget && phase === 'playing' && turn !== 0 && (
                <div className="babanuki-target-msg">{PLAYERS[turn].name} が引く番です…</div>
              )}
            </div>
          )
        })}
      </div>

      {phase === 'playing' && turn === 0 && (
        <div className="babanuki-draw">
          <p>{PLAYERS[target].name} の伏せ札から1枚選んで引く（←→キーでも選べます）</p>
          <div className="babanuki-pick">
            {g.hands[target].map((_, i) => (
              <button
                key={i}
                className={`babanuki-pick-card${sel === i ? ' sel' : ''}`}
                onClick={() => { setSel(i); drawFrom(i) }}
                aria-label={`${i + 1}枚目を引く`}
              >🂠</button>
            ))}
          </div>
        </div>
      )}
      {phase === 'playing' && turn !== 0 && (
        <p className="babanuki-wait">{PLAYERS[turn].name} の番です…</p>
      )}

      <div className="babanuki-myhand">
        <div className="babanuki-myhand-head">あなたの手札（{g.hands[0].length}枚）{myRank ? ` 🎉${myRank}位であがり` : ''}</div>
        <div className="babanuki-cards">
          {myHand.map((c, i) => (
            <span key={i} className={`babanuki-card${c.suit === '♥' || c.suit === '♦' ? ' red' : ''}${c.suit === 'JOKER' ? ' joker' : ''}`}>
              <span className="babanuki-rank">{rankLabel(c.rank)}</span>
              <span className="babanuki-suit">{c.suit === 'JOKER' ? '👻' : c.suit}</span>
            </span>
          ))}
          {g.hands[0].length === 0 && <span>手札はありません 🎉</span>}
        </div>
      </div>

      <div className="babanuki-log">
        {g.log.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  )
}
