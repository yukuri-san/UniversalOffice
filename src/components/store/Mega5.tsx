import { useState } from 'react'

function load<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')
    return v ?? fallback
  } catch { return fallback }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignore */ }
}
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n))

/* ---------- 読書記録 ---------- */
interface BookRec { id: number; title: string; author: string; status: string; rating: number; memo: string }
export function Reading() {
  const [items, setItems] = useState<BookRec[]>(() => load('webx-reading', []))
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [status, setStatus] = useState('読みたい')
  const [rating, setRating] = useState(3)
  const persist = (next: BookRec[]) => { setItems(next); save('webx-reading', next) }
  const add = () => {
    if (!title.trim()) return
    persist([...items, { id: Date.now(), title: title.trim(), author: author.trim(), status, rating, memo: '' }])
    setTitle(''); setAuthor('')
  }
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="本のタイトル" style={{ flex: 1 }} />
        <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="著者" style={{ flex: 1 }} />
      </div>
      <div className="sa-row">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>読みたい</option><option>読書中</option><option>読了</option>
        </select>
        <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>評価 {n}</option>)}
        </select>
        <button className="btn accent" onClick={add}>追加</button>
      </div>
      <div className="sa-log">
        {items.map((b) => (
          <div key={b.id} className="sa-cardrow">
            <span><b>{b.title}</b>{b.author && <span className="sa-note">／{b.author}</span>}<br /><span className="sa-note" style={{ color: '#d97706' }}>{stars(b.rating)}</span></span>
            <span className="sa-row">
              <select value={b.status} onChange={(e) => persist(items.map((x) => x.id === b.id ? { ...x, status: e.target.value } : x))}>
                <option>読みたい</option><option>読書中</option><option>読了</option>
              </select>
              <button className="btn small" onClick={() => persist(items.filter((x) => x.id !== b.id))}>削除</button>
            </span>
          </div>
        ))}
        {items.length === 0 && <p className="sa-note">まだ本が登録されていません。</p>}
      </div>
      <p className="sa-note">読みたい本・読んだ本の記録です。記録は端末内に保存されます。</p>
    </div>
  )
}

/* ---------- 映画記録 ---------- */
interface MovieRec { id: number; title: string; date: string; rating: number; memo: string }
export function MovieLog() {
  const [items, setItems] = useState<MovieRec[]>(() => load('webx-movies', []))
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayStr())
  const [rating, setRating] = useState(4)
  const [memo, setMemo] = useState('')
  const persist = (next: MovieRec[]) => { setItems(next); save('webx-movies', next) }
  const add = () => {
    if (!title.trim()) return
    persist([{ id: Date.now(), title: title.trim(), date, rating, memo: memo.trim() }, ...items])
    setTitle(''); setMemo('')
  }
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="映画のタイトル" style={{ flex: 1 }} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="sa-row">
        <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>評価 {n}</option>)}
        </select>
        <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="ひとこと感想" style={{ flex: 1 }} />
        <button className="btn accent" onClick={add}>追加</button>
      </div>
      <div className="sa-log">
        {items.map((m) => (
          <div key={m.id} className="sa-cardrow">
            <span><b>{m.title}</b> <span className="sa-note">{m.date}</span><br /><span style={{ color: '#d97706' }}>{stars(m.rating)}</span>{m.memo && <span className="sa-note">　{m.memo}</span>}</span>
            <button className="btn small" onClick={() => persist(items.filter((x) => x.id !== m.id))}>削除</button>
          </div>
        ))}
        {items.length === 0 && <p className="sa-note">まだ映画が登録されていません。</p>}
      </div>
      <p className="sa-note">観た映画の記録です。記録は端末内に保存されます。</p>
    </div>
  )
}

