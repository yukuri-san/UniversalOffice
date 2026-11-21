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
const COLWIDTH_KEY = 'universal-office-sheet-colwidths'
/** 列幅の既定値（px）。table-layout: fixed のもと col 要素で指定する */
const DEFAULT_COL_WIDTH = 130
const MIN_COL_WIDTH = 48
const MAX_COL_WIDTH = 420
type ColWidthMap = Record<number, number>

function loadColWidths(): ColWidthMap {
  try {
    const saved = localStorage.getItem(COLWIDTH_KEY)
    if (saved) return JSON.parse(saved) as ColWidthMap
  } catch { /* ignore */ }
  return {}
}

/** 列の挿入／削除に合わせて列幅マップの列番号を付け替える */
function remapColWidths(widths: ColWidthMap, mapCol: (c: number) => number | null): ColWidthMap {
  const next: ColWidthMap = {}
  for (const [key, w] of Object.entries(widths)) {
    const c = Number(key)
    const p = mapCol(c)
    if (p !== null) next[p] = w
  }
  return next
}

const ROWHEIGHT_KEY = 'universal-office-sheet-rowheights'
/** 行の高さの既定値（px）。セル内 input の上下 padding（8px×2）＋文字の高さに合わせる */
const DEFAULT_ROW_HEIGHT = 36
const MIN_ROW_HEIGHT = 24
const MAX_ROW_HEIGHT = 160
type RowHeightMap = Record<number, number>

function loadRowHeights(): RowHeightMap {
  try {
    const saved = localStorage.getItem(ROWHEIGHT_KEY)
    if (saved) return JSON.parse(saved) as RowHeightMap
  } catch { /* ignore */ }
  return {}
}

/** 行の挿入／削除／ソートに合わせて行の高さマップの行番号を付け替える */
function remapRowHeights(heights: RowHeightMap, mapRow: (r: number) => number | null): RowHeightMap {
  const next: RowHeightMap = {}
  for (const [key, h] of Object.entries(heights)) {
    const r = Number(key)
    const p = mapRow(r)
    if (p !== null) next[p] = h
  }
  return next
}

const MERGE_KEY = 'universal-office-sheet-merges'
/** セルの結合。キーは結合の左上 `${row},${col}`、値は結合する行数・列数 */
type MergeMap = Record<string, { rs: number; cs: number }>

function loadMerges(): MergeMap {
  try {
    const saved = localStorage.getItem(MERGE_KEY)
    if (saved) return JSON.parse(saved) as MergeMap
  } catch { /* ignore */ }
  return {}
}

/** 行・列の挿入／削除／ソートに合わせて結合を付け替える。null を返すとその結合は解除される */
function remapMerges(merges: MergeMap, mapPos: (r: number, c: number, rs: number, cs: number) => { r: number; c: number; rs: number; cs: number } | null): MergeMap {
  const next: MergeMap = {}
  for (const [key, m] of Object.entries(merges)) {
    const [r, c] = key.split(',').map(Number)
    const p = mapPos(r, c, m.rs, m.cs)
    if (!p || p.rs <= 0 || p.cs <= 0) continue
    if (p.rs === 1 && p.cs === 1) continue // 1セルになった結合は解除
    next[`${p.r},${p.c}`] = { rs: p.rs, cs: p.cs }
  }
  return next
}

const CONDFMT_KEY = 'universal-office-sheet-condfmt'
/** 条件付き書式のルール。範囲内のセルで条件に合うものの背景色を変える */
type CondFmtOp = 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'contains' | 'empty'
type CondFmtRule = { id: string; r1: number; c1: number; r2: number; c2: number; op: CondFmtOp; value: string; bg: string }

function loadCondFmt(): CondFmtRule[] {
  try {
    const saved = localStorage.getItem(CONDFMT_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as CondFmtRule[]
      if (Array.isArray(parsed)) return parsed.filter((r) => r && typeof r.r1 === 'number' && typeof r.c1 === 'number' && typeof r.bg === 'string')
    }
  } catch { /* ignore */ }
  return []
}

/** 行・列の挿入／削除／ソートに合わせて条件付き書式の範囲を付け替える。範囲が消えたルールは除く */
function remapCondFmt(rules: CondFmtRule[], mapPos: (r: number, c: number) => { r: number; c: number } | null): CondFmtRule[] {
  const next: CondFmtRule[] = []
  for (const rule of rules) {
    const pts: { r: number; c: number }[] = []
    const corners = [
      { r: rule.r1, c: rule.c1 }, { r: rule.r1, c: rule.c2 },
      { r: rule.r2, c: rule.c1 }, { r: rule.r2, c: rule.c2 },
    ]
    for (const p of corners) {
      const m = mapPos(p.r, p.c)
      if (m) pts.push(m)
    }
    if (pts.length === 0) continue
    const r1 = Math.min(...pts.map((p) => p.r))
    const r2 = Math.max(...pts.map((p) => p.r))
    const c1 = Math.min(...pts.map((p) => p.c))
    const c2 = Math.max(...pts.map((p) => p.c))
    next.push({ ...rule, r1, r2, c1, c2 })
  }
  return next
}

