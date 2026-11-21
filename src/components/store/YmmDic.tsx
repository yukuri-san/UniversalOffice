import { useEffect, useMemo, useRef, useState } from 'react'
import { createStore, get, set } from 'idb-keyval'
import { notifyOs } from '../../lib/notify'

// YMM4辞書用CSVエディタ（https://api.ykr3.net/ymm-csv.html）の WebX 移植。
// 2列CSV（1列目=立ち絵空間ID、2列目=セリフ）をファイル／フォルダ単位で管理し、
// YMM4仕様（UTF-8 BOM付き・CRLF）で読み書きする。データは端末内 IndexedDB に自動保存。

const DEFAULT_CHAR_IDS = ['由栗参（通常版）', '由栗弥生（ギャグ茶番）', '由栗心夏（通常茶番）']
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

const S = {
  root: { display: 'flex', gap: 10, height: '100%', minHeight: 0 } as React.CSSProperties,
  side: { width: 178, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--border, rgba(127,127,127,.25))', paddingRight: 8 } as React.CSSProperties,
  main: { flex: 1, minWidth: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 } as React.CSSProperties,
  fileRow: (on: boolean) => ({
    display: 'flex', alignItems: 'center', gap: 4, width: '100%', textAlign: 'left',
    padding: '5px 7px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5,
    background: on ? 'var(--accent, #3b82f6)' : 'transparent', color: on ? '#fff' : 'inherit',
  }) as React.CSSProperties,
  mini: { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, padding: '1px 3px', opacity: 0.75 } as React.CSSProperties,
  rowLine: (cur: boolean) => ({
    display: 'flex', gap: 5, alignItems: 'center', padding: '3px 4px', borderRadius: 8,
    background: cur ? 'rgba(59,130,246,.14)' : 'transparent',
  }) as React.CSSProperties,
  sel: { width: 128, flexShrink: 0, fontSize: 12.5, padding: '5px 4px' } as React.CSSProperties,
  txt: { flex: 1, minWidth: 0, fontSize: 13, padding: '5px 7px' } as React.CSSProperties,
  ctx: { border: '1px solid var(--border, rgba(127,127,127,.25))', borderRadius: 10, padding: '8px 10px', fontSize: 12.5 } as React.CSSProperties,
}

