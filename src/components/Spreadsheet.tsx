import { useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { downloadText, escapeHtml, printHtml } from '../lib/files'
import Backstage, { type AppId } from './Backstage'
import FileManager from './FileManager'
import { listDocs } from '../lib/store'

const GRID_KEY = 'universal-office-sheet-grid'
const NAME_KEY = 'universal-office-sheet-name'

const SAMPLE: string[][] = [
  ['名前', '個数', '単価', '金額'],
  ['りんご', '3', '150', '=B2*C2'],
  ['みかん', '5', '100', '=B3*C3'],
  ['合計', '', '', '=SUM(D2:D3)'],
]

function colName(index: number): string {
  let name = ''
  let n = index + 1
  while (n > 0) {
    const r = (n - 1) % 26
    name = String.fromCharCode(65 + r) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

function refToPos(ref: string): { r: number; c: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase())
  if (!m) return null
  let c = 0
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64)
  return { c: c - 1, r: Number(m[2]) - 1 }
}

/** 数式を評価する。対応：四則演算・括弧・セル参照・範囲・SUM/AVERAGE/MIN/MAX/COUNT */
export function evaluateGrid(grid: string[][]): string[][] {
  const cache = new Map<string, number | string>()

  const cellNumber = (r: number, c: number, visiting: Set<string>): number | string => {
    const key = `${r},${c}`
    if (cache.has(key)) return cache.get(key)!
    if (visiting.has(key)) return '#循環!'
    const raw = grid[r]?.[c] ?? ''
    let result: number | string
    if (raw.startsWith('=')) {
      visiting.add(key)
      result = evalFormula(raw.slice(1), visiting)
      visiting.delete(key)
    } else if (raw.trim() === '') {
      result = 0
    } else {
      const n = Number(raw)
      result = Number.isNaN(n) ? '#値!' : n
    }
    cache.set(key, result)
    return result
  }

  const rangeValues = (a: string, b: string, visiting: Set<string>): number[] => {
    const p1 = refToPos(a)
    const p2 = refToPos(b)
    if (!p1 || !p2) return []
    const values: number[] = []
    for (let r = Math.min(p1.r, p2.r); r <= Math.max(p1.r, p2.r); r++) {
      for (let c = Math.min(p1.c, p2.c); c <= Math.max(p1.c, p2.c); c++) {
        const raw = grid[r]?.[c] ?? ''
        if (raw.trim() === '') continue
        const v = cellNumber(r, c, visiting)
        if (typeof v === 'number') values.push(v)
      }
    }
    return values
  }

  const evalFormula = (src: string, visiting: Set<string>): number | string => {
    const tokens = src.toUpperCase().match(/[A-Z]+\d+(?::[A-Z]+\d+)?|[A-Z]+|\d+(?:\.\d+)?|[+\-*/(),]/g)
    if (!tokens) return '#エラー'
    let pos = 0
    const peek = () => tokens[pos]
    const next = () => tokens[pos++]

    const parseExpr = (): number | string => {
      let v = parseTerm()
      while (typeof v === 'number' && (peek() === '+' || peek() === '-')) {
        const op = next()
        const rhs = parseTerm()
        if (typeof rhs !== 'number') return rhs
        v = op === '+' ? v + rhs : v - rhs
      }
      return v
    }
    const parseTerm = (): number | string => {
      let v = parseFactor()
      while (typeof v === 'number' && (peek() === '*' || peek() === '/')) {
        const op = next()
        const rhs = parseFactor()
        if (typeof rhs !== 'number') return rhs
        v = op === '*' ? v * rhs : rhs === 0 ? '#0除算!' : v / rhs
      }
      return v
    }
    const parseFactor = (): number | string => {
      const t = next()
      if (t === undefined) return '#エラー'
      if (t === '-') {
        const v = parseFactor()
        return typeof v === 'number' ? -v : v
      }
      if (t === '(') {
        const v = parseExpr()
        if (next() !== ')') return '#エラー'
        return v
      }
      if (/^\d/.test(t)) return Number(t)
      if (/^[A-Z]+$/.test(t)) {
        // 関数
        if (next() !== '(') return '#エラー'
        const args: number[] = []
        for (;;) {
          const a = next()
          if (a === undefined) return '#エラー'
          if (a.includes(':')) {
            const [from, to] = a.split(':')
            args.push(...rangeValues(from, to, visiting))
          } else if (/^[A-Z]+\d+$/.test(a)) {
            const p = refToPos(a)!
            const v = cellNumber(p.r, p.c, visiting)
            if (typeof v !== 'number') return v
            args.push(v)
          } else if (/^\d/.test(a)) {
            args.push(Number(a))
          } else if (a === ')') {
            break
          } else {
            return '#エラー'
          }
          const sep = next()
          if (sep === ')') break
          if (sep !== ',') return '#エラー'
        }
        switch (t) {
          case 'SUM': return args.reduce((x, y) => x + y, 0)
          case 'AVERAGE': case 'AVG': return args.length ? args.reduce((x, y) => x + y, 0) / args.length : '#0除算!'
          case 'MIN': return args.length ? Math.min(...args) : 0
          case 'MAX': return args.length ? Math.max(...args) : 0
          case 'COUNT': return args.length
          default: return '#関数?'
        }
      }
      if (/^[A-Z]+\d+$/.test(t)) {
        const p = refToPos(t)!
        return cellNumber(p.r, p.c, visiting)
      }
      return '#エラー'
    }

    const v = parseExpr()
    if (pos !== tokens.length) return '#エラー'
    return v
  }

  return grid.map((row, r) =>
    row.map((raw, c) => {
      if (!raw.startsWith('=')) return raw
      const v = cellNumber(r, c, new Set())
      if (typeof v === 'string') return v
      return String(Number(v.toFixed(10)))
    })
  )
}

export default function Spreadsheet({ onSwitch }: { onSwitch: (app: AppId) => void }) {
  const [grid, setGrid] = useState<string[][]>(() => {
    try {
      const saved = localStorage.getItem(GRID_KEY)
      if (saved) return JSON.parse(saved) as string[][]
    } catch { /* ignore */ }
    return SAMPLE
  })
  const [filename, setFilename] = useState(() => localStorage.getItem(NAME_KEY) || 'sheet.csv')
  const [homeOpen, setHomeOpen] = useState(false)
  const [selected, setSelected] = useState({ r: 0, c: 0 })
  const [focused, setFocused] = useState<{ r: number; c: number } | null>(null)
  const [freeze, setFreeze] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  const computed = useMemo(() => evaluateGrid(grid), [grid])

  useEffect(() => {
    localStorage.setItem(GRID_KEY, JSON.stringify(grid))
  }, [grid])
  useEffect(() => {
    localStorage.setItem(NAME_KEY, filename)
  }, [filename])

  // ホーム画面で文書が選ばれたら開く
  useEffect(() => {
    const pending = localStorage.getItem('uo-pending-open')
    if (!pending) return
    void listDocs().then((docs) => {
      const doc = docs.find((d) => d.id === pending)
      if (doc && doc.kind === 'sheet') {
        localStorage.removeItem('uo-pending-open')
        try {
          setGrid(JSON.parse(doc.content) as string[][])
          setFilename(doc.name.endsWith('.csv') ? doc.name : `${doc.name}.csv`)
        } catch { /* ignore */ }
      }
    })
  }, [])

  const setCell = (r: number, c: number, value: string) => {
    setGrid((prev) => prev.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)))
  }

  const addRow = () => setGrid((prev) => [...prev, Array(prev[0]?.length ?? 1).fill('')])
  const addCol = () => setGrid((prev) => prev.map((row) => [...row, '']))
  const deleteRow = () => setGrid((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== selected.r) : prev))
  const deleteCol = () => setGrid((prev) => (prev[0].length > 1 ? prev.map((row) => row.filter((_, i) => i !== selected.c)) : prev))
  const clear = () => setGrid((prev) => prev.map((row) => row.map(() => '')))

  const sortByColumn = (dir: 1 | -1) => {
    setGrid((prev) => {
      const [head, ...body] = prev
      const sorted = [...body].sort((a, b) => {
        const av = a[selected.c] ?? ''
        const bv = b[selected.c] ?? ''
        const an = Number(av)
        const bn = Number(bv)
        if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== '' && bv !== '') return (an - bn) * dir
        return av.localeCompare(bv, 'ja') * dir
      })
      return [head, ...sorted]
    })
  }

  const openCsv = async (file: File) => {
    const text = await file.text()
    const result = Papa.parse<string[]>(text, { skipEmptyLines: false })
    const rows = (result.data as unknown[][]).map((row) => row.map((v) => String(v ?? '')))
    if (rows.length > 0) {
      const width = Math.max(...rows.map((r) => r.length))
      setGrid(rows.map((r) => [...r, ...Array(width - r.length).fill('')]))
      setFilename(file.name)
    }
  }

  const saveCsv = () => {
    downloadText(filename || 'sheet.csv', Papa.unparse(computed), 'text/csv;charset=utf-8')
  }

  const printSheet = () => {
    const head = computed[0]?.map((c) => `<th>${escapeHtml(c)}</th>`).join('') ?? ''
    const body = computed
      .slice(1)
      .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
      .join('')
    printHtml(filename.replace(/\.csv$/i, ''), `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`)
  }

  const selectedRaw = grid[selected.r]?.[selected.c] ?? ''
  const columnSum = useMemo(() => {
    let sum = 0
    let count = 0
    computed.forEach((row) => {
      const v = row[selected.c]
      const n = Number(v)
      if (v !== '' && v !== undefined && !Number.isNaN(n)) { sum += n; count++ }
    })
    return count ? sum : null
  }, [computed, selected.c])

  return (
    <section className="sheet-app">
      <Backstage
        open={homeOpen}
        onClose={() => setHomeOpen(false)}
        current="sheet"
        onSwitch={onSwitch}
        actions={[
          { label: '開く (.csv)', onClick: () => fileRef.current?.click() },
          { label: '保存 (.csv)', hint: '計算結果の値で保存します', onClick: saveCsv },
          { label: '印刷 / PDF', onClick: printSheet },
          { label: 'クリア', hint: 'すべてのセルを空にする', onClick: clear },
        ]}
        fileManager={
          <FileManager
            kind="sheet"
            currentName={filename.replace(/\.csv$/i, '')}
            getContent={() => JSON.stringify(grid)}
            onOpen={(doc) => {
              if (doc.kind !== 'sheet') {
                localStorage.setItem('uo-pending-open', doc.id)
                onSwitch(doc.kind)
                return
              }
              try {
                setGrid(JSON.parse(doc.content) as string[][])
                setFilename(`${doc.name}.csv`)
              } catch { /* ignore */ }
            }}
          />
        }
      />
      <div className="titlebar sheet-title">
        <button className="home-btn" onClick={() => setHomeOpen(true)}>ホーム</button>
        <input className="title-input" value={filename} onChange={(e) => setFilename(e.target.value)} aria-label="ファイル名" />
        <span className="titlebar-app">スプレッドシート</span>
      </div>
      <div className="toolbar">
        <button onClick={() => fileRef.current?.click()}>開く (.csv)</button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void openCsv(f)
            e.target.value = ''
          }}
        />
        <button onClick={saveCsv}>保存 (.csv)</button>
        <button onClick={printSheet}>PDF出力（印刷）</button>
        <button onClick={addRow}>行を追加</button>
        <button onClick={addCol}>列を追加</button>
        <button onClick={deleteRow}>選択行を削除</button>
        <button onClick={deleteCol}>選択列を削除</button>
        <button onClick={() => sortByColumn(1)}>列で昇順</button>
        <button onClick={() => sortByColumn(-1)}>列で降順</button>
        <label className="check-inline"><input type="checkbox" checked={freeze} onChange={(e) => setFreeze(e.target.checked)} /> 先頭行を固定</label>
        <span className="meta">{grid.length} 行 × {grid[0]?.length ?? 0} 列</span>
      </div>
      <div className="formula-bar">
        <span className="cell-addr">{colName(selected.c)}{selected.r + 1}</span>
        <span className="fx">fx</span>
        <input
          value={selectedRaw}
          onChange={(e) => setCell(selected.r, selected.c, e.target.value)}
          placeholder="値、または =SUM(A1:A5) のような数式"
          aria-label="数式バー"
        />
        {columnSum !== null && <span className="col-sum">{colName(selected.c)}列の合計：{Number(columnSum.toFixed(10))}</span>}
      </div>
      <div className="sheet-wrap">
        <table className={freeze ? 'sheet freeze' : 'sheet'}>
          <thead>
            <tr>
              <th className="corner" />
              {grid[0]?.map((_, c) => <th key={c} className={c === selected.c ? 'sel-col' : ''}>{colName(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, r) => (
              <tr key={r}>
                <th className={r === selected.r ? 'sel-row' : ''}>{r + 1}</th>
                {row.map((cell, c) => {
                  const isFocused = focused?.r === r && focused?.c === c
                  return (
                    <td key={c} className={r === selected.r && c === selected.c ? 'sel-cell' : ''}>
                      <input
                        value={isFocused ? cell : (computed[r]?.[c] ?? cell)}
                        onFocus={() => { setSelected({ r, c }); setFocused({ r, c }) }}
                        onBlur={() => setFocused(null)}
                        onChange={(e) => setCell(r, c, e.target.value)}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">数式対応：=B2*C2 のような四則演算と、SUM / AVERAGE / MIN / MAX / COUNT（範囲は A1:B5）。CSV保存は計算結果の値で書き出します。シートは自動で端末内に保存されます。</p>
    </section>
  )
}
