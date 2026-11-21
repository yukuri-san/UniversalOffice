import { useState } from 'react'

const num = (s: string) => (s === '' ? NaN : Number(s))
const fmt = (n: number, d = 2) => (Number.isFinite(n) ? String(Math.round(n * 10 ** d) / 10 ** d) : '―')

/* ---------- 進数変換 ---------- */
export function BaseConv() {
  const [val, setVal] = useState('255')
  const [base, setBase] = useState(10)
  const n = parseInt(val.trim(), base)
  const valid = val.trim() !== '' && !Number.isNaN(n)
  const show = (b: number) => (valid ? n.toString(b).toUpperCase() : '―')
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="text" value={val} onChange={(e) => setVal(e.target.value)} style={{ flex: 1 }} placeholder="変換したい数" />
        <select value={base} onChange={(e) => setBase(Number(e.target.value))}>
          <option value={2}>2進数として入力</option>
          <option value={8}>8進数として入力</option>
          <option value={10}>10進数として入力</option>
          <option value={16}>16進数として入力</option>
        </select>
      </div>
      <div className="sa-log">
        <div className="sa-cardrow"><span>2進数</span><b className="sa-mono">{show(2)}</b></div>
        <div className="sa-cardrow"><span>8進数</span><b className="sa-mono">{show(8)}</b></div>
        <div className="sa-cardrow"><span>10進数</span><b className="sa-mono">{show(10)}</b></div>
        <div className="sa-cardrow"><span>16進数</span><b className="sa-mono">{show(16)}</b></div>
      </div>
      {!valid && val.trim() !== '' && <p className="sa-note" style={{ color: '#dc2626' }}>その進数では使えない文字が含まれています。</p>}
      <p className="sa-note">2進数・8進数・10進数・16進数を相互変換します（整数のみ）。</p>
    </div>
  )
}

/* ---------- 割合計算 ---------- */
export function Percent() {
  const [a, setA] = useState('200')
  const [b, setB] = useState('25')
  const na = num(a); const nb = num(b)
  return (
    <div className="sa-app">
      <div className="sa-row">
        <label>もとの数 <input type="number" className="sa-num-wide" value={a} onChange={(e) => setA(e.target.value)} /></label>
        <label>割合（％） <input type="number" className="sa-num" value={b} onChange={(e) => setB(e.target.value)} /></label>
      </div>
      <div className="sa-log">
        <div className="sa-cardrow"><span>{a || '―'} の {b || '―'}％ は</span><b>{fmt(na * nb / 100)}</b></div>
        <div className="sa-cardrow"><span>{b || '―'} は {a || '―'} の何％？</span><b>{fmt(nb / na * 100)} ％</b></div>
        <div className="sa-cardrow"><span>{a || '―'} の {b || '―'}％ 増し</span><b>{fmt(na * (1 + nb / 100))}</b></div>
        <div className="sa-cardrow"><span>{a || '―'} の {b || '―'}％ 引き</span><b>{fmt(na * (1 - nb / 100))}</b></div>
      </div>
      <p className="sa-note">割合の基本計算をまとめて表示します。</p>
    </div>
  )
}

/* ---------- 税込計算 ---------- */
export function TaxCalc() {
  const [price, setPrice] = useState('1000')
  const [rate, setRate] = useState(10)
  const [mode, setMode] = useState<'nuki' | 'komi'>('nuki')
  const p = num(price)
  const withTax = mode === 'nuki' ? p * (1 + rate / 100) : p
  const withoutTax = mode === 'nuki' ? p : p / (1 + rate / 100)
  return (
    <div className="sa-app">
      <div className="sa-row">
        <button className={`btn ${mode === 'nuki' ? 'accent' : ''}`} onClick={() => setMode('nuki')}>税抜を入力</button>
        <button className={`btn ${mode === 'komi' ? 'accent' : ''}`} onClick={() => setMode('komi')}>税込を入力</button>
        <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>
          <option value={10}>消費税 10％</option>
          <option value={8}>消費税 8％（軽減税率）</option>
        </select>
      </div>
      <div className="sa-row">
        <label>{mode === 'nuki' ? '税抜価格' : '税込価格'} <input type="number" className="sa-num-wide" value={price} onChange={(e) => setPrice(e.target.value)} /> 円</label>
      </div>
      <div className="sa-log">
        <div className="sa-cardrow"><span>税込価格</span><b>{Number.isFinite(withTax) ? `${Math.floor(withTax).toLocaleString('ja-JP')} 円` : '―'}</b></div>
        <div className="sa-cardrow"><span>税抜価格</span><b>{Number.isFinite(withoutTax) ? `${Math.floor(withoutTax).toLocaleString('ja-JP')} 円` : '―'}</b></div>
        <div className="sa-cardrow"><span>消費税額</span><b>{Number.isFinite(p) ? `${Math.floor(withTax - withoutTax).toLocaleString('ja-JP')} 円` : '―'}</b></div>
      </div>
      <p className="sa-note">税込・税抜の相互計算です（端数は切り捨て表示）。</p>
    </div>
  )
}

