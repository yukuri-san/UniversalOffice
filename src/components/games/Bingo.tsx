import { useEffect, useRef, useState } from 'react'

/* ================= ビンゴ =================
 * 5×5 のビンゴカードで遊ぶビンゴゲーム。
 * ・B(1-15) I(16-30) N(31-45) G(46-60) O(61-75) の列ごとに数字が並ぶ
 * ・「数字を引く」ボタン／Spaceキーで1〜75から数字を抽選（ルーレット演出つき）
 * ・引かれた数字がカードにあればタップしてマーク。中央はFREE
 * ・タテ・ヨコ・ナナメのどれか1ラインそろえばビンゴ！
 * ・ビンゴまでの抽選回数が少ないほどすごい。最少回数を保存 */

const COLS = ['B', 'I', 'N', 'G', 'O']
const BEST_KEY = 'webx-bingo-best'
const BEST_LINES_KEY = 'webx-bingo-lines'

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

type Phase = 'title' | 'playing' | 'done'

/** カードを生成する。card[r][c]、中央(2,2)は 0＝FREE */
function makeCard(): number[][] {
  const card: number[][] = []
  for (let r = 0; r < 5; r++) card.push([0, 0, 0, 0, 0])
  for (let c = 0; c < 5; c++) {
    const lo = c * 15 + 1
    const pool = Array.from({ length: 15 }, (_, i) => lo + i)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    for (let r = 0; r < 5; r++) card[r][c] = pool[r]
  }
  card[2][2] = 0 // FREE
  return card
}

function emptyMarked(): boolean[][] {
  const m = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => false))
  m[2][2] = true // FREE は最初からマーク済み
  return m
}

/** そろったラインを返す（0-4: 横、5-9: 縦、10: ＼、11: ／） */
function findLines(marked: boolean[][]): number[] {
  const lines: number[] = []
  for (let r = 0; r < 5; r++) if (marked[r].every(Boolean)) lines.push(r)
  for (let c = 0; c < 5; c++) if (marked.every((row) => row[c])) lines.push(5 + c)
  if ([0, 1, 2, 3, 4].every((i) => marked[i][i])) lines.push(10)
  if ([0, 1, 2, 3, 4].every((i) => marked[i][4 - i])) lines.push(11)
  return lines
}

/** ラインに含まれるマスかどうか */
function inLines(r: number, c: number, lines: number[]): boolean {
  return lines.some((l) => {
    if (l < 5) return r === l
    if (l < 10) return c === l - 5
    if (l === 10) return r === c
    return r + c === 4
  })
}

