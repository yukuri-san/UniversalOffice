import { useMemo, useState } from 'react'

type UnitDef = { id: string; label: string; toBase: (v: number) => number; fromBase: (v: number) => number }

const linear = (factor: number) => ({ toBase: (v: number) => v * factor, fromBase: (v: number) => v / factor })

const CATEGORIES: { id: string; label: string; units: UnitDef[] }[] = [
  {
    id: 'length',
    label: '長さ',
    units: [
      { id: 'm', label: 'メートル (m)', ...linear(1) },
      { id: 'km', label: 'キロメートル (km)', ...linear(1000) },
      { id: 'cm', label: 'センチメートル (cm)', ...linear(0.01) },
      { id: 'mm', label: 'ミリメートル (mm)', ...linear(0.001) },
      { id: 'inch', label: 'インチ (in)', ...linear(0.0254) },
      { id: 'ft', label: 'フィート (ft)', ...linear(0.3048) },
      { id: 'mile', label: 'マイル (mi)', ...linear(1609.344) },
    ],
  },
  {
    id: 'weight',
    label: '重さ',
    units: [
      { id: 'kg', label: 'キログラム (kg)', ...linear(1) },
      { id: 'g', label: 'グラム (g)', ...linear(0.001) },
      { id: 't', label: 'トン (t)', ...linear(1000) },
      { id: 'lb', label: 'ポンド (lb)', ...linear(0.45359237) },
      { id: 'oz', label: 'オンス (oz)', ...linear(0.028349523125) },
    ],
  },
  {
    id: 'temp',
    label: '温度',
    units: [
      { id: 'c', label: '摂氏 (°C)', toBase: (v) => v, fromBase: (v) => v },
      { id: 'f', label: '華氏 (°F)', toBase: (v) => ((v - 32) * 5) / 9, fromBase: (v) => (v * 9) / 5 + 32 },
      { id: 'k', label: 'ケルビン (K)', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
    ],
  },
  {
    id: 'data',
    label: 'データ量',
    units: [
      { id: 'b', label: 'バイト (B)', ...linear(1) },
      { id: 'kb', label: 'キロバイト (KB)', ...linear(1000) },
      { id: 'mb', label: 'メガバイト (MB)', ...linear(1000 ** 2) },
      { id: 'gb', label: 'ギガバイト (GB)', ...linear(1000 ** 3) },
      { id: 'tb', label: 'テラバイト (TB)', ...linear(1000 ** 4) },
      { id: 'kib', label: 'キビバイト (KiB)', ...linear(1024) },
      { id: 'mib', label: 'メビバイト (MiB)', ...linear(1024 ** 2) },
      { id: 'gib', label: 'ギビバイト (GiB)', ...linear(1024 ** 3) },
    ],
  },
]

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e12 || abs < 1e-6) return n.toExponential(5)
  return String(Number(n.toPrecision(8)))
}

export default function UnitConverter() {
  const [catId, setCatId] = useState('length')
  const cat = CATEGORIES.find((c) => c.id === catId) ?? CATEGORIES[0]
  const [fromId, setFromId] = useState('m')
  const [toId, setToId] = useState('cm')
  const [input, setInput] = useState('1')

  const from = cat.units.find((u) => u.id === fromId) ?? cat.units[0]
  const to = cat.units.find((u) => u.id === toId) ?? cat.units[1] ?? cat.units[0]

  const result = useMemo(() => {
    const v = Number(input)
    if (input.trim() === '' || Number.isNaN(v)) return '—'
    return fmt(to.fromBase(from.toBase(v)))
  }, [input, from, to])

  const pickCat = (id: string) => {
    const c = CATEGORIES.find((x) => x.id === id) ?? CATEGORIES[0]
    setCatId(id)
    setFromId(c.units[0].id)
    setToId((c.units[1] ?? c.units[0]).id)
  }

  const swap = () => {
    setFromId(to.id)
    setToId(from.id)
    if (result !== '—') setInput(result)
  }

  return (
    <div className="unit-app">
      <div className="unit-cats">
        {CATEGORIES.map((c) => (
          <button key={c.id} className={c.id === catId ? 'chip on' : 'chip'} onClick={() => pickCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="unit-row">
        <input className="unit-input" inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} aria-label="変換する値" />
        <select value={from.id} onChange={(e) => setFromId(e.target.value)}>
          {cat.units.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </select>
      </div>
      <button className="unit-swap" onClick={swap}>⇅ 入れ替え</button>
      <div className="unit-row">
        <div className="unit-result">{result}</div>
        <select value={to.id} onChange={(e) => setToId(e.target.value)}>
          {cat.units.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </select>
      </div>
      <p className="unit-note">ストアからインストールされたアプリです。アンインストールはストアからできます。</p>
    </div>
  )
}