/* ---------- 割引計算 ---------- */
export function Discount() {
  const [price, setPrice] = useState('3000')
  const [off, setOff] = useState('20')
  const p = num(price); const o = num(off)
  const final = p * (1 - o / 100)
  return (
    <div className="sa-app">
      <div className="sa-row">
        <label>定価 <input type="number" className="sa-num-wide" value={price} onChange={(e) => setPrice(e.target.value)} /> 円</label>
        <label>割引 <input type="number" className="sa-num" value={off} onChange={(e) => setOff(e.target.value)} /> ％引き</label>
      </div>
      <div className="sa-row">
        {[10, 20, 30, 50, 70].map((v) => <button key={v} className="btn small" onClick={() => setOff(String(v))}>{v}％引き</button>)}
      </div>
      <div className="sa-log">
        <div className="sa-cardrow"><span>割引後の価格</span><b className="sa-big">{Number.isFinite(final) ? `${Math.round(final).toLocaleString('ja-JP')} 円` : '―'}</b></div>
        <div className="sa-cardrow"><span>お得になる金額</span><b>{Number.isFinite(final) ? `${Math.round(p - final).toLocaleString('ja-JP')} 円` : '―'}</b></div>
      </div>
      <p className="sa-note">セールの割引価格をすぐ計算できます。</p>
    </div>
  )
}

/* ---------- ローン計算 ---------- */
export function Loan() {
  const [principal, setPrincipal] = useState('3000000')
  const [rate, setRate] = useState('1.5')
  const [years, setYears] = useState('10')
  const P = num(principal); const annual = num(rate); const Y = num(years)
  const r = annual / 100 / 12
  const n = Y * 12
  const monthly = Number.isFinite(P) && n > 0 ? (r === 0 ? P / n : P * r * (1 + r) ** n / ((1 + r) ** n - 1)) : NaN
  const total = monthly * n
  return (
    <div className="sa-app">
      <div className="sa-row">
        <label>借入額 <input type="number" className="sa-num-wide" value={principal} onChange={(e) => setPrincipal(e.target.value)} /> 円</label>
      </div>
      <div className="sa-row">
        <label>年利 <input type="number" className="sa-num" value={rate} onChange={(e) => setRate(e.target.value)} step="0.1" /> ％</label>
        <label>期間 <input type="number" className="sa-num" value={years} onChange={(e) => setYears(e.target.value)} /> 年</label>
      </div>
      <div className="sa-log">
        <div className="sa-cardrow"><span>毎月の返済額（元利均等）</span><b className="sa-big">{Number.isFinite(monthly) ? `${Math.round(monthly).toLocaleString('ja-JP')} 円` : '―'}</b></div>
        <div className="sa-cardrow"><span>返済総額</span><b>{Number.isFinite(total) ? `${Math.round(total).toLocaleString('ja-JP')} 円` : '―'}</b></div>
        <div className="sa-cardrow"><span>利息の合計</span><b>{Number.isFinite(total) ? `${Math.round(total - P).toLocaleString('ja-JP')} 円` : '―'}</b></div>
      </div>
      <p className="sa-note">元利均等返済の概算です。実際の返済額は金融機関の条件で変わります。</p>
    </div>
  )
}