/** 条件付き書式の条件ラベル用の i18n キー */
const condOpKey = (op: CondFmtOp): string => ({ gt: 'condOpGt', lt: 'condOpLt', eq: 'condOpEq', gte: 'condOpGte', lte: 'condOpLte', contains: 'condOpContains', empty: 'condOpEmpty' })[op]

/** セルの書式。キーは `${row},${col}`。fmt は数値書式（未指定＝標準） */
type NumFmt = 'number' | 'currency' | 'percent'
type CellStyle = { b?: boolean; i?: boolean; color?: string; bg?: string; align?: 'left' | 'center' | 'right'; fmt?: NumFmt }
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

/** 印刷用 HTML の style 属性（色はカラーピッカー由来の hex のみ）。overrideBg があればセルの背景色より優先する */
function styleToAttr(s?: CellStyle, overrideBg?: string): string {
  const parts: string[] = []
  if (s?.b) parts.push('font-weight:bold')
  if (s?.i) parts.push('font-style:italic')
  if (s?.color) parts.push(`color:${s.color}`)
  const bg = overrideBg ?? s?.bg
  if (bg) parts.push(`background-color:${bg}`)
  if (s?.align) parts.push(`text-align:${s.align}`)
  return parts.length ? ` style="${parts.join(';')}"` : ''
}

