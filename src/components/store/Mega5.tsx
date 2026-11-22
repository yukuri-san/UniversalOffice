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

/* ---------- 睡眠記録 ---------- */
interface SleepRec { id: number; date: string; bed: string; wake: string; quality: number; memo: string }
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const sleepMin = (bed: string, wake: string) => { let d = toMin(wake) - toMin(bed); if (d <= 0) d += 1440; return d }
const fmtDur = (min: number) => `${Math.floor(min / 60)}時間${min % 60}分`
export function SleepLog() {
  const [items, setItems] = useState<SleepRec[]>(() => load('webx-sleep', []))
  const [date, setDate] = useState(todayStr())
  const [bed, setBed] = useState('23:30')
  const [wake, setWake] = useState('07:00')
  const [quality, setQuality] = useState(3)
  const [memo, setMemo] = useState('')
  const persist = (next: SleepRec[]) => { setItems(next); save('webx-sleep', next) }
  const add = () => {
    if (!bed || !wake) return
    const rec: SleepRec = { id: Date.now(), date, bed, wake, quality, memo: memo.trim() }
    persist([rec, ...items].sort((a, b) => b.date.localeCompare(a.date)))
    setMemo('')
  }
  const avg = items.length ? Math.round(items.reduce((s, r) => s + sleepMin(r.bed, r.wake), 0) / items.length) : 0
  const last7 = items.slice(0, 7)
  const avg7 = last7.length ? Math.round(last7.reduce((s, r) => s + sleepMin(r.bed, r.wake), 0) / last7.length) : 0
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label>就寝 <input type="time" value={bed} onChange={(e) => setBed(e.target.value)} /></label>
        <label>起床 <input type="time" value={wake} onChange={(e) => setWake(e.target.value)} /></label>
      </div>
      <div className="sa-row">
        <select value={quality} onChange={(e) => setQuality(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>眠りの質 {n}</option>)}
        </select>
        <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="メモ（任意）" style={{ flex: 1 }} />
        <button className="btn accent" onClick={add}>追加</button>
      </div>
      <div className="sa-stats">
        <span>平均睡眠時間 <b>{items.length ? fmtDur(avg) : '—'}</b></span>
        <span>直近7件の平均 <b>{last7.length ? fmtDur(avg7) : '—'}</b></span>
        <span>記録数 <b>{items.length}</b></span>
      </div>
      <div className="sa-log">
        {items.map((r) => (
          <div key={r.id} className="sa-cardrow">
            <span><b>{r.date}</b> <span className="sa-note">{r.bed}〜{r.wake}</span><br /><b>{fmtDur(sleepMin(r.bed, r.wake))}</b> <span style={{ color: '#d97706' }}>{stars(r.quality)}</span>{r.memo && <span className="sa-note">　{r.memo}</span>}</span>
            <button className="btn small" onClick={() => persist(items.filter((x) => x.id !== r.id))}>削除</button>
          </div>
        ))}
        {items.length === 0 && <p className="sa-note">まだ記録がありません。就寝・起床時刻を入れて追加してください。</p>}
      </div>
      <p className="sa-note">就寝・起床時刻から睡眠時間を自動計算します。日をまたぐ睡眠にも対応しています。記録は端末内に保存されます。</p>
    </div>
  )
}