/* ---------- チップ計算 ---------- */
export function Tip() {
  const [bill, setBill] = useState('5000')
  const [pct, setPct] = useState(15)
  const [people, setPeople] = useState('2')
  const b = num(bill); const pp = num(people)
  const tipAmt = b * pct / 100
  const total = b + tipAmt
  return (
    <div className="sa-app">
      <div className="sa-row">
        <label>お会計 <input type="number" className="sa-num-wide" value={bill} onChange={(e) => setBill(e.target.value)} /> 円</label>
        <label>人数 <input type="number" className="sa-num" value={people} onChange={(e) => setPeople(e.target.value)} /> 人</label>
      </div>
      <div className="sa-row">
        {[10, 15, 18, 20, 25].map((v) => <button key={v} className={`btn small ${pct === v ? 'accent' : ''}`} onClick={() => setPct(v)}>チップ {v}％</button>)}
      </div>
      <div className="sa-log">
        <div className="sa-cardrow"><span>チップ額</span><b>{Number.isFinite(tipAmt) ? `${Math.round(tipAmt).toLocaleString('ja-JP')} 円` : '―'}</b></div>
        <div className="sa-cardrow"><span>合計</span><b>{Number.isFinite(total) ? `${Math.round(total).toLocaleString('ja-JP')} 円` : '―'}</b></div>
        <div className="sa-cardrow"><span>1人あたり</span><b className="sa-big">{Number.isFinite(total) && pp > 0 ? `${Math.round(total / pp).toLocaleString('ja-JP')} 円` : '―'}</b></div>
      </div>
      <p className="sa-note">海外旅行先でのチップと割り勘の計算に。</p>
    </div>
  )
}

/* ---------- 時給換算 ---------- */
export function Salary() {
  const [wage, setWage] = useState('1100')
  const [hours, setHours] = useState('8')
  const [days, setDays] = useState('20')
  const [monthly, setMonthly] = useState('200000')
  const w = num(wage); const h = num(hours); const d = num(days); const m = num(monthly)
  const month = w * h * d
  return (
    <div className="sa-app">
      <h3 className="sa-h">時給から計算</h3>
      <div className="sa-row">
        <label>時給 <input type="number" className="sa-num" value={wage} onChange={(e) => setWage(e.target.value)} /> 円</label>
        <label>1日 <input type="number" className="sa-num" value={hours} onChange={(e) => setHours(e.target.value)} /> 時間</label>
        <label>月 <input type="number" className="sa-num" value={days} onChange={(e) => setDays(e.target.value)} /> 日</label>
      </div>
      <div className="sa-log">
        <div className="sa-cardrow"><span>日給</span><b>{Number.isFinite(w * h) ? `${Math.round(w * h).toLocaleString('ja-JP')} 円` : '―'}</b></div>
        <div className="sa-cardrow"><span>月収（目安）</span><b>{Number.isFinite(month) ? `${Math.round(month).toLocaleString('ja-JP')} 円` : '―'}</b></div>
        <div className="sa-cardrow"><span>年収（目安）</span><b>{Number.isFinite(month) ? `${Math.round(month * 12).toLocaleString('ja-JP')} 円` : '―'}</b></div>
      </div>
      <h3 className="sa-h">月収から時給換算</h3>
      <div className="sa-row">
        <label>月収 <input type="number" className="sa-num-wide" value={monthly} onChange={(e) => setMonthly(e.target.value)} /> 円</label>
      </div>
      <div className="sa-cardrow"><span>時給換算（上の勤務条件で）</span><b>{Number.isFinite(m) && h * d > 0 ? `${Math.round(m / (h * d)).toLocaleString('ja-JP')} 円` : '―'}</b></div>
      <p className="sa-note">税金・社会保険などは考慮していません。</p>
    </div>
  )
}

