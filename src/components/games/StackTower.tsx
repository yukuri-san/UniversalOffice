import { useCallback, useEffect, useRef, useState } from 'react'

/* ================= タワースタック =================
 * 左右にスライドするブロックをタイミングよく落として積み上げる。
 * ・タップ／クリック／Spaceで落とす。はみ出した部分は切り落とされる
 * ・ぴったり重なるとパーフェクト（コンボでボーナス）。外すとゲームオーバー
 * ・難易度で初期の幅と速度が変わる。積むほど少しずつ速くなる
 * ・ベストの高さとプレイ数を保存 */

const W = 300
const BH = 20
const H = 380
const PERFECT_PX = 5

type Difficulty = 'easy' | 'normal' | 'hard'
type Phase = 'idle' | 'playing' | 'paused' | 'over'
type Block = { x: number; w: number; c: number }
type Cur = { x: number; w: number; dir: number }

const DIFFS: Record<Difficulty, { label: string; startW: number; speed: number }> = {
  easy: { label: 'やさしい', startW: 220, speed: 2.0 },
  normal: { label: 'ふつう', startW: 180, speed: 2.8 },
  hard: { label: 'つよい', startW: 140, speed: 3.6 },
}

const PALETTE = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6', '#2dd4bf']
const BEST_KEY = 'webx-stacktower-best'
const GAMES_KEY = 'webx-stacktower-games'

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

