import { useEffect, useState } from 'react'
import { loadCustomApps, newCustomId, saveCustomApps, type CustomApp } from '../lib/customApps'
import { ownUsageBytes, storageInfo } from '../lib/store'

/* 開発者アプリ：プレイグラウンド／マイApp作成／ストレージ検査 */
type Tab = 'play' | 'apps' | 'storage'
const PG_KEY = 'webx-dev-playground'
const DEFAULT_JS = `// JavaScript を書いて「実行」すると下に結果が出ます\nconst xs = [1, 2, 3, 4, 5]\nconsole.log('合計:', xs.reduce((a, b) => a + b, 0))\n'答えは ' + xs.reduce((a, b) => a + b, 0)`
const DEFAULT_HTML = `<!doctype html>\n<html><body style="font-family:sans-serif;padding:16px">\n<h1>マイApp</h1>\n<p>ここに HTML を書くとアプリになります。</p>\n<button onclick="document.body.style.background='#e0f2fe'">色を変える</button>\n</body></html>`

export default function DeveloperApp({ openApp }: { openApp: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>('play')
  const [mode, setMode] = useState<'js' | 'html'>('js')
  const [code, setCode] = useState(() => localStorage.getItem(PG_KEY) ?? DEFAULT_JS)
  const [output, setOutput] = useState<string[]>([])
  const [apps, setApps] = useState<CustomApp[]>(loadCustomApps)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('📦')
  const [html, setHtml] = useState(DEFAULT_HTML)
  const [lsRows, setLsRows] = useState<{ key: string; size: number }[]>([])
  const [usage, setUsage] = useState('')

  useEffect(() => { localStorage.setItem(PG_KEY, code) }, [code])

  const refreshStorage = async () => {
    const rows: { key: string; size: number }[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) rows.push({ key: k, size: new TextEncoder().encode(localStorage.getItem(k) ?? '').length })
    }
    rows.sort((a, b) => b.size - a.size)
    setLsRows(rows)
    const info = await storageInfo()
    const own = await ownUsageBytes()
    setUsage(`保存方式: ${info.backend} / ブラウザ使用量: ${(info.usage / 1024).toFixed(1)} KB / WebX データ実測: ${(own / 1024).toFixed(1)} KB / localStorage: ${(rows.reduce((s, r) => s + r.size, 0) / 1024).toFixed(1)} KB`)
  }
  useEffect(() => { if (tab === 'storage') void refreshStorage() }, [tab])

  const runJs = () => {
    const logs: string[] = []
    const fakeConsole = {
      log: (...a: unknown[]) => logs.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ')),
      error: (...a: unknown[]) => logs.push('⛔ ' + a.map(String).join(' ')),
      warn: (...a: unknown[]) => logs.push('⚠ ' + a.map(String).join(' ')),
    }
    try {
      const fn = new Function('console', `"use strict";\n${code}`)
      const ret = fn(fakeConsole) as unknown
      if (ret !== undefined) logs.push(`→ ${typeof ret === 'object' ? JSON.stringify(ret) : String(ret)}`)
      setOutput(logs.length ? logs : ['（出力なし）'])
    } catch (e) {
      setOutput([...logs, `⛔ ${e instanceof Error ? e.message : String(e)}`])
    }
  }

  const startNew = () => { setEditId(null); setName(''); setIcon('📦'); setHtml(DEFAULT_HTML) }
  const startEdit = (a: CustomApp) => { setEditId(a.id); setName(a.name); setIcon(a.icon); setHtml(a.html) }
  const saveApp = () => {
    if (!name.trim()) return
    const app: CustomApp = { id: editId ?? newCustomId(), name: name.trim(), icon: icon || '📦', html, createdAt: Date.now() }
    const next = editId ? apps.map((a) => (a.id === editId ? app : a)) : [...apps, app]
    setApps(next)
    saveCustomApps(next)
    setEditId(app.id)
  }
  const deleteApp = (id: string) => {
    const next = apps.filter((a) => a.id !== id)
    setApps(next)
    saveCustomApps(next)
    if (editId === id) startNew()
  }

  return (
    <div className="wxapp dev-app">
      <div className="wxapp-tabs">
        <button className={tab === 'play' ? 'chip on' : 'chip'} onClick={() => setTab('play')}>▶ プレイグラウンド</button>
        <button className={tab === 'apps' ? 'chip on' : 'chip'} onClick={() => setTab('apps')}>📦 マイApp作成</button>
        <button className={tab === 'storage' ? 'chip on' : 'chip'} onClick={() => setTab('storage')}>🗄 ストレージ検査</button>
      </div>

      {tab === 'play' && (
        <>
          <div className="wxapp-chips">
            <button className={mode === 'js' ? 'chip on' : 'chip'} onClick={() => setMode('js')}>JavaScript</button>
            <button className={mode === 'html' ? 'chip on' : 'chip'} onClick={() => setMode('html')}>HTML プレビュー</button>
            {mode === 'js' && <button className="btn primary" onClick={runJs}>▶ 実行</button>}
          </div>
          <textarea className="dev-code" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false}
            placeholder={mode === 'js' ? 'JavaScript コード' : 'HTML コード'} />
          {mode === 'js'
            ? <pre className="dev-output">{output.join('\n') || '実行結果がここに出ます'}</pre>
            : <iframe title="プレビュー" className="dev-preview" sandbox="allow-scripts" srcDoc={code} />}
          <p className="wxapp-note">コードは端末内に自動保存されます。実行はこのページ内だけで完結し、外部に送信されません。</p>
        </>
      )}

      {tab === 'apps' && (
        <>
          <div className="dev-app-list">
            {apps.map((a) => (
              <div key={a.id} className="dev-app-row">
                <span className="dev-app-icon">{a.icon}</span>
                <span className="dev-app-name">{a.name}</span>
                <button className="btn" onClick={() => openApp(a.id)}>開く</button>
                <button className="btn" onClick={() => startEdit(a)}>編集</button>
                <button className="btn danger" onClick={() => deleteApp(a.id)}>削除</button>
              </div>
            ))}
            {apps.length === 0 && <p className="wxapp-empty">まだマイAppがありません。下のフォームから作れます。</p>}
          </div>
          <label className="wxapp-label">アプリ名</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：おみくじ" />
          <label className="wxapp-label">アイコン（絵文字1文字）</label>
          <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} />
          <label className="wxapp-label">HTMLコード</label>
          <textarea className="dev-code" value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false} />
          <div className="wxapp-toolbar">
            <button className="btn primary" onClick={saveApp}>{editId ? '上書き保存' : 'アプリを作成'}</button>
            <button className="btn" onClick={startNew}>新規</button>
          </div>
          <p className="wxapp-note">作ったアプリはデスクトップとスタートメニューに並び、通常のアプリと同じように開けます。実行はサンドボックス内（WebX 本体のデータには触れません）。</p>
        </>
      )}

      {tab === 'storage' && (
        <>
          <p className="wxapp-note">{usage || '読み込み中…'}</p>
          <button className="btn" onClick={() => void refreshStorage()}>再読み込み</button>
          <div className="dev-ls-list">
            {lsRows.map((r) => (
              <div key={r.key} className="dev-ls-row">
                <code>{r.key}</code>
                <span>{(r.size / 1024).toFixed(2)} KB</span>
                <button className="btn danger" onClick={() => { if (window.confirm(`${r.key} を削除しますか？`)) { localStorage.removeItem(r.key); void refreshStorage() } }}>削除</button>
              </div>
            ))}
          </div>
          <p className="wxapp-note">注意：設定やアプリのデータが消えるキーもあります。意味の分かるものだけ削除してください。</p>
        </>
      )}
    </div>
  )
}