/* ---------- 水やり記録 ---------- */
interface PlantRec { id: number; name: string; last: string; days: number }
export function Plants() {
  const [items, setItems] = useState<PlantRec[]>(() => load('webx-plants', []))
  const [name, setName] = useState('')
  const [days, setDays] = useState('3')
  const persist = (next: PlantRec[]) => { setItems(next); save('webx-plants', next) }
  const add = () => {
    if (!name.trim()) return
    persist([...items, { id: Date.now(), name: name.trim(), last: todayStr(), days: Math.max(1, Math.round(Number(days) || 1)) }])
    setName('')
  }
  const daysSince = (dateStr: string) => Math.floor((new Date(todayStr()).getTime() - new Date(dateStr).getTime()) / 86400000)
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="植物の名前" style={{ flex: 1 }} />
        <label>水やり間隔 <input type="number" className="sa-num" value={days} onChange={(e) => setDays(e.target.value)} /> 日</label>
        <button className="btn accent" onClick={add}>追加</button>
      </div>
      <div className="sa-log">
        {items.map((p) => {
          const since = daysSince(p.last)
          const due = since >= p.days
          return (
            <div key={p.id} className="sa-cardrow" style={due ? { borderColor: '#f59e0b', background: '#fffbeb' } : undefined}>
              <span>🪴 <b>{p.name}</b><br /><span className="sa-note">前回 {p.last}（{since}日前）／{p.days}日おき{due ? '／💧 水やりの時期です' : `／あと${p.days - since}日`}</span></span>
              <span className="sa-row">
                <button className="btn small accent" onClick={() => persist(items.map((x) => x.id === p.id ? { ...x, last: todayStr() } : x))}>水やりした</button>
                <button className="btn small" onClick={() => persist(items.filter((x) => x.id !== p.id))}>削除</button>
              </span>
            </div>
          )
        })}
        {items.length === 0 && <p className="sa-note">まだ植物が登録されていません。</p>}
      </div>
      <p className="sa-note">植物の水やり周期を管理します。記録は端末内に保存されます。</p>
    </div>
  )
}

/* ---------- 持ち物リスト ---------- */
interface InvRec { id: number; name: string; place: string; qty: number }
export function Inventory() {
  const [items, setItems] = useState<InvRec[]>(() => load('webx-inventory', []))
  const [name, setName] = useState('')
  const [place, setPlace] = useState('')
  const [query, setQuery] = useState('')
  const persist = (next: InvRec[]) => { setItems(next); save('webx-inventory', next) }
  const add = () => {
    if (!name.trim()) return
    persist([...items, { id: Date.now(), name: name.trim(), place: place.trim(), qty: 1 }])
    setName(''); setPlace('')
  }
  const shown = items.filter((i) => !query || i.name.includes(query) || i.place.includes(query))
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="持ち物の名前" style={{ flex: 1 }} />
        <input type="text" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="保管場所" style={{ flex: 1 }} />
        <button className="btn accent" onClick={add}>追加</button>
      </div>
      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 名前・場所で検索" />
      <div className="sa-log">
        {shown.map((i) => (
          <div key={i.id} className="sa-cardrow">
            <span><b>{i.name}</b>{i.place && <span className="sa-note">／📍{i.place}</span>}</span>
            <span className="sa-row">
              <button className="btn small" onClick={() => persist(items.map((x) => x.id === i.id ? { ...x, qty: Math.max(0, x.qty - 1) } : x))}>−</button>
              <b>{i.qty}</b>
              <button className="btn small" onClick={() => persist(items.map((x) => x.id === i.id ? { ...x, qty: x.qty + 1 } : x))}>＋</button>
              <button className="btn small" onClick={() => persist(items.filter((x) => x.id !== i.id))}>削除</button>
            </span>
          </div>
        ))}
        {shown.length === 0 && <p className="sa-note">{items.length === 0 ? 'まだ持ち物が登録されていません。' : '見つかりませんでした。'}</p>}
      </div>
      <p className="sa-note">「どこにしまったか」を記録するリストです。記録は端末内に保存されます。</p>
    </div>
  )
}

