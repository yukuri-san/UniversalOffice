import { useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { downloadText, escapeHtml, printHtml } from '../lib/files'
import Backstage, { type AppId } from './Backstage'
import { useLang } from '../lib/i18n'
import FileManager from './FileManager'
import { listDocs } from '../lib/store'

const GRID_KEY = 'universal-office-sheet-grid'
const NAME_KEY = 'universal-office-sheet-name'
const STYLE_KEY = 'universal-office-sheet-styles'

/** セルの書式。キーは `${row},${col}` */
type CellStyle = { b?: boolean; i?: boolean; color?: string; bg?: string; align?: 'left' | 'center' | 'right' }
type StyleMap = Record<string, CellStyle>

const styleKey = (r: number, c: number) => `${r},${c}`

function loadStyles(): StyleMap {
  try {
    const saved = localStorage.getItem(STYLE_KEY)
    if (saved) return JSON.parse(saved) as StyleMap
  } catch { /* ignore */ }
  return {}
}

/** 行・列の挿入／削除／ソートに合わせて書式マップの座標を付け替える。null を返すとその書式は消える */
function remapStyles(styles: StyleMap, mapPos: (r: number, c: number) => { r: number; c: number } | null): StyleMap {
  const next: StyleMap = {}
  for (const [key, s] of Object.entries(styles)) {
    const [r, c] = key.split(',').map(Number)
    const p = mapPos(r, c)
    if (p) next[styleKey(p.r, p.c)] = s
  }
  return next
}

function styleToCss(s?: CellStyle): React.CSSProperties {
  return {
    fontWeight: s?.b ? 'bold' : undefined,
    fontStyle: s?.i ? 'italic' : undefined,
    color: s?.color || undefined,
    backgroundColor: s?.bg || undefined,
    textAlign: s?.align || undefined,
  }
}

/** 印刷用 HTML の style 属性（色はカラーピッカー由来の hex のみ） */
function styleToAttr(s?: CellStyle): string {
  const parts: string[] = []
  if (s?.b) parts.push('font-weight:bold')
  if (s?.i) parts.push('font-style:italic')
  if (s?.color) parts.push(`color:${s.color}`)
  if (s?.bg) parts.push(`background-color:${s.bg}`)
  if (s?.align) parts.push(`text-align:${s.align}`)
  return parts.length ? ` style="${parts.join(';')}"` : ''
}

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
  const { t } = useLang()
  const [grid, setGrid] = useState<string[][]>(() => {
    try {
      const saved = localStorage.getItem(GRID_KEY)
      if (saved) return JSON.parse(saved) as string[][]
    } catch { /* ignore */ }
    return SAMPLE
  })
  const [filename, setFilename] = useState(() => localStorage.getItem(NAME_KEY) || 'sheet.csv')
  const [styles, setStyles] = useState<StyleMap>(loadStyles)
  const [homeOpen, setHomeOpen] = useState(false)
  const [selected, setSelected] = useState({ r: 0, c: 0 })
  const [focused, setFocused] = useState<{ r: number; c: number } | null>(null)
  const [freeze, setFreeze] = useState(true)
  const [chartOpen, setChartOpen] = useState(false)
  const [chartRange, setChartRange] = useState('A1:B5')
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar')
  const [chartLabels, setChartLabels] = useState(true)
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [findStatus, setFindStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const cellRefs = useRef(new Map<string, HTMLInputElement>())
  const [pendingFocus, setPendingFocus] = useState<{ r: number; c: number } | null>(null)

  /** 元に戻す・やり直しの履歴。{grid, styles} のスナップショットを最大50件保持する（メモリ内のみ） */
  type HistoryEntry = { grid: string[][]; styles: StyleMap; key?: string }
  const HISTORY_LIMIT = 50
  const pastRef = useRef<HistoryEntry[]>([])
  const futureRef = useRef<HistoryEntry[]>([])
  const [, setHistVer] = useState(0)
  const bumpHist = () => setHistVer((v) => v + 1)
  /** 編集前の状態を履歴に積む（やり直しは破棄される）。同じ key の連続操作（書式変更など）は1件にまとめる */
  const pushHistory = (g: string[][], s: StyleMap, key?: string) => {
    const p = pastRef.current
    if (key && p.length > 0) {
      const top = p[p.length - 1]
      if (top.key === key && top.grid === g) {
        futureRef.current = []
        bumpHist()
        return
      }
    }
    pastRef.current = [...p.slice(-(HISTORY_LIMIT - 1)), { grid: g, styles: s, key }]
    futureRef.current = []
    bumpHist()
  }
  /** セル編集中の開始時点スナップショット。フォーカス時に取り、離れるときに変化があれば履歴へ */
  const editSnapRef = useRef<HistoryEntry | null>(null)
  const beginEdit = () => {
    if (!editSnapRef.current) editSnapRef.current = { grid, styles }
  }
  const commitEdit = () => {
    const snap = editSnapRef.current
    editSnapRef.current = null
    if (snap && JSON.stringify(snap.grid) !== JSON.stringify(grid)) pushHistory(snap.grid, snap.styles)
  }

  useEffect(() => {
    if (!pendingFocus) return
    cellRefs.current.get(`${pendingFocus.r}-${pendingFocus.c}`)?.focus()
    setPendingFocus(null)
  }, [pendingFocus, grid])

  const computed = useMemo(() => evaluateGrid(grid), [grid])

  useEffect(() => {
    localStorage.setItem(GRID_KEY, JSON.stringify(grid))
  }, [grid])
  useEffect(() => {
    localStorage.setItem(STYLE_KEY, JSON.stringify(styles))
  }, [styles])
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

  /** 選択中のセルの書式を更新する。patch が null なら書式をすべて消す */
  const updateStyle = (patch: Partial<CellStyle> | null) => {
    pushHistory(grid, styles, 'style')
    const key = styleKey(selected.r, selected.c)
    setStyles((prev) => {
      if (patch === null) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      const merged = { ...(prev[key] ?? {}), ...patch }
      const cleaned: CellStyle = {}
      if (merged.b) cleaned.b = true
      if (merged.i) cleaned.i = true
      if (merged.color) cleaned.color = merged.color
      if (merged.bg) cleaned.bg = merged.bg
      if (merged.align) cleaned.align = merged.align
      if (Object.keys(cleaned).length === 0) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: cleaned }
    })
  }
  const curStyle = styles[styleKey(selected.r, selected.c)]

  /** 選択位置をグリッド内に収める（行・列の増減を伴う操作の後用） */
  const clampSelection = (g: string[][]) => {
    const r = Math.min(selected.r, Math.max(0, g.length - 1))
    const c = Math.min(selected.c, Math.max(0, (g[0]?.length ?? 1) - 1))
    setSelected({ r: Math.max(0, r), c: Math.max(0, c) })
  }
  const undo = () => {
    const p = pastRef.current
    if (p.length === 0) return
    const prev = p[p.length - 1]
    pastRef.current = p.slice(0, -1)
    futureRef.current = [{ grid, styles }, ...futureRef.current].slice(0, HISTORY_LIMIT)
    setGrid(prev.grid)
    setStyles(prev.styles)
    clampSelection(prev.grid)
    bumpHist()
  }
  const redo = () => {
    const f = futureRef.current
    if (f.length === 0) return
    const next = f[0]
    futureRef.current = f.slice(1)
    pastRef.current = [...pastRef.current, { grid, styles }].slice(-HISTORY_LIMIT)
    setGrid(next.grid)
    setStyles(next.styles)
    clampSelection(next.grid)
    bumpHist()
  }

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const countMatches = (q: string) => {
    let n = 0
    for (const row of grid) for (const cell of row) {
      const lower = cell.toLowerCase()
      let i = lower.indexOf(q)
      while (i !== -1) { n++; i = lower.indexOf(q, i + q.length) }
    }
    return n
  }
  /** 選択中のセルの次から検索し、最初に見つかった位置を返す（末尾まで行ったら先頭へ回る） */
  const findNextPos = (q: string): { r: number; c: number } | null => {
    const cols = grid[0]?.length ?? 0
    const total = grid.length * cols
    if (total === 0) return null
    for (let step = 1; step <= total; step++) {
      const idx = (selected.r * cols + selected.c + step) % total
      const r = Math.floor(idx / cols)
      const c = idx % cols
      if (String(grid[r]?.[c] ?? '').toLowerCase().includes(q)) return { r, c }
    }
    return null
  }
  const findNext = () => {
    const q = findText.trim().toLowerCase()
    if (!q) { setFindStatus(''); return }
    const pos = findNextPos(q)
    if (!pos) { setFindStatus(t('findNotFound')); return }
    setSelected(pos)
    setPendingFocus(pos)
    setFindStatus(t('findMatches').replace('{n}', String(countMatches(q))))
  }
  /** 選択中のセルに検索文字があれば置換し、次の一致へ移動する。無ければ次を検索するだけ */
  const replaceOne = () => {
    const q = findText
    if (!q) return
    const cur = grid[selected.r]?.[selected.c] ?? ''
    if (cur.toLowerCase().includes(q.toLowerCase())) {
      pushHistory(grid, styles)
      setCell(selected.r, selected.c, cur.replace(new RegExp(escapeRegExp(q), 'gi'), replaceText))
      setFindStatus(t('replacedCount').replace('{n}', '1'))
      const pos = findNextPos(q.toLowerCase())
      if (pos) { setSelected(pos); setPendingFocus(pos) }
      return
    }
    findNext()
  }
  const replaceAll = () => {
    const q = findText
    if (!q) return
    const lower = q.toLowerCase()
    const re = new RegExp(escapeRegExp(q), 'gi')
    let count = 0
    const next = grid.map((row) => row.map((cell) => {
      if (!cell.toLowerCase().includes(lower)) return cell
      return cell.replace(re, () => { count++; return replaceText })
    }))
    if (count === 0) { setFindStatus(t('findNotFound')); return }
    pushHistory(grid, styles)
    setGrid(next)
    setFindStatus(t('replacedCount').replace('{n}', String(count)))
  }

  /** キーボードでセル間を移動する。端を超えたら行・列を自動追加する */
  const moveSelection = (dr: number, dc: number) => {
    const cols = grid[0]?.length ?? 1
    let r = Math.max(0, selected.r + dr)
    let c = Math.max(0, selected.c + dc)
    if (r >= grid.length) { addRowInternal(); r = grid.length }
    if (c >= cols) { addColInternal(); c = cols }
    setSelected({ r, c })
    setPendingFocus({ r, c })
  }

  const onCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); commitEdit(); if (e.shiftKey) redo(); else undo() }
    else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); commitEdit(); redo() }
    else if (e.key === 'Enter') { e.preventDefault(); commitEdit(); moveSelection(e.shiftKey ? -1 : 1, 0) }
    else if (e.key === 'Tab') { e.preventDefault(); commitEdit(); moveSelection(0, e.shiftKey ? -1 : 1) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); commitEdit(); moveSelection(1, 0) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); commitEdit(); moveSelection(-1, 0) }
  }

  /** 移動時の自動追加は履歴に積まない（空の行・列の追加は操作ではないため） */
  const addRowInternal = () => setGrid((prev) => [...prev, Array(prev[0]?.length ?? 1).fill('')])
  const addColInternal = () => setGrid((prev) => prev.map((row) => [...row, '']))
  const addRow = () => { pushHistory(grid, styles); addRowInternal() }
  const addCol = () => { pushHistory(grid, styles); addColInternal() }
  const deleteRow = () => {
    if (grid.length <= 1) return
    pushHistory(grid, styles)
    setGrid((prev) => prev.filter((_, i) => i !== selected.r))
    setStyles((prev) => remapStyles(prev, (r, c) => (r === selected.r ? null : r > selected.r ? { r: r - 1, c } : { r, c })))
    // 末尾の行を消したとき選択位置が範囲外に残らないよう詰める
    const r = Math.min(selected.r, grid.length - 2)
    setSelected({ r, c: selected.c })
    setPendingFocus({ r, c: selected.c })
  }
  const deleteCol = () => {
    const cols = grid[0]?.length ?? 1
    if (cols <= 1) return
    pushHistory(grid, styles)
    setGrid((prev) => prev.map((row) => row.filter((_, i) => i !== selected.c)))
    setStyles((prev) => remapStyles(prev, (r, c) => (c === selected.c ? null : c > selected.c ? { r, c: c - 1 } : { r, c })))
    // 末尾の列を消したとき選択位置が範囲外に残らないよう詰める
    const c = Math.min(selected.c, cols - 2)
    setSelected({ r: selected.r, c })
    setPendingFocus({ r: selected.r, c })
  }
  const insertRow = () => {
    pushHistory(grid, styles)
    setGrid((prev) => {
      const cols = prev[0]?.length ?? 1
      return [...prev.slice(0, selected.r), Array(cols).fill(''), ...prev.slice(selected.r)]
    })
    setStyles((prev) => remapStyles(prev, (r, c) => (r >= selected.r ? { r: r + 1, c } : { r, c })))
  }
  const insertCol = () => {
    pushHistory(grid, styles)
    setGrid((prev) => prev.map((row) => [...row.slice(0, selected.c), '', ...row.slice(selected.c)]))
    setStyles((prev) => remapStyles(prev, (r, c) => (c >= selected.c ? { r, c: c + 1 } : { r, c })))
  }
  const clear = () => {
    pushHistory(grid, styles)
    setGrid((prev) => prev.map((row) => row.map(() => '')))
    setStyles({})
  }

  const sortByColumn = (dir: 1 | -1) => {
    pushHistory(grid, styles)
    const [head, ...body] = grid
    // 並び替え前後の行番号の対応表を作り、書式も行について回らせる（先頭行は固定）
    const order = body.map((_, i) => i).sort((ia, ib) => {
      const av = body[ia][selected.c] ?? ''
      const bv = body[ib][selected.c] ?? ''
      const an = Number(av)
      const bn = Number(bv)
      if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== '' && bv !== '') return (an - bn) * dir
      return av.localeCompare(bv, 'ja') * dir
    })
    setGrid([head, ...order.map((i) => body[i])])
    setStyles((prev) => remapStyles(prev, (r, c) => {
      if (r === 0) return { r, c }
      const newBodyIdx = order.indexOf(r - 1)
      return newBodyIdx < 0 ? null : { r: newBodyIdx + 1, c }
    }))
  }

  const openCsv = async (file: File) => {
    const text = await file.text()
    const result = Papa.parse<string[]>(text, { skipEmptyLines: false })
    const rows = (result.data as unknown[][]).map((row) => row.map((v) => String(v ?? '')))
    if (rows.length > 0) {
      pushHistory(grid, styles)
      const width = Math.max(...rows.map((r) => r.length))
      setGrid(rows.map((r) => [...r, ...Array(width - r.length).fill('')]))
      setFilename(file.name)
    }
  }

  const saveCsv = () => {
    downloadText(filename || 'sheet.csv', Papa.unparse(computed), 'text/csv;charset=utf-8')
  }

  const printSheet = () => {
    const head = computed[0]?.map((c, ci) => `<th${styleToAttr(styles[styleKey(0, ci)])}>${escapeHtml(c)}</th>`).join('') ?? ''
    const body = computed
      .slice(1)
      .map((row, ri) => `<tr>${row.map((c, ci) => `<td${styleToAttr(styles[styleKey(ri + 1, ci)])}>${escapeHtml(c)}</td>`).join('')}</tr>`)
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
          { label: `${t('openBtn')} (.csv)`, onClick: () => fileRef.current?.click() },
          { label: t('csvDl'), onClick: saveCsv },
          { label: t('printPdf'), onClick: printSheet },
          { label: 'クリア', hint: 'すべてのセルを空にする', onClick: clear },
        ]}
        fileManager={
          <FileManager
            kind="sheet"
            currentName={filename.replace(/\.csv$/i, '')}
            getContent={() => JSON.stringify(grid)}
            onOpen={(doc) => {
              if (doc.kind === 'memo') return
              if (doc.kind !== 'sheet') {
                localStorage.setItem('uo-pending-open', doc.id)
                onSwitch(doc.kind)
                return
              }
              try {
                pushHistory(grid, styles)
                setGrid(JSON.parse(doc.content) as string[][])
                setFilename(`${doc.name}.csv`)
              } catch { /* ignore */ }
            }}
          />
        }
      />
      <div className="titlebar sheet-title">
        <button className="home-btn" onClick={() => setHomeOpen(true)}>{t('home')}</button>
        <input className="title-input" value={filename} onChange={(e) => setFilename(e.target.value)} aria-label="ファイル名" />
        <span className="titlebar-app">{t('sheet')}</span>
      </div>
      <div className="toolbar">
        <button onClick={() => fileRef.current?.click()}>{t('openBtn')} (.csv)</button>
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
        <button onClick={saveCsv}>{t('csvDl')}</button>
        <button onClick={printSheet}>{t('printPdf')}</button>
        <button onClick={undo} disabled={pastRef.current.length === 0} title={t('undo')}>↩ {t('undo')}</button>
        <button onClick={redo} disabled={futureRef.current.length === 0} title={t('redo')}>↪ {t('redo')}</button>
        <button onClick={() => setFindOpen((v) => !v)}>{t('findReplace')}</button>
        <button onClick={addRow}>{t('addRow')}</button>
        <button onClick={addCol}>{t('addCol')}</button>
        <button onClick={insertRow}>{t('insertRow')}</button>
        <button onClick={insertCol}>{t('insertCol')}</button>
        <button onClick={deleteRow}>{t('delRow')}</button>
        <button onClick={deleteCol}>{t('delCol')}</button>
        <button onClick={() => sortByColumn(1)}>{t('sortAsc')}</button>
        <button onClick={() => sortByColumn(-1)}>{t('sortDesc')}</button>
        <span className="fmt-group" role="group" aria-label="セル書式">
          <button className={curStyle?.b ? 'fmt-active' : ''} onClick={() => updateStyle({ b: !curStyle?.b })} title={t('cellBold')} aria-pressed={!!curStyle?.b}><b>B</b></button>
          <button className={curStyle?.i ? 'fmt-active' : ''} onClick={() => updateStyle({ i: !curStyle?.i })} title={t('cellItalic')} aria-pressed={!!curStyle?.i}><i>I</i></button>
          <label className="fmt-color" title={t('cellTextColor')}>A<input type="color" value={curStyle?.color ?? '#1f2937'} onChange={(e) => updateStyle({ color: e.target.value })} aria-label={t('cellTextColor')} /></label>
          <label className="fmt-color" title={t('cellBg')}>■<input type="color" value={curStyle?.bg ?? '#ffffff'} onChange={(e) => updateStyle({ bg: e.target.value })} aria-label={t('cellBg')} /></label>
          <button className={curStyle?.align === 'left' ? 'fmt-active' : ''} onClick={() => updateStyle({ align: curStyle?.align === 'left' ? undefined : 'left' })} title={t('cellAlignLeft')} aria-pressed={curStyle?.align === 'left'}>⇤</button>
          <button className={curStyle?.align === 'center' ? 'fmt-active' : ''} onClick={() => updateStyle({ align: curStyle?.align === 'center' ? undefined : 'center' })} title={t('cellAlignCenter')} aria-pressed={curStyle?.align === 'center'}>≡</button>
          <button className={curStyle?.align === 'right' ? 'fmt-active' : ''} onClick={() => updateStyle({ align: curStyle?.align === 'right' ? undefined : 'right' })} title={t('cellAlignRight')} aria-pressed={curStyle?.align === 'right'}>⇥</button>
          <button onClick={() => updateStyle(null)}>{t('cellClearFormat')}</button>
        </span>
        <label className="check-inline"><input type="checkbox" checked={freeze} onChange={(e) => setFreeze(e.target.checked)} /> {t('freeze')}</label>
        <span className="meta">{grid.length} 行 × {grid[0]?.length ?? 0} 列</span>
        <button onClick={() => setChartOpen((v) => !v)}>📊 グラフ</button>
      </div>
      {findOpen && (
        <div className="sheet-find-panel">
          <label>{t('findPh')} <input value={findText} onChange={(e) => setFindText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); findNext() } }} /></label>
          <label>{t('replacePh')} <input value={replaceText} onChange={(e) => setReplaceText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); replaceOne() } }} /></label>
          <button onClick={findNext}>{t('findNext')}</button>
          <button onClick={replaceOne}>{t('replaceOne')}</button>
          <button onClick={replaceAll}>{t('replaceAllBtn')}</button>
          {findStatus && <span className="find-status">{findStatus}</span>}
          <button onClick={() => setFindOpen(false)}>{t('close')}</button>
        </div>
      )}
      {chartOpen && (
        <div className="sheet-chart-panel">
          <label>範囲 <input value={chartRange} onChange={(e) => setChartRange(e.target.value)} size={9} placeholder="A1:B5" /></label>
          <label>種類
            <select value={chartType} onChange={(e) => setChartType(e.target.value as 'bar' | 'line' | 'pie')}>
              <option value="bar">棒グラフ</option>
              <option value="line">折れ線</option>
              <option value="pie">円グラフ</option>
            </select>
          </label>
          <label className="check-inline"><input type="checkbox" checked={chartLabels} onChange={(e) => setChartLabels(e.target.checked)} /> 先頭列をラベルにする</label>
          <SheetChart computed={computed} range={chartRange} type={chartType} useLabels={chartLabels} />
        </div>
      )}
      <div className="formula-bar">
        <span className="cell-addr">{colName(selected.c)}{selected.r + 1}</span>
        <span className="fx">fx</span>
        <input
          value={selectedRaw}
          onChange={(e) => setCell(selected.r, selected.c, e.target.value)}
          onFocus={beginEdit}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); commitEdit(); if (e.shiftKey) redo(); else undo() }
            else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); commitEdit(); redo() }
            else if (e.key === 'Enter') { e.preventDefault(); commitEdit(); moveSelection(1, 0) }
          }}
          placeholder={t('formulaPh')}
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
                        ref={(el) => { if (el) cellRefs.current.set(`${r}-${c}`, el); else cellRefs.current.delete(`${r}-${c}`) }}
                        value={isFocused ? cell : (computed[r]?.[c] ?? cell)}
                        style={styleToCss(styles[styleKey(r, c)])}
                        onFocus={() => { setSelected({ r, c }); setFocused({ r, c }); beginEdit() }}
                        onBlur={() => { setFocused(null); commitEdit() }}
                        onChange={(e) => setCell(r, c, e.target.value)}
                        onKeyDown={onCellKeyDown}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">数式対応：=B2*C2 のような四則演算と、SUM / AVERAGE / MIN / MAX / COUNT（範囲は A1:B5）。キーボード：Enter・↑↓で上下のセルへ、Tab・Shift+Tabで左右のセルへ（端を超えると行・列を自動追加）。元に戻す・やり直し：ツールバーのボタン、または Ctrl+Z／Ctrl+Y（Mac は Cmd+Z／Cmd+Shift+Z）。検索・置換：ツールバーの「検索・置換」から文字を探して置き換えられます（1件ずつ／すべて置換）。セル書式：選択中のセルに太字・斜体・文字色・背景色・配置を設定できます（行・列の挿入／削除・ソートに追従し、印刷にも反映されます）。CSV保存は計算結果の値で書き出します。シートは自動で端末内に保存されます。</p>
    </section>
  )
}

