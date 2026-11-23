import { useCallback, useEffect, useRef, useState } from 'react'

/* ================= カルタ =================
 * 読み札（ヒント文）に合う絵札を場から取るカルタ取りゲーム。
 * ・読み札が表示され、音声でも読まれる（端末の音声読み上げ）
 * ・正しい絵札をタップすると取れて100点。違う札はお手つき（ミス）
 * ・ミス3回で終了。制限時間内に全部取ればクリア（残り時間×10点ボーナス）
 * ・ヒントボタンは1ゲーム2回まで。正しい札を3秒だけ光らせる
 * ・難易度3段階（やさしい＝6枚・90秒／ふつう＝9枚・75秒／つよい＝12枚・60秒）
 * ・ベストスコア・クリア数・プレイ数を保存 */

type Difficulty = 'easy' | 'normal' | 'hard'
type Phase = 'idle' | 'playing' | 'paused' | 'clear' | 'over'

const DIFFS: Record<Difficulty, { label: string; cards: number; time: number }> = {
  easy: { label: 'やさしい', cards: 6, time: 90 },
  normal: { label: 'ふつう', cards: 9, time: 75 },
  hard: { label: 'つよい', cards: 12, time: 60 },
}

type Pair = { word: string; emoji: string; reading: string }

const PAIRS: Pair[] = [
  { word: 'ニワトリ', emoji: '🐔', reading: '朝になると「コケコッコー」と鳴く鳥は？' },
  { word: 'イヌ', emoji: '🐶', reading: '「ワンワン」と鳴いて、しっぽをふる動物は？' },
  { word: 'ネコ', emoji: '🐱', reading: '「ニャー」と鳴いて、毛づくろいが好きな動物は？' },
  { word: 'ウサギ', emoji: '🐰', reading: '耳が長くて、ぴょんぴょん跳ねる動物は？' },
  { word: 'パンダ', emoji: '🐼', reading: '竹を食べて、白と黒の毛の動物は？' },
  { word: 'ペンギン', emoji: '🐧', reading: '南極に住む、飛べないけど泳ぐのが得意な鳥は？' },
  { word: 'ゾウ', emoji: '🐘', reading: '鼻が長くて、耳が大きな動物は？' },
  { word: 'ライオン', emoji: '🦁', reading: 'たてがみが立派な、百獣の王は？' },
  { word: 'リンゴ', emoji: '🍎', reading: '赤くて丸く、シャキシャキした果物は？' },
  { word: 'バナナ', emoji: '🍌', reading: '黄色くて曲がった、サルが好きな果物は？' },
  { word: 'イチゴ', emoji: '🍓', reading: '赤くて小さく、種がつぶつぶの果物は？' },
  { word: 'ブドウ', emoji: '🍇', reading: '紫色の実が房になってなる果物は？' },
  { word: 'スイカ', emoji: '🍉', reading: '夏に食べる、緑の皮に赤い実の大きな果物は？' },
  { word: 'ケーキ', emoji: '🍰', reading: '誕生日にろうそくを立てて食べる甘いものは？' },
  { word: 'ピザ', emoji: '🍕', reading: '丸くてチーズがのった、イタリアの食べものは？' },
  { word: 'アイスクリーム', emoji: '🍦', reading: '冷たくて甘い、コーンにのせて食べるものは？' },
  { word: 'サクラ', emoji: '🌸', reading: '春にピンクの花を咲かせる日本の木は？' },
  { word: 'ヒマワリ', emoji: '🌻', reading: '夏に太陽のほうを向いて咲く大きな黄色い花は？' },
  { word: 'ユキ', emoji: '❄️', reading: '冬に空から降る、白くて冷たいものは？' },
  { word: 'タイヨウ', emoji: '☀️', reading: '朝に東からのぼる、明るくてあたたかいものは？' },
  { word: 'ニジ', emoji: '🌈', reading: '雨上がりに空にかかる、七色の橋は？' },
  { word: 'ツキ', emoji: '🌙', reading: '夜空に浮かぶ、満ち欠けするものは？' },
  { word: 'ホシ', emoji: '⭐', reading: '夜空にキラキラ光る、小さな光は？' },
  { word: 'ウミ', emoji: '🌊', reading: '波があって、魚がたくさん住む青いところは？' },
  { word: 'クルマ', emoji: '🚗', reading: '4つのタイヤで走る、乗りものは？' },
  { word: 'ヒコウキ', emoji: '✈️', reading: '空を飛ぶ、翼のある乗りものは？' },
  { word: 'フネ', emoji: '⛵', reading: '海や川を進む、水に浮かぶ乗りものは？' },
  { word: 'ロケット', emoji: '🚀', reading: '宇宙へ飛んでいく、火をふいて上がる乗りものは？' },
  { word: 'ギター', emoji: '🎸', reading: '弦をはじいて音を出す、楽器は？' },
  { word: 'サッカーボール', emoji: '⚽', reading: '足でける、白と黒のボールは？' },
  { word: 'ホン', emoji: '📚', reading: '字が書いてあって、読むものは？' },
  { word: 'カギ', emoji: '🔑', reading: 'ドアを開けるのに使う、小さな金属のものは？' },
]