/* ---------- 賞味期限メモ ---------- */
interface ExpRec { id: number; name: string; date: string }
export function Expiry() {
  const [items, setItems] = useState<ExpRec[]>(() => load('webx-expiry', []))
  const [name, setName] = useState('')
  const [date, setDate] = useState(todayStr())
  const persist = (next: ExpRec[]) => { setItems(next); save('webx-expiry', next) }
  const add = () => {
    if (!name.trim()) return
    persist([...items, { id: Date.now(), name: name.trim(), date }].sort((a, b) => a.date.localeCompare(b.date)))
    setName('')
  }
  const daysLeft = (dateStr: string) => Math.round((new Date(dateStr).getTime() - new Date(todayStr()).getTime()) / 86400000)
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="食品の名前" style={{ flex: 1 }} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn accent" onClick={add}>追加</button>
      </div>
      <div className="sa-log">
        {items.map((i) => {
          const left = daysLeft(i.date)
          const color = left < 0 ? '#dc2626' : left <= 3 ? '#d97706' : undefined
          return (
            <div key={i.id} className="sa-cardrow">
              <span><b>{i.name}</b> <span className="sa-note">{i.date}</span></span>
              <span className="sa-row">
                <b style={{ color }}>{left < 0 ? `${-left}日過ぎています！` : left === 0 ? '今日まで！' : `あと${left}日`}</b>
                <button className="btn small" onClick={() => persist(items.filter((x) => x.id !== i.id))}>削除</button>
              </span>
            </div>
          )
        })}
        {items.length === 0 && <p className="sa-note">まだ登録されていません。期限の近い順に並びます。</p>}
      </div>
      <p className="sa-note">冷蔵庫の食品などの賞味期限メモです。記録は端末内に保存されます。</p>
    </div>
  )
}

/* ---------- プレゼントメモ ---------- */
interface GiftRec { id: number; person: string; item: string; kind: 'あげた' | 'もらった'; date: string; memo: string }
export function GiftMemo() {
  const [items, setItems] = useState<GiftRec[]>(() => load('webx-gifts', []))
  const [person, setPerson] = useState('')
  const [item, setItem] = useState('')
  const [kind, setKind] = useState<'あげた' | 'もらった'>('あげた')
  const [date, setDate] = useState(todayStr())
  const persist = (next: GiftRec[]) => { setItems(next); save('webx-gifts', next) }
  const add = () => {
    if (!person.trim() || !item.trim()) return
    persist([{ id: Date.now(), person: person.trim(), item: item.trim(), kind, date, memo: '' }, ...items])
    setPerson(''); setItem('')
  }
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="text" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="相手の名前" style={{ flex: 1 }} />
        <input type="text" value={item} onChange={(e) => setItem(e.target.value)} placeholder="プレゼントの内容" style={{ flex: 1 }} />
      </div>
      <div className="sa-row">
        <select value={kind} onChange={(e) => setKind(e.target.value as 'あげた' | 'もらった')}>
          <option value="あげた">あげた</option>
          <option value="もらった">もらった</option>
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn accent" onClick={add}>追加</button>
      </div>
      <div className="sa-log">
        {items.map((g) => (
          <div key={g.id} className="sa-cardrow">
            <span>{g.kind === 'あげた' ? '🎁➡️' : '🎁⬅️'} <b>{g.person}</b> さんに{g.kind}：{g.item}<br /><span className="sa-note">{g.date}</span></span>
            <button className="btn small" onClick={() => persist(items.filter((x) => x.id !== g.id))}>削除</button>
          </div>
        ))}
        {items.length === 0 && <p className="sa-note">まだ記録がありません。誕生日プレゼントの重複防止やお返しの管理に。</p>}
      </div>
      <p className="sa-note">誰に何をあげた・もらったかの記録です。記録は端末内に保存されます。</p>
    </div>
  )
}

