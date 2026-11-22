import { useEffect, useMemo, useRef, useState } from 'react'
import { createStore, get, set } from 'idb-keyval'
import { notifyOs } from '../../lib/notify'

// YMM4辞書用CSVエディタ（https://api.ykr3.net/ymm-csv.html）の WebX 移植。
// 2列CSV（1列目=立ち絵空間ID、2列目=セリフ）をファイル／フォルダ単位で管理し、
// YMM4仕様（UTF-8 BOM付き・CRLF）で読み書きする。データは端末内 IndexedDB に自動保存。

// v1.0.0 で入れていた既定の立ち絵空間IDは仮データだったため廃止した。
// これは旧データの掃除（一度だけ）専用の定義。
const LEGACY_DUMMY_IDS = ['由栗参（通常版）', '由栗弥生（ギャグ茶番）', '由栗心夏（通常茶番）']
const LEGACY_SAMPLE_ROWS = ['ここにセリフ（2列目）を入力します。', '左端の選択肢が「立ち絵空間ID（1列目）」になります。']
const store = createStore('webx-ymm-db', 'kv')

interface YFolder { id: string; name: string }
interface YRow { id: string; charId: string; text: string }
interface YFile {
  id: string
  folderId: string | null
  name: string
  characterIds: string[]
  rows: YRow[]
  updatedAt: number
}

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36)

/** 立ち絵空間IDごとに安定した色を割り当てる */
function colorOf(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return `hsl(${h} 65% 45%)`
}

