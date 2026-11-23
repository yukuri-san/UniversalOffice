import { useCallback, useEffect, useRef, useState } from 'react'

/* ================= フルーツキャッチ =================
 * 上から落ちてくるフルーツをカゴでキャッチするゲーム。
 * ・←→キー・ドラッグ・ボタンでカゴを動かす
 * ・フルーツを取ると得点。連続キャッチでコンボ倍率アップ
 * ・💣を取るとライフ-1。フルーツを落としてもライフ-1
 * ・ライフ3つ。取った数でレベルが上がり落下が速くなる
 * ・ベストスコアとプレイ数を保存 */

const W = 320
const H = 420
const BASKET_W = 64
const BASKET_H = 34
const BASKET_Y = H - BASKET_H - 6

type Difficulty = 'easy' | 'normal' | 'hard'
type Phase = 'idle' | 'playing' | 'paused' | 'over'
type Kind = 'fruit' | 'bomb' | 'gold'
type Item = { id: number; kind: Kind; emoji: string; x: number; y: number; vy: number; pts: number }

const DIFFS: Record<Difficulty, { label: string; speed: number; bombRate: number; spawnMs: number }> = {
  easy: { label: 'やさしい', speed: 2.2, bombRate: 0.08, spawnMs: 900 },
  normal: { label: 'ふつう', speed: 3.0, bombRate: 0.14, spawnMs: 750 },
  hard: { label: 'つよい', speed: 3.8, bombRate: 0.2, spawnMs: 620 },
}

const FRUITS: { emoji: string; pts: number }[] = [
  { emoji: '🍎', pts: 10 },
  { emoji: '🍊', pts: 10 },
  { emoji: '🍌', pts: 10 },
  { emoji: '🍓', pts: 20 },
  { emoji: '🍇', pts: 20 },
  { emoji: '🍒', pts: 30 },
]

const BEST_KEY = 'webx-fruitcatch-best'
const GAMES_KEY = 'webx-fruitcatch-games'

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

