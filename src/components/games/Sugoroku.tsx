import { useEffect, useRef, useState } from 'react'

/* ================= すごろく =================
 * ボードゲームのすごろく。自分＋CPU 3人（ミオ・ケン・ユウ）の4人対戦。
 * ・40マスのボード（スタート→ゴール）。サイコロをふって進む
 * ・ゴールはちょうどで止まる必要があり、行き過ぎると跳ね返る
 * ・イベントマス：進む／戻る／もう1回／1回休み／スタートに戻る
 * ・先にゴールした人の勝ち。勝利数・最少ターン数を保存 */

const PLAYERS = [
  { name: 'あなた', color: '#ef4444', emoji: '🔴' },
  { name: 'ミオ', color: '#3b82f6', emoji: '🔵' },
  { name: 'ケン', color: '#22c55e', emoji: '🟢' },
  { name: 'ユウ', color: '#eab308', emoji: '🟡' },
]

const GOAL = 39 // マス番号 0〜39（0=スタート、39=ゴール）

type EventKind = 'forward' | 'back' | 'again' | 'rest' | 'start'
type BoardEvent = { kind: EventKind; n: number; icon: string; label: string }

const EVENTS: Record<number, BoardEvent> = {
  5: { kind: 'forward', n: 3, icon: '🍀', label: 'ラッキー！3マス進む' },
  9: { kind: 'back', n: 3, icon: '💧', label: 'ぬかるみ！3マス戻る' },
  13: { kind: 'again', n: 0, icon: '🎲', label: 'もう1回ふれる！' },
  17: { kind: 'forward', n: 5, icon: '💨', label: '追い風！5マス進む' },
  22: { kind: 'rest', n: 0, icon: '😴', label: 'お昼寝…1回休み' },
  26: { kind: 'start', n: 0, icon: '🌀', label: '落とし穴！スタートに戻る' },
  30: { kind: 'forward', n: 2, icon: '⭐', label: '2マス進む' },
  33: { kind: 'back', n: 5, icon: '🌊', label: '川に流された！5マス戻る' },
  36: { kind: 'again', n: 0, icon: '🎲', label: 'もう1回ふれる！' },
}

const WINS_KEY = 'webx-sugoroku-wins'
const LOSES_KEY = 'webx-sugoroku-loses'
const BEST_KEY = 'webx-sugoroku-best' // 最少勝利ターン数

type Phase = 'idle' | 'playing' | 'won' | 'lost'

type GameState = {
  phase: Phase
  positions: number[]
  turn: number // 0=自分、1〜3=CPU
  dice: number
  rolling: boolean
  message: string
  turns: number // 自分の手番の回数
  skip: boolean[] // 次の手番を休むか
  winner: number // -1 = 未定
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

function loadNum(key: string): number {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v >= 0 ? v : 0
  } catch {
    return 0
  }
}

function saveNum(key: string, v: number) {
  try { localStorage.setItem(key, String(v)) } catch { /* 保存できなくても遊べる */ }
}

const DICE_FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

/** 表示上の（行, 列）からマス番号へ（8列×5行、蛇行） */
function cellIndex(r: number, c: number): number {
  const base = r * 8
  return r % 2 === 0 ? base + c : base + (7 - c)
}

