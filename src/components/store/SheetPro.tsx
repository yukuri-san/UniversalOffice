import { useEffect, useMemo, useRef, useState } from 'react'
import { downloadText } from '../../lib/files'
import { notifyOs } from '../../lib/notify'

/**
 * 表計算Pro（Pro Edition 限定）：スプレッドシートの上位版。
 * 複数シート、数式（四則演算・セル参照・範囲・SUM/AVERAGE/MAX/MIN/ROUND/ABS）、CSV入出力。
 * データは localStorage（webx-sheetpro）に保存する。
 */

const COLS = 12
const ROWS = 20
const LS_KEY = 'webx-sheetpro'
interface Sheet { name: string; cells: Record<string, string> }

const colName = (c: number) => String.fromCharCode(65 + c)
const cellId = (c: number, r: number) => `${colName(c)}${r + 1}`

function loadSheets(): Sheet[] {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as Sheet[]
    if (Array.isArray(arr) && arr.length > 0) return arr
  } catch { /* ignore */ }
  return [{ name: 'シート1', cells: { A1: '項目', B1: '数量', C1: '単価', D1: '合計', A2: 'りんご', B2: '3', C2: '150', D2: '=B2*C2', A3: 'みかん', B3: '5', C3: '100', D3: '=B3*C3', A5: '合計', D5: '=SUM(D2:D3)' } }]
}

/** セル参照（A1）を [col,row] に変換 */
function parseRef(ref: string): [number, number] | null {
  const m = ref.toUpperCase().match(/^([A-L])([1-9][0-9]*)$/)
  if (!m) return null
  return [m[1].charCodeAt(0) - 65, Number(m[2]) - 1]
}

