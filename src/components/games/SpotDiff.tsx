import { useCallback, useEffect, useRef, useState } from 'react'

/* ================= 間違い探し =================
 * 左右2つの絵文字パネルを見比べて、違うマスをすべて見つけるゲーム。
 * ・違うマスをタップ／クリックすると ⭕ で記録、100点
 * ・違う場所ではないマスを押すとミス。ミス3回で終了
 * ・制限時間内に全部見つければクリア（残り時間×10点ボーナス）
 * ・ヒントボタンは1ゲーム2回まで。未発見の違いを1つだけ3秒間光らせる
 * ・難易度3段階（やさしい／ふつう／つよい）で盤面と違いの数が変わる
 * ・ベストスコア・クリア数・プレイ数を保存 */

type Difficulty = 'easy' | 'normal' | 'hard'
type Phase = 'idle' | 'playing' | 'paused' | 'clear' | 'over'

const DIFFS: Record<Difficulty, { label: string; cols: number; rows: number; diffCount: number; time: number }> = {
  easy: { label: 'やさしい', cols: 4, rows: 4, diffCount: 3, time: 90 },
  normal: { label: 'ふつう', cols: 5, rows: 4, diffCount: 5, time: 75 },
  hard: { label: 'つよい', cols: 6, rows: 5, diffCount: 7, time: 60 },
}