/* ---------- 貯金目標 ---------- */
interface SaveRec { id: number; name: string; target: number; current: number }
export function Savings() {
  const [items, setItems] = useState<SaveRec[]>(() => load('webx-savings', []))
  const [name, setName] = useState('')
  const [target, setTarget] = useState('100000')
  const [amounts, setAmounts] = useState<Record<number, string>>({})
  const persist = (next: SaveRec[]) => { setItems(next); save('webx-savings', next) }
  const add = () => {
    if (!name.trim()) return
    persist([...items, { id: Date.now(), name: name.trim(), target: Math.max(1, Math.round(Number(target) || 1)), current: 0 }])
    setName('')
  }
  const deposit = (id: number) => {
    const v = Math.round(Number(amounts[id]) || 0)
    if (v === 0) return
    persist(items.map((x) => x.id === id ? { ...x, current: Math.max(0, x.current + v) } : x))
    setAmounts({ ...amounts, [id]: '' })
  }
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="目標の名前（例：旅行資金）" style={{ flex: 1 }} />
        <label>目標 <input type="number" className="sa-num-wide" value={target} onChange={(e) => setTarget(e.target.value)} /> 円</label>
        <button className="btn accent" onClick={add}>追加</button>
      </div>
      <div className="sa-log">
        {items.map((s) => {
          const pct = Math.min(100, Math.round(s.current / s.target * 100))
          return (
            <div key={s.id} className="sa-cardrow" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <span className="sa-row" style={{ justifyContent: 'space-between' }}>
                <b>{s.name}</b>
                <span>{s.current.toLocaleString('ja-JP')} ／ {s.target.toLocaleString('ja-JP')} 円（{pct}％）{pct >= 100 ? ' 🎉達成！' : ''}</span>
              </span>
              <div style={{ height: 10, background: '#e5e7eb', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#34d399,#059669)' }} />
              </div>
              <span className="sa-row">
                <input type="number" className="sa-num-wide" placeholder="金額" value={amounts[s.id] ?? ''} onChange={(e) => setAmounts({ ...amounts, [s.id]: e.target.value })} />
                <button className="btn small accent" onClick={() => deposit(s.id)}>貯金する</button>
                <button className="btn small" onClick={() => persist(items.filter((x) => x.id !== s.id))}>削除</button>
              </span>
            </div>
          )
        })}
        {items.length === 0 && <p className="sa-note">まだ目標がありません。</p>}
      </div>
      <p className="sa-note">目標金額までの進み具合がバーで分かります。記録は端末内に保存されます。</p>
    </div>
  )
}

/* ---------- サブスク管理 ---------- */
interface SubRec { id: number; name: string; price: number; day: number }
export function Subs() {
  const [items, setItems] = useState<SubRec[]>(() => load('webx-subs', []))
  const [name, setName] = useState('')
  const [price, setPrice] = useState('1000')
  const [day, setDay] = useState('1')
  const persist = (next: SubRec[]) => { setItems(next); save('webx-subs', next) }
  const add = () => {
    if (!name.trim()) return
    persist([...items, { id: Date.now(), name: name.trim(), price: Math.max(0, Math.round(Number(price) || 0)), day: Math.min(31, Math.max(1, Math.round(Number(day) || 1))) }])
    setName('')
  }
  const monthly = items.reduce((s, i) => s + i.price, 0)
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="サービス名" style={{ flex: 1 }} />
        <label>月額 <input type="number" className="sa-num" value={price} onChange={(e) => setPrice(e.target.value)} /> 円</label>
        <label>更新日 <input type="number" className="sa-num" value={day} onChange={(e) => setDay(e.target.value)} /> 日</label>
        <button className="btn accent" onClick={add}>追加</button>
      </div>
      <div className="sa-stats">
        <span>月額合計 <b>{monthly.toLocaleString('ja-JP')} 円</b></span>
        <span>年額換算 <b>{(monthly * 12).toLocaleString('ja-JP')} 円</b></span>
        <span>登録数 <b>{items.length}</b></span>
      </div>
      <div className="sa-log">
        {items.map((s) => (
          <div key={s.id} className="sa-cardrow">
            <span><b>{s.name}</b> <span className="sa-note">毎月{s.day}日更新</span></span>
            <span className="sa-row"><b>{s.price.toLocaleString('ja-JP')} 円/月</b>
              <button className="btn small" onClick={() => persist(items.filter((x) => x.id !== s.id))}>削除</button></span>
          </div>
        ))}
        {items.length === 0 && <p className="sa-note">まだ登録がありません。使っていないサブスクの見直しに。</p>}
      </div>
      <p className="sa-note">サブスクリプションの月額と更新日を一覧管理します。記録は端末内に保存されます。</p>
    </div>
  )
}