/* ---------- レシピ帳 ---------- */
interface RecipeRec { id: number; name: string; category: string; minutes: number; servings: number; ingredients: string; steps: string; fav: boolean }
const RECIPE_CATS = ['主菜', '副菜', '汁物・スープ', 'ごはん・麺', 'お菓子', 'その他']
export function RecipeBook() {
  const [items, setItems] = useState<RecipeRec[]>(() => load('webx-recipe', []))
  const [name, setName] = useState('')
  const [category, setCategory] = useState(RECIPE_CATS[0])
  const [minutes, setMinutes] = useState(30)
  const [servings, setServings] = useState(2)
  const [ingredients, setIngredients] = useState('')
  const [steps, setSteps] = useState('')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const persist = (next: RecipeRec[]) => { setItems(next); save('webx-recipe', next) }
  const add = () => {
    if (!name.trim()) return
    const rec: RecipeRec = { id: Date.now(), name: name.trim(), category, minutes: Math.max(1, minutes || 1), servings: Math.max(1, servings || 1), ingredients: ingredients.trim(), steps: steps.trim(), fav: false }
    persist([rec, ...items].sort((a, b) => b.id - a.id))
    setName(''); setIngredients(''); setSteps('')
  }
  const q = query.trim()
  const shown = items.filter((r) => !q || r.name.includes(q) || r.ingredients.includes(q) || r.category.includes(q))
  const favCount = items.filter((r) => r.fav).length
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="料理名（例：肉じゃが）" style={{ flex: 1 }} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {RECIPE_CATS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="sa-row">
        <label>調理時間 <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} style={{ width: 64 }} /> 分</label>
        <label>人数 <input type="number" min={1} value={servings} onChange={(e) => setServings(Number(e.target.value))} style={{ width: 56 }} /> 人分</label>
        <button className="btn accent" onClick={add}>追加</button>
      </div>
      <div className="sa-row">
        <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="材料（1行に1つずつ）" rows={2} style={{ flex: 1 }} />
        <textarea value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="手順（1行に1工程ずつ）" rows={2} style={{ flex: 1 }} />
      </div>
      <div className="sa-row">
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="検索（料理名・材料・カテゴリ）" style={{ flex: 1 }} />
      </div>
      <div className="sa-stats">
        <span>登録数 <b>{items.length}</b></span>
        <span>お気に入り <b>{favCount}</b></span>
      </div>
      <div className="sa-log">
        {shown.map((r) => (
          <div key={r.id} className="sa-cardrow">
            <span style={{ flex: 1 }}>
              <b>{r.name}</b> <span className="sa-note">{r.category}／{r.minutes}分／{r.servings}人分</span>
              <button className="btn small" onClick={() => setOpenId(openId === r.id ? null : r.id)}>{openId === r.id ? '閉じる' : 'レシピを見る'}</button>
              {openId === r.id && (
                <span className="sa-col" style={{ marginTop: 6 }}>
                  {r.ingredients && <span><b>材料</b><br />{r.ingredients.split('\n').filter(Boolean).map((l, i) => <span key={i}>・{l}<br /></span>)}</span>}
                  {r.steps && <span><b>手順</b><br />{r.steps.split('\n').filter(Boolean).map((l, i) => <span key={i}>{i + 1}. {l}<br /></span>)}</span>}
                  {!r.ingredients && !r.steps && <span className="sa-note">材料・手順は登録されていません。</span>}
                </span>
              )}
            </span>
            <span className="sa-row">
              <button className="btn small" onClick={() => persist(items.map((x) => x.id === r.id ? { ...x, fav: !x.fav } : x))}>{r.fav ? '★ お気に入り' : '☆'}</button>
              <button className="btn small" onClick={() => persist(items.filter((x) => x.id !== r.id))}>削除</button>
            </span>
          </div>
        ))}
        {shown.length === 0 && <p className="sa-note">{items.length === 0 ? 'まだレシピが登録されていません。料理名を入れて追加してください。' : '検索に合うレシピがありません。'}</p>}
      </div>
      <p className="sa-note">作り方を書き留めておけるレシピ帳です。材料と手順は1行ずつ入力します。記録は端末内に保存されます。</p>
    </div>
  )
}

