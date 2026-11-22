import { useEffect, useMemo, useState } from 'react'

// ================= ソリティア（クロンダイク） =================
// 52枚を7列に配り、A→Kの順に同じマークを4つの組札へ集める定番カードゲーム。
// カードをタップして選択→移動先をタップで移動。ダブルクリック（ダブルタップ）で
// 組札へ自動移動。山札は1枚ずつめくる。1手戻る・ベストタイム保存付き。
type Suit = 'S' | 'H' | 'D' | 'C'

interface Card {
  suit: Suit
  rank: number // 1=A, 11=J, 12=Q, 13=K
  faceUp: boolean
}

interface GameState {
  tableau: Card[][]
  foundations: Card[][]
  stock: Card[]
  waste: Card[]
}

const SUITS: Suit[] = ['S', 'H', 'D', 'C']
const SUIT_MARK: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
const SUIT_NAME: Record<Suit, string> = { S: 'スペード', H: 'ハート', D: 'ダイヤ', C: 'クラブ' }
const BEST_KEY = 'webx-solitaire-best'

function rankLabel(rank: number): string {
  return rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : String(rank)
}

function isRed(c: Card): boolean {
  return c.suit === 'H' || c.suit === 'D'
}

function cloneState(s: GameState): GameState {
  return {
    tableau: s.tableau.map((p) => p.map((c) => ({ ...c }))),
    foundations: s.foundations.map((p) => p.map((c) => ({ ...c }))),
    stock: s.stock.map((c) => ({ ...c })),
    waste: s.waste.map((c) => ({ ...c })),
  }
}

function newGameState(): GameState {
  const deck: Card[] = []
  for (const suit of SUITS) for (let rank = 1; rank <= 13; rank++) deck.push({ suit, rank, faceUp: false })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const tableau: Card[][] = Array.from({ length: 7 }, () => [])
  let k = 0
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const c = deck[k++]
      tableau[col].push({ ...c, faceUp: row === col })
    }
  }
  return { tableau, foundations: [[], [], [], []], stock: deck.slice(k), waste: [] }
}

// 場札への配置可否（空列はKのみ、 otherwise 色違いで1つ小さい数字）
function canStackTableau(card: Card, pile: Card[]): boolean {
  const top = pile[pile.length - 1]
  if (!top) return card.rank === 13
  return isRed(card) !== isRed(top) && card.rank === top.rank - 1
}

// 組札への配置可否（空きはAのみ、 otherwise 同じマークで1つ大きい数字）
function canStackFoundation(card: Card, pile: Card[]): boolean {
  const top = pile[pile.length - 1]
  if (!top) return card.rank === 1
  return card.suit === top.suit && card.rank === top.rank + 1
}

function fmtTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

interface Selection {
  from: 'tableau' | 'waste'
  pile: number
  index: number
}

