import { useEffect, useRef, useState } from 'react'

/* ================= スピード =================
 * トランプのスピード。自分 vs CPU（ミオ）のリアルタイム対戦。
 * ・52枚を26枚ずつ分け、手札4枚＋山札22枚ずつでスタート
 * ・場の2つの山に、手札から±1のカード（AとKはつながる）を出せる
 * ・早く手札と山札を0枚にした方が勝ち
 * ・どちらも出せなくなったら両方とも場に1枚ずつめくる
 * ・難易度でCPUの反応速度が変わる。勝利数・最速タイムを保存 */

type Suit = '♠' | '♥' | '♦' | '♣'
type CardT = { suit: Suit; rank: number } // rank: 1-13

const SUITS: Suit[] = ['♠', '♥', '♦', '♣']
const DIFFS = [
  { label: 'やさしい', delay: 1600 },
  { label: 'ふつう', delay: 1050 },
  { label: 'つよい', delay: 620 },
]

const WINS_KEY = 'webx-speed-wins'
const LOSES_KEY = 'webx-speed-loses'
const BEST_KEY = 'webx-speed-best' // 最速勝利タイム（秒）

type Phase = 'playing' | 'won' | 'lost' | 'draw'

type GameState = {
  phase: Phase
  playerHand: CardT[]
  playerDeck: CardT[]
  cpuHand: CardT[]
  cpuDeck: CardT[]
  field: [CardT, CardT]
  selected: number // 手札の選択位置（-1 = 未選択）
  targetPile: 0 | 1
  message: string
  startAt: number
  endElapsed: number // 終了時の経過秒
  difficulty: number
}

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

/** 場のカードに手札のカードを出せるか（±1、AとKはつながる） */
function playableOn(fieldCard: CardT, card: CardT): boolean {
  const d = (card.rank - fieldCard.rank + 13) % 13
  return d === 1 || d === 12
}

function loadNum(key: string): number {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v >= 0 ? v : 0
  } catch {
    return 0
  }
}