/** 計算結果の表示値を数値書式に合わせて整える。数値でないセルや空欄はそのまま返す（入力値・数式そのものは変わらない） */
export function formatCellValue(value: string, fmt?: NumFmt): string {
  if (!fmt) return value
  if (value.trim() === '') return value
  const n = Number(value)
  if (Number.isNaN(n)) return value
  switch (fmt) {
    case 'number': return n.toLocaleString('ja-JP')
    case 'currency': return `¥${n.toLocaleString('ja-JP')}`
    case 'percent': return `${Number((n * 100).toFixed(10)).toLocaleString('ja-JP')}%`
  }
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
  const [colWidths, setColWidths] = useState<ColWidthMap>(loadColWidths)
  const [rowHeights, setRowHeights] = useState<RowHeightMap>(loadRowHeights)
  const [merges, setMerges] = useState<MergeMap>(loadMerges)
  const [condFmt, setCondFmt] = useState<CondFmtRule[]>(loadCondFmt)
  const [condFmtOpen, setCondFmtOpen] = useState(false)
  const [cfRange, setCfRange] = useState('')
  const [cfOp, setCfOp] = useState<CondFmtOp>('gt')
  const [cfValue, setCfValue] = useState('')
  const [cfBg, setCfBg] = useState('#fde68a')
  const [homeOpen, setHomeOpen] = useState(false)
  const [selected, setSelected] = useState({ r: 0, c: 0 })
  /** 範囲選択（Shift+クリック）。結合の対象になる矩形。null は単独セル選択 */
  const [range, setRange] = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(null)
  /** 範囲選択の起点。キーボード移動・単独クリックで更新される */
  const anchorRef = useRef({ r: 0, c: 0 })
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

  /** 元に戻す・やり直しの履歴。{grid, styles, merges} のスナップショットを最大50件保持する（メモリ内のみ） */
  type HistoryEntry = { grid: string[][]; styles: StyleMap; merges?: MergeMap; key?: string }
  const HISTORY_LIMIT = 50
  const pastRef = useRef<HistoryEntry[]>([])
  const futureRef = useRef<HistoryEntry[]>([])
  const [, setHistVer] = useState(0)
  const bumpHist = () => setHistVer((v) => v + 1)
  /** 編集前の状態を履歴に積む（やり直しは破棄される）。同じ key の連続操作（書式変更など）は1件にまとめる */
  const pushHistory = (g: string[][], s: StyleMap, key?: string, m: MergeMap = merges) => {
    const p = pastRef.current
    if (key && p.length > 0) {
      const top = p[p.length - 1]
      if (top.key === key && top.grid === g) {
        futureRef.current = []
        bumpHist()
        return
      }
    }
    pastRef.current = [...p.slice(-(HISTORY_LIMIT - 1)), { grid: g, styles: s, merges: m, key }]
    futureRef.current = []
    bumpHist()
  }
  /** セル編集中の開始時点スナップショット。フォーカス時に取り、離れるときに変化があれば履歴へ */
  const editSnapRef = useRef<HistoryEntry | null>(null)
  const beginEdit = () => {
    if (!editSnapRef.current) editSnapRef.current = { grid, styles, merges }
  }
  const commitEdit = () => {
    const snap = editSnapRef.current
    editSnapRef.current = null
    if (snap && JSON.stringify(snap.grid) !== JSON.stringify(grid)) pushHistory(snap.grid, snap.styles, undefined, snap.merges)
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
    localStorage.setItem(COLWIDTH_KEY, JSON.stringify(colWidths))
  }, [colWidths])
  useEffect(() => {
    localStorage.setItem(ROWHEIGHT_KEY, JSON.stringify(rowHeights))
  }, [rowHeights])
  useEffect(() => {
    localStorage.setItem(MERGE_KEY, JSON.stringify(merges))
  }, [merges])
  useEffect(() => {
    localStorage.setItem(CONDFMT_KEY, JSON.stringify(condFmt))
  }, [condFmt])
  useEffect(() => {
    localStorage.setItem(NAME_KEY, filename)
  }, [filename])

  /** 結合に覆われるセルを「左上 → 結合情報」で引ける表。左上以外の被覆セルは描画しない */
  type CoverInfo = { or: number; oc: number; rs: number; cs: number }
  const coverMap = useMemo(() => {
    const map = new Map<string, CoverInfo>()
    for (const [key, m] of Object.entries(merges)) {
      const [or, oc] = key.split(',').map(Number)
      for (let r = or; r < or + m.rs; r++) {
        for (let c = oc; c < oc + m.cs; c++) map.set(`${r},${c}`, { or, oc, rs: m.rs, cs: m.cs })
      }
    }
    return map
  }, [merges])
  const coverAt = (r: number, c: number) => coverMap.get(`${r},${c}`)
  /** 結合の左上セル。範囲選択中の矩形（正規化済み） */
  const rangeRect = range ? { r1: Math.min(range.r1, range.r2), r2: Math.max(range.r1, range.r2), c1: Math.min(range.c1, range.c2), c2: Math.max(range.c1, range.c2) } : null
  /** 選択中の範囲が2セル以上なら結合できる */
  const canMerge = !!rangeRect && (rangeRect.r1 !== rangeRect.r2 || rangeRect.c1 !== rangeRect.c2)
  /** 選択中のセルを含む結合（なければ undefined） */
  const selectedMerge = coverAt(selected.r, selected.c)

  /** 表示値（数式の計算結果）に対して条件付き書式のルールが合うか判定する */
  const condFmtMatch = (rule: CondFmtRule, display: string, raw: string): boolean => {
    if (rule.op === 'empty') return raw.trim() === ''
    if (rule.op === 'contains') return rule.value !== '' && display.includes(rule.value)
    if (rule.value.trim() === '') return false
    const n = Number(display)
    const v = Number(rule.value)
    if (Number.isNaN(n) || Number.isNaN(v)) return false
    switch (rule.op) {
      case 'gt': return n > v
      case 'lt': return n < v
      case 'eq': return n === v
      case 'gte': return n >= v
      case 'lte': return n <= v
    }
  }
  /** セルに適用される条件付き書式の背景色（先に登録したルールを優先）。無ければ undefined */
  const condFmtBg = (r: number, c: number): string | undefined => {
    for (const rule of condFmt) {
      if (r < rule.r1 || r > rule.r2 || c < rule.c1 || c > rule.c2) continue
      const display = computed[r]?.[c] ?? ''
      const raw = grid[r]?.[c] ?? ''
      if (condFmtMatch(rule, display, raw)) return rule.bg
    }
    return undefined
  }
  /** 選択範囲を A1:B5 形式の文字列にする（単独セルは A1 形式） */
  const selectionRangeText = (): string => {
    const rect = rangeRect ?? { r1: selected.r, r2: selected.r, c1: selected.c, c2: selected.c }
    const from = `${colName(rect.c1)}${rect.r1 + 1}`
    if (rect.r1 === rect.r2 && rect.c1 === rect.c2) return from
    return `${from}:${colName(rect.c2)}${rect.r2 + 1}`
  }
  /** パネルで入力した条件付き書式のルールを追加する。範囲が空欄なら選択範囲を使う */
  const addCondFmtRule = () => {
    const text = cfRange.trim() || selectionRangeText()
    const parts = text.split(':')
    const a = parseRef(parts[0] ?? '')
    const b = parseRef(parts[1] ?? parts[0] ?? '')
    if (!a || !b) return
    const rule: CondFmtRule = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      r1: Math.min(a.r, b.r), r2: Math.max(a.r, b.r),
      c1: Math.min(a.c, b.c), c2: Math.max(a.c, b.c),
      op: cfOp, value: cfValue, bg: cfBg,
    }
    setCondFmt((prev) => [...prev, rule])
    setCfValue('')
  }
  const deleteCondFmtRule = (id: string) => setCondFmt((prev) => prev.filter((r) => r.id !== id))

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
          setMerges({})
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
      if (merged.fmt) cleaned.fmt = merged.fmt
      if (Object.keys(cleaned).length === 0) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: cleaned }
    })
  }
  const curStyle = styles[styleKey(selected.r, selected.c)]

  /** 列幅のドラッグ変更。ハンドルを掴んで左右に動かすとその列の幅が変わる */
  const dragRef = useRef<{ c: number; startX: number; startW: number } | null>(null)
  const colWidth = (c: number) => colWidths[c] ?? DEFAULT_COL_WIDTH
  const startColResize = (e: React.PointerEvent, c: number) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = colWidth(c)
    dragRef.current = { c, startX, startW }
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const w = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, d.startW + (ev.clientX - d.startX)))
      setColWidths((prev) => ({ ...prev, [d.c]: w }))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  /** 列の内容に合わせて幅を自動調整する（ダブルクリック用）。見出し＋表示値の最長から見積もる */
  const autoFitColumn = (c: number) => {
    const head = colName(c).length
    let maxLen = head
    computed.forEach((row, r) => {
      const v = formatCellValue(row[c] ?? '', styles[styleKey(r, c)]?.fmt)
      maxLen = Math.max(maxLen, String(v).length)
    })
    const w = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.ceil(maxLen * 8.5) + 26))
    setColWidths((prev) => ({ ...prev, [c]: w }))
  }
  const resetColWidths = () => setColWidths({})

  /** 行の高さのドラッグ変更。行見出しの下端を掴んで上下に動かすとその行の高さが変わる */
  const rowDragRef = useRef<{ r: number; startY: number; startH: number } | null>(null)
  const rowHeight = (r: number) => rowHeights[r] ?? DEFAULT_ROW_HEIGHT
  const startRowResize = (e: React.PointerEvent, r: number) => {
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const startH = rowHeight(r)
    rowDragRef.current = { r, startY, startH }
    const onMove = (ev: PointerEvent) => {
      const d = rowDragRef.current
      if (!d) return
      const h = Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, d.startH + (ev.clientY - d.startY)))
      setRowHeights((prev) => ({ ...prev, [d.r]: h }))
    }
    const onUp = () => {
      rowDragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  /** その行の高さを既定に戻す（ダブルクリック用） */
  const resetRowHeight = (r: number) => {
    setRowHeights((prev) => {
      const next = { ...prev }
      delete next[r]
      return next
    })
  }
  const resetRowHeights = () => setRowHeights({})

  /** 選択位置をグリッド内に収める（行・列の増減を伴う操作の後用）。結合の被覆セルなら左上へ寄せる */
  const clampSelection = (g: string[][]) => {
    let r = Math.min(selected.r, Math.max(0, g.length - 1))
    let c = Math.min(selected.c, Math.max(0, (g[0]?.length ?? 1) - 1))
    r = Math.max(0, r); c = Math.max(0, c)
    const cov = coverMap.get(`${r},${c}`)
    if (cov) { r = cov.or; c = cov.oc }
    setSelected({ r, c })
  }
  const undo = () => {
    const p = pastRef.current
    if (p.length === 0) return
    const prev = p[p.length - 1]
    pastRef.current = p.slice(0, -1)
    futureRef.current = [{ grid, styles, merges }, ...futureRef.current].slice(0, HISTORY_LIMIT)
    setGrid(prev.grid)
    setStyles(prev.styles)
    setMerges(prev.merges ?? {})
    clampSelection(prev.grid)
    bumpHist()
  }
  const redo = () => {
    const f = futureRef.current
    if (f.length === 0) return
    const next = f[0]
    futureRef.current = f.slice(1)
    pastRef.current = [...pastRef.current, { grid, styles, merges }].slice(-HISTORY_LIMIT)
    setGrid(next.grid)
    setStyles(next.styles)
    setMerges(next.merges ?? {})
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
    anchorRef.current = pos
    setRange(null)
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

  /** キーボードでセル間を移動する。端を超えたら行・列を自動追加する。結合の被覆セルには入らず、その結合を飛び越える */
  const moveSelection = (dr: number, dc: number) => {
    const cols = grid[0]?.length ?? 1
    let r = Math.max(0, selected.r + dr)
    let c = Math.max(0, selected.c + dc)
    if (r >= grid.length) { addRowInternal(); r = grid.length }
    if (c >= cols) { addColInternal(); c = cols }
    const cov = coverMap.get(`${r},${c}`)
    if (cov) {
      if (dr > 0) r = cov.or + cov.rs
      else if (dr < 0) r = cov.or - 1
      else if (dc > 0) c = cov.oc + cov.cs
      else if (dc < 0) c = cov.oc - 1
      r = Math.max(0, r); c = Math.max(0, c)
      if (r >= grid.length) { addRowInternal(); r = grid.length }
      if (c >= cols) { addColInternal(); c = cols }
    }
    anchorRef.current = { r, c }
    setRange(null)
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
    setMerges((prev) => remapMerges(prev, (r, c, rs, cs) => (r === selected.r ? null : r > selected.r ? { r: r - 1, c, rs, cs } : r < selected.r && selected.r < r + rs ? { r, c, rs: rs - 1, cs } : { r, c, rs, cs })))
    setCondFmt((prev) => remapCondFmt(prev, (r, c) => (r === selected.r ? null : r > selected.r ? { r: r - 1, c } : { r, c })))
    setRowHeights((prev) => remapRowHeights(prev, (r) => (r === selected.r ? null : r > selected.r ? r - 1 : r)))
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
    setMerges((prev) => remapMerges(prev, (r, c, rs, cs) => (c === selected.c ? null : c > selected.c ? { r, c: c - 1, rs, cs } : c < selected.c && selected.c < c + cs ? { r, c, rs, cs: cs - 1 } : { r, c, rs, cs })))
    setCondFmt((prev) => remapCondFmt(prev, (r, c) => (c === selected.c ? null : c > selected.c ? { r, c: c - 1 } : { r, c })))
    setColWidths((prev) => remapColWidths(prev, (c) => (c === selected.c ? null : c > selected.c ? c - 1 : c)))
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
    setMerges((prev) => remapMerges(prev, (r, c, rs, cs) => (r >= selected.r ? { r: r + 1, c, rs, cs } : r < selected.r && selected.r < r + rs ? { r, c, rs: rs + 1, cs } : { r, c, rs, cs })))
    setCondFmt((prev) => remapCondFmt(prev, (r, c) => (r >= selected.r ? { r: r + 1, c } : { r, c })))
    setRowHeights((prev) => remapRowHeights(prev, (r) => (r >= selected.r ? r + 1 : r)))
  }
  const insertCol = () => {
    pushHistory(grid, styles)
    setGrid((prev) => prev.map((row) => [...row.slice(0, selected.c), '', ...row.slice(selected.c)]))
    setStyles((prev) => remapStyles(prev, (r, c) => (c >= selected.c ? { r, c: c + 1 } : { r, c })))
    setMerges((prev) => remapMerges(prev, (r, c, rs, cs) => (c >= selected.c ? { r, c: c + 1, rs, cs } : c < selected.c && selected.c < c + cs ? { r, c, rs, cs: cs + 1 } : { r, c, rs, cs })))
    setCondFmt((prev) => remapCondFmt(prev, (r, c) => (c >= selected.c ? { r, c: c + 1 } : { r, c })))
    setColWidths((prev) => remapColWidths(prev, (c) => (c >= selected.c ? c + 1 : c)))
  }
  const clear = () => {
    pushHistory(grid, styles)
    setGrid((prev) => prev.map((row) => row.map(() => '')))
    setStyles({})
    setMerges({})
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
    setCondFmt((prev) => remapCondFmt(prev, (r, c) => {
      if (r === 0) return { r, c }
      const newBodyIdx = order.indexOf(r - 1)
      return newBodyIdx < 0 ? null : { r: newBodyIdx + 1, c }
    }))
    // 複数行にまたがる結合は行の並べ替えで崩れるため解除し、1行だけの結合は行について回らせる
    setMerges((prev) => remapMerges(prev, (r, c, rs, cs) => {
      if (r === 0 || rs > 1) return rs > 1 ? null : { r, c, rs, cs }
      const newBodyIdx = order.indexOf(r - 1)
      return newBodyIdx < 0 ? null : { r: newBodyIdx + 1, c, rs, cs }
    }))
    setRowHeights((prev) => remapRowHeights(prev, (r) => {
      if (r === 0) return 0
      const newBodyIdx = order.indexOf(r - 1)
      return newBodyIdx < 0 ? null : newBodyIdx + 1
    }))
  }

  /** 選択中の範囲を1つのセルに結合する。重なる既存の結合は解除してから結合し直す */
  const mergeSelected = () => {
    if (!canMerge || !rangeRect) return
    const { r1, r2, c1, c2 } = rangeRect
    pushHistory(grid, styles)
    const next: MergeMap = {}
    for (const [key, m] of Object.entries(merges)) {
      const [or, oc] = key.split(',').map(Number)
      const overlaps = or <= r2 && or + m.rs - 1 >= r1 && oc <= c2 && oc + m.cs - 1 >= c1
      if (!overlaps) next[key] = m
    }
    next[`${r1},${c1}`] = { rs: r2 - r1 + 1, cs: c2 - c1 + 1 }
    setMerges(next)
    anchorRef.current = { r: r1, c: c1 }
    setRange(null)
    setSelected({ r: r1, c: c1 })
    setPendingFocus({ r: r1, c: c1 })
  }
  /** 選択中のセルを含む結合を解除する（隠れていたセルの値はそのまま残る） */
  const unmergeSelected = () => {
    const cov = selectedMerge
    if (!cov) return
    pushHistory(grid, styles)
    setMerges((prev) => {
      const next = { ...prev }
      delete next[`${cov.or},${cov.oc}`]
      return next
    })
    setRange(null)
  }

  const openCsv = async (file: File) => {
    const text = await file.text()
    const result = Papa.parse<string[]>(text, { skipEmptyLines: false })
    const rows = (result.data as unknown[][]).map((row) => row.map((v) => String(v ?? '')))
    if (rows.length > 0) {
      pushHistory(grid, styles)
      const width = Math.max(...rows.map((r) => r.length))
      setGrid(rows.map((r) => [...r, ...Array(width - r.length).fill('')]))
      setMerges({})
      setFilename(file.name)
    }
  }

  const saveCsv = () => {
    downloadText(filename || 'sheet.csv', Papa.unparse(computed), 'text/csv;charset=utf-8')
  }

  const printSheet = () => {
    /** 印刷用セルの style 属性。書式に加えて列幅も反映する。条件付き書式の背景色があればそちらを優先する */
    const cellAttr = (r: number, c: number) => {
      const base = styleToAttr(styles[styleKey(r, c)], condFmtBg(r, c))
      const w = `width:${colWidth(c)}px`
      return base ? base.replace(/"$/, `;${w}"`) : ` style="${w}"`
    }
    /** 印刷用セルの結合属性。被覆セル（左上以外）は null を返して描画しない */
    const spanAttr = (r: number, c: number): string | null => {
      const cov = coverAt(r, c)
      if (!cov) return ''
      if (cov.or !== r || cov.oc !== c) return null
      return ` rowspan="${cov.rs}" colspan="${cov.cs}"`
    }
    const head = computed[0]?.map((c, ci) => {
      const span = spanAttr(0, ci)
      if (span === null) return ''
      return `<th${span}${cellAttr(0, ci)}>${escapeHtml(formatCellValue(c, styles[styleKey(0, ci)]?.fmt))}</th>`
    }).join('') ?? ''
    const body = computed
      .slice(1)
      .map((row, ri) => `<tr style="height:${rowHeight(ri + 1)}px">${row.map((c, ci) => {
        const span = spanAttr(ri + 1, ci)
        if (span === null) return ''
        return `<td${span}${cellAttr(ri + 1, ci)}>${escapeHtml(formatCellValue(c, styles[styleKey(ri + 1, ci)]?.fmt))}</td>`
      }).join('')}</tr>`)
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
                setMerges({})
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
        <button onClick={mergeSelected} disabled={!canMerge} title={t('mergeCells')}>{t('mergeCells')}</button>
        <button onClick={unmergeSelected} disabled={!selectedMerge} title={t('unmergeCells')}>{t('unmergeCells')}</button>
        <button onClick={resetColWidths} title={t('colWidthResetHint')}>{t('colWidthReset')}</button>
        <button onClick={resetRowHeights} title={t('rowHeightResetHint')}>{t('rowHeightReset')}</button>
        <span className="fmt-group" role="group" aria-label="セル書式">
          <button className={curStyle?.b ? 'fmt-active' : ''} onClick={() => updateStyle({ b: !curStyle?.b })} title={t('cellBold')} aria-pressed={!!curStyle?.b}><b>B</b></button>
          <button className={curStyle?.i ? 'fmt-active' : ''} onClick={() => updateStyle({ i: !curStyle?.i })} title={t('cellItalic')} aria-pressed={!!curStyle?.i}><i>I</i></button>
          <label className="fmt-color" title={t('cellTextColor')}>A<input type="color" value={curStyle?.color ?? '#1f2937'} onChange={(e) => updateStyle({ color: e.target.value })} aria-label={t('cellTextColor')} /></label>
          <label className="fmt-color" title={t('cellBg')}>■<input type="color" value={curStyle?.bg ?? '#ffffff'} onChange={(e) => updateStyle({ bg: e.target.value })} aria-label={t('cellBg')} /></label>
          <button className={curStyle?.align === 'left' ? 'fmt-active' : ''} onClick={() => updateStyle({ align: curStyle?.align === 'left' ? undefined : 'left' })} title={t('cellAlignLeft')} aria-pressed={curStyle?.align === 'left'}>⇤</button>
          <button className={curStyle?.align === 'center' ? 'fmt-active' : ''} onClick={() => updateStyle({ align: curStyle?.align === 'center' ? undefined : 'center' })} title={t('cellAlignCenter')} aria-pressed={curStyle?.align === 'center'}>≡</button>
          <button className={curStyle?.align === 'right' ? 'fmt-active' : ''} onClick={() => updateStyle({ align: curStyle?.align === 'right' ? undefined : 'right' })} title={t('cellAlignRight')} aria-pressed={curStyle?.align === 'right'}>⇥</button>
          <select value={curStyle?.fmt ?? 'general'} onChange={(e) => updateStyle({ fmt: e.target.value === 'general' ? undefined : (e.target.value as NumFmt) })} title={t('cellNumFmt')} aria-label={t('cellNumFmt')}>
            <option value="general">{t('fmtGeneral')}</option>
            <option value="number">{t('fmtNumber')}</option>
            <option value="currency">{t('fmtCurrency')}</option>
            <option value="percent">{t('fmtPercent')}</option>
          </select>
          <button onClick={() => updateStyle(null)}>{t('cellClearFormat')}</button>
        </span>
        <label className="check-inline"><input type="checkbox" checked={freeze} onChange={(e) => setFreeze(e.target.checked)} /> {t('freeze')}</label>
        <span className="meta">{grid.length} 行 × {grid[0]?.length ?? 0} 列</span>
        <button onClick={() => setChartOpen((v) => !v)}>📊 グラフ</button>
        <button onClick={() => { if (!condFmtOpen) setCfRange(selectionRangeText()); setCondFmtOpen((v) => !v) }}>{t('condFmt')}</button>
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
      {condFmtOpen && (
        <div className="sheet-condfmt-panel">
          <div className="sheet-condfmt-form">
            <label>{t('condFmtRange')} <input value={cfRange} onChange={(e) => setCfRange(e.target.value)} size={9} placeholder="A1:B5" /></label>
            <label>{t('condFmtOp')}
              <select value={cfOp} onChange={(e) => setCfOp(e.target.value as CondFmtOp)}>
                <option value="gt">{t('condOpGt')}</option>
                <option value="lt">{t('condOpLt')}</option>
                <option value="eq">{t('condOpEq')}</option>
                <option value="gte">{t('condOpGte')}</option>
                <option value="lte">{t('condOpLte')}</option>
                <option value="contains">{t('condOpContains')}</option>
                <option value="empty">{t('condOpEmpty')}</option>
              </select>
            </label>
            {cfOp !== 'empty' && (
              <label>{t('condFmtValue')} <input value={cfValue} onChange={(e) => setCfValue(e.target.value)} size={8} /></label>
            )}
            <label className="fmt-color" title={t('condFmtColor')}>■<input type="color" value={cfBg} onChange={(e) => setCfBg(e.target.value)} aria-label={t('condFmtColor')} /></label>
            <button onClick={addCondFmtRule}>{t('addBtn')}</button>
            <button onClick={() => setCondFmtOpen(false)}>{t('close')}</button>
          </div>
          {condFmt.length === 0 ? (
            <p className="sheet-chart-empty">{t('condFmtNoRules')}</p>
          ) : (
            <ul className="sheet-condfmt-list">
              {condFmt.map((rule) => (
                <li key={rule.id}>
                  <span className="sheet-condfmt-swatch" style={{ background: rule.bg }} />
                  {`${colName(rule.c1)}${rule.r1 + 1}${rule.r1 === rule.r2 && rule.c1 === rule.c2 ? '' : `:${colName(rule.c2)}${rule.r2 + 1}`} ${t(condOpKey(rule.op))}${rule.op === 'empty' ? '' : ` ${rule.value}`}`}
                  <button onClick={() => deleteCondFmtRule(rule.id)}>{t('deleteBtn')}</button>
                </li>
              ))}
            </ul>
          )}
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
          <colgroup>
            <col style={{ width: 44 }} />
            {grid[0]?.map((_, c) => <col key={c} style={{ width: colWidth(c) }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="corner" />
              {grid[0]?.map((_, c) => (
                <th key={c} className={c === selected.c ? 'sel-col' : ''}>
                  {colName(c)}
                  <span
                    className="col-resize"
                    title={t('colWidthAutoFit')}
                    onPointerDown={(e) => startColResize(e, c)}
                    onDoubleClick={() => autoFitColumn(c)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, r) => (
              <tr key={r} style={{ height: rowHeight(r) }}>
                <th className={r === selected.r ? 'sel-row' : ''}>{r + 1}
                  <span
                    className="row-resize"
                    title={t('rowHeightDefault')}
                    onPointerDown={(e) => startRowResize(e, r)}
                    onDoubleClick={() => resetRowHeight(r)}
                  />
                </th>
                {row.map((cell, c) => {
                  const cov = coverAt(r, c)
                  // 結合に覆われたセル（左上以外）は描画しない
                  if (cov && (cov.or !== r || cov.oc !== c)) return null
                  const isFocused = focused?.r === r && focused?.c === c
                  const inRange = !!rangeRect && r >= rangeRect.r1 && r <= rangeRect.r2 && c >= rangeRect.c1 && c <= rangeRect.c2
                  const cfBgCell = condFmtBg(r, c)
                  return (
                    <td key={c} rowSpan={cov?.rs} colSpan={cov?.cs} className={`${r === selected.r && c === selected.c ? 'sel-cell' : ''}${inRange ? ' in-range' : ''}`}>
                      <input
                        ref={(el) => { if (el) cellRefs.current.set(`${r}-${c}`, el); else cellRefs.current.delete(`${r}-${c}`) }}
                        value={isFocused ? cell : formatCellValue(computed[r]?.[c] ?? cell, styles[styleKey(r, c)]?.fmt)}
                        style={{ ...styleToCss(styles[styleKey(r, c)]), ...(cfBgCell ? { backgroundColor: cfBgCell } : {}) }}
                        onFocus={() => { setSelected({ r, c }); setFocused({ r, c }); beginEdit() }}
                        onBlur={() => { setFocused(null); commitEdit() }}
                        onChange={(e) => setCell(r, c, e.target.value)}
                        onKeyDown={onCellKeyDown}
                        onClick={(e) => {
                          if (e.shiftKey) {
                            const a = anchorRef.current
                            setRange({ r1: a.r, c1: a.c, r2: r, c2: c })
                          } else {
                            anchorRef.current = { r, c }
                            setRange(null)
                          }
                        }}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">数式対応：=B2*C2 のような四則演算と、SUM / AVERAGE / MIN / MAX / COUNT（範囲は A1:B5）。キーボード：Enter・↑↓で上下のセルへ、Tab・Shift+Tabで左右のセルへ（端を超えると行・列を自動追加）。元に戻す・やり直し：ツールバーのボタン、または Ctrl+Z／Ctrl+Y（Mac は Cmd+Z／Cmd+Shift+Z）。検索・置換：ツールバーの「検索・置換」から文字を探して置き換えられます（1件ずつ／すべて置換）。セル書式：選択中のセルに太字・斜体・文字色・背景色・配置を設定できます（行・列の挿入／削除・ソートに追従し、印刷にも反映されます）。数値書式：同じくツールバーの「数値書式」から、数値の表示を標準・数値（3桁区切り）・通貨（¥）・パーセントから選べます。入力した値や数式そのものは変わらず、表示だけが変わります（CSV保存は元の値で書き出します）。列幅：列見出しの右端をドラッグすると列の幅を変えられます。右端をダブルクリックすると内容に合った幅に自動調整します。幅は端末内に保存され、列の挿入／削除に追従し、印刷にも反映されます。「列幅をリセット」で元に戻せます。行の高さ：行見出し（1・2・3…）の下端をドラッグすると行の高さを変えられます。下端をダブルクリックすると既定の高さに戻ります。高さは端末内に保存され、行の挿入／削除・ソートに追従し、印刷にも反映されます。「行の高さをリセット」で元に戻せます。CSV保存は計算結果の値で書き出します。シートは自動で端末内に保存されます。セルの結合：セルをクリックしてから Shift+クリックで範囲を選び、ツールバーの「セルを結合」で1つのセルにまとめられます。表示されるのは左上のセルの値で、結合したセルは行・列の挿入／削除に追従し、印刷にも反映されます。「結合を解除」で元のセルに戻ります（隠れていたセルの値は残ります）。条件付き書式：ツールバーの「条件付き書式」から、範囲・条件（より大きい／より小さい／等しい／以上／以下／を含む／空欄）・値・色を指定すると、条件に合うセルの背景色が変わります。数式の計算結果にも対応し、複数のルールがあるときは先に登録したものが優先されます。ルールは端末内に保存され、行・列の挿入／削除・ソートに追従し、印刷にも反映されます。</p>
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