const BEST_KEY = 'webx-karuta-best'
const CLEARS_KEY = 'webx-karuta-clears'
const GAMES_KEY = 'webx-karuta-games'

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

function speak(text: string) {
  try {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ja-JP'
    u.rate = 0.95
    window.speechSynthesis.speak(u)
  } catch {
    /* 読み上げできなくても遊べる */
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

export default function Karuta() {
  const [diff, setDiff] = useState<Difficulty>('normal')
  const [phase, setPhase] = useState<Phase>('idle')
  const [board, setBoard] = useState<Pair[]>([])
  const [order, setOrder] = useState<Pair[]>([])
  const [taken, setTaken] = useState<string[]>([])
  const [targetIdx, setTargetIdx] = useState(0)
  const [misses, setMisses] = useState(0)
  const [wrongFlash, setWrongFlash] = useState<string | null>(null)
  const [hintWord, setHintWord] = useState<string | null>(null)
  const [hintsLeft, setHintsLeft] = useState(2)
  const [timeLeft, setTimeLeft] = useState(0)
  const [score, setScore] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [msg, setMsg] = useState('')
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0) || 0)
  const [clears, setClears] = useState(() => Number(localStorage.getItem(CLEARS_KEY) ?? 0) || 0)
  const [games, setGames] = useState(() => Number(localStorage.getItem(GAMES_KEY) ?? 0) || 0)

  const phaseRef = useRef<Phase>('idle')
  const boardRef = useRef<Pair[]>([])
  const orderRef = useRef<Pair[]>([])
  const takenRef = useRef<string[]>([])
  const targetRef = useRef(0)
  const missesRef = useRef(0)
  const scoreRef = useRef(0)
  const timeRef = useRef(0)
  const cursorRef = useRef(0)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const diffRef = useRef<Difficulty>('normal')

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const finishGame = useCallback((cleared: boolean, finalScore: number) => {
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
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
    const picked = shuffle(PAIRS).slice(0, d.cards)
    const readingOrder = shuffle(picked)
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    boardRef.current = picked
    orderRef.current = readingOrder
    takenRef.current = []
    targetRef.current = 0
    missesRef.current = 0
    scoreRef.current = 0
    timeRef.current = d.time
    cursorRef.current = 0
    setBoard(picked)
    setOrder(readingOrder)
    setTaken([])
    setTargetIdx(0)
    setMisses(0)
    setWrongFlash(null)
    setHintWord(null)
    setHintsLeft(2)
    setTimeLeft(d.time)
    setScore(0)
    setCursor(0)
    setMsg('')
    setPhaseBoth('playing')
    beep(660, 0.1, 0.05)
    speak(readingOrder[0].reading)
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

  const onCard = useCallback((pair: Pair) => {
    if (phaseRef.current !== 'playing') return
    if (takenRef.current.includes(pair.word)) return
    const target = orderRef.current[targetRef.current]
    if (!target) return
    if (pair.word === target.word) {
      takenRef.current = [...takenRef.current, pair.word]
      scoreRef.current += 100
      setTaken(takenRef.current)
      setScore(scoreRef.current)
      beep(900 + takenRef.current.length * 60, 0.1, 0.05)
      if (takenRef.current.length === orderRef.current.length) {
        const bonus = timeRef.current * 10
        const total = scoreRef.current + bonus
        scoreRef.current = total
        setScore(total)
        finishGame(true, total)
      } else {
        targetRef.current += 1
        setTargetIdx(targetRef.current)
        speak(orderRef.current[targetRef.current].reading)
      }
    } else {
      missesRef.current += 1
      setMisses(missesRef.current)
      setWrongFlash(pair.word)
      beep(140, 0.2, 0.06)
      setTimeout(() => setWrongFlash((cur) => (cur === pair.word ? null : cur)), 500)
      if (missesRef.current >= 3) finishGame(false, scoreRef.current)
    }
  }, [finishGame])

  const useHint = useCallback(() => {
    if (phaseRef.current !== 'playing' || hintsLeft <= 0) return
    const target = orderRef.current[targetRef.current]
    if (!target) return
    setHintWord(target.word)
    setHintsLeft((h) => h - 1)
    beep(1200, 0.08, 0.04)
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    hintTimerRef.current = setTimeout(() => setHintWord(null), 3000)
  }, [hintsLeft])

  const repeatReading = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    const target = orderRef.current[targetRef.current]
    if (target) speak(target.reading)
  }, [])

  const togglePause = useCallback(() => {
    if (phaseRef.current === 'playing') {
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
      setPhaseBoth('paused')
    } else if (phaseRef.current === 'paused') {
      setPhaseBoth('playing')
      const target = orderRef.current[targetRef.current]
      if (target) speak(target.reading)
    }
  }, [setPhaseBoth])

  // キーボード：Enterで開始／Pで一時停止／数字キー・矢印キー＋Enterで札を取る
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (phaseRef.current === 'idle' || phaseRef.current === 'clear' || phaseRef.current === 'over') {
        if (e.key === 'Enter') startGame()
        return
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault()
        togglePause()
        return
      }
      if (phaseRef.current !== 'playing') return
      const cols = boardRef.current.length <= 6 ? 3 : 4
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const len = boardRef.current.length
        let next = cursorRef.current
        if (e.key === 'ArrowLeft') next = (next - 1 + len) % len
        if (e.key === 'ArrowRight') next = (next + 1) % len
        if (e.key === 'ArrowUp') next = (next - cols + len) % len
        if (e.key === 'ArrowDown') next = (next + cols) % len
        cursorRef.current = next
        setCursor(next)
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const pair = boardRef.current[cursorRef.current]
        if (pair) onCard(pair)
        return
      }
      const num = e.key === '0' ? 10 : /^[1-9]$/.test(e.key) ? Number(e.key) : -1
      if (num > 0) {
        const pair = boardRef.current[num - 1]
        if (pair) {
          cursorRef.current = num - 1
          setCursor(num - 1)
          onCard(pair)
        }
      }
    }
    window.addEventListener('keydown', onDown)
    return () => window.removeEventListener('keydown', onDown)
  }, [startGame, togglePause, onCard])

  const d = DIFFS[diff]
  const target = order[targetIdx]
  const playing = phase === 'playing' || phase === 'paused' || phase === 'clear' || phase === 'over'

  return (
    <div className="karuta">
      <h2>🎴 カルタ</h2>
      <div className="karuta-head">
        <span>スコア <b>{score}</b></span>
        <span>取った札 <b>{taken.length} / {board.length}</b></span>
        <span>残り時間 <b>{timeLeft}秒</b></span>
        <span>お手つき <b>{'❌'.repeat(misses) || '—'}</b></span>
        <span>ベスト <b>{best}</b></span>
      </div>
      {msg && <div className="karuta-msg">{msg}</div>}

      {phase === 'idle' && (
        <div className="karuta-rules">
          <p>読み札のヒントに合う絵札を場から取ろう！正しい札で100点。違う札はお手つきで、3回でゲームオーバー。</p>
          <p>読み札は音声でも読まれるよ（🔊ボタンでもう一度聞ける）。制限時間内に全部取ればクリア。残り時間×10点のボーナスつき。</p>
          <p>ヒントボタンは1ゲーム2回まで。正しい札を3秒だけ光らせるよ。</p>
          <div className="karuta-diff">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((k) => (
              <button key={k} className={diff === k ? 'karuta-diff-on' : ''} onClick={() => { setDiff(k); diffRef.current = k }}>
                {DIFFS[k].label}（{DIFFS[k].cards}枚・{DIFFS[k].time}秒）
              </button>
            ))}
          </div>
          <div className="karuta-start-row">
            <button className="karuta-start" onClick={startGame}>スタート</button>
          </div>
          <p className="karuta-best">ベスト：{best}点 ／ クリア：{clears}回 ／ プレイ数：{games}回</p>
        </div>
      )}

      {playing && target && (
        <>
          <div className="karuta-reading">
            <div className="karuta-reading-label">読み札 {targetIdx + 1} / {order.length}</div>
            <div className="karuta-reading-text">「{target.reading}」</div>
            <button className="karuta-speak" onClick={repeatReading} disabled={phase !== 'playing'}>🔊 もう一度聞く</button>
          </div>
          <div className="karuta-board" style={{ gridTemplateColumns: `repeat(${board.length <= 6 ? 3 : 4}, 1fr)` }}>
            {board.map((pair, i) => {
              const isTaken = taken.includes(pair.word)
              const isHint = hintWord === pair.word
              const isWrong = wrongFlash === pair.word
              const isCursor = cursor === i && phase === 'playing'
              return (
                <button
                  key={pair.word}
                  className={`karuta-card${isTaken ? ' karuta-taken' : ''}${isHint ? ' karuta-hint' : ''}${isWrong ? ' karuta-wrong' : ''}${isCursor ? ' karuta-cursor' : ''}`}
                  onClick={() => onCard(pair)}
                  disabled={phase !== 'playing' || isTaken}
                  aria-label={`${pair.word}の札`}
                >
                  <span className="karuta-emoji">{isTaken ? '✅' : pair.emoji}</span>
                  <span className="karuta-word">{pair.word}</span>
                  <span className="karuta-num">{i + 1 <= 10 ? i + 1 : ''}</span>
                </button>
              )
            })}
          </div>
          <div className="karuta-ctrl">
            <button onClick={useHint} disabled={phase !== 'playing' || hintsLeft <= 0}>💡 ヒント（残り{hintsLeft}回）</button>
            <button onClick={togglePause}>{phase === 'paused' ? '▶ 再開' : '⏸ 一時停止'}</button>
          </div>
          {phase === 'paused' && <div className="karuta-overlay">一時停止中（Pで再開）</div>}
          {(phase === 'clear' || phase === 'over') && (
            <div className="karuta-result">
              {phase === 'clear' ? '🎉 クリア！' : '⏰ ゲームオーバー'}
              <br />
              スコア {score}点 ／ 取った札 {taken.length} / {board.length}
              <br />
              <button onClick={startGame}>もう一度</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