const THEMES: { label: string; emojis: string[] }[] = [
  { label: 'どうぶつ', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦄', '🐝'] },
  { label: 'たべもの', emojis: ['🍎', '🍊', '🍌', '🍓', '🍇', '🍉', '🍑', '🍒', '🥝', '🍍', '🥕', '🌽', '🍞', '🧀', '🍕', '🍔', '🍟', '🍩', '🍰', '🍦'] },
  { label: 'しぜん', emojis: ['🌸', '🌼', '🌻', '🌹', '🌷', '🍀', '🌲', '🌳', '🌴', '🌵', '🍄', '🌙', '⭐', '☀️', '☁️', '🌈', '⚡', '❄️', '🔥', '💧'] },
  { label: 'どうぐ', emojis: ['⚽', '🏀', '🎾', '🎲', '🎯', '🎮', '🎸', '🎺', '📷', '🔑', '💡', '📚', '✏️', '🎁', '🧸', '🚗', '✈️', '🚀', '⛵', '🏠'] },
]

const BEST_KEY = 'webx-spotdiff-best'
const CLEARS_KEY = 'webx-spotdiff-clears'
const GAMES_KEY = 'webx-spotdiff-games'

function beep(freq: number, dur = 0.08, vol = 0.05) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = freq
    g.gain.value = vol
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
    o.stop(ctx.currentTime + dur)
  } catch {
    /* 音が出なくても遊べる */
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

export default function SpotDiff() {
  const [diff, setDiff] = useState<Difficulty>('normal')
  const [phase, setPhase] = useState<Phase>('idle')
  const [left, setLeft] = useState<string[]>([])
  const [right, setRight] = useState<string[]>([])
  const [diffIdx, setDiffIdx] = useState<number[]>([])
  const [found, setFound] = useState<number[]>([])
  const [misses, setMisses] = useState(0)
  const [wrongFlash, setWrongFlash] = useState<number | null>(null)
  const [hintIdx, setHintIdx] = useState<number | null>(null)
  const [hintsLeft, setHintsLeft] = useState(2)
  const [timeLeft, setTimeLeft] = useState(0)
  const [score, setScore] = useState(0)
  const [theme, setTheme] = useState('')
  const [msg, setMsg] = useState('')
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0) || 0)
  const [clears, setClears] = useState(() => Number(localStorage.getItem(CLEARS_KEY) ?? 0) || 0)
  const [games, setGames] = useState(() => Number(localStorage.getItem(GAMES_KEY) ?? 0) || 0)

  const phaseRef = useRef<Phase>('idle')
  const diffRef = useRef<Difficulty>('normal')
  const diffIdxRef = useRef<number[]>([])
  const foundRef = useRef<number[]>([])
  const missesRef = useRef(0)
  const scoreRef = useRef(0)
  const timeRef = useRef(0)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const finishGame = useCallback((cleared: boolean, finalScore: number) => {
    const g = games + 1
    setGames(g)
    localStorage.setItem(GAMES_KEY, String(g))
    if (cleared) {
      const c = clears + 1
      setClears(c)
      localStorage.setItem(CLEARS_KEY, String(c))
    }
    if (finalScore > best) {
      setBest(finalScore)
      localStorage.setItem(BEST_KEY, String(finalScore))
      setMsg(cleared ? `クリア！ 新記録 ${finalScore}点！` : `新記録 ${finalScore}点！`)
    } else {
      setMsg(cleared ? `クリア！ ${finalScore}点！` : '')
    }
    setPhaseBoth(cleared ? 'clear' : 'over')
    beep(cleared ? 880 : 160, cleared ? 0.25 : 0.3, 0.06)
  }, [best, clears, games, setPhaseBoth])

  const startGame = useCallback(() => {
    const d = DIFFS[diffRef.current]
    const total = d.cols * d.rows
    const t = THEMES[Math.floor(Math.random() * THEMES.length)]
    const pool = shuffle(t.emojis)
    const base: string[] = []
    for (let i = 0; i < total; i++) base.push(pool[i % pool.length])
    const changed: number[] = shuffle(Array.from({ length: total }, (_, i) => i)).slice(0, d.diffCount)
    const alt = base.map((e, i) => {
      if (!changed.includes(i)) return e
      // 元と違う絵文字をプールから選ぶ
      const others = pool.filter((x) => x !== e)
      return others[Math.floor(Math.random() * others.length)]
    })
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    diffIdxRef.current = changed
    foundRef.current = []
    missesRef.current = 0
    scoreRef.current = 0
    timeRef.current = d.time
    setLeft(base)
    setRight(alt)
    setDiffIdx(changed)
    setFound([])
    setMisses(0)
    setWrongFlash(null)
    setHintIdx(null)
    setHintsLeft(2)
    setTimeLeft(d.time)
    setScore(0)
    setTheme(t.label)
    setMsg('')
    setPhaseBoth('playing')
    beep(660, 0.1, 0.05)
  }, [setPhaseBoth])

  // タイマー
  useEffect(() => {
    if (phase !== 'playing') return
    const id = setInterval(() => {
      timeRef.current -= 1
      setTimeLeft(timeRef.current)
      if (timeRef.current <= 0) {
        clearInterval(id)
        finishGame(false, scoreRef.current)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [phase, finishGame])

  const onCell = useCallback((idx: number) => {
    if (phaseRef.current !== 'playing') return
    if (foundRef.current.includes(idx)) return
    if (diffIdxRef.current.includes(idx)) {
      foundRef.current = [...foundRef.current, idx]
      scoreRef.current += 100
      setFound(foundRef.current)
      setScore(scoreRef.current)
      beep(900 + foundRef.current.length * 60, 0.1, 0.05)
      if (foundRef.current.length === diffIdxRef.current.length) {
        const bonus = timeRef.current * 10
        const total = scoreRef.current + bonus
        scoreRef.current = total
        setScore(total)
        finishGame(true, total)
      }
    } else {
      missesRef.current += 1
      setMisses(missesRef.current)
      setWrongFlash(idx)
      beep(140, 0.2, 0.06)
      setTimeout(() => setWrongFlash((cur) => (cur === idx ? null : cur)), 500)
      if (missesRef.current >= 3) finishGame(false, scoreRef.current)
    }
  }, [finishGame])

  const useHint = useCallback(() => {
    if (phaseRef.current !== 'playing' || hintsLeft <= 0) return
    const rest = diffIdxRef.current.filter((i) => !foundRef.current.includes(i))
    if (rest.length === 0) return
    const pick = rest[Math.floor(Math.random() * rest.length)]
    setHintIdx(pick)
    setHintsLeft((h) => h - 1)
    beep(1200, 0.08, 0.04)
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    hintTimerRef.current = setTimeout(() => setHintIdx(null), 3000)
  }, [hintsLeft])

  const togglePause = useCallback(() => {
    if (phaseRef.current === 'playing') setPhaseBoth('paused')
    else if (phaseRef.current === 'paused') setPhaseBoth('playing')
  }, [setPhaseBoth])

  // キーボード：Enterで開始／Pで一時停止
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (phaseRef.current === 'idle' || phaseRef.current === 'clear' || phaseRef.current === 'over') {
        if (e.key === 'Enter') startGame()
        return
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault()
        togglePause()
      }
    }
    window.addEventListener('keydown', onDown)
    return () => window.removeEventListener('keydown', onDown)
  }, [startGame, togglePause])

  const d = DIFFS[diff]
  const playing = phase === 'playing' || phase === 'paused' || phase === 'clear' || phase === 'over'

  return (
    <div className="spotdiff">
      <h2>🔍 間違い探し</h2>
      <div className="spotdiff-head">
        <span>スコア <b>{score}</b></span>
        <span>見つけた数 <b>{found.length} / {diffIdx.length}</b></span>
        <span>残り時間 <b>{timeLeft}秒</b></span>
        <span>ミス <b>{'❌'.repeat(misses) || '—'}</b></span>
        <span>ベスト <b>{best}</b></span>
      </div>
      {msg && <div className="spotdiff-msg">{msg}</div>}

      {phase === 'idle' && (
        <div className="spotdiff-rules">
          <p>左右の2つの絵文字パネルを見比べて、違うマスをすべて見つけよう！</p>
          <p>違うマスをタップすると⭕で記録され100点。違う場所ではないマスを押すとミスになり、ミス3回でゲームオーバー。</p>
          <p>制限時間内に全部見つければクリア。残り時間×10点のボーナスつき。</p>
          <p>ヒントボタンは1ゲーム2回まで。未発見の違いを3秒だけ光らせるよ。</p>
          <div className="spotdiff-diff">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((k) => (
              <button key={k} className={diff === k ? 'spotdiff-diff-on' : ''} onClick={() => { setDiff(k); diffRef.current = k }}>
                {DIFFS[k].label}（{DIFFS[k].diffCount}か所・{DIFFS[k].time}秒）
              </button>
            ))}
          </div>
          <div className="spotdiff-start-row">
            <button className="spotdiff-start" onClick={startGame}>スタート</button>
          </div>
          <p className="spotdiff-best">ベスト：{best}点 ／ クリア：{clears}回 ／ プレイ数：{games}回</p>
        </div>
      )}

      {playing && (
        <>
          <div className="spotdiff-theme">テーマ：{theme}　（{d.cols}×{d.rows}・違い{d.diffCount}か所）</div>
          <div className="spotdiff-boards">
            {([left, right] as const).map((board, bi) => (
              <div key={bi} className="spotdiff-board" style={{ gridTemplateColumns: `repeat(${d.cols}, 1fr)` }}>
                {board.map((emoji, i) => {
                  const isFound = found.includes(i)
                  const isHint = hintIdx === i
                  const isWrong = wrongFlash === i
                  return (
                    <button
                      key={i}
                      className={`spotdiff-cell${isFound ? ' spotdiff-found' : ''}${isHint ? ' spotdiff-hint' : ''}${isWrong ? ' spotdiff-wrong' : ''}`}
                      onClick={() => onCell(i)}
                      disabled={phase !== 'playing'}
                      aria-label={`マス${i + 1}`}
                    >
                      {isFound ? '⭕' : emoji}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="spotdiff-ctrl">
            <button onClick={useHint} disabled={phase !== 'playing' || hintsLeft <= 0}>💡 ヒント（残り{hintsLeft}回）</button>
            <button onClick={togglePause}>{phase === 'paused' ? '▶ 再開' : '⏸ 一時停止'}</button>
          </div>
          {phase === 'paused' && <div className="spotdiff-overlay">一時停止中（Pで再開）</div>}
          {(phase === 'clear' || phase === 'over') && (
            <div className="spotdiff-result">
              {phase === 'clear' ? '🎉 クリア！' : '⏰ ゲームオーバー'}
              <br />
              スコア {score}点 ／ 見つけた数 {found.length} / {diffIdx.length}
              <br />
              <button onClick={startGame}>もう一度</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
