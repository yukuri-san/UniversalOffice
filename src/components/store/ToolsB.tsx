import { useMemo, useState } from 'react'

const todayStr = () => new Date().toISOString().slice(0, 10)
const fmtDate = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`

/* ---------- 日数計算 ---------- */
export function DayCalc() {
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const [base, setBase] = useState(todayStr())
  const [days, setDays] = useState(30)
  const diff = useMemo(() => {
    const a = new Date(from + 'T00:00:00'), b = new Date(to + 'T00:00:00')
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
    return Math.round((b.getTime() - a.getTime()) / 86400000)
  }, [from, to])
  const added = useMemo(() => {
    const a = new Date(base + 'T00:00:00')
    if (Number.isNaN(a.getTime())) return null
    a.setDate(a.getDate() + days)
    return a
  }, [base, days])
  return (
    <div className="sa-app">
      <h4 className="sa-h">2つの日の間隔</h4>
      <div className="sa-row">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span>から</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="sa-big">{diff === null ? '—' : `${diff} 日`}</div>
      <h4 className="sa-h">日付をずらす</h4>
      <div className="sa-row">
        <input type="date" value={base} onChange={(e) => setBase(e.target.value)} />
        <input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} className="sa-num" />
        <span>日後（マイナスで前）</span>
      </div>
      <div className="sa-big">{added ? fmtDate(added) : '—'}</div>
    </div>
  )
}

/* ---------- BMI ---------- */
export function Bmi() {
  const [height, setHeight] = useState(170)
  const [weight, setWeight] = useState(60)
  const bmi = weight / Math.pow(height / 100, 2)
  const cat = bmi < 18.5 ? '低体重' : bmi < 25 ? '普通体重' : bmi < 30 ? '肥満（1度）' : bmi < 35 ? '肥満（2度）' : bmi < 40 ? '肥満（3度）' : '肥満（4度）'
  const std = 22 * Math.pow(height / 100, 2)
  return (
    <div className="sa-app">
      <div className="sa-row">
        <label>身長(cm) <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} className="sa-num" /></label>
        <label>体重(kg) <input type="number" value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="sa-num" /></label>
      </div>
      <div className="sa-big">BMI {Number.isFinite(bmi) ? bmi.toFixed(1) : '—'}（{cat}）</div>
      <p className="sa-note">標準体重（BMI 22）の目安：{std.toFixed(1)} kg</p>
    </div>
  )
}

/* ---------- 割り勘 ---------- */
export function SplitBill() {
  const [total, setTotal] = useState(10000)
  const [people, setPeople] = useState(4)
  const [unit, setUnit] = useState(100)
  const per = people > 0 ? Math.ceil(total / people / unit) * unit : 0
  const collected = per * people
  return (
    <div className="sa-app">
      <div className="sa-row">
        <label>合計(円) <input type="number" value={total} onChange={(e) => setTotal(Number(e.target.value))} className="sa-num-wide" /></label>
        <label>人数 <input type="number" value={people} onChange={(e) => setPeople(Number(e.target.value))} className="sa-num" /></label>
        <label>丸め
          <select value={unit} onChange={(e) => setUnit(Number(e.target.value))}>
            <option value={1}>1円</option><option value={10}>10円</option><option value={100}>100円</option><option value={500}>500円</option>
          </select>
        </label>
      </div>
      <div className="sa-big">1人 {per.toLocaleString()} 円</div>
      <p className="sa-note">集まる金額 {collected.toLocaleString()} 円（余り {(collected - total).toLocaleString()} 円は幹事さんへ）</p>
    </div>
  )
}

/* ---------- 通貨変換（固定レート） ---------- */
const RATES: Record<string, { label: string; per: number }> = {
  JPY: { label: '日本円 (JPY)', per: 1 },
  USD: { label: '米ドル (USD)', per: 156 },
  EUR: { label: 'ユーロ (EUR)', per: 168 },
  GBP: { label: '英ポンド (GBP)', per: 198 },
  CNY: { label: '人民元 (CNY)', per: 21.5 },
  KRW: { label: '韓国ウォン (KRW)', per: 0.112 },
  AUD: { label: '豪ドル (AUD)', per: 102 },
  CAD: { label: '加ドル (CAD)', per: 112 },
  CHF: { label: 'スイスフラン (CHF)', per: 176 },
  HKD: { label: '香港ドル (HKD)', per: 20 },
  TWD: { label: '台湾ドル (TWD)', per: 4.9 },
}
export function Currency() {
  const [amount, setAmount] = useState(10000)
  const [from, setFrom] = useState('JPY')
  const [to, setTo] = useState('USD')
  const [live, setLive] = useState<Record<string, number> | null>(null)
  const [rateInfo, setRateInfo] = useState('')
  const [fetching, setFetching] = useState(false)
  const per = (k: string) => live?.[k] ?? RATES[k].per
  const result = amount * (per(from) / per(to))
  const fetchRates = async () => {
    setFetching(true)
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/USD')
      const j = await r.json()
      if (!j || j.result !== 'success' || !j.rates?.JPY) throw new Error('bad response')
      const next: Record<string, number> = {}
      for (const k of Object.keys(RATES)) {
        const usdRate = j.rates[k]
        if (typeof usdRate === 'number' && usdRate > 0) next[k] = j.rates.JPY / usdRate
      }
      next.JPY = 1
      setLive(next)
      const when = j.time_last_update_utc ? new Date(j.time_last_update_utc).toLocaleString('ja-JP') : new Date().toLocaleString('ja-JP')
      setRateInfo(`最新レートを取得しました（${when} 時点）`)
    } catch {
      setRateInfo('最新レートを取得できませんでした。従来の固定レートを使います')
    } finally { setFetching(false) }
  }
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="sa-num-wide" />
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          {Object.entries(RATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div className="sa-big">≈ {result.toLocaleString(undefined, { maximumFractionDigits: 2 })} {to}</div>
      <div className="sa-row">
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {Object.entries(RATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn" onClick={() => { setFrom(to); setTo(from) }}>⇅ 入れ替え</button>
        <button className="btn accent" onClick={fetchRates} disabled={fetching}>{fetching ? '取得中…' : '最新レートを取得'}</button>
      </div>
      <p className="sa-note">{rateInfo || 'レートは 2026年11月時点の目安（固定値）です。「最新レートを取得」で open.er-api.com の最新値に更新できます。実際の取引レートとは異なります。'}</p>
    </div>
  )
}

/* ---------- 和暦変換 ---------- */
const ERAS = [
  { name: '令和', start: 2019, startM: 5, startD: 1 },
  { name: '平成', start: 1989, startM: 1, startD: 8 },
  { name: '昭和', start: 1926, startM: 12, startD: 25 },
  { name: '大正', start: 1912, startM: 7, startD: 30 },
  { name: '明治', start: 1868, startM: 1, startD: 25 },
]
export function Wareki() {
  const [date, setDate] = useState(todayStr())
  const [era, setEra] = useState('令和')
  const [eraYear, setEraYear] = useState(8)
  const wareki = useMemo(() => {
    const d = new Date(date + 'T00:00:00')
    if (Number.isNaN(d.getTime())) return '—'
    for (const e of ERAS) {
      const start = new Date(e.start, e.startM - 1, e.startD)
      if (d >= start) {
        const y = d.getFullYear() - e.start + 1
        return `${e.name}${y === 1 ? '元' : y}年${d.getMonth() + 1}月${d.getDate()}日`
      }
    }
    return '明治より前'
  }, [date])
  const seireki = useMemo(() => {
    const e = ERAS.find((x) => x.name === era)
    return e ? e.start + eraYear - 1 : null
  }, [era, eraYear])
  return (
    <div className="sa-app">
      <h4 className="sa-h">西暦 → 和暦</h4>
      <div className="sa-row"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="sa-big">{wareki}</div>
      <h4 className="sa-h">和暦 → 西暦</h4>
      <div className="sa-row">
        <select value={era} onChange={(e) => setEra(e.target.value)}>
          {ERAS.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
        </select>
        <input type="number" value={eraYear} onChange={(e) => setEraYear(Number(e.target.value))} className="sa-num" min={1} />
        <span>年</span>
      </div>
      <div className="sa-big">{seireki ? `西暦 ${seireki} 年` : '—'}</div>
    </div>
  )
}