export default function Bingo() {
  const [phase, setPhase] = useState<Phase>('title')
  const [card, setCard] = useState<number[][]>(() => makeCard())
  const [marked, setMarked] = useState<boolean[][]>(() => emptyMarked())
  const [drawn, setDrawn] = useState<number[]>([])
  const [displayNum, setDisplayNum] = useState<number | null>(null)
  const [rolling, setRolling] = useState(false)
  const [lines, setLines] = useState<number[]>([])
  const [message, setMessage] = useState('カードを作ったよ。「スタート」でゲーム開始！')
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0 } catch { return 0 }
  })
  const [bestLines, setBestLines] = useState(() => {
    try { return Number(localStorage.getItem(BEST_LINES_KEY) ?? 0) || 0 } catch { return 0 }
  })
  const [elapsed, setElapsed] = useState(0)
  const startAtRef = useRef(0)
  const rollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const drawnRef = useRef(drawn)
  drawnRef.current = drawn
  const cardRef = useRef(card)
  cardRef.current = card

  useEffect(() => {
    return () => {
      if (rollTimerRef.current) clearInterval(rollTimerRef.current)
    }
  }, [])

  function startGame() {
    const c = makeCard()
    setCard(c)
    setMarked(emptyMarked())
    setDrawn([])
    setDisplayNum(null)
    setLines([])
    setElapsed(0)
    startAtRef.current = Date.now()
    setMessage('数字を引いて、カードの数字をタップしてマークしよう！')
    setPhase('playing')
    beep(660, 0.12, 0.06)
  }

  function newCard() {
    startGame()
  }

  function drawNumber() {
    if (phaseRef.current !== 'playing' || rolling) return
    const remaining = Array.from({ length: 75 }, (_, i) => i + 1).filter((n) => !drawnRef.current.includes(n))
    if (!remaining.length) return
    const picked = remaining[Math.floor(Math.random() * remaining.length)]
    setRolling(true)
    setMessage('抽選中…')
    // ルーレット演出：表示がくるくる変わってから確定する
    let ticks = 0
    rollTimerRef.current = setInterval(() => {
      ticks++
      setDisplayNum(1 + Math.floor(Math.random() * 75))
      if (ticks >= 10) {
        if (rollTimerRef.current) clearInterval(rollTimerRef.current)
        rollTimerRef.current = null
        setRolling(false)
        setDisplayNum(picked)
        const next = [...drawnRef.current, picked]
        setDrawn(next)
        const onCard = cardRef.current.some((row) => row.includes(picked))
        if (onCard) {
          beep(880, 0.15, 0.07)
          setMessage(`${picked} が出た！ カードにあったらタップしてマークしよう`)
        } else {
          beep(440, 0.1, 0.05)
          setMessage(`${picked} が出た。カードには無いよ。次を引こう`)
        }
      }
    }, 60)
  }

  function toggleMark(r: number, c: number) {
    if (phaseRef.current !== 'playing' || rolling) return
    if (r === 2 && c === 2) return // FREE は固定
    const n = card[r][c]
    if (!drawn.includes(n)) {
      setMessage(`${n} はまだ引かれていないよ。まず数字を引こう`)
      beep(220, 0.1, 0.05)
      return
    }
    const next = marked.map((row, ri) => row.map((v, ci) => (ri === r && ci === c ? !v : v)))
    setMarked(next)
    const found = findLines(next)
    setLines(found)
    if (found.length > 0) {
      const secs = Math.max(1, Math.round((Date.now() - startAtRef.current) / 1000))
      setElapsed(secs)
      setPhase('done')
      fanfare()
      const draws = drawn.length
      const newBest = best === 0 || draws < best
      if (newBest) {
        setBest(draws)
        try { localStorage.setItem(BEST_KEY, String(draws)) } catch { /* 保存できなくても遊べる */ }
      }
      if (found.length > bestLines) {
        setBestLines(found.length)
        try { localStorage.setItem(BEST_LINES_KEY, String(found.length)) } catch { /* 保存できなくても遊べる */ }
      }
      setMessage(`ビンゴ！ ${found.length}ラインそろったよ！ ${draws}回目の抽選・${secs}秒で達成${newBest ? '（最少回数を更新！）' : ''}`)
    } else {
      beep(740, 0.08, 0.06)
      setMessage(`${n} をマークしたよ`)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === ' ') e.preventDefault()
    if (e.key === ' ' && phaseRef.current === 'title') { startGame(); return }
    if (e.key === ' ' && phaseRef.current === 'done') { startGame(); return }
    if (e.key === ' ') drawNumber()
  }

  const drawnSet = new Set(drawn)
  const recent = drawn.slice(-8).reverse()

  return (
    <div className="bingo" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="bingo-head">
        <span>引いた数 <b>{drawn.length}</b> / 75</span>
        <span>ライン <b>{lines.length}</b></span>
        <span>最少回数 {best ? `${best}回` : '—'}</span>
        <span>最多ライン {bestLines ? `${bestLines}` : '—'}</span>
        {phase === 'done' && <span>タイム {elapsed}秒</span>}
      </div>
      <div className="bingo-draw">
        <div className={`bingo-ball${rolling ? ' rolling' : ''}`}>
          {displayNum === null ? '?' : displayNum}
        </div>
        <div className="bingo-draw-side">
          <button onClick={drawNumber} disabled={phase !== 'playing' || rolling}>
            {rolling ? '抽選中…' : '数字を引く'}
          </button>
          <p className="bingo-recent">
            {recent.length ? `最近：${recent.join('・')}` : 'まだ何も引いていないよ'}
          </p>
        </div>
      </div>
      <div className="bingo-board" role="grid" aria-label="ビンゴカード">
        <div className="bingo-row bingo-header">
          {COLS.map((col) => (
            <div key={col} className="bingo-col-label">{col}</div>
          ))}
        </div>
        {card.map((row, r) => (
          <div key={r} className="bingo-row">
            {row.map((n, c) => {
              const isFree = r === 2 && c === 2
              const isMarked = marked[r][c]
              const isDrawn = isFree || drawnSet.has(n)
              const onLine = isMarked && inLines(r, c, lines)
              return (
                <button
                  key={c}
                  className={`bingo-cell${isMarked ? ' marked' : ''}${!isMarked && isDrawn ? ' drawn' : ''}${onLine ? ' online' : ''}`}
                  onClick={() => toggleMark(r, c)}
                  disabled={phase !== 'playing'}
                  aria-label={isFree ? 'FREE' : String(n)}
                >
                  {isFree ? 'FREE' : n}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <p className="bingo-msg">{message}</p>
      <div className="bingo-btns">
        {phase === 'title' && <button onClick={startGame}>スタート</button>}
        {phase === 'playing' && <button onClick={newCard}>新しいカード</button>}
        {phase === 'done' && (
          <>
            <button onClick={startGame}>もう一度</button>
            <button onClick={() => setPhase('title')}>タイトルへ</button>
          </>
        )}
      </div>
      <p className="bingo-help">B・I・N・G・Oの列ごとに1〜75の数字が並ぶよ。「数字を引く」で抽選し、引かれた数字がカードにあればタップしてマーク。タテ・ヨコ・ナナメのどれか1ラインそろえばビンゴ！ 少ない抽選回数でのビンゴを目指そう。Spaceキーでも抽選できるよ。</p>
    </div>
  )
}