const CHART_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#64748b']
function parseRef(ref: string): { r: number; c: number } | null {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/)
  if (!m) return null
  let c = 0
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64)
  return { r: parseInt(m[2], 10) - 1, c: c - 1 }
}
function SheetChart({ computed, range, type, useLabels }: { computed: string[][]; range: string; type: 'bar' | 'line' | 'pie'; useLabels: boolean }) {
  const parts = range.split(':')
  const a = parseRef(parts[0] ?? '')
  const b = parseRef(parts[1] ?? parts[0] ?? '')
  if (!a || !b) return <p className="sheet-chart-empty">範囲の形式は A1:B5 のように指定してください</p>
  const r0 = Math.min(a.r, b.r); const r1 = Math.max(a.r, b.r)
  const c0 = Math.min(a.c, b.c); const c1 = Math.max(a.c, b.c)
  const valueCol = useLabels ? c0 + 1 : c0
  const items: { label: string; value: number }[] = []
  for (let r = r0; r <= r1; r++) {
    const raw = computed[r]?.[valueCol] ?? ''
    const v = parseFloat(String(raw).replace(/[^0-9.\-]/g, ''))
    if (!Number.isFinite(v)) continue
    items.push({ label: useLabels ? String(computed[r]?.[c0] ?? `行${r + 1}`) : `行${r + 1}`, value: v })
  }
  if (items.length === 0) return <p className="sheet-chart-empty">数値データがありません（値の列を確認してください）</p>
  const W = 520; const H = 240; const PAD = 34
  const max = Math.max(...items.map((i) => i.value), 0)
  const min = Math.min(...items.map((i) => i.value), 0)
  const span = max - min || 1
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 1.6)
  if (type === 'pie') {
    const total = items.reduce((s, i) => s + Math.max(0, i.value), 0) || 1
    let acc = 0
    const cx = 130; const cy = 120; const rad = 92
    return (
      <div className="sheet-chart-flex">
        <svg viewBox={`0 0 ${W} ${H}`} className="sheet-chart-svg" role="img" aria-label="円グラフ">
          {items.map((it, i) => {
            const frac = Math.max(0, it.value) / total
            const a0 = acc * Math.PI * 2 - Math.PI / 2
            acc += frac
            const a1 = acc * Math.PI * 2 - Math.PI / 2
            const large = frac > 0.5 ? 1 : 0
            const d = frac >= 0.999
              ? `M ${cx} ${cy} m ${-rad} 0 a ${rad} ${rad} 0 1 0 ${rad * 2} 0 a ${rad} ${rad} 0 1 0 ${-rad * 2} 0`
              : `M ${cx} ${cy} L ${cx + rad * Math.cos(a0)} ${cy + rad * Math.sin(a0)} A ${rad} ${rad} 0 ${large} 1 ${cx + rad * Math.cos(a1)} ${cy + rad * Math.sin(a1)} Z`
            return <path key={i} d={d} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="#fff" strokeWidth={1.5} />
          })}
        </svg>
        <ul className="sheet-chart-legend">{items.map((it, i) => <li key={i}><span style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{it.label}: {it.value}</li>)}</ul>
      </div>
    )
  }
  const stepX = (W - PAD * 1.6) / Math.max(1, items.length)
  const points = items.map((it, i) => `${PAD + stepX * (i + 0.5)},${y(it.value)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sheet-chart-svg" role="img" aria-label="グラフ">
      <line x1={PAD} y1={y(0)} x2={W - 8} y2={y(0)} stroke="#94a3b8" strokeWidth={1} />
      <text x={4} y={y(max) + 4} fontSize={10} fill="#64748b">{max}</text>
      <text x={4} y={y(min) + 4} fontSize={10} fill="#64748b">{min}</text>
      {type === 'bar' && items.map((it, i) => {
        const bw = Math.min(52, stepX * 0.62)
        const x = PAD + stepX * (i + 0.5) - bw / 2
        const top = y(Math.max(it.value, 0)); const bottom = y(Math.min(it.value, 0))
        return (
          <g key={i}>
            <rect x={x} y={top} width={bw} height={Math.max(1, bottom - top)} fill={CHART_COLORS[i % CHART_COLORS.length]} rx={3} />
            <text x={x + bw / 2} y={H - 12} fontSize={10} textAnchor="middle" fill="#475569">{it.label.slice(0, 8)}</text>
            <text x={x + bw / 2} y={top - 4} fontSize={10} textAnchor="middle" fill="#334155">{it.value}</text>
          </g>
        )
      })}
      {type === 'line' && (
        <g>
          <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth={2.5} />
          {items.map((it, i) => (
            <g key={i}>
              <circle cx={PAD + stepX * (i + 0.5)} cy={y(it.value)} r={4} fill="#3b82f6" />
              <text x={PAD + stepX * (i + 0.5)} y={H - 12} fontSize={10} textAnchor="middle" fill="#475569">{it.label.slice(0, 8)}</text>
              <text x={PAD + stepX * (i + 0.5)} y={y(it.value) - 9} fontSize={10} textAnchor="middle" fill="#334155">{it.value}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  )
}