export default function YmmDic() {
  const [folders, setFolders] = useState<YFolder[]>([])
  const [files, setFiles] = useState<YFile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [idsOpen, setIdsOpen] = useState(false)
  const [idsText, setIdsText] = useState('')
  const csvRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)
  const importMode = useRef<'new' | 'overwrite'>('new')
  const saveTimer = useRef<number | null>(null)

  const active = useMemo(() => files.find((f) => f.id === activeId) ?? null, [files, activeId])

  // 初回読み込み（無ければサンプルを作成）
  useEffect(() => {
    void (async () => {
      try {
        const [fo, fi, act] = await Promise.all([
          get<YFolder[]>('folders', store),
          get<YFile[]>('files', store),
          get<string>('activeId', store),
        ])
        if (fi && fi.length > 0) {
          setFolders(fo ?? [])
          setFiles(fi)
          setActiveId(act && fi.some((f) => f.id === act) ? act : fi[0].id)
        } else {
          const sample: YFile = {
            id: uid(), folderId: null, name: '基本辞書サンプル',
            characterIds: [...DEFAULT_CHAR_IDS],
            rows: [
              { id: uid(), charId: DEFAULT_CHAR_IDS[0], text: 'ここにセリフ（2列目）を入力します。' },
              { id: uid(), charId: DEFAULT_CHAR_IDS[1], text: '左端の選択肢が「立ち絵空間ID（1列目）」になります。' },
            ],
            updatedAt: Date.now(),
          }
          setFiles([sample])
          setActiveId(sample.id)
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
          await set('activeId', activeId ?? '', store)
          const d = new Date()
          setSaveMsg(`保存しました ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
        } catch { setSaveMsg('保存に失敗しました') }
      })()
    }, 400)
  }, [folders, files, activeId, loaded])

  const patchFile = (id: string, patch: Partial<YFile>) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch, updatedAt: Date.now() } : f)))

  // ---- ファイル／フォルダ操作 ----
  const createFile = (folderId: string | null) => {
    const name = window.prompt('新しい辞書ファイルの名前', '新しい辞書')
    if (!name) return
    const f: YFile = { id: uid(), folderId, name, characterIds: [...DEFAULT_CHAR_IDS], rows: [], updatedAt: Date.now() }
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
  const addRow = () => {
    if (!active) return
    const r: YRow = { id: uid(), charId: active.characterIds[0] ?? '', text: '' }
    patchFile(active.id, { rows: [...active.rows, r] })
    setActiveRowId(r.id)
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
  const clearRows = () => {
    if (!active) return
    if (!window.confirm('このファイルの行をすべて削除しますか？')) return
    patchFile(active.id, { rows: [] })
  }

  // ---- 立ち絵空間ID ----
  const openIds = () => {
    if (!active) return
    setIdsText(active.characterIds.join('\n'))
    setIdsOpen(true)
  }
  const applyIds = () => {
    if (!active) return
    const ids = idsText.split('\n').map((s) => s.trim()).filter(Boolean)
    patchFile(active.id, { characterIds: ids.length > 0 ? ids : [...DEFAULT_CHAR_IDS] })
    setIdsOpen(false)
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
          rows.push({ id: uid(), charId: detected[0] ?? DEFAULT_CHAR_IDS[0], text: cols[0] })
        }
      }
      if (rows.length === 0) { notifyOs('インポート可能なデータがありませんでした', 'ymmdic'); return }
      if (importMode.current === 'overwrite' && active) {
        if (!window.confirm(`「${active.name}」の内容を、このCSVで上書きしますか？`)) return
        const merged = Array.from(new Set([...active.characterIds, ...detected]))
        patchFile(active.id, { rows, characterIds: merged })
        notifyOs(`CSVを上書き取り込みしました（${rows.length}行）`, 'ymmdic')
      } else {
        const name = file.name.replace(/\.csv$/i, '') || '取り込んだ辞書'
        const f: YFile = {
          id: uid(), folderId: null, name,
          characterIds: detected.length > 0 ? detected : [...DEFAULT_CHAR_IDS],
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
    download('ymm-dic-backup.json', new Blob([JSON.stringify({ folders, files }, null, 2)], { type: 'application/json' }))
  }
  const onJsonPicked = (file: File) => {
    void (async () => {
      try {
        const data = JSON.parse(await file.text()) as { folders?: YFolder[]; files?: YFile[] }
        if (!Array.isArray(data.files)) throw new Error('bad format')
        if (!window.confirm('現在の辞書データをすべて、このバックアップで置き換えますか？')) return
        setFolders(Array.isArray(data.folders) ? data.folders : [])
        setFiles(data.files)
        setActiveId(data.files[0]?.id ?? null)
        notifyOs('バックアップを復元しました', 'ymmdic')
      } catch { notifyOs('バックアップファイルを読み込めませんでした', 'ymmdic') }
    })()
  }

  const fileRow = (f: YFile) => (
    <div key={f.id} style={{ display: 'flex', alignItems: 'center' }}>
      <button style={{ ...S.fileRow(f.id === activeId), flex: 1 }} onClick={() => setActiveId(f.id)}>📄 {f.name}</button>
      <button style={S.mini} title="名前を変更" onClick={() => renameFile(f)}>✏️</button>
      <button style={S.mini} title="削除" onClick={() => deleteFile(f)}>🗑</button>
    </div>
  )

  const ctxRows = (() => {
    if (!active || !activeRowId) return null
    const i = active.rows.findIndex((r) => r.id === activeRowId)
    if (i < 0) return null
    return active.rows.slice(Math.max(0, i - 2), Math.min(active.rows.length, i + 3)).map((r) => ({ r, cur: r.id === activeRowId }))
  })()

  return (
    <div style={S.root}>
      {/* サイドバー：ファイルツリー */}
      <div style={S.side}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <button className="btn" onClick={() => createFile(null)}>＋ファイル</button>
          <button className="btn" onClick={createFolder}>＋フォルダ</button>
        </div>
        {files.filter((f) => !f.folderId).map(fileRow)}
        {folders.map((fo) => (
          <div key={fo.id} style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button style={{ ...S.fileRow(false), flex: 1, fontWeight: 700 }} onClick={() => setCollapsed((p) => ({ ...p, [fo.id]: !p[fo.id] }))}>
                {collapsed[fo.id] ? '▸' : '▾'} 📁 {fo.name}
              </button>
              <button style={S.mini} title="このフォルダにファイルを作成" onClick={() => createFile(fo.id)}>＋</button>
              <button style={S.mini} title="名前を変更" onClick={() => renameFolder(fo)}>✏️</button>
              <button style={S.mini} title="削除" onClick={() => deleteFolder(fo)}>🗑</button>
            </div>
            {!collapsed[fo.id] && <div style={{ marginLeft: 12 }}>{files.filter((f) => f.folderId === fo.id).map(fileRow)}</div>}
          </div>
        ))}
        <p className="hint" style={{ marginTop: 10 }}>{saveMsg || '自動保存（端末内）'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          <button className="btn" onClick={exportJSON}>JSONバックアップ出力</button>
          <button className="btn" onClick={() => jsonRef.current?.click()}>JSONバックアップ復元</button>
        </div>
      </div>

      {/* メイン：編集エリア */}
      <div style={S.main}>
        {!active && <p className="hint">左の「＋ファイル」から辞書を作成してください。</p>}
        {active && (
          <>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              <strong style={{ fontSize: 14 }}>{active.name}</strong>
              <span className="hint">{active.rows.length}行</span>
              <span style={{ flex: 1 }} />
              <button className="btn" onClick={openIds}>立ち絵空間IDを編集</button>
              <button className="btn" onClick={() => { importMode.current = 'new'; csvRef.current?.click() }}>CSVを取り込む（新規）</button>
              <button className="btn" onClick={() => { importMode.current = 'overwrite'; csvRef.current?.click() }}>CSVで上書き</button>
              <button className="btn accent" onClick={exportCSV}>CSVを出力</button>
            </div>

            {idsOpen && (
              <div style={S.ctx}>
                <p style={{ margin: '0 0 4px' }}>立ち絵空間ID（1行に1つ）</p>
                <textarea value={idsText} onChange={(e) => setIdsText(e.target.value)} rows={4} style={{ width: '100%', fontSize: 12.5 }} />
                <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                  <button className="btn accent" onClick={applyIds}>適用</button>
                  <button className="btn" onClick={() => setIdsText(DEFAULT_CHAR_IDS.join('\n'))}>既定に戻す</button>
                  <button className="btn" onClick={() => setIdsOpen(false)}>閉じる</button>
                </div>
              </div>
            )}

            {/* 前後の会話プレビュー */}
            {ctxRows && (
              <div style={S.ctx}>
                {ctxRows.map(({ r, cur }) => (
                  <div key={r.id} style={{ opacity: cur ? 1 : 0.6, fontWeight: cur ? 700 : 400, padding: '1.5px 0' }}>
                    <span style={{ color: 'var(--accent, #3b82f6)' }}>{r.charId || '（IDなし）'}</span>：{r.text || '（空）'}
                  </div>
                ))}
              </div>
            )}

            <div>
              {active.rows.map((r) => (
                <div key={r.id} style={S.rowLine(r.id === activeRowId)}>
                  <select style={S.sel} value={r.charId} onFocus={() => setActiveRowId(r.id)} onChange={(e) => patchRow(r.id, { charId: e.target.value })}>
                    {active.characterIds.map((c) => <option key={c} value={c}>{c}</option>)}
                    {!active.characterIds.includes(r.charId) && <option value={r.charId}>{r.charId}</option>}
                  </select>
                  <input style={S.txt} value={r.text} placeholder="セリフを入力" onFocus={() => setActiveRowId(r.id)} onChange={(e) => patchRow(r.id, { text: e.target.value })} />
                  <button style={S.mini} title="上へ" onClick={() => moveRow(r.id, -1)}>↑</button>
                  <button style={S.mini} title="下へ" onClick={() => moveRow(r.id, 1)}>↓</button>
                  <button style={S.mini} title="この行を削除" onClick={() => deleteRow(r.id)}>🗑</button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 5 }}>
              <button className="btn accent" onClick={addRow}>＋行を追加</button>
              <button className="btn" onClick={clearRows}>全行を削除</button>
            </div>
            <p className="hint">CSVは YMM4 仕様（UTF-8 BOM付き・2列：立ち絵空間ID,セリフ）で読み書きします。行を選ぶと前後の会話プレビューが出ます。</p>
          </>
        )}
      </div>

      <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onCsvPicked(f) }} />
      <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onJsonPicked(f) }} />
    </div>
  )
}
