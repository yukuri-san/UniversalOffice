import { useEffect, useRef, useState } from 'react'

function load<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')
    return v ?? fallback
  } catch { return fallback }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignore */ }
}
const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ---------- 家計簿 ---------- */
interface KEntry { id: number; date: string; kind: 'in' | 'out'; cat: string; amount: number; memo: string }
const KCATS_OUT = ['食費', '交通', '日用品', '娯楽', '医療', 'その他']
const KCATS_IN = ['給料', '副収入', 'その他']
export function Kakeibo() {
  const [entries, setEntries] = useState<KEntry[]>(() => load('webx-kakeibo', []))
  const [month, setMonth] = useState(() => todayStr().slice(0, 7))
  const [kind, setKind] = useState<'in' | 'out'>('out')
  const [cat, setCat] = useState(KCATS_OUT[0])
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [date, setDate] = useState(todayStr())
  const persist = (next: KEntry[]) => { setEntries(next); save('webx-kakeibo', next) }
  const add = () => {
    const amt = Math.floor(Number(amount))
    if (!amt || amt <= 0) return
    persist([{ id: Date.now(), date, kind, cat, amount: amt, memo: memo.trim() }, ...entries])
    setAmount(''); setMemo('')
  }
  const inMonth = entries.filter((e) => e.date.startsWith(month))
  const sumIn = inMonth.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount, 0)
  const sumOut = inMonth.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount, 0)
  const byCat = KCATS_OUT.map((c) => ({ c, total: inMonth.filter((e) => e.kind === 'out' && e.cat === c).reduce((s, e) => s + e.amount, 0) })).filter((x) => x.total > 0)
  const shiftMonth = (d: number) => {
    const [y, m] = month.split('-').map(Number)
    const dt = new Date(y, m - 1 + d, 1)
    setMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`)
  }
  return (
    <div className="sa-app">
      <div className="sa-row">
        <button className="btn small" onClick={() => shiftMonth(-1)}>← 前月</button>
        <strong>{month.replace('-', '年')}月</strong>
        <button className="btn small" onClick={() => shiftMonth(1)}>次月 →</button>
      </div>
      <div className="sa-row">
        <span className="sa-cardrow">収入 <b>{yen(sumIn)}</b></span>
        <span className="sa-cardrow">支出 <b>{yen(sumOut)}</b></span>
        <span className="sa-cardrow">収支 <b>{yen(sumIn - sumOut)}</b></span>
      </div>
      {byCat.length > 0 && <p className="sa-note">支出内訳：{byCat.map((x) => `${x.c} ${yen(x.total)}`).join(' ／ ')}</p>}
      <div className="sa-row">
        <button className={kind === 'out' ? 'chip on' : 'chip'} onClick={() => { setKind('out'); setCat(KCATS_OUT[0]) }}>支出</button>
        <button className={kind === 'in' ? 'chip on' : 'chip'} onClick={() => { setKind('in'); setCat(KCATS_IN[0]) }}>収入</button>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          {(kind === 'out' ? KCATS_OUT : KCATS_IN).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="sa-row">
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金額" style={{ width: 110 }} />
        <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="メモ" style={{ flex: 1, minWidth: 0 }}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <button className="btn accent" onClick={add}>追加</button>
      </div>
      <div className="sa-log">
        {inMonth.map((e) => (
          <div key={e.id} className="sa-cardrow">
            <span>{e.date.slice(5)} ・ {e.cat}{e.memo ? ` ・ ${e.memo}` : ''}</span>
            <span>
              <b style={{ color: e.kind === 'in' ? '#16a34a' : '#dc2626' }}>{e.kind === 'in' ? '+' : '−'}{yen(e.amount)}</b>{' '}
              <button className="btn small" onClick={() => persist(entries.filter((x) => x.id !== e.id))}>削除</button>
            </span>
          </div>
        ))}
        {inMonth.length === 0 && <p className="sa-note">この月の記録はまだありません。</p>}
      </div>
      <p className="sa-note">記録はこの端末内に保存されます。</p>
    </div>
  )
}

/* ---------- 習慣トラッカー ---------- */
interface Habit { id: number; name: string; days: Record<string, boolean> }
export function HabitTracker() {
  const [habits, setHabits] = useState<Habit[]>(() => load('webx-habits', []))
  const [name, setName] = useState('')
  const persist = (next: Habit[]) => { setHabits(next); save('webx-habits', next) }
  const add = () => {
    const n = name.trim()
    if (!n) return
    persist([...habits, { id: Date.now(), name: n, days: {} }])
    setName('')
  }
  const week: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    week.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  const streak = (h: Habit) => {
    let s = 0
    const d = new Date()
    if (!h.days[todayStr()]) d.setDate(d.getDate() - 1)
    for (;;) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (h.days[key]) { s++; d.setDate(d.getDate() - 1) } else break
    }
    return s
  }
  const toggle = (h: Habit, day: string) => {
    persist(habits.map((x) => x.id === h.id ? { ...x, days: { ...x.days, [day]: !x.days[day] } } : x))
  }
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="習慣の名前（例：運動）" style={{ flex: 1, minWidth: 0 }}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <button className="btn accent" onClick={add}>追加</button>
      </div>
      <div className="sa-log">
        {habits.map((h) => (
          <div key={h.id} className="sa-cardrow" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="sa-row" style={{ justifyContent: 'space-between' }}>
              <b>{h.name}</b>
              <span className="sa-note">{streak(h)}日連続中</span>
              <button className="btn small" onClick={() => persist(habits.filter((x) => x.id !== h.id))}>削除</button>
            </div>
            <div className="sa-row">
              {week.map((day) => (
                <button key={day} className={h.days[day] ? 'chip on' : 'chip'} onClick={() => toggle(h, day)}>
                  {day.slice(5).replace('-', '/')}{day === todayStr() ? '（今日）' : ''}
                </button>
              ))}
            </div>
          </div>
        ))}
        {habits.length === 0 && <p className="sa-note">まだ習慣がありません。続けたいことを追加してみてください。</p>}
      </div>
      <p className="sa-note">直近7日分を表示しています。記録はこの端末内に保存されます。</p>
    </div>
  )
}

/* ---------- 買い物リスト ---------- */
interface ShopItem { id: number; name: string; qty: string; done: boolean }
export function ShoppingList() {
  const [items, setItems] = useState<ShopItem[]>(() => load('webx-shopping', []))
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const persist = (next: ShopItem[]) => { setItems(next); save('webx-shopping', next) }
  const add = () => {
    const n = name.trim()
    if (!n) return
    persist([{ id: Date.now(), name: n, qty: qty.trim(), done: false }, ...items])
    setName(''); setQty('')
  }
  const remaining = items.filter((i) => !i.done).length
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="買うもの" style={{ flex: 1, minWidth: 0 }}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <input type="text" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="数量" style={{ width: 70 }} />
        <button className="btn accent" onClick={add}>追加</button>
      </div>
      <div className="sa-log">
        {items.map((i) => (
          <div key={i.id} className="sa-cardrow">
            <label className="sa-todo-label">
              <input type="checkbox" checked={i.done} onChange={() => persist(items.map((x) => x.id === i.id ? { ...x, done: !x.done } : x))} />
              <span className={i.done ? 'sa-todo-done' : undefined}>{i.name}{i.qty ? ` × ${i.qty}` : ''}</span>
            </label>
            <button className="btn small" onClick={() => persist(items.filter((x) => x.id !== i.id))}>削除</button>
          </div>
        ))}
        {items.length === 0 && <p className="sa-note">リストは空です。</p>}
      </div>
      <div className="sa-row">
        <p className="sa-note">残り {remaining} 件 ／ 全 {items.length} 件</p>
        {items.some((i) => i.done) && <button className="btn small" onClick={() => persist(items.filter((i) => !i.done))}>買ったものを消す</button>}
      </div>
    </div>
  )
}

/* ---------- 反応速度テスト ---------- */
export function ReactionTest() {
  const [phase, setPhase] = useState<'idle' | 'wait' | 'go' | 'early'>('idle')
  const [ms, setMs] = useState<number | null>(null)
  const [best, setBest] = useState<number>(() => load('webx-reaction-best', 0))
  const timer = useRef(0)
  const startAt = useRef(0)
  const start = () => {
    setPhase('wait'); setMs(null)
    timer.current = window.setTimeout(() => { startAt.current = performance.now(); setPhase('go') }, 1200 + Math.random() * 2800)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const tap = () => {
    if (phase === 'wait') { window.clearTimeout(timer.current); setPhase('early') }
    else if (phase === 'go') {
      const v = Math.round(performance.now() - startAt.current)
      setMs(v); setPhase('idle')
      if (!best || v < best) { setBest(v); save('webx-reaction-best', v) }
    } else start()
  }
  const bg = phase === 'wait' ? '#dc2626' : phase === 'go' ? '#16a34a' : '#334155'
  return (
    <div className="sa-app">
      <button onClick={tap} style={{ height: 220, borderRadius: 12, border: 'none', background: bg, color: '#fff', fontSize: 20, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
        {phase === 'wait' ? '待って…' : phase === 'go' ? 'タップ！' : phase === 'early' ? '早すぎ！タップでもう一度' : ms ? `${ms} ms（タップでもう一度）` : 'タップで開始'}
      </button>
      <p className="sa-note">赤の間は待って、緑になったらすぐタップ。{best ? `ベスト記録：${best} ms` : ''}</p>
    </div>
  )
}

/* ---------- サイモン（記憶ゲーム） ---------- */
const SIMON_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#eab308']
export function SimonGame() {
  const [seq, setSeq] = useState<number[]>([])
  const [lit, setLit] = useState(-1)
  const [msg, setMsg] = useState('スタートを押して、光る順番を覚えてください')
  const [playing, setPlaying] = useState(false)
  const [best, setBest] = useState<number>(() => load('webx-simon-best', 0))
  const timers = useRef<number[]>([])
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)) }, [])
  const playSeq = (s: number[]) => {
    setPlaying(true)
    s.forEach((c, i) => {
      timers.current.push(window.setTimeout(() => setLit(c), 600 * (i + 1)))
      timers.current.push(window.setTimeout(() => setLit(-1), 600 * (i + 1) + 380))
    })
    timers.current.push(window.setTimeout(() => { setPlaying(false); setMsg('あなたの番です。同じ順番でタップ！') }, 600 * (s.length + 1)))
  }
  const startGame = () => {
    const s = [Math.floor(Math.random() * 4)]
    setSeq(s); setMsg('よく見て…')
    playSeq(s)
  }
  const tapColor = (c: number) => {
    if (playing || seq.length === 0) return
    setLit(c)
    window.setTimeout(() => setLit(-1), 200)
    const expected = seq[progressRef.current]
    if (c !== expected) {
      setMsg(`ゲームオーバー… ${seq.length} ラウンドまで進みました`)
      if (seq.length - 1 > best) { setBest(seq.length - 1); save('webx-simon-best', seq.length - 1) }
      setSeq([]); progressRef.current = 0
      return
    }
    progressRef.current += 1
    if (progressRef.current >= seq.length) {
      progressRef.current = 0
      const next = [...seq, Math.floor(Math.random() * 4)]
      setSeq(next)
      setMsg(`正解！次は ${next.length} 個`)
      timers.current.push(window.setTimeout(() => playSeq(next), 800))
    }
  }
  const progressRef = useRef(0)
  return (
    <div className="sa-app" style={{ alignItems: 'center' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: 240 }}>
        {SIMON_COLORS.map((col, i) => (
          <button key={i} onClick={() => tapColor(i)} aria-label={`color-${i}`}
            style={{ height: 100, borderRadius: 12, border: 'none', background: col, opacity: lit === i ? 1 : 0.45, cursor: 'pointer' }} />
        ))}
      </div>
      <p className="game-msg">{msg}</p>
      <div className="sa-row">
        <button className="btn accent" onClick={startGame}>スタート</button>
        {best > 0 && <span className="sa-note">ベスト：{best} ラウンド</span>}
      </div>
    </div>
  )
}

/* ---------- カウンター ---------- */
export function Counter() {
  const [counts, setCounts] = useState<{ id: number; name: string; value: number }[]>(() => load('webx-counters', [{ id: 1, name: 'カウンター', value: 0 }]))
  const persist = (next: typeof counts) => { setCounts(next); save('webx-counters', next) }
  return (
    <div className="sa-app">
      <div className="sa-log">
        {counts.map((c) => (
          <div key={c.id} className="sa-cardrow">
            <input type="text" value={c.name} style={{ width: 110 }} onChange={(e) => persist(counts.map((x) => x.id === c.id ? { ...x, name: e.target.value } : x))} />
            <b className="sa-big">{c.value}</b>
            <span className="sa-row">
              <button className="btn" onClick={() => persist(counts.map((x) => x.id === c.id ? { ...x, value: x.value - 1 } : x))}>−</button>
              <button className="btn accent" onClick={() => persist(counts.map((x) => x.id === c.id ? { ...x, value: x.value + 1 } : x))}>＋</button>
              <button className="btn small" onClick={() => persist(counts.map((x) => x.id === c.id ? { ...x, value: 0 } : x))}>0</button>
              <button className="btn small" onClick={() => persist(counts.filter((x) => x.id !== c.id))}>削除</button>
            </span>
          </div>
        ))}
      </div>
      <button className="btn" onClick={() => persist([...counts, { id: Date.now(), name: `カウンター${counts.length + 1}`, value: 0 }])}>カウンターを追加</button>
      <p className="sa-note">数えた結果はこの端末内に保存されます。</p>
    </div>
  )
}

/* ---------- ルーレット ---------- */
export function Roulette() {
  const [input, setInput] = useState('A\nB\nC')
  const [result, setResult] = useState('')
  const [spinning, setSpinning] = useState(false)
  const spin = () => {
    const items = input.split('\n').map((s) => s.trim()).filter(Boolean)
    if (items.length === 0 || spinning) return
    setSpinning(true)
    let n = 0
    const iv = window.setInterval(() => {
      setResult(items[Math.floor(Math.random() * items.length)])
      n++
      if (n > 18) {
        window.clearInterval(iv)
        setResult(items[Math.floor(Math.random() * items.length)])
        setSpinning(false)
      }
    }, 70)
  }
  return (
    <div className="sa-app">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={5} placeholder="候補を1行に1つずつ入力" />
      <div className="sa-row">
        <button className="btn accent" onClick={spin} disabled={spinning}>{spinning ? '回転中…' : 'ルーレットを回す'}</button>
        {result && <span className="sa-big">→ {result}</span>}
      </div>
      <p className="sa-note">迷ったときの決定にどうぞ。</p>
    </div>
  )
}

/* ---------- コイントス ---------- */
export function CoinFlip() {
  const [face, setFace] = useState<'表' | '裏' | ''>('')
  const [heads, setHeads] = useState(0)
  const [tails, setTails] = useState(0)
  const [flipping, setFlipping] = useState(false)
  const flip = () => {
    if (flipping) return
    setFlipping(true)
    let n = 0
    const iv = window.setInterval(() => {
      setFace(Math.random() < 0.5 ? '表' : '裏')
      n++
      if (n > 10) {
        window.clearInterval(iv)
        const f = Math.random() < 0.5 ? '表' : '裏'
        setFace(f)
        if (f === '表') setHeads((v) => v + 1); else setTails((v) => v + 1)
        setFlipping(false)
      }
    }, 60)
  }
  return (
    <div className="sa-app" style={{ alignItems: 'center' }}>
      <div style={{ width: 130, height: 130, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #fde68a, #f59e0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, fontWeight: 800, color: '#92400e', boxShadow: '0 6px 18px rgba(0,0,0,.25)' }}>
        {face || '？'}
      </div>
      <button className="btn accent" onClick={flip} disabled={flipping}>{flipping ? '回転中…' : 'コインを投げる'}</button>
      <p className="sa-note">表 {heads} 回 ／ 裏 {tails} 回（合計 {heads + tails} 回）</p>
    </div>
  )
}

/* ---------- カウントダウン ---------- */
export function Countdown() {
  const [title, setTitle] = useState(() => load('webx-countdown-title', '記念日'))
  const [date, setDate] = useState(() => load('webx-countdown-date', ''))
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(() => {
    const iv = window.setInterval(() => setNowTick(Date.now()), 60000)
    return () => window.clearInterval(iv)
  }, [])
  const target = date ? new Date(`${date}T00:00:00`).getTime() : 0
  const days = target ? Math.ceil((target - nowTick) / 86400000) : null
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="text" value={title} onChange={(e) => { setTitle(e.target.value); save('webx-countdown-title', e.target.value) }} placeholder="イベント名" style={{ flex: 1, minWidth: 0 }} />
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); save('webx-countdown-date', e.target.value) }} />
      </div>
      <div style={{ textAlign: 'center', padding: '18px 0' }}>
        {days === null ? <p className="sa-note">日付を選んでください</p>
          : days > 0 ? <><div className="sa-note">{title}まで</div><div style={{ fontSize: 52, fontWeight: 800 }}>あと {days} 日</div></>
          : days === 0 ? <div style={{ fontSize: 40, fontWeight: 800 }}>🎉 今日が{title}です！</div>
          : <><div className="sa-note">{title}から</div><div style={{ fontSize: 52, fontWeight: 800 }}>{-days} 日経過</div></>}
      </div>
      <p className="sa-note">設定はこの端末内に保存されます。</p>
    </div>
  )
}

/* ---------- 年齢計算 ---------- */
export function AgeCalc() {
  const [birth, setBirth] = useState('')
  const [ref, setRef] = useState(todayStr())
  const calc = () => {
    if (!birth || !ref) return null
    const b = new Date(`${birth}T00:00:00`)
    const r = new Date(`${ref}T00:00:00`)
    if (r < b) return null
    let years = r.getFullYear() - b.getFullYear()
    let months = r.getMonth() - b.getMonth()
    let days = r.getDate() - b.getDate()
    if (days < 0) { months--; days += new Date(r.getFullYear(), r.getMonth(), 0).getDate() }
    if (months < 0) { years--; months += 12 }
    const totalDays = Math.floor((r.getTime() - b.getTime()) / 86400000)
    return { years, months, days, totalDays }
  }
  const res = calc()
  return (
    <div className="sa-app">
      <div className="sa-row">
        <label>生年月日 <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} /></label>
        <label>基準日 <input type="date" value={ref} onChange={(e) => setRef(e.target.value)} /></label>
      </div>
      {res ? (
        <div className="sa-log">
          <div className="sa-cardrow"><span>年齢</span><b className="sa-big">{res.years}歳 {res.months}か月 {res.days}日</b></div>
          <div className="sa-cardrow"><span>生まれてから</span><b>{res.totalDays.toLocaleString('ja-JP')} 日</b></div>
        </div>
      ) : <p className="sa-note">生年月日を入れると年齢を計算します。</p>}
    </div>
  )
}