export default function Sugoroku() {
  const [g, setG] = useState<GameState | null>(null)
  const [wins, setWins] = useState(() => loadNum(WINS_KEY))
  const [loses, setLoses] = useState(() => loadNum(LOSES_KEY))
  const [best, setBest] = useState(() => loadNum(BEST_KEY))
  const gRef = useRef<GameState | null>(null)
  const timerRef = useRef<number | null>(null)
  const recordedRef = useRef(false)
  gRef.current = g

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  const startGame = () => {
    recordedRef.current = false
    setG({
      phase: 'playing',
      positions: [0, 0, 0, 0],
      turn: 0,
      dice: 1,
      rolling: false,
      message: 'あなたの番です。サイコロをふってください。',
      turns: 0,
      skip: [false, false, false, false],
      winner: -1,
    })
  }

  /** イベントマスを適用し、最終位置とメッセージ・再投・休みの情報を返す */
  const applyEvent = (pos: number, who: number): { pos: number; again: boolean; rest: boolean; msg: string } => {
    const ev = EVENTS[pos]
    if (!ev) return { pos, again: false, rest: false, msg: '' }
    const name = PLAYERS[who].name
    switch (ev.kind) {
      case 'forward': {
        const np = Math.min(GOAL, pos + ev.n)
        return { pos: np, again: false, rest: false, msg: `${name}は${ev.label}（${pos + 1}→${np + 1}マス目）` }
      }
      case 'back': {
        const np = Math.max(0, pos - ev.n)
        return { pos: np, again: false, rest: false, msg: `${name}は${ev.label}（${pos + 1}→${np + 1}マス目）` }
      }
      case 'again':
        return { pos, again: true, rest: false, msg: `${name}は${ev.label}` }
      case 'rest':
        return { pos, again: false, rest: true, msg: `${name}は${ev.label}` }
      case 'start':
        return { pos: 0, again: false, rest: false, msg: `${name}は${ev.label}` }
    }
  }

  const finishGame = (winner: number, cur: GameState) => {
    const youWon = winner === 0
    if (youWon) {
      fanfare()
      setWins((w) => { const v = w + 1; saveNum(WINS_KEY, v); return v })
      if (!recordedRef.current) {
        recordedRef.current = true
        const t = cur.turns
        if (t > 0 && (best === 0 || t < best)) {
          setBest(t)
          saveNum(BEST_KEY, t)
        }
      }
    } else {
      beep(220, 0.3, 0.06)
      setLoses((l) => { const v = l + 1; saveNum(LOSES_KEY, v); return v })
    }
    setG({ ...cur, phase: youWon ? 'won' : 'lost', winner, rolling: false,
      message: youWon ? `🎉 あなたの勝利！${cur.turns}ターンでゴールしました！` : `🏁 ${PLAYERS[winner].name}がゴール！あなたの負けです…` })
  }

  /** 1手番を進める（サイコロをふって移動・イベント適用・手番交代） */
  const doTurn = (cur: GameState) => {
    const who = cur.turn
    const dice = 1 + Math.floor(Math.random() * 6)
    beep(660, 0.06, 0.05)
    let pos = cur.positions[who] + dice
    let bounced = false
    if (pos > GOAL) {
      pos = GOAL - (pos - GOAL)
      bounced = true
    }
    const ev = applyEvent(pos, who)
    pos = ev.pos
    const positions = [...cur.positions]
    positions[who] = pos
    const skip = [...cur.skip]
    if (ev.rest) skip[who] = true
    const turns = who === 0 ? cur.turns + 1 : cur.turns
    let msg = `${PLAYERS[who].name}は${dice}が出た！${pos + 1}マス目へ${bounced ? '（跳ね返った）' : ''}`
    if (ev.msg) msg += ` ${ev.msg}`
    if (pos === GOAL) {
      finishGame(who, { ...cur, positions, skip, turns, dice, message: msg })
      return
    }
    if (ev.again) beep(880, 0.1, 0.06)
    const nextTurn = ev.again ? who : (who + 1) % 4
    const next: GameState = { ...cur, positions, skip, turns, dice, turn: nextTurn,
      message: msg + (ev.again ? ` ${PLAYERS[who].name}はもう1回ふれます。` : '') }
    setG(next)
    scheduleNext(next)
  }

  /** 次の手番への進行（CPUは自動、休みの人はスキップ） */
  const scheduleNext = (cur: GameState) => {
    if (cur.phase !== 'playing') return
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    const who = cur.turn
    if (cur.skip[who]) {
      const skip = [...cur.skip]
      skip[who] = false
      const next: GameState = { ...cur, skip, turn: (who + 1) % 4,
        message: `${PLAYERS[who].name}はお休みのため1回パスします。` }
      setG(next)
      timerRef.current = window.setTimeout(() => scheduleNext(next), 1100)
      return
    }
    if (who === 0) return // 自分の番はボタン／キー待ち
    timerRef.current = window.setTimeout(() => {
      const latest = gRef.current
      if (!latest || latest.phase !== 'playing') return
      doTurn(latest)
    }, 1300)
  }

  const rollDice = () => {
    const cur = gRef.current
    if (!cur || cur.phase !== 'playing' || cur.turn !== 0 || cur.rolling || cur.skip[0]) return
    // サイコロのアニメーション
    setG({ ...cur, rolling: true })
    let n = 0
    const iv = window.setInterval(() => {
      n++
      const latest = gRef.current
      if (!latest) { window.clearInterval(iv); return }
      setG({ ...latest, dice: 1 + Math.floor(Math.random() * 6) })
      if (n >= 6) {
        window.clearInterval(iv)
        const after = gRef.current
        if (!after || after.phase !== 'playing') return
        setG({ ...after, rolling: false })
        // 少し待ってから移動を確定
        timerRef.current = window.setTimeout(() => {
          const c = gRef.current
          if (c && c.phase === 'playing') doTurn(c)
        }, 250)
      }
    }, 90)
  }

  // キーボード：Space／Enterでサイコロをふる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        const cur = gRef.current
        if (cur && cur.phase === 'playing' && cur.turn === 0 && !cur.rolling) {
          e.preventDefault()
          rollDice()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ゲーム開始直後とCPUターンの進行
  useEffect(() => {
    if (g && g.phase === 'playing' && g.turn !== 0 && !g.rolling) scheduleNext(g)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g?.turn, g?.phase])

  const boardCells: number[] = []
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) boardCells.push(cellIndex(r, c))

  return (
    <div className="sugoroku">
      <h2>🎲 すごろく</h2>
      <div className="sugoroku-head">
        <span>🏆 勝ち {wins} ／ 負け {loses}</span>
        {best > 0 && <span>⏱ 最速ゴール {best}ターン</span>}
        {g && g.phase !== 'idle' && <button onClick={startGame}>はじめから</button>}
      </div>

      {!g && (
        <div className="sugoroku-rules">
          <p>40マスのボードをサイコロで進むボードゲーム。自分＋CPU 3人の4人対戦です。</p>
          <p>🎯 ゴールはちょうどで止まる必要があり、行き過ぎると跳ね返ります。</p>
          <p>🍀⭐💨 進むマス ／ 💧🌊 戻るマス ／ 🎲 もう1回 ／ 😴 1回休み ／ 🌀 スタートに戻る</p>
          <p>先にゴールした人の勝ち！Spaceキーでもサイコロをふれます。</p>
          <button className="sugoroku-start" onClick={startGame}>ゲームスタート</button>
        </div>
      )}

      {g && (
        <>
          <div className="sugoroku-board">
            {boardCells.map((i) => {
              const ev = EVENTS[i]
              const here = g.positions.map((p, pi) => (p === i ? pi : -1)).filter((x) => x >= 0)
              return (
                <div key={i} className={`sugoroku-cell${i === GOAL ? ' goal' : ''}${ev ? ' event' : ''}${i === 0 ? ' start' : ''}`}>
                  <span className="sugoroku-num">{i === 0 ? 'START' : i === GOAL ? '🏁' : i + 1}</span>
                  {ev && <span className="sugoroku-ev">{ev.icon}</span>}
                  <span className="sugoroku-tokens">
                    {here.map((pi) => <span key={pi} title={PLAYERS[pi].name}>{PLAYERS[pi].emoji}</span>)}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="sugoroku-status">
            {PLAYERS.map((p, i) => (
              <div key={p.name} className={`sugoroku-player${g.turn === i && g.phase === 'playing' ? ' active' : ''}`}>
                <span>{p.emoji} {p.name}</span>
                <strong>{g.positions[i] + 1}マス目</strong>
                {g.skip[i] && <span className="sugoroku-rest">😴休み</span>}
              </div>
            ))}
          </div>

          <div className="sugoroku-dice-area">
            <div className="sugoroku-dice">{DICE_FACE[g.dice]}</div>
            {g.phase === 'playing' && g.turn === 0 && !g.skip[0] && (
              <button className="sugoroku-roll" onClick={rollDice} disabled={g.rolling}>
                {g.rolling ? 'ころがり中…' : '🎲 サイコロをふる'}
              </button>
            )}
            {g.phase === 'playing' && g.turn !== 0 && (
              <span className="sugoroku-wait">{PLAYERS[g.turn].name}の番です…</span>
            )}
            {g.phase === 'playing' && g.turn === 0 && g.skip[0] && (
              <span className="sugoroku-wait">あなたはお休みのためパスします…</span>
            )}
          </div>

          <div className="sugoroku-msg">{g.message}</div>

          {(g.phase === 'won' || g.phase === 'lost') && (
            <div className="sugoroku-result">
              <p>{g.phase === 'won' ? '🎉 あなたの勝利です！' : `🏁 ${PLAYERS[g.winner].name}の勝利でした。`}</p>
              <button className="sugoroku-start" onClick={startGame}>もう1回遊ぶ</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