/* ---------- ペース計算 ---------- */
export function Pace() {
  const [dist, setDist] = useState('10')
  const [min, setMin] = useState('50')
  const [sec, setSec] = useState('0')
  const d = num(dist); const totalSec = num(min) * 60 + num(sec)
  const paceSec = totalSec / d
  const speed = d / (totalSec / 3600)
  const paceStr = Number.isFinite(paceSec) && paceSec > 0 ? `${Math.floor(paceSec / 60)}分${String(Math.round(paceSec % 60)).padStart(2, '0')}秒` : '―'
  const predict = (km: number) => {
    const s = paceSec * km
    if (!Number.isFinite(s) || s <= 0) return '―'
    const hh = Math.floor(s / 3600); const mm = Math.floor((s % 3600) / 60); const ss = Math.round(s % 60)
    return hh > 0 ? `${hh}時間${mm}分${ss}秒` : `${mm}分${ss}秒`
  }
  return (
    <div className="sa-app">
      <div className="sa-row">
        <label>距離 <input type="number" className="sa-num" value={dist} onChange={(e) => setDist(e.target.value)} /> km</label>
        <label>タイム <input type="number" className="sa-num" value={min} onChange={(e) => setMin(e.target.value)} /> 分</label>
        <input type="number" className="sa-num" value={sec} onChange={(e) => setSec(e.target.value)} aria-label="秒" /> 秒
      </div>
      <div className="sa-log">
        <div className="sa-cardrow"><span>ペース（1kmあたり）</span><b className="sa-big">{paceStr}</b></div>
        <div className="sa-cardrow"><span>平均速度</span><b>{fmt(speed)} km/h</b></div>
        <div className="sa-cardrow"><span>ハーフ（21.1km）予測</span><b>{predict(21.0975)}</b></div>
        <div className="sa-cardrow"><span>フル（42.2km）予測</span><b>{predict(42.195)}</b></div>
      </div>
      <p className="sa-note">ランニングのペース計算と、同じペースで走った場合の予測タイムです。</p>
    </div>
  )
}

/* ---------- アスペクト比 ---------- */
function gcd2(a: number, b: number): number { return b === 0 ? a : gcd2(b, a % b) }
export function Aspect() {
  const [w, setW] = useState('1920')
  const [h, setH] = useState('1080')
  const [targetW, setTargetW] = useState('1280')
  const nw = num(w); const nh = num(h); const tw = num(targetW)
  const g = Number.isFinite(nw) && Number.isFinite(nh) && nw > 0 && nh > 0 ? gcd2(Math.round(nw), Math.round(nh)) : NaN
  const ratio = Number.isFinite(g) ? `${Math.round(nw) / g} : ${Math.round(nh) / g}` : '―'
  const th = tw * nh / nw
  return (
    <div className="sa-app">
      <div className="sa-row">
        <label>幅 <input type="number" className="sa-num-wide" value={w} onChange={(e) => setW(e.target.value)} /></label>
        <label>高さ <input type="number" className="sa-num-wide" value={h} onChange={(e) => setH(e.target.value)} /></label>
      </div>
      <div className="sa-cardrow"><span>アスペクト比</span><b className="sa-big">{ratio}</b></div>
      <div className="sa-row">
        <label>目標の幅 <input type="number" className="sa-num-wide" value={targetW} onChange={(e) => setTargetW(e.target.value)} /></label>
        <span>→ 高さは <b>{Number.isFinite(th) ? Math.round(th) : '―'}</b></span>
      </div>
      <div className="sa-row">
        {[['1920', '1080'], ['1280', '720'], ['800', '600'], ['1080', '1080'], ['1080', '1920']].map(([a, b]) => (
          <button key={`${a}x${b}`} className="btn small" onClick={() => { setW(a); setH(b) }}>{a}×{b}</button>
        ))}
      </div>
      <p className="sa-note">画面や画像の縦横比と、比率を保ったサイズ計算に。</p>
    </div>
  )
}