export default function FruitCatch() {
  const [diff, setDiff] = useState<Difficulty>('normal')
  const [phase, setPhase] = useState<Phase>('idle')
  const [items, setItems] = useState<Item[]>([])
  const [basketX, setBasketX] = useState((W - BASKET_W) / 2)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [caught, setCaught] = useState(0)
  const [msg, setMsg] = useState('')
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0) || 0)
  const [games, setGames] = useState(() => Number(localStorage.getItem(GAMES_KEY) ?? 0) || 0)

  const itemsRef = useRef<Item[]>([])
  const basketRef = useRef((W - BASKET_W) / 2)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const livesRef = useRef(3)
  const caughtRef = useRef(0)
  const levelRef = useRef(1)
  const phaseRef = useRef<Phase>('idle')
  const diffRef = useRef<Difficulty>('normal')
  const moveRef = useRef(0) // -1: 左, 0: 止まる, 1: 右
  const nextIdRef = useRef(1)
  const lastSpawnRef = useRef(0)
  const boardRef = useRef<HTMLDivElement>(null)

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const spawnItem = useCallback(() => {
    const d = DIFFS[diffRef.current]
    const r = Math.random()
    let item: Item
    if (r < d.bombRate) {
      item = { id: nextIdRef.current++, kind: 'bomb', emoji: '💣', x: 0, y: -30, vy: 0, pts: 0 }
    } else if (r < d.bombRate + 0.06) {
      item = { id: nextIdRef.current++, kind: 'gold', emoji: '⭐', x: 0, y: -30, vy: 0, pts: 50 }
    } else {
      const f = FRUITS[Math.floor(Math.random() * FRUITS.length)]
      item = { id: nextIdRef.current++, kind: 'fruit', emoji: f.emoji, x: 0, y: -30, vy: 0, pts: f.pts }
    }
    const speed = d.speed + (levelRef.current - 1) * 0.35
    item.vy = speed * (0.85 + Math.random() * 0.4)
    item.x = 12 + Math.random() * (W - 40)
    itemsRef.current = [...itemsRef.current, item]
  }, [])

  const startGame = useCallback(() => {
    itemsRef.current = []
    basketRef.current = (W - BASKET_W) / 2
    scoreRef.current = 0
    comboRef.current = 0
    livesRef.current = 3
    caughtRef.current = 0
    levelRef.current = 1
    lastSpawnRef.current = 0
    setItems([])
    setBasketX(basketRef.current)
    setScore(0)
    setCombo(0)
    setLives(3)
    setLevel(1)
    setCaught(0)
    setMsg('')
    setPhaseBoth('playing')
    beep(660, 0.1, 0.05)
    boardRef.current?.focus()
  }, [setPhaseBoth])

  const gameOver = useCallback(() => {
    const s = scoreRef.current
    const g = games + 1
    setGames(g)
    localStorage.setItem(GAMES_KEY, String(g))
    if (s > best) {
      setBest(s)
      localStorage.setItem(BEST_KEY, String(s))
      setMsg(`新記録！ ${s}点！`)
    } else {
      setMsg('')
    }
    setPhaseBoth('over')
    beep(160, 0.3, 0.06)
  }, [best, games, setPhaseBoth])

  const loseLife = useCallback(() => {
    livesRef.current -= 1
    comboRef.current = 0
    setLives(livesRef.current)
    setCombo(0)
    beep(140, 0.2, 0.06)
    if (livesRef.current <= 0) gameOver()
  }, [gameOver])

  const togglePause = useCallback(() => {
    if (phaseRef.current === 'playing') setPhaseBoth('paused')
    else if (phaseRef.current === 'paused') setPhaseBoth('playing')
  }, [setPhaseBoth])

  // ゲームループ
  useEffect(() => {
    if (phase !== 'playing') return
    const id = setInterval(() => {
      // カゴの移動
      if (moveRef.current !== 0) {
        const nx = Math.max(0, Math.min(W - BASKET_W, basketRef.current + moveRef.current * 7))
        basketRef.current = nx
        setBasketX(nx)
      }
      // スポーン
      const now = Date.now()
      const d = DIFFS[diffRef.current]
      const spawnMs = Math.max(320, d.spawnMs - (levelRef.current - 1) * 40)
      if (now - lastSpawnRef.current >= spawnMs) {
        lastSpawnRef.current = now
        spawnItem()
      }
      // 落下と判定
      let over = false
      const next: Item[] = []
      for (const it of itemsRef.current) {
        const y = it.y + it.vy
        const inBasketY = y + 24 >= BASKET_Y && y + 24 <= BASKET_Y + BASKET_H + 8
        const inBasketX = it.x + 14 >= basketRef.current - 6 && it.x + 14 <= basketRef.current + BASKET_W + 6
        if (inBasketY && inBasketX) {
          if (it.kind === 'bomb') {
            loseLife()
            if (livesRef.current <= 0) over = true
          } else {
            comboRef.current += 1
            const mult = Math.min(5, 1 + Math.floor(comboRef.current / 3))
            scoreRef.current += it.pts * mult
            caughtRef.current += 1
            const lv = 1 + Math.floor(caughtRef.current / 10)
            if (lv !== levelRef.current) {
              levelRef.current = lv
              setLevel(lv)
              setMsg(`レベル${lv}！ 速くなったよ`)
            }
            setScore(scoreRef.current)
            setCombo(comboRef.current)
            setCaught(caughtRef.current)
            beep(it.kind === 'gold' ? 1200 : 700 + Math.min(300, comboRef.current * 20), 0.07, 0.05)
          }
          continue
        }
        if (y > H) {
          if (it.kind !== 'bomb') {
            loseLife()
            if (livesRef.current <= 0) over = true
          }
          continue
        }
        next.push({ ...it, y })
      }
      itemsRef.current = next
      setItems([...next])
      if (over) return
    }, 30)
    return () => clearInterval(id)
  }, [phase, loseLife, spawnItem])

  // キーボード操作
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (phaseRef.current === 'idle' || phaseRef.current === 'over') {
        if (e.key === 'Enter') startGame()
        return
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault()
        togglePause()
        return
      }
      if (phaseRef.current !== 'playing') return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        moveRef.current = -1
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        moveRef.current = 1
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && moveRef.current === -1) moveRef.current = 0
      if (e.key === 'ArrowRight' && moveRef.current === 1) moveRef.current = 0
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [startGame, togglePause])

  // ドラッグでカゴを動かす
  const onBoardPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== 'playing') return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const nx = Math.max(0, Math.min(W - BASKET_W, x - BASKET_W / 2))
    basketRef.current = nx
    setBasketX(nx)
  }

  const nudge = (dir: number) => {
    if (phaseRef.current !== 'playing') return
    const nx = Math.max(0, Math.min(W - BASKET_W, basketRef.current + dir * 28))
    basketRef.current = nx
    setBasketX(nx)
  }

  return (
    <div className="fruitcatch">
      <h2>🍎 フルーツキャッチ</h2>
      <div className="fruitcatch-head">
        <span>スコア <b>{score}</b></span>
        <span>コンボ <b>{combo}</b></span>
        <span>レベル <b>{level}</b></span>
        <span>ライフ <b>{'❤️'.repeat(Math.max(0, lives)) || '💔'}</b></span>
        <span>ベスト <b>{best}</b></span>
      </div>
      {msg && <div className="fruitcatch-msg">{msg}</div>}

      {phase === 'idle' && (
        <div className="fruitcatch-rules">
          <p>上から落ちてくるフルーツをカゴでキャッチしよう！</p>
          <p>🍎🍊🍌は10点、🍓🍇は20点、🍒は30点、⭐は50点。連続キャッチでコンボ倍率が上がるよ。</p>
          <p>💣を取るとライフが1つ減る。フルーツを落としてもライフが1つ減るよ。ライフは3つ。</p>
          <p>10個取るごとにレベルアップして落下が速くなるよ。</p>
          <p>操作：←→キーで移動／盤面をドラッグ／◀ ▶ボタン</p>
          <div className="fruitcatch-diff">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button key={d} className={diff === d ? 'fruitcatch-diff-on' : ''} onClick={() => { setDiff(d); diffRef.current = d }}>
                {DIFFS[d].label}
              </button>
            ))}
          </div>
          <div className="fruitcatch-start-row">
            <button className="fruitcatch-start" onClick={startGame}>スタート</button>
          </div>
          <p className="fruitcatch-best">ベスト：{best}点 ／ プレイ数：{games}回</p>
        </div>
      )}

      {(phase === 'playing' || phase === 'paused' || phase === 'over') && (
        <>
          <div
            className="fruitcatch-board"
            ref={boardRef}
            tabIndex={0}
            onPointerDown={onBoardPointer}
            onPointerMove={(e) => { if (e.buttons > 0) onBoardPointer(e) }}
          >
            {items.map((it) => (
              <div key={it.id} className="fruitcatch-item" style={{ left: it.x, top: it.y }}>
                {it.emoji}
              </div>
            ))}
            <div className="fruitcatch-basket" style={{ left: basketX }}>
              🧺
            </div>
            {phase === 'paused' && <div className="fruitcatch-overlay">一時停止中（Pで再開）</div>}
            {phase === 'over' && (
              <div className="fruitcatch-overlay">
                ゲームオーバー
                <br />
                スコア {score}点 ／ 取った数 {caught}個
                <br />
                <button onClick={(e) => { e.stopPropagation(); startGame() }}>もう一度</button>
              </div>
            )}
          </div>
          <div className="fruitcatch-ctrl">
            <button onPointerDown={() => { moveRef.current = -1 }} onPointerUp={() => { moveRef.current = 0 }} onPointerLeave={() => { moveRef.current = 0 }} onClick={() => nudge(-1)}>◀</button>
            <button onClick={togglePause}>{phase === 'paused' ? '▶ 再開' : '⏸ 一時停止'}</button>
            <button onPointerDown={() => { moveRef.current = 1 }} onPointerUp={() => { moveRef.current = 0 }} onPointerLeave={() => { moveRef.current = 0 }} onClick={() => nudge(1)}>▶</button>
          </div>
        </>
      )}
    </div>
  )
}