export default function StackTower() {
  const [diff, setDiff] = useState<Difficulty>('normal')
  const [phase, setPhase] = useState<Phase>('idle')
  const [stack, setStack] = useState<Block[]>([])
  const [cur, setCur] = useState<Cur | null>(null)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [msg, setMsg] = useState('')
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0) || 0)
  const [games, setGames] = useState(() => Number(localStorage.getItem(GAMES_KEY) ?? 0) || 0)

  const stackRef = useRef<Block[]>([])
  const curRef = useRef<Cur | null>(null)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)
  const phaseRef = useRef<Phase>('idle')
  const diffRef = useRef<Difficulty>('normal')
  const sideRef = useRef(1)
  const wrapRef = useRef<HTMLDivElement>(null)

  const floors = stack.length > 0 ? stack.length - 1 : 0

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const startGame = useCallback(() => {
    const d = DIFFS[diffRef.current]
    const base: Block = { x: (W - d.startW) / 2, w: d.startW, c: 0 }
    stackRef.current = [base]
    curRef.current = { x: 0, w: d.startW, dir: 1 }
    sideRef.current = 1
    scoreRef.current = 0
    comboRef.current = 0
    setStack([...stackRef.current])
    setCur({ ...curRef.current })
    setScore(0)
    setCombo(0)
    setMsg('')
    setPhaseBoth('playing')
    beep(660, 0.1, 0.05)
    wrapRef.current?.focus()
  }, [setPhaseBoth])

  const gameOver = useCallback(() => {
    const f = stackRef.current.length - 1
    const g = games + 1
    setGames(g)
    localStorage.setItem(GAMES_KEY, String(g))
    if (f > best) {
      setBest(f)
      localStorage.setItem(BEST_KEY, String(f))
      setMsg(`新記録！ ${f}段！`)
    } else {
      setMsg('')
    }
    setPhaseBoth('over')
    beep(160, 0.3, 0.06)
  }, [best, games, setPhaseBoth])

  const drop = useCallback(() => {
    if (phaseRef.current !== 'playing' || !curRef.current) return
    const c = curRef.current
    const top = stackRef.current[stackRef.current.length - 1]
    const overlapL = Math.max(c.x, top.x)
    const overlapR = Math.min(c.x + c.w, top.x + top.w)
    if (overlapR - overlapL <= 0) {
      curRef.current = null
      setCur(null)
      gameOver()
      return
    }
    const perfect = Math.abs(c.x - top.x) <= PERFECT_PX
    const colorIdx = stackRef.current.length % PALETTE.length
    if (perfect) {
      comboRef.current += 1
      scoreRef.current += 1 + comboRef.current
      const nb: Block = { x: top.x, w: top.w, c: colorIdx }
      stackRef.current = [...stackRef.current, nb]
      setMsg(comboRef.current >= 2 ? `パーフェクト ${comboRef.current}連！` : 'パーフェクト！')
      beep(880, 0.1, 0.06)
      curRef.current = { x: 0, w: top.w, dir: 1 }
    } else {
      comboRef.current = 0
      scoreRef.current += 1
      const nb: Block = { x: overlapL, w: overlapR - overlapL, c: colorIdx }
      stackRef.current = [...stackRef.current, nb]
      setMsg('')
      beep(520, 0.07, 0.05)
      sideRef.current *= -1
      const w = nb.w
      curRef.current = sideRef.current === 1 ? { x: 0, w, dir: 1 } : { x: W - w, w, dir: -1 }
    }
    setStack([...stackRef.current])
    setCur(curRef.current ? { ...curRef.current } : null)
    setScore(scoreRef.current)
    setCombo(comboRef.current)
  }, [gameOver])

  const togglePause = useCallback(() => {
    if (phaseRef.current === 'playing') setPhaseBoth('paused')
    else if (phaseRef.current === 'paused') setPhaseBoth('playing')
  }, [setPhaseBoth])

  // スライドタイマー
  useEffect(() => {
    if (phase !== 'playing') return
    const id = setInterval(() => {
      const c = curRef.current
      if (!c) return
      const speed = DIFFS[diffRef.current].speed + (stackRef.current.length - 1) * 0.07
      let nx = c.x + c.dir * speed
      let dir = c.dir
      if (nx <= 0) {
        nx = 0
        dir = 1
      } else if (nx + c.w >= W) {
        nx = W - c.w
        dir = -1
      }
      curRef.current = { ...c, x: nx, dir }
      setCur({ ...curRef.current })
    }, 16)
    return () => clearInterval(id)
  }, [phase])

  // キーボード操作
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault()
        drop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drop, startGame, togglePause])

  const shift = Math.max(0, (stack.length + 1) * BH - H + 8)

  return (
    <div className="stacktower" ref={wrapRef} tabIndex={0}>
      <h2>🧱 タワースタック</h2>
      <div className="stacktower-head">
        <span>スコア <b>{score}</b></span>
        <span>高さ <b>{floors}段</b></span>
        <span>ベスト <b>{best}段</b></span>
      </div>
      {combo >= 2 && <div className="stacktower-combo">パーフェクト {combo}連！</div>}
      {msg && <div className="stacktower-msg">{msg}</div>}

      {phase === 'idle' && (
        <div className="stacktower-rules">
          <p>左右に動くブロックをタイミングよく落として、タワーを高く積み上げよう！</p>
          <p>はみ出した部分は切り落とされ、ブロックがどんどん細くなるよ。外すとゲームオーバー。</p>
          <p>ぴったり重なるとパーフェクト！連続で決めるとボーナスが増えるよ。</p>
          <p>操作：タップ／クリック／Spaceで落とす／P 一時停止</p>
          <div className="stacktower-diff">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button key={d} className={diff === d ? 'stacktower-diff-on' : ''} onClick={() => { setDiff(d); diffRef.current = d }}>
                {DIFFS[d].label}
              </button>
            ))}
          </div>
          <div className="stacktower-start-row">
            <button className="stacktower-start" onClick={startGame}>スタート</button>
          </div>
          <p className="stacktower-best">ベスト：{best}段 ／ プレイ数：{games}回</p>
        </div>
      )}

      {(phase === 'playing' || phase === 'paused' || phase === 'over') && (
        <>
          <div className="stacktower-board" onPointerDown={drop}>
            <div className="stacktower-tower" style={{ transform: `translateY(${-shift}px)` }}>
              {stack.map((b, i) => (
                <div
                  key={i}
                  className="stacktower-block"
                  style={{ left: b.x, bottom: i * BH, width: b.w, background: PALETTE[b.c % PALETTE.length] }}
                />
              ))}
              {cur && phase !== 'over' && (
                <div
                  className="stacktower-block stacktower-moving"
                  style={{ left: cur.x, bottom: stack.length * BH, width: cur.w, background: PALETTE[stack.length % PALETTE.length] }}
                />
              )}
            </div>
            {phase === 'paused' && <div className="stacktower-overlay">一時停止中（Pで再開）</div>}
            {phase === 'over' && (
              <div className="stacktower-overlay">
                ゲームオーバー
                <br />
                高さ {floors}段 ／ スコア {score}
                <br />
                <button onClick={(e) => { e.stopPropagation(); startGame() }}>もう一度</button>
              </div>
            )}
          </div>
          <div className="stacktower-ctrl">
            <button className="stacktower-drop" onClick={drop}>落とす</button>
            <button onClick={togglePause}>{phase === 'paused' ? '▶ 再開' : '⏸ 一時停止'}</button>
          </div>
        </>
      )}
    </div>
  )
}