/* ---------- 約数・倍数 ---------- */
export function Gcd() {
  const [a, setA] = useState('48')
  const [b, setB] = useState('36')
  const na = Math.abs(Math.round(num(a))); const nb = Math.abs(Math.round(num(b)))
  const g = na > 0 && nb > 0 ? gcd2(na, nb) : NaN
  const lcm = Number.isFinite(g) && g > 0 ? na * nb / g : NaN
  const divisors = (n: number): number[] => {
    const out: number[] = []
    for (let i = 1; i <= n; i++) if (n % i === 0) out.push(i)
    return out
  }
  return (
    <div className="sa-app">
      <div className="sa-row">
        <label>数A <input type="number" className="sa-num-wide" value={a} onChange={(e) => setA(e.target.value)} /></label>
        <label>数B <input type="number" className="sa-num-wide" value={b} onChange={(e) => setB(e.target.value)} /></label>
      </div>
      <div className="sa-log">
        <div className="sa-cardrow"><span>最大公約数</span><b className="sa-big">{Number.isFinite(g) ? g : '―'}</b></div>
        <div className="sa-cardrow"><span>最小公倍数</span><b className="sa-big">{Number.isFinite(lcm) ? lcm : '―'}</b></div>
        <div className="sa-cardrow"><span>{na || 'A'} の約数</span><b className="sa-mono">{na > 0 && na <= 100000 ? divisors(na).join(', ') : '―'}</b></div>
        <div className="sa-cardrow"><span>{nb || 'B'} の約数</span><b className="sa-mono">{nb > 0 && nb <= 100000 ? divisors(nb).join(', ') : '―'}</b></div>
      </div>
      <p className="sa-note">最大公約数・最小公倍数・約数を調べます（正の整数）。</p>
    </div>
  )
}

/* ---------- 素数判定 ---------- */
function factorize(n: number): number[] {
  const out: number[] = []
  let x = n
  for (let p = 2; p * p <= x; p++) while (x % p === 0) { out.push(p); x /= p }
  if (x > 1) out.push(x)
  return out
}
export function Prime() {
  const [val, setVal] = useState('97')
  const n = Math.round(num(val))
  const valid = Number.isFinite(n) && n >= 2 && n <= 100000000
  const factors = valid ? factorize(n) : []
  const isPrime = valid && factors.length === 1 && factors[0] === n
  let nextPrime = NaN
  if (valid) { let c = n + 1; while (factorize(c).length !== 1 || factorize(c)[0] !== c) c++; nextPrime = c }
  return (
    <div className="sa-app">
      <div className="sa-row">
        <label>調べる数 <input type="number" className="sa-num-wide" value={val} onChange={(e) => setVal(e.target.value)} /></label>
      </div>
      {valid ? (
        <div className="sa-log">
          <div className="sa-cardrow"><span>判定</span><b className="sa-big">{isPrime ? '素数です！' : '素数ではありません'}</b></div>
          <div className="sa-cardrow"><span>素因数分解</span><b className="sa-mono">{factors.join(' × ')}</b></div>
          <div className="sa-cardrow"><span>次の素数</span><b>{nextPrime}</b></div>
        </div>
      ) : <p className="sa-note" style={{ color: '#dc2626' }}>2以上1億以下の整数を入力してください。</p>}
      <p className="sa-note">素数かどうかと素因数分解、次の素数を表示します。</p>
    </div>
  )
}

/* ---------- 順列・組合せ ---------- */
function fact(n: number): number { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r }
export function Combin() {
  const [n, setN] = useState('10')
  const [r, setR] = useState('3')
  const nn = Math.round(num(n)); const rr = Math.round(num(r))
  const ok = Number.isFinite(nn) && Number.isFinite(rr) && nn >= 0 && rr >= 0 && rr <= nn && nn <= 170
  const nPr = ok ? fact(nn) / fact(nn - rr) : NaN
  const nCr = ok ? fact(nn) / (fact(rr) * fact(nn - rr)) : NaN
  return (
    <div className="sa-app">
      <div className="sa-row">
        <label>n <input type="number" className="sa-num" value={n} onChange={(e) => setN(e.target.value)} /></label>
        <label>r <input type="number" className="sa-num" value={r} onChange={(e) => setR(e.target.value)} /></label>
      </div>
      <div className="sa-log">
        <div className="sa-cardrow"><span>順列 nPr（並べ方）</span><b>{ok ? nPr.toLocaleString('ja-JP') : '―'}</b></div>
        <div className="sa-cardrow"><span>組合せ nCr（選び方）</span><b>{ok ? nCr.toLocaleString('ja-JP') : '―'}</b></div>
        <div className="sa-cardrow"><span>階乗 n!</span><b>{ok ? fact(nn).toLocaleString('ja-JP') : '―'}</b></div>
      </div>
      {!ok && <p className="sa-note" style={{ color: '#dc2626' }}>0 ≦ r ≦ n ≦ 170 の整数で入力してください。</p>}
      <p className="sa-note">順列・組合せ・階乗の計算です。大きな数では概数になることがあります。</p>
    </div>
  )
}