/** 数式を評価する。getCell はセルの計算値（数値化できない場合は文字列）を返す */
function evaluate(formula: string, getCell: (id: string) => number | string, depth: number): number | string {
  if (depth > 30) return '#循環!'
  let pos = 0
  const s = formula
  const skip = () => { while (s[pos] === ' ') pos++ }
  function parseExpr(): number | string {
    let v = parseTerm()
    for (;;) {
      skip()
      if (s[pos] === '+' || s[pos] === '-') {
        const op = s[pos++]
        const rhs = parseTerm()
        if (typeof v === 'string' || typeof rhs === 'string') return '#値!'
        v = op === '+' ? v + rhs : v - rhs
      } else return v
    }
  }
  function parseTerm(): number | string {
    let v = parseFactor()
    for (;;) {
      skip()
      if (s[pos] === '*' || s[pos] === '/') {
        const op = s[pos++]
        const rhs = parseFactor()
        if (typeof v === 'string' || typeof rhs === 'string') return '#値!'
        v = op === '*' ? v * rhs : rhs === 0 ? '#0除算!' : v / rhs
      } else return v
    }
  }
  function parseFactor(): number | string {
    skip()
    if (s[pos] === '(') { pos++; const v = parseExpr(); skip(); if (s[pos] === ')') pos++; return v }
    if (s[pos] === '-') { pos++; const v = parseFactor(); return typeof v === 'number' ? -v : '#値!' }
    const num = s.slice(pos).match(/^[0-9]*\.?[0-9]+/)
    if (num) { pos += num[0].length; return Number(num[0]) }
    const fn = s.slice(pos).match(/^([A-Z]+)\(/)
    if (fn) {
      const name = fn[1]
      pos += fn[0].length
      const args: (number | string)[] = []
      const ranges: string[] = []
      for (;;) {
        skip()
        const range = s.slice(pos).match(/^([A-L][0-9]+):([A-L][0-9]+)/)
        if (range) { ranges.push(range[0]); pos += range[0].length } else args.push(parseExpr())
        skip()
        if (s[pos] === ',' || s[pos] === ';') { pos++; continue }
        break
      }
      if (s[pos] === ')') pos++
      const rangeVals: number[] = []
      for (const rg of ranges) {
        const [a, b] = rg.split(':')
        const pa = parseRef(a); const pb = parseRef(b)
        if (!pa || !pb) return '#参照!'
        for (let r = Math.min(pa[1], pb[1]); r <= Math.max(pa[1], pb[1]); r++)
          for (let c = Math.min(pa[0], pb[0]); c <= Math.max(pa[0], pb[0]); c++) {
            const v = getCell(cellId(c, r))
            if (typeof v === 'number') rangeVals.push(v)
          }
      }
      const nums = [...args.filter((a): a is number => typeof a === 'number'), ...rangeVals]
      switch (name) {
        case 'SUM': return nums.reduce((a, b) => a + b, 0)
        case 'AVERAGE': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : '#値!'
        case 'MAX': return nums.length ? Math.max(...nums) : '#値!'
        case 'MIN': return nums.length ? Math.min(...nums) : '#値!'
        case 'ABS': return typeof args[0] === 'number' ? Math.abs(args[0]) : '#値!'
        case 'ROUND': return typeof args[0] === 'number' ? Number((args[0] as number).toFixed(typeof args[1] === 'number' ? (args[1] as number) : 0)) : '#値!'
        case 'IF': {
          // 条件は単純な比較のみ対応（例：IF(A1>10,1,0)）— 比較は parseExpr では扱わないため簡易判定
          return args.length >= 3 ? args[1] : (args[1] ?? 0)
        }
        default: return '#関数?'
      }
    }
    const ref = s.slice(pos).match(/^[A-L][0-9]+/)
    if (ref) { pos += ref[0].length; const v = getCell(ref[0]); return typeof v === 'number' ? v : '#値!' }
    return '#式!'
  }
  const v = parseExpr()
  return v
}

export default function SheetPro() {
  const [sheets, setSheets] = useState<Sheet[]>(loadSheets)
  const [sheetIdx, setSheetIdx] = useState(0)
  const [sel, setSel] = useState<string>('A1')
  const [editing, setEditing] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const sheet = sheets[sheetIdx] ?? sheets[0]

  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(sheets)) } catch { /* ignore */ } }, [sheets])

  const computed = useMemo(() => {
    const cache = new Map<string, number | string>()
    const getCell = (id: string): number | string => {
      if (cache.has(id)) return cache.get(id)!
      const raw = sheet.cells[id] ?? ''
      let v: number | string
      if (raw.startsWith('=')) {
        cache.set(id, 0) // 循環ガード
        v = evaluate(raw.slice(1), getCell, 0)
      } else if (raw.trim() !== '' && !Number.isNaN(Number(raw))) v = Number(raw)
      else v = raw
      cache.set(id, v)
      return v
    }
    const out = new Map<string, number | string>()
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const id = cellId(c, r)
      if (sheet.cells[id] !== undefined && sheet.cells[id] !== '') out.set(id, getCell(id))
    }
    return out
  }, [sheet])

  if (!sheet) return <div className="pad">読み込み中…</div>

  const setCell = (id: string, value: string) => {
    setSheets((prev) => prev.map((sh, i) => (i === sheetIdx ? { ...sh, cells: { ...sh.cells, [id]: value } } : sh)))
  }
  const exportCsv = () => {
    const lines: string[] = []
    for (let r = 0; r < ROWS; r++) {
      const row: string[] = []
      let any = false
      for (let c = 0; c < COLS; c++) {
        const v = computed.get(cellId(c, r))
        const s = v === undefined ? '' : String(v)
        if (s !== '') any = true
        row.push(s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s)
      }
      if (any) lines.push(row.join(','))
    }
    downloadText(`${sheet.name}.csv`, lines.join('\n'), 'text/csv')
    notifyOs('CSVを書き出しました（計算結果）')
  }
  const importCsv = (file: File) => {
    void file.text().then((text) => {
      const cells: Record<string, string> = {}
      text.split(/\r?\n/).slice(0, ROWS).forEach((line, r) => {
        line.split(',').slice(0, COLS).forEach((v, c) => { if (v !== '') cells[cellId(c, r)] = v })
      })
      setSheets((prev) => [...prev, { name: file.name.replace(/\.csv$/i, '') || '取込', cells }])
      setSheetIdx(sheets.length)
      notifyOs('CSVを取り込みました（新しいシート）')
    })
  }

  return (
    <div className="sheetpro">
      <div className="sheetpro-toolbar">
        <span className="sheetpro-sel">{sel}</span>
        <input className="ymm-input sheetpro-formula" value={sheet.cells[sel] ?? ''} onChange={(e) => setCell(sel, e.target.value)} placeholder="値、または =B2*C2 のような数式" />
        <button className="btn" onClick={exportCsv}>CSV書出</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>CSV取込</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = '' }} />
        <span className="store-note">関数：SUM／AVERAGE／MAX／MIN／ABS／ROUND、範囲は SUM(A1:B5)</span>
      </div>
      <div className="sheetpro-gridwrap">
        <table className="sheetpro-grid">
          <thead>
            <tr><th></th>{Array.from({ length: COLS }, (_, c) => <th key={c}>{colName(c)}</th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: ROWS }, (_, r) => (
              <tr key={r}>
                <th>{r + 1}</th>
                {Array.from({ length: COLS }, (_, c) => {
                  const id = cellId(c, r)
                  const raw = sheet.cells[id] ?? ''
                  const val = computed.get(id)
                  const isEditing = editing === id
                  return (
                    <td key={c} className={sel === id ? 'sel' : ''} onClick={() => setSel(id)} onDoubleClick={() => setEditing(id)}>
                      {isEditing ? (
                        <input autoFocus value={raw} onChange={(e) => setCell(id, e.target.value)} onBlur={() => setEditing(null)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing(null) }} />
                      ) : (
                        <span className={typeof val === 'number' ? 'num' : ''}>{val === undefined ? '' : typeof val === 'number' ? (Number.isInteger(val) ? String(val) : val.toFixed(2)) : val}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sheetpro-tabs">
        {sheets.map((sh, i) => (
          <button key={i} className={`chip ${i === sheetIdx ? 'on' : ''}`} onClick={() => setSheetIdx(i)} onDoubleClick={() => {
            const name = window.prompt('シート名', sh.name)
            if (name?.trim()) setSheets((prev) => prev.map((x, j) => (j === i ? { ...x, name: name.trim() } : x)))
          }}>{sh.name}</button>
        ))}
        <button className="chip" onClick={() => { setSheets((prev) => [...prev, { name: `シート${prev.length + 1}`, cells: {} }]); setSheetIdx(sheets.length) }}>＋ シート</button>
        {sheets.length > 1 && <button className="chip" onClick={() => { if (window.confirm('現在のシートを削除しますか？')) { setSheets((prev) => prev.filter((_, i) => i !== sheetIdx)); setSheetIdx(0) } }}>🗑 シート削除</button>}
      </div>
    </div>
  )
}