export function Solitaire() {
  const [game, setGame] = useState<GameState>(() => newGameState())
  const [history, setHistory] = useState<GameState[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)
  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [started, setStarted] = useState(false)
  const [best, setBest] = useState<number | null>(() => {
    const v = Number(localStorage.getItem(BEST_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  })
  const [msg, setMsg] = useState('')

  const won = useMemo(() => game.foundations.reduce((n, p) => n + p.length, 0) === 52, [game])

  // 経過時間（開始後・クリア前のみ進む）
  useEffect(() => {
    if (!started || won) return
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [started, won])

  // クリア時にベストタイムを保存
  useEffect(() => {
    if (!won) return
    setBest((prev) => {
      if (prev === null || seconds < prev) {
        localStorage.setItem(BEST_KEY, String(seconds))
        return seconds
      }
      return prev
    })
  }, [won, seconds])

  // Uキーで1手戻る
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'u' && !(e.target as HTMLElement).closest('input, textarea')) undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history])

  const applyMove = (next: GameState) => {
    setHistory((h) => [...h.slice(-199), cloneState(game)])
    setGame(next)
    setMoves((m) => m + 1)
    setStarted(true)
    setSelection(null)
    setMsg('')
  }

  const undo = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setGame(cloneState(prev))
    setMoves((m) => Math.max(0, m - 1))
    setSelection(null)
    setMsg('')
    setHistory(history.slice(0, -1))
  }

  const newGame = () => {
    setGame(newGameState())
    setHistory([])
    setSelection(null)
    setMoves(0)
    setSeconds(0)
    setStarted(false)
    setMsg('')
  }

  // 山札をめくる（空なら捨て札を山札へ戻す）
  const drawStock = () => {
    if (won) return
    const next = cloneState(game)
    if (next.stock.length === 0) {
      if (next.waste.length === 0) return
      next.stock = next.waste.reverse().map((c) => ({ ...c, faceUp: false }))
      next.waste = []
    } else {
      const c = next.stock.pop()!
      next.waste.push({ ...c, faceUp: true })
    }
    applyMove(next)
  }

  // 選択中のカード群（場札の途中から・捨て札の1枚）
  const selectedCards = (): Card[] | null => {
    if (!selection) return null
    if (selection.from === 'waste') return game.waste.length > 0 ? [game.waste[game.waste.length - 1]] : null
    return game.tableau[selection.pile].slice(selection.index)
  }

  // 選択中のカード群を場札の列へ移動する
  const moveSelectionToTableau = (pile: number): boolean => {
    const cards = selectedCards()
    if (!cards || cards.length === 0) return false
    if (selection!.from === 'tableau' && selection!.pile === pile) return false
    if (!canStackTableau(cards[0], game.tableau[pile])) return false
    const next = cloneState(game)
    if (selection!.from === 'waste') next.waste.pop()
    else next.tableau[selection!.pile].splice(selection!.index)
    next.tableau[pile].push(...cards)
    flipExposed(next)
    applyMove(next)
    return true
  }

  // 選択中のカード1枚を組札へ移動する（複数枚選択時は不可）
  const moveSelectionToFoundation = (fi: number): boolean => {
    const cards = selectedCards()
    if (!cards || cards.length !== 1) return false
    if (!canStackFoundation(cards[0], game.foundations[fi])) return false
    const next = cloneState(game)
    if (selection!.from === 'waste') next.waste.pop()
    else next.tableau[selection!.pile].splice(selection!.index)
    next.foundations[fi].push(cards[0])
    flipExposed(next)
    applyMove(next)
    return true
  }

  // 場札の列の末尾をめくる（移動後に表向きのカードが無くなった場合）
  const flipExposed = (next: GameState) => {
    for (const pile of next.tableau) {
      const top = pile[pile.length - 1]
      if (top && !top.faceUp) top.faceUp = true
    }
  }

  // 場札のカードをタップ：選択中なら移動を試み、そうでなければ選択する
  const onTableauCard = (pile: number, index: number) => {
    if (won) return
    const card = game.tableau[pile][index]
    if (!card.faceUp) return
    if (selection) {
      if (selection.from === 'tableau' && selection.pile === pile && selection.index === index) {
        setSelection(null)
        return
      }
      if (moveSelectionToTableau(pile)) return
      setSelection({ from: 'tableau', pile, index })
      return
    }
    setSelection({ from: 'tableau', pile, index })
  }

  // 場札の空列をタップ：選択中のKの並びを移動する
  const onTableauEmpty = (pile: number) => {
    if (won || !selection) return
    if (!moveSelectionToTableau(pile)) setMsg('空の列にはKしか置けません')
  }

  // 捨て札の1番上をタップ：選択中なら移動先として扱い、そうでなければ選択する
  const onWasteCard = () => {
    if (won || game.waste.length === 0) return
    if (selection?.from === 'waste') {
      setSelection(null)
      return
    }
    if (selection) {
      // 捨て札は移動先にならないので選択を切り替える
      setSelection({ from: 'waste', pile: 0, index: game.waste.length - 1 })
      return
    }
    setSelection({ from: 'waste', pile: 0, index: game.waste.length - 1 })
  }

  // 組札をタップ：選択中のカードを置く
  const onFoundation = (fi: number) => {
    if (won || !selection) return
    if (!moveSelectionToFoundation(fi)) setMsg('そのカードはここには置けません')
  }

  // ダブルクリック／ダブルタップで自動移動（組札優先、次に場札）
  const autoMove = (from: 'tableau' | 'waste', pile: number, index: number) => {
    if (won) return
    const cards = from === 'waste'
      ? (game.waste.length > 0 ? [game.waste[game.waste.length - 1]] : [])
      : game.tableau[pile].slice(index)
    if (cards.length === 0) return
    const saved = selection
    setSelection({ from, pile, index })
    // 組札へ（1枚のときだけ）
    if (cards.length === 1) {
      for (let fi = 0; fi < 4; fi++) {
        if (canStackFoundation(cards[0], game.foundations[fi])) {
          // setSelection直後の state を使うため selection を直接渡す形で実行する
          const next = cloneState(game)
          if (from === 'waste') next.waste.pop()
          else next.tableau[pile].splice(index)
          next.foundations[fi].push(cards[0])
          flipExposed(next)
          applyMove(next)
          return
        }
      }
    }
    // 場札へ（空列にはKの並びだけ）
    for (let tp = 0; tp < 7; tp++) {
      if (from === 'tableau' && tp === pile) continue
      if (canStackTableau(cards[0], game.tableau[tp])) {
        const next = cloneState(game)
        if (from === 'waste') next.waste.pop()
        else next.tableau[pile].splice(index)
        next.tableau[tp].push(...cards)
        flipExposed(next)
        applyMove(next)
        return
      }
    }
    setSelection(saved)
    setMsg('移動できる場所がありません')
  }

  const isSelected = (from: 'tableau' | 'waste', pile: number, index: number): boolean => {
    if (!selection || selection.from !== from || selection.pile !== pile) return false
    if (from === 'waste') return index === game.waste.length - 1
    return index >= selection.index
  }

  const renderCard = (c: Card, key: string, opts: { pile: number; index: number; from: 'tableau' | 'waste'; onTap: () => void; onDouble: () => void; overlap: boolean }) => {
    if (!c.faceUp) {
      return (
        <div key={key} className={`sol-card sol-card-back${opts.overlap ? ' sol-overlap' : ''}`}>
          <span className="sol-back-mark">♠</span>
        </div>
      )
    }
    const sel = isSelected(opts.from, opts.pile, opts.index)
    return (
      <div
        key={key}
        className={`sol-card${isRed(c) ? ' sol-red' : ''}${sel ? ' sol-selected' : ''}${opts.overlap ? ' sol-overlap' : ''}`}
        onClick={opts.onTap}
        onDoubleClick={opts.onDouble}
        role="button"
        aria-label={`${rankLabel(c.rank)} ${SUIT_NAME[c.suit]}`}
      >
        <span className="sol-corner">{rankLabel(c.rank)}{SUIT_MARK[c.suit]}</span>
        <span className="sol-center">{SUIT_MARK[c.suit]}</span>
      </div>
    )
  }

  const wasteTop = game.waste[game.waste.length - 1]

  return (
    <div className="sol-root">
      <div className="sol-toolbar">
        <button className="btn" onClick={newGame}>新しいゲーム</button>
        <button className="btn" onClick={undo} disabled={history.length === 0}>1手戻る (U)</button>
        <span className="sol-stats">手数 {moves} ／ {fmtTime(seconds)}{best !== null && ` ／ ベスト ${fmtTime(best)}`}</span>
      </div>
      {won && (
        <div className="sol-win">🎉 クリア！ {moves}手・{fmtTime(seconds)}で上がりました{best !== null && seconds <= best ? '（ベスト更新！）' : ''}</div>
      )}
      {msg && <p className="sol-msg">{msg}</p>}
      <div className="sol-top">
        <div
          className="sol-slot"
          onClick={drawStock}
          role="button"
          aria-label={game.stock.length > 0 ? `山札 ${game.stock.length}枚` : '山札を戻す'}
          title={game.stock.length > 0 ? `山札（残り${game.stock.length}枚）` : '捨て札を山札へ戻す'}
        >
          {game.stock.length > 0 ? (
            <div className="sol-card sol-card-back"><span className="sol-back-mark">♠</span><span className="sol-stock-n">{game.stock.length}</span></div>
          ) : (
            <span className="sol-empty-mark">↻</span>
          )}
        </div>
        <div className="sol-slot">
          {wasteTop ? renderCard(wasteTop, wasteTop.suit + String(wasteTop.rank), {
            pile: 0, index: game.waste.length - 1, from: 'waste',
            onTap: onWasteCard,
            onDouble: () => autoMove('waste', 0, game.waste.length - 1),
            overlap: false,
          }) : <span className="sol-empty-mark">－</span>}
        </div>
        <div className="sol-gap" />
        {game.foundations.map((pile, fi) => {
          const top = pile[pile.length - 1]
          return (
            <div key={fi} className="sol-slot" onClick={() => onFoundation(fi)} role="button" aria-label={`組札 ${SUIT_NAME[SUITS[fi]]}`}>
              {top ? (
                <div className={`sol-card${isRed(top) ? ' sol-red' : ''}`}>
                  <span className="sol-corner">{rankLabel(top.rank)}{SUIT_MARK[top.suit]}</span>
                  <span className="sol-center">{SUIT_MARK[top.suit]}</span>
                </div>
              ) : (
                <span className="sol-empty-mark">{SUIT_MARK[SUITS[fi]]}</span>
              )}
            </div>
          )
        })}
      </div>
      <div className="sol-tableau">
        {game.tableau.map((pile, pi) => (
          <div key={pi} className="sol-column" onClick={pile.length === 0 ? () => onTableauEmpty(pi) : undefined}>
            {pile.length === 0 ? (
              <div className="sol-slot sol-slot-empty"><span className="sol-empty-mark">K</span></div>
            ) : (
              pile.map((c, ci) => renderCard(c, `${c.suit}${c.rank}@${pi}-${ci}`, {
                pile: pi, index: ci, from: 'tableau',
                onTap: () => onTableauCard(pi, ci),
                onDouble: () => autoMove('tableau', pi, ci),
                overlap: ci > 0,
              }))
            )}
          </div>
        ))}
      </div>
      <p className="game-hint">カードをタップして選び、移動先をタップします。ダブルタップで組札へ自動移動。山札をタップで1枚めくります（空になったらタップで戻す）。</p>
    </div>
  )
}