/* ---------- 水分記録 ---------- */
interface WaterRec { id: number; date: string; amount: number }
const WATER_QUICK = [100, 200, 350, 500]
const dayLabel = (date: string) => {
  const d = new Date(date + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`
}
export function WaterLog() {
  const [items, setItems] = useState<WaterRec[]>(() => load('webx-water', []))
  const [goal, setGoal] = useState<number>(() => load('webx-water-goal', 2000))
  const [amount, setAmount] = useState(200)
  const [date, setDate] = useState(todayStr())
  const persist = (next: WaterRec[]) => { setItems(next); save('webx-water', next) }
  const saveGoal = (g: number) => { const v = Math.max(100, Math.round(g) || 2000); setGoal(v); save('webx-water-goal', v) }
  const add = (ml: number, d: string = todayStr()) => {
    if (!ml || ml <= 0) return
    persist([...items, { id: Date.now() + Math.random(), date: d, amount: Math.round(ml) }].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id))
  }
  const today = todayStr()
  const todayTotal = items.filter((r) => r.date === today).reduce((s, r) => s + r.amount, 0)
  const todayItems = items.filter((r) => r.date === today)
  const pct = Math.min(100, Math.round((todayTotal / goal) * 100))
  const remain = Math.max(0, goal - todayTotal)
  const last7: { date: string; total: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    last7.push({ date: ds, total: items.filter((r) => r.date === ds).reduce((s, r) => s + r.amount, 0) })
  }
  const avg7 = Math.round(last7.reduce((s, d) => s + d.total, 0) / 7)
  const max7 = Math.max(goal, ...last7.map((d) => d.total), 1)
  return (
    <div className="sa-app">
      <div className="sa-stats">
        <span>今日の合計 <b>{todayTotal.toLocaleString()} ml</b></span>
        <span>目標 <b>{goal.toLocaleString()} ml</b></span>
        <span>達成率 <b>{pct}%</b></span>
        <span>残り <b>{remain.toLocaleString()} ml</b></span>
      </div>
      <div style={{ height: 12, borderRadius: 6, background: 'var(--muted, #e5e7eb)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#38bdf8,#0369a1)', transition: 'width .3s' }} />
      </div>
      <p className="sa-note">{remain === 0 ? '目標達成です。よく飲めました。' : `目標まであと ${remain.toLocaleString()} ml です。`}</p>
      <div className="sa-row">
        {WATER_QUICK.map((ml) => (
          <button key={ml} className="btn" onClick={() => add(ml)}>+{ml} ml</button>
        ))}
      </div>
      <div className="sa-row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label>量 <input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ width: 72 }} /> ml</label>
        <button className="btn accent" onClick={() => add(amount, date)}>追加</button>
      </div>
      <div className="sa-row">
        <label>1日の目標 <input type="number" min={100} step={100} value={goal} onChange={(e) => saveGoal(Number(e.target.value))} style={{ width: 80 }} /> ml</label>
        <span className="sa-note">7日平均 <b>{avg7.toLocaleString()} ml</b></span>
      </div>
      <div className="sa-log">
        {last7.map((d) => (
          <div key={d.date} className="sa-cardrow">
            <span style={{ flex: 1 }}><b>{d.date === today ? '今日' : dayLabel(d.date)}</b>　{d.total.toLocaleString()} ml
              <span style={{ display: 'block', height: 8, borderRadius: 4, background: 'var(--muted, #e5e7eb)', overflow: 'hidden', marginTop: 4 }}>
                <span style={{ display: 'block', width: `${Math.min(100, Math.round((d.total / max7) * 100))}%`, height: '100%', background: d.total >= goal ? '#16a34a' : '#38bdf8' }} />
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="sa-log">
        {todayItems.map((r) => (
          <div key={r.id} className="sa-cardrow">
            <span>今日　<b>{r.amount.toLocaleString()} ml</b></span>
            <button className="btn small" onClick={() => persist(items.filter((x) => x.id !== r.id))}>削除</button>
          </div>
        ))}
        {todayItems.length === 0 && <p className="sa-note">今日はまだ記録がありません。上のボタンで飲んだ量を追加してください。</p>}
      </div>
      <p className="sa-note">飲んだ水の量を記録して、1日の目標に対する進み具合を確認できます。記録と目標は端末内に保存されます。</p>
    </div>
  )
}
