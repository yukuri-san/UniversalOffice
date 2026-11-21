import { useRef, useState } from 'react'

/* ---------- サイコロ ---------- */
const PIPS: Record<number, string> = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' }
export function Dice() {
  const [count, setCount] = useState(2)
  const [dice, setDice] = useState<number[]>([3, 5])
  const [rolling, setRolling] = useState(false)
  const timer = useRef<number | null>(null)
  const roll = () => {
    if (timer.current) window.clearInterval(timer.current)
    setRolling(true)
    timer.current = window.setInterval(() => {
      setDice(Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6)))
    }, 60)
    window.setTimeout(() => {
      if (timer.current) window.clearInterval(timer.current)
      setDice(Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6)))
      setRolling(false)
    }, 600)
  }
  return (
    <div className="sa-app">
      <div className="sa-dice">{dice.map((d, i) => <span key={i}>{PIPS[d]}</span>)}</div>
      <div className="sa-big">合計 {dice.reduce((a, b) => a + b, 0)}</div>
      <div className="sa-row">
        <label>個数
          <select value={count} onChange={(e) => { const n = Number(e.target.value); setCount(n); setDice(Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6))) }}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}個</option>)}
          </select>
        </label>
        <button className="btn accent" onClick={roll} disabled={rolling}>振る</button>
      </div>
    </div>
  )
}

/* ---------- じゃんけん ---------- */
const HANDS = ['✊ グー', '✌️ チョキ', '🖐 パー']
export function Janken() {
  const [mine, setMine] = useState<number | null>(null)
  const [cpu, setCpu] = useState<number | null>(null)
  const [score, setScore] = useState({ w: 0, l: 0, d: 0 })
  const play = (h: number) => {
    const c = Math.floor(Math.random() * 3)
    setMine(h); setCpu(c)
    setScore((s) => {
      if (h === c) return { ...s, d: s.d + 1 }
      if ((h - c + 3) % 3 === 2) return { ...s, w: s.w + 1 }
      return { ...s, l: s.l + 1 }
    })
  }
  const result = mine === null || cpu === null ? '' : mine === cpu ? 'あいこ' : (mine - cpu + 3) % 3 === 2 ? '勝ち！' : '負け…'
  return (
    <div className="sa-app">
      <div className="sa-row sa-center">
        <div className="sa-hand"><div className="sa-hand-emoji">{mine === null ? '❓' : HANDS[mine].split(' ')[0]}</div><div>あなた</div></div>
        <div className="sa-vs">VS</div>
        <div className="sa-hand"><div className="sa-hand-emoji">{cpu === null ? '❓' : HANDS[cpu].split(' ')[0]}</div><div>CPU</div></div>
      </div>
      <div className="sa-big sa-center">{result || '手を選んでください'}</div>
      <div className="sa-row sa-center">
        {HANDS.map((h, i) => <button key={h} className="btn" onClick={() => play(i)}>{h}</button>)}
      </div>
      <p className="sa-note">{score.w}勝 {score.l}敗 {score.d}分け</p>
    </div>
  )
}

/* ---------- 数当てゲーム ---------- */
export function NumGuess() {
  const [target, setTarget] = useState(() => 1 + Math.floor(Math.random() * 100))
  const [guess, setGuess] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const reset = () => { setTarget(1 + Math.floor(Math.random() * 100)); setLog([]); setGuess(''); setDone(false) }
  const tryGuess = () => {
    const n = Number(guess)
    if (!Number.isFinite(n) || guess.trim() === '') return
    const msg = n === target ? `🎉 正解！ ${log.length + 1}回で当てました` : n < target ? `${n} → もっと大きい` : `${n} → もっと小さい`
    setLog((l) => [msg, ...l])
    if (n === target) setDone(true)
    setGuess('')
  }
  return (
    <div className="sa-app">
      <p className="sa-note">1〜100 の数を当ててください。</p>
      <div className="sa-row">
        <input type="number" min={1} max={100} value={guess} onChange={(e) => setGuess(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') tryGuess() }} disabled={done} placeholder="数字を入力" />
        <button className="btn accent" onClick={tryGuess} disabled={done}>予想</button>
        <button className="btn" onClick={reset}>リセット</button>
      </div>
      <div className="sa-log">{log.map((m, i) => <div key={i}>{m}</div>)}</div>
    </div>
  )
}

/* ---------- おみくじ ---------- */
const FORTUNES: { name: string; msg: string }[] = [
  { name: '大吉', msg: '最高の一日になりそう。思い切って挑戦を。' },
  { name: '中吉', msg: '良い流れ。コツコツ進めば実ります。' },
  { name: '小吉', msg: '小さな幸せが見つかる日。' },
  { name: '吉', msg: '穏やかに過ごせる一日。' },
  { name: '末吉', msg: '後半から上向き。焦らずに。' },
  { name: '凶', msg: '慎重に。無理は禁物です。' },
  { name: '大凶', msg: '今日は守りの日。早めに休もう。' },
]
export function Omikuji() {
  const [result, setResult] = useState<typeof FORTUNES[number] | null>(null)
  const [count, setCount] = useState(0)
  const draw = () => {
    const r = Math.random()
    const idx = r < 0.18 ? 0 : r < 0.38 ? 1 : r < 0.55 ? 2 : r < 0.72 ? 3 : r < 0.86 ? 4 : r < 0.95 ? 5 : 6
    setResult(FORTUNES[idx]); setCount((c) => c + 1)
  }
  return (
    <div className="sa-app sa-center-col">
      {result ? (<><div className="sa-fortune">{result.name}</div><p>{result.msg}</p></>) : <p className="sa-note">ボタンを押しておみくじを引こう。</p>}
      <button className="btn accent" onClick={draw}>おみくじを引く</button>
      {count > 0 && <p className="sa-note">今日 {count} 回引きました</p>}
    </div>
  )
}