/** 引用符・改行を含むフィールドにも対応する CSV パーサ */
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else field += c
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function escapeCSVField(field: string): string {
  const str = field ?? ''
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export default function YmmDic() {
  const [folders, setFolders] = useState<YFolder[]>([])
  const [files, setFiles] = useState<YFile[]>([])
  const [charIds, setCharIds] = useState<string[]>([]) // 空間IDは全ファイル共通
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [view, setView] = useState<'edit' | 'idsettings'>('edit')
  const [rowQuery, setRowQuery] = useState('')
  const [problemFilter, setProblemFilter] = useState<null | 'empty' | 'noid' | 'dup'>(null)
  const [newId, setNewId] = useState('')
  const [focusRowId, setFocusRowId] = useState<string | null>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)
  const importMode = useRef<'new' | 'overwrite'>('new')
  const saveTimer = useRef<number | null>(null)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const active = useMemo(() => files.find((f) => f.id === activeId) ?? null, [files, activeId])

  useEffect(() => {
    if (focusRowId) {
      inputRefs.current[focusRowId]?.focus()
      setFocusRowId(null)
    }
  }, [focusRowId, active?.rows.length])

  // 初回読み込み（無ければサンプルを作成）
  useEffect(() => {
    void (async () => {
      try {
        const [fo, fi, act, gids] = await Promise.all([
          get<YFolder[]>('folders', store),
          get<YFile[]>('files', store),
          get<string>('activeId', store),
          get<string[]>('charIds', store),
        ])
        // 空間IDは全ファイル共通。旧データ（ファイルごとのID）は統合して移行する
        if (Array.isArray(gids)) setCharIds(gids)
        else if (fi) {
          // 仮データ掃除がまだの環境では、既定ID（仮データ）を共通IDへ持ち込まない
          const cleanedYet = !!localStorage.getItem('webx-ymm-cleaned-v110')
          const union = Array.from(new Set(fi.flatMap((f) => f.characterIds ?? [])))
          setCharIds(cleanedYet ? union : union.filter((c) => !LEGACY_DUMMY_IDS.includes(c)))
        }
        if (fi && fi.length > 0) {
          let cleaned = fi
          // v1.1.0：仮データ（既定ID・未編集のサンプル）の掃除を一度だけ行う
          if (!localStorage.getItem('webx-ymm-cleaned-v110')) {
            cleaned = fi
              .filter((f) => !(f.name === '基本辞書サンプル' && f.rows.length === 2 && f.rows.every((r, i) => r.text === LEGACY_SAMPLE_ROWS[i])))
              .map((f) => ({ ...f, characterIds: f.characterIds.filter((c) => !LEGACY_DUMMY_IDS.includes(c)) }))
            localStorage.setItem('webx-ymm-cleaned-v110', '1')
          }
          setFolders(fo ?? [])
          setFiles(cleaned)
          setActiveId(act && cleaned.some((f) => f.id === act) ? act : (cleaned[0]?.id ?? null))
        }
      } catch { /* ignore */ }
      setLoaded(true)
    })()
  }, [])

  // 自動保存（デバウンス）
  useEffect(() => {
    if (!loaded) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void (async () => {
        try {
          await set('folders', folders, store)
          await set('files', files, store)
          await set('charIds', charIds, store)
          await set('activeId', activeId ?? '', store)
          const d = new Date()
          setSaveMsg(`✓ 保存 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
        } catch { setSaveMsg('保存に失敗しました') }
      })()
    }, 400)
  }, [folders, files, charIds, activeId, loaded])

  const patchFile = (id: string, patch: Partial<YFile>) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch, updatedAt: Date.now() } : f)))

  // ---- ファイル／フォルダ操作 ----
  const createFile = (folderId: string | null) => {
    const name = window.prompt('新しい辞書ファイルの名前', '新しい辞書')
    if (!name) return
    const f: YFile = { id: uid(), folderId, name, characterIds: [], rows: [], updatedAt: Date.now() }
    setFiles((p) => [...p, f])
    setActiveId(f.id)
  }
  const createFolder = () => {
    const name = window.prompt('新しいフォルダの名前', '新しいフォルダ')
    if (!name) return
    setFolders((p) => [...p, { id: uid(), name }])
  }
  const renameFile = (f: YFile) => {
    const name = window.prompt('ファイル名を変更', f.name)
    if (name) patchFile(f.id, { name })
  }
  const renameFolder = (fo: YFolder) => {
    const name = window.prompt('フォルダ名を変更', fo.name)
    if (name) setFolders((p) => p.map((x) => (x.id === fo.id ? { ...x, name } : x)))
  }
  const deleteFile = (f: YFile) => {
    if (!window.confirm(`ファイル「${f.name}」を削除しますか？`)) return
    setFiles((p) => p.filter((x) => x.id !== f.id))
    if (activeId === f.id) setActiveId(null)
  }
  const deleteFolder = (fo: YFolder) => {
    if (!window.confirm(`フォルダ「${fo.name}」を削除しますか？\n（中のファイルはフォルダから外れてルート直下に保存されます）`)) return
    setFiles((p) => p.map((x) => (x.folderId === fo.id ? { ...x, folderId: null } : x)))
    setFolders((p) => p.filter((x) => x.id !== fo.id))
  }

  // ---- 行操作 ----
  const insertRowAfter = (afterId: string | null) => {
    if (!active) return
    const r: YRow = { id: uid(), charId: charIds[0] ?? '', text: '' }
    const rows = [...active.rows]
    const i = afterId ? rows.findIndex((x) => x.id === afterId) : -1
    if (i >= 0) {
      r.charId = rows[i].charId
      rows.splice(i + 1, 0, r)
    } else rows.push(r)
    patchFile(active.id, { rows })
    setActiveRowId(r.id)
    setFocusRowId(r.id)
  }
  const patchRow = (rowId: string, patch: Partial<YRow>) => {
    if (!active) return
    patchFile(active.id, { rows: active.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) })
  }
  const deleteRow = (rowId: string) => {
    if (!active) return
    patchFile(active.id, { rows: active.rows.filter((r) => r.id !== rowId) })
  }
  const moveRow = (rowId: string, dir: -1 | 1) => {
    if (!active) return
    const rows = [...active.rows]
    const i = rows.findIndex((r) => r.id === rowId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= rows.length) return
    ;[rows[i], rows[j]] = [rows[j], rows[i]]
    patchFile(active.id, { rows })
  }
  const duplicateRow = (rowId: string) => {
    if (!active) return
    const rows = [...active.rows]
    const i = rows.findIndex((r) => r.id === rowId)
    if (i < 0) return
    const copy: YRow = { ...rows[i], id: uid() }
    rows.splice(i + 1, 0, copy)
    patchFile(active.id, { rows })
    setActiveRowId(copy.id)
  }
  const clearRows = () => {
    if (!active) return
    if (!window.confirm('このファイルの行をすべて削除しますか？')) return
    patchFile(active.id, { rows: [] })
  }

  // ---- 立ち絵空間ID（設定画面） ----
  const renameId = (oldName: string, raw: string) => {
    const name = raw.trim()
    if (!name || name === oldName) return
    if (charIds.includes(name)) { notifyOs('同じ名前のIDが既にあります', 'ymmdic'); return }
    setCharIds((prev) => prev.map((c) => (c === oldName ? name : c)))
    // 名前変更は全ファイルの行にも反映する
    setFiles((prev) => prev.map((f) => ({ ...f, rows: f.rows.map((r) => (r.charId === oldName ? { ...r, charId: name } : r)) })))
  }
  const deleteId = (name: string) => {
    const n = files.reduce((sum, f) => sum + f.rows.filter((r) => r.charId === name).length, 0)
    if (!window.confirm(`空間ID「${name}」を削除しますか？${n > 0 ? `\n（このIDを使っている行が全ファイルで ${n} 件あります。行そのものは残ります）` : ''}`)) return
    setCharIds((prev) => prev.filter((c) => c !== name))
  }
  const moveId = (name: string, dir: -1 | 1) => {
    const ids = [...charIds]
    const i = ids.indexOf(name)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    setCharIds(ids)
  }
  const addId = () => {
    const name = newId.trim()
    if (!name) return
    if (charIds.includes(name)) { notifyOs('同じ名前のIDが既にあります', 'ymmdic'); return }
    setCharIds((prev) => [...prev, name])
    setNewId('')
  }

  // ---- CSV ----
  const onCsvPicked = (file: File) => {
    void (async () => {
      const text = await file.text()
      const parsed = parseCSV(text)
      const rows: YRow[] = []
      const detected: string[] = []
      for (const cols of parsed) {
        if (cols.every((c) => !c.trim())) continue
        if (cols.length >= 2) {
          const charId = cols[0].trim()
          if (charId && !detected.includes(charId)) detected.push(charId)
          rows.push({ id: uid(), charId, text: cols[1] })
        } else if (cols.length === 1 && cols[0].trim()) {
          rows.push({ id: uid(), charId: detected[0] ?? '', text: cols[0] })
        }
      }
      if (rows.length === 0) { notifyOs('インポート可能なデータがありませんでした', 'ymmdic'); return }
      setCharIds((prev) => Array.from(new Set([...prev, ...detected])))
      if (importMode.current === 'overwrite' && active) {
        if (!window.confirm(`「${active.name}」の内容を、このCSVで上書きしますか？`)) return
        patchFile(active.id, { rows })
        notifyOs(`CSVを上書き取り込みしました（${rows.length}行）`, 'ymmdic')
      } else {
        const name = file.name.replace(/\.csv$/i, '') || '取り込んだ辞書'
        const f: YFile = {
          id: uid(), folderId: null, name,
          characterIds: [],
          rows, updatedAt: Date.now(),
        }
        setFiles((p) => [...p, f])
        setActiveId(f.id)
        notifyOs(`CSVを取り込みました（${rows.length}行）`, 'ymmdic')
      }
    })()
  }
  const exportCSV = () => {
    if (!active || active.rows.length === 0) { notifyOs('出力するデータが空です', 'ymmdic'); return }
    const body = active.rows.map((r) => `${escapeCSVField(r.charId)},${escapeCSVField(r.text)}`).join('\r\n') + '\r\n'
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF])
    download(active.name.endsWith('.csv') ? active.name : `${active.name}.csv`, new Blob([bom, body], { type: 'text/csv;charset=utf-8;' }))
    notifyOs(`「${active.name}」をダウンロードしました`, 'ymmdic')
  }

  // ---- JSONバックアップ ----
  const exportJSON = () => {
    download('ymm-dic-backup.json', new Blob([JSON.stringify({ folders, files, charIds }, null, 2)], { type: 'application/json' }))
  }
  const onJsonPicked = (file: File) => {
    void (async () => {
      try {
        const data = JSON.parse(await file.text()) as { folders?: YFolder[]; files?: YFile[]; charIds?: string[] }
        if (!Array.isArray(data.files)) throw new Error('bad format')
        if (!window.confirm('現在の辞書データをすべて、このバックアップで置き換えますか？')) return
        setFolders(Array.isArray(data.folders) ? data.folders : [])
        setFiles(data.files)
        setCharIds(Array.isArray(data.charIds) ? data.charIds : Array.from(new Set(data.files.flatMap((f) => f.characterIds ?? []))))
        setActiveId(data.files[0]?.id ?? null)
        notifyOs('バックアップを復元しました', 'ymmdic')
      } catch { notifyOs('バックアップファイルを読み込めませんでした', 'ymmdic') }
    })()
  }

  // v1.4.0：行の検索と、空行・IDなし・重複セリフのチェック
  const rowStats = (() => {
    if (!active) return { empty: 0, noid: 0, dup: 0, dupTexts: new Set<string>() }
    const counts = new Map<string, number>()
    for (const r of active.rows) {
      const key = r.text.trim()
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const dupTexts = new Set([...counts.entries()].filter(([, n]) => n >= 2).map(([k]) => k))
    return {
      empty: active.rows.filter((r) => !r.text.trim()).length,
      noid: active.rows.filter((r) => !r.charId).length,
      dup: active.rows.filter((r) => dupTexts.has(r.text.trim())).length,
      dupTexts,
    }
  })()
  const displayRows = (() => {
    if (!active) return []
    let rows = active.rows
    if (problemFilter === 'empty') rows = rows.filter((r) => !r.text.trim())
    else if (problemFilter === 'noid') rows = rows.filter((r) => !r.charId)
    else if (problemFilter === 'dup') rows = rows.filter((r) => rowStats.dupTexts.has(r.text.trim()))
    const q = rowQuery.trim().toLowerCase()
    if (q) rows = rows.filter((r) => r.text.toLowerCase().includes(q) || r.charId.toLowerCase().includes(q))
    return rows
  })()
  const filtering = problemFilter !== null || rowQuery.trim() !== ''

  const fileRow = (f: YFile) => (
    <div key={f.id} className={f.id === activeId ? 'ymm-file on' : 'ymm-file'}>
      <button className="ymm-file-main" onClick={() => { setActiveId(f.id); setView('edit') }}>
        <span>📄</span>
        <span className="ymm-file-name">{f.name}</span>
        <span className="ymm-file-count">{f.rows.length}</span>
      </button>
      <button className="ymm-mini" title="名前を変更" onClick={() => renameFile(f)}>✏️</button>
      <button className="ymm-mini" title="削除" onClick={() => deleteFile(f)}>🗑</button>
    </div>
  )

  const ctxRows = (() => {
    if (!active || !activeRowId) return null
    const i = active.rows.findIndex((r) => r.id === activeRowId)
    if (i < 0) return null
    return active.rows.slice(Math.max(0, i - 2), Math.min(active.rows.length, i + 3)).map((r) => ({ r, cur: r.id === activeRowId }))
  })()

  return (
    <div className="ymm-root">
      <div className="ymm-head">
        <div className="ymm-logo">🗣</div>
        <div>
          <div className="ymm-title">YMM4辞書CSV</div>
          <div className="ymm-sub">立ち絵空間ID × セリフの辞書エディタ</div>
        </div>
        <span className="ymm-savepill">{saveMsg || '自動保存（端末内）'}</span>
      </div>

      <div className="ymm-body">
        {/* サイドバー */}
        <div className="ymm-side">
          <div className="ymm-addbtns">
            <button className="btn" onClick={() => createFile(null)}>＋ ファイル</button>
            <button className="btn" onClick={createFolder}>＋ フォルダ</button>
          </div>
          <div className="ymm-side-cap">辞書ファイル</div>
          {files.filter((f) => !f.folderId).map(fileRow)}
          {folders.map((fo) => (
            <div key={fo.id}>
              <div className="ymm-folder-head">
                <button className="ymm-file-main" style={{ fontWeight: 700 }} onClick={() => setCollapsed((p) => ({ ...p, [fo.id]: !p[fo.id] }))}>
                  <span>{collapsed[fo.id] ? '▸' : '▾'} 📁</span>
                  <span className="ymm-file-name">{fo.name}</span>
                </button>
                <button className="ymm-mini" title="このフォルダにファイルを作成" onClick={() => createFile(fo.id)}>＋</button>
                <button className="ymm-mini" title="名前を変更" onClick={() => renameFolder(fo)}>✏️</button>
                <button className="ymm-mini" title="削除" onClick={() => deleteFolder(fo)}>🗑</button>
              </div>
              {!collapsed[fo.id] && <div style={{ marginLeft: 10 }}>{files.filter((f) => f.folderId === fo.id).map(fileRow)}</div>}
            </div>
          ))}
          <div className="ymm-backup">
            <div className="ymm-side-cap">バックアップ</div>
            <button className="btn" onClick={exportJSON}>JSONで書き出す</button>
            <button className="btn" onClick={() => jsonRef.current?.click()}>JSONから復元</button>
          </div>
        </div>

        {/* メイン */}
        <div className="ymm-main">
          {!active && (
            <div className="ymm-empty">
              <div style={{ fontSize: 40 }}>🗣</div>
              <p>辞書が選択されていません。<br />左の「＋ ファイル」から作成してください。</p>
            </div>
          )}
          {active && view === 'idsettings' && (
            <>
              <div className="ymm-set-head">
                <button className="ymm-backbtn" onClick={() => setView('edit')}>← 戻る</button>
                <span className="ymm-set-title">🎭 空間IDの設定</span>
                <span className="hint">全ファイル共通</span>
              </div>
              <p className="hint" style={{ margin: 0 }}>空間IDは全ての辞書ファイルで共通です。名前を変えると、全ファイルの行にも反映されます。並び順は、行のID選択肢の順番になります。</p>
              <div className="ymm-set-list">
                {charIds.map((c) => (
                  <div key={c} className="ymm-set-row">
                    <span className="ymm-ava" style={{ background: colorOf(c), width: 26, height: 26, fontSize: 13 }}>{c.slice(0, 1)}</span>
                    <input
                      className="ymm-set-name"
                      defaultValue={c}
                      onBlur={(e) => renameId(c, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    />
                    <span className="ymm-set-count">全{files.reduce((sum, f) => sum + f.rows.filter((r) => r.charId === c).length, 0)}行</span>
                    <button className="ymm-iconbtn" title="上へ" onClick={() => moveId(c, -1)}>↑</button>
                    <button className="ymm-iconbtn" title="下へ" onClick={() => moveId(c, 1)}>↓</button>
                    <button className="ymm-iconbtn" title="削除" onClick={() => deleteId(c)}>✕</button>
                  </div>
                ))}
                {charIds.length === 0 && <p className="hint">空間IDがまだありません。下から追加してください。</p>}
              </div>
              <div className="ymm-set-add">
                <input
                  value={newId}
                  placeholder="新しい空間IDの名前"
                  onChange={(e) => setNewId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addId() }}
                />
                <button className="btn accent" onClick={addId}>＋ 追加</button>
              </div>
            </>
          )}
          {active && view === 'edit' && (
            <>
              <div className="ymm-toolbar">
                <span className="ymm-fname">{active.name}</span>
                <span className="hint">{active.rows.length}行</span>
                <span style={{ flex: 1 }} />
                <button className="btn" onClick={() => setView('idsettings')}>🎭 IDの設定</button>
                <button className="btn" onClick={() => { importMode.current = 'new'; csvRef.current?.click() }}>CSV取込（新規）</button>
                <button className="btn" onClick={() => { importMode.current = 'overwrite'; csvRef.current?.click() }}>CSVで上書き</button>
                <button className="btn accent" onClick={exportCSV}>⬇ CSVを出力</button>
              </div>

              <div className="ymm-chips">
                {charIds.map((c) => (
                  <span key={c} className="ymm-chip">
                    <span className="ymm-ava" style={{ background: colorOf(c) }}>{c.slice(0, 1)}</span>
                    {c}
                  </span>
                ))}
              </div>

              <div className="ymm-searchrow">
                <input
                  className="ymm-search"
                  value={rowQuery}
                  placeholder="🔍 セリフ・空間IDで検索"
                  onChange={(e) => setRowQuery(e.target.value)}
                />
                <button className={problemFilter === 'empty' ? 'chip on warn' : 'chip'} onClick={() => setProblemFilter(problemFilter === 'empty' ? null : 'empty')}>空のセリフ {rowStats.empty}件</button>
                <button className={problemFilter === 'noid' ? 'chip on warn' : 'chip'} onClick={() => setProblemFilter(problemFilter === 'noid' ? null : 'noid')}>IDなし {rowStats.noid}件</button>
                <button className={problemFilter === 'dup' ? 'chip on warn' : 'chip'} onClick={() => setProblemFilter(problemFilter === 'dup' ? null : 'dup')}>重複セリフ {rowStats.dup}件</button>
                {filtering && (
                  <>
                    <span className="hint">{displayRows.length}件を表示中（全{active.rows.length}行）</span>
                    <button className="chip" onClick={() => { setProblemFilter(null); setRowQuery('') }}>絞り込み解除</button>
                  </>
                )}
              </div>


              {ctxRows && (
                <div className="ymm-ctx">
                  <div className="ymm-ctx-cap">会話プレビュー</div>
                  {ctxRows.map(({ r, cur }) => (
                    <div key={r.id} className={cur ? 'ymm-bubble-row cur' : 'ymm-bubble-row'}>
                      <span className="ymm-ava" style={{ background: colorOf(r.charId), width: 24, height: 24 }}>{(r.charId || '？').slice(0, 1)}</span>
                      <div className="ymm-bubble">
                        <div className="ymm-bubble-name" style={{ color: colorOf(r.charId) }}>{r.charId || '（IDなし）'}</div>
                        {r.text || '（空）'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {active.rows.length === 0 && (
                <div className="ymm-empty">
                  <div style={{ fontSize: 34 }}>💬</div>
                  <p>まだ行がありません。下のボタンからセリフを追加しましょう。</p>
                </div>
              )}

              <div className="ymm-rows">
                {displayRows.map((r) => (
                  <div key={r.id} className={r.id === activeRowId ? 'ymm-row cur' : 'ymm-row'}>
                    <span className="ymm-row-bar" style={{ background: colorOf(r.charId) }} />
                    <span className="ymm-ava" style={{ background: colorOf(r.charId) }}>{(r.charId || '？').slice(0, 1)}</span>
                    <select className="ymm-sel" value={r.charId} onFocus={() => setActiveRowId(r.id)} onChange={(e) => patchRow(r.id, { charId: e.target.value })}>
                      {charIds.map((c) => <option key={c} value={c}>{c}</option>)}
                      {!charIds.includes(r.charId) && r.charId && <option value={r.charId}>{r.charId}</option>}
                    </select>
                    <input
                      className="ymm-txt"
                      ref={(el) => { inputRefs.current[r.id] = el }}
                      value={r.text}
                      placeholder="セリフを入力"
                      onFocus={() => setActiveRowId(r.id)}
                      onChange={(e) => patchRow(r.id, { text: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertRowAfter(r.id) } }}
                    />
                    <span className="ymm-rowacts">
                      <button className="ymm-iconbtn" title="上へ" onClick={() => moveRow(r.id, -1)}>↑</button>
                      <button className="ymm-iconbtn" title="下へ" onClick={() => moveRow(r.id, 1)}>↓</button>
                      <button className="ymm-iconbtn" title="この行を複製" onClick={() => duplicateRow(r.id)}>⧉</button>
                      <button className="ymm-iconbtn" title="この行を削除" onClick={() => deleteRow(r.id)}>✕</button>
                    </span>
                  </div>
                ))}
              </div>

              {filtering && displayRows.length === 0 && <p className="hint">条件に合う行がありません。</p>}
              <button className="ymm-addrow" onClick={() => insertRowAfter(active.rows[active.rows.length - 1]?.id ?? null)}>＋ 行を追加</button>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="btn" onClick={clearRows}>全行を削除</button>
              </div>
            </>
          )}
        </div>
      </div>

      <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onCsvPicked(f) }} />
      <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onJsonPicked(f) }} />
    </div>
  )
}