export default function Speed() {
  const [g, setG] = useState<GameState | null>(null)
  const [wins, setWins] = useState(() => loadNum(WINS_KEY))
  const [loses, setLoses] = useState(() => loadNum(LOSES_KEY))
  const [best, setBest] = useState(() => loadNum(BEST_KEY))
  const [difficulty, setDifficulty] = useState(1)
  const [now, setNow] = useState(() => Date.now())
  const gRef = useRef<GameState | null>(null)
  const nextCpuAt = useRef(0)
  const stuckSince = useRef(0)
  const recordedRef = useRef(false)
  gRef.current = g

  const startGame = (diff: number) => {
    const deck = makeDeck()
    const pCards = deck.slice(0, 26)
    const cCards = deck.slice(26)
    const field: [CardT, CardT] = [pCards[0], cCards[0]]
    setG({
      phase: 'playing',
      playerHand: pCards.slice(1, 5),
      playerDeck: pCards.slice(5),
      cpuHand: cCards.slice(1, 5),
      cpuDeck: cCards.slice(5),
      field,
      selected: -1,
      targetPile: 0,
      message: '場の山に±1のカードを出そう！',
      startAt: Date.now(),
      endElapsed: 0,
      difficulty: diff,
    })
    nextCpuAt.current = Date.now() + DIFFS[diff].delay
    stuckSince.current = 0
    recordedRef.current = false
    beep(660, 0.1, 0.06)
  }

  /** 終了時の成績記録（1回だけ） */
  useEffect(() => {
    if (!g || g.phase === 'playing' || recordedRef.current) return
    recordedRef.current = true
    if (g.phase === 'won') {
      const n = loadNum(WINS_KEY) + 1
      try { localStorage.setItem(WINS_KEY, String(n)) } catch { /* 保存できなくても遊べる */ }
      setWins(n)
      if (best === 0 || g.endElapsed < best) {
        setBest(g.endElapsed)
        try { localStorage.setItem(BEST_KEY, String(g.endElapsed)) } catch { /* 保存できなくても遊べる */ }
      }
      fanfare()
    } else if (g.phase === 'lost') {
      const n = loadNum(LOSES_KEY) + 1
      try { localStorage.setItem(LOSES_KEY, String(n)) } catch { /* 保存できなくても遊べる */ }
      setLoses(n)
      beep(220, 0.3, 0.06)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g?.phase])

  const finish = (phase: 'won' | 'lost' | 'draw', prev: GameState): GameState => {
    const elapsed = Math.max(1, Math.round((Date.now() - prev.startAt) / 1000))
    return {
      ...prev,
      phase,
      endElapsed: elapsed,
      message:
        phase === 'won'
          ? `勝ち！ ${elapsed}秒で手札をなくしたよ！`
          : phase === 'lost'
            ? `負け… ミオの方が先に手札をなくしたよ。`
            : `引き分け！ 残り枚数が同じだったよ。`,
    }
  }

  /** 選択中の手札を対象の山に出す */
  const playSelected = (pile: 0 | 1) => {
    const cur = gRef.current
    if (!cur || cur.phase !== 'playing' || cur.selected < 0) return
    const card = cur.playerHand[cur.selected]
    if (!card || !playableOn(cur.field[pile], card)) {
      beep(160, 0.1, 0.05)
      return
    }
    setG((prev) => {
      if (!prev || prev.phase !== 'playing' || prev.selected < 0) return prev
      const c = prev.playerHand[prev.selected]
      if (!c || !playableOn(prev.field[pile], c)) return prev
      const hand = prev.playerHand.filter((_, i) => i !== prev.selected)
      const deck = [...prev.playerDeck]
      if (deck.length > 0) hand.push(deck.shift()!)
      const field: [CardT, CardT] = [...prev.field]
      field[pile] = c
      const next: GameState = { ...prev, playerHand: hand, playerDeck: deck, field, selected: -1, message: `${cardName(c)} を出した！` }
      if (hand.length === 0 && deck.length === 0) return finish('won', next)
      return next
    })
    beep(880, 0.08, 0.06)
  }

  // 経過時間の表示用タイマー
  useEffect(() => {
    if (!g || g.phase !== 'playing') return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [g?.phase])

  // CPUの手番と、どちらも出せないときの場めくり
  useEffect(() => {
    if (!g || g.phase !== 'playing') return
    const id = setInterval(() => {
      const cur = gRef.current
      if (!cur || cur.phase !== 'playing') return
      const t = Date.now()
      const cpuMoves: { card: CardT; handIdx: number; pile: 0 | 1 }[] = []
      cur.cpuHand.forEach((c, i) => {
        if (playableOn(cur.field[0], c)) cpuMoves.push({ card: c, handIdx: i, pile: 0 })
        else if (playableOn(cur.field[1], c)) cpuMoves.push({ card: c, handIdx: i, pile: 1 })
      })
      const playerCan = cur.playerHand.some((c) => playableOn(cur.field[0], c) || playableOn(cur.field[1], c))
      if (cpuMoves.length > 0) {
        stuckSince.current = 0
        if (t >= nextCpuAt.current) {
          const mv = cpuMoves[Math.floor(Math.random() * cpuMoves.length)]
          nextCpuAt.current = t + DIFFS[cur.difficulty].delay + Math.random() * 400
          setG((prev) => {
            if (!prev || prev.phase !== 'playing') return prev
            const hand = prev.cpuHand.filter((_, i) => i !== mv.handIdx)
            const deck = [...prev.cpuDeck]
            if (deck.length > 0) hand.push(deck.shift()!)
            const field: [CardT, CardT] = [...prev.field]
            field[mv.pile] = mv.card
            const next: GameState = { ...prev, cpuHand: hand, cpuDeck: deck, field, message: `ミオが ${cardName(mv.card)} を出した！` }
            if (hand.length === 0 && deck.length === 0) return finish('lost', next)
            return next
          })
          beep(440, 0.06, 0.04)
        }
        return
      }
      // CPUも出せない
      if (playerCan) {
        stuckSince.current = 0
        return
      }
      // どちらも出せない → 少し待ってから場をめくる
      if (stuckSince.current === 0) {
        stuckSince.current = t
        return
      }
      if (t - stuckSince.current < 900) return
      stuckSince.current = 0
      setG((prev) => {
        if (!prev || prev.phase !== 'playing') return prev
        const pDeck = [...prev.playerDeck]
        const cDeck = [...prev.cpuDeck]
        if (pDeck.length === 0 && cDeck.length === 0) {
          const pLeft = prev.playerHand.length
          const cLeft = prev.cpuHand.length
          const next: GameState = { ...prev, message: 'どちらも出せないよ。' }
          if (pLeft < cLeft) return finish('won', next)
          if (cLeft < pLeft) return finish('lost', next)
          return finish('draw', next)
        }
        const field: [CardT, CardT] = [...prev.field]
        if (pDeck.length > 0) field[0] = pDeck.shift()!
        else if (cDeck.length > 0) field[0] = cDeck.shift()!
        if (cDeck.length > 0) field[1] = cDeck.shift()!
        else if (pDeck.length > 0) field[1] = pDeck.shift()!
        return { ...prev, playerDeck: pDeck, cpuDeck: cDeck, field, message: 'どちらも出せないので場をめくったよ！' }
      })
      beep(330, 0.1, 0.05)
    }, 300)
    return () => clearInterval(id)
  }, [g?.phase])

  // キーボード操作：1〜4で手札選択、←→で山の切替、Enter/Spaceで出す
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cur = gRef.current
      if (!cur || cur.phase !== 'playing') return
      if (e.key >= '1' && e.key <= '4') {
        const idx = Number(e.key) - 1
        if (idx < cur.playerHand.length) {
          setG((prev) => (prev ? { ...prev, selected: prev.selected === idx ? -1 : idx } : prev))
          beep(520, 0.05, 0.04)
        }
        e.preventDefault()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        setG((prev) => (prev ? { ...prev, targetPile: prev.targetPile === 0 ? 1 : 0 } : prev))
        e.preventDefault()
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (cur.selected >= 0) playSelected(cur.targetPile)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const elapsed = g && g.phase === 'playing' ? Math.floor((now - g.startAt) / 1000) : (g?.endElapsed ?? 0)

  return (
    <div className="speed" tabIndex={0}>
      <h2>⚡ スピード</h2>
      <div className="speed-head">
        <span>🏆 {wins}勝</span>
        <span>💧 {loses}敗</span>
        <span>⏱ 最速 {best > 0 ? `${best}秒` : '—'}</span>
        {g && g.phase === 'playing' && <span>⏳ {elapsed}秒</span>}
      </div>

      {!g ? (
        <div className="speed-rules">
          <p>リアルタイムのトランプ対戦！場の2つの山に、手札から±1のカードを出そう。</p>
          <p>AとKはつながるよ（Kの次はA、Aの前はK）。</p>
          <p>手札と山札を先に0枚にした方が勝ち。どちらも出せなくなったら場をめくるよ。</p>
          <p>操作：カードをタップして選び、場の山をタップして出す。キーボードは1〜4で選択、←→で山の切替、Enterで出す。</p>
          <div className="speed-diff">
            <span>難易度：</span>
            {DIFFS.map((d, i) => (
              <button key={d.label} className={difficulty === i ? 'sel' : ''} onClick={() => setDifficulty(i)}>
                {d.label}
              </button>
            ))}
          </div>
          <button className="speed-start" onClick={() => startGame(difficulty)}>ゲームスタート</button>
        </div>
      ) : (
        <>
          <div className="speed-cpu">
            <div className="speed-opp-name">🤖 ミオ（CPU）</div>
            <div className="speed-backs">
              {g.cpuHand.map((_, i) => (
                <span key={i}>🂠</span>
              ))}
            </div>
            <div className="speed-count">手札 {g.cpuHand.length}枚 ／ 山札 {g.cpuDeck.length}枚</div>
          </div>

          <div className="speed-field">
            <div className="speed-field-head">場の山（±1のカードを出せるよ）</div>
            <div className="speed-piles">
              {([0, 1] as const).map((pile) => {
                const card = g.field[pile]
                const selCard = g.selected >= 0 ? g.playerHand[g.selected] : null
                const canPlay = selCard ? playableOn(card, selCard) : false
                return (
                  <button
                    key={pile}
                    className={`speed-pile${g.targetPile === pile ? ' target' : ''}${canPlay ? ' ok' : ''}`}
                    onClick={() => {
                      if (g.selected >= 0) playSelected(pile)
                      else setG((prev) => (prev ? { ...prev, targetPile: pile } : prev))
                    }}
                    aria-label={`場の山${pile + 1} ${cardName(card)}`}
                  >
                    <span className="speed-pile-label">山{pile + 1}</span>
                    <span className={`speed-card big${card.suit === '♥' || card.suit === '♦' ? ' red' : ''}`}>
                      <span>{card.suit}</span>
                      <span>{rankLabel(card.rank)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <p className="speed-msg">{g.message}</p>

          <div className="speed-myhand">
            <div className="speed-myhand-head">あなたの手札（山札 {g.playerDeck.length}枚）</div>
            <div className="speed-cards">
              {g.playerHand.map((c, i) => {
                const playable = playableOn(g.field[0], c) || playableOn(g.field[1], c)
                return (
                  <button
                    key={`${c.suit}${c.rank}`}
                    className={`speed-card${c.suit === '♥' || c.suit === '♦' ? ' red' : ''}${playable ? ' playable' : ''}${g.selected === i ? ' sel' : ''}`}
                    onClick={() => setG((prev) => (prev ? { ...prev, selected: prev.selected === i ? -1 : i } : prev))}
                    aria-label={cardName(c)}
                  >
                    <span>{c.suit}</span>
                    <span>{rankLabel(c.rank)}</span>
                  </button>
                )
              })}
            </div>
            <p className="speed-hint">カードを選んで場の山をタップ（1〜4・←→・Enterでも操作できるよ）</p>
          </div>

          {g.phase !== 'playing' && (
            <div className="speed-result">
              <p>{g.message}</p>
              <p>🏆 {wins}勝 💧 {loses}敗 ／ 最速 {best > 0 ? `${best}秒` : '—'}</p>
              <button className="speed-start" onClick={() => startGame(g.difficulty)}>もう一度遊ぶ</button>
            </div>
          )}
          {g.phase === 'playing' && (
            <button className="speed-restart" onClick={() => startGame(g.difficulty)}>最初から</button>
          )}
        </>
      )}
    </div>
  )
}
