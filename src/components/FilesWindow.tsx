import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteDoc, exportAll, importAll, listDocs, listEvents, listFolders,
  requestPersist, storageInfo, type LocalDoc,
} from '../lib/store'
import { downloadText } from '../lib/files'
import type { AppId } from './Backstage'

const KIND_LABEL: Record<LocalDoc['kind'], string> = {
  word: 'ワードプロセッサ',
  sheet: 'スプレッドシート',
  note: 'メモ帳',
}
const KIND_ICON: Record<LocalDoc['kind'], string> = { word: 'W', sheet: 'S', note: 'メ' }

function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

export default function FilesWindow({ openApp }: { openApp: (app: AppId) => void }) {
  const [docs, setDocs] = useState<LocalDoc[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [eventCount, setEventCount] = useState(0)
  const [filter, setFilter] = useState('__all__')
  const [info, setInfo] = useState<{ usage: number; quota: number; persisted: boolean; backend: string } | null>(null)
  const [msg, setMsg] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const [d, f, e, i] = await Promise.all([listDocs(), listFolders(), listEvents(), storageInfo()])
    setDocs(d)
    setFolders(f)
    setEventCount(e.length)
    setInfo(i)
  }, [])

  useEffect(() => {
    void refresh()
    const t = window.setInterval(() => void refresh(), 4000)
    return () => window.clearInterval(t)
  }, [refresh])

  const visible = docs.filter((d) => filter === '__all__' || d.folder === filter)
  const docsSize = docs.reduce((sum, d) => sum + new Blob([d.content]).size, 0)
  const usagePct = info && info.quota > 0 ? Math.min(100, (info.usage / info.quota) * 100) : 0

  const open = (doc: LocalDoc) => {
    localStorage.setItem('uo-pending-open', doc.id)
    openApp(doc.kind)
  }

  const remove = async (doc: LocalDoc) => {
    if (!window.confirm(`「${doc.name}」を削除しますか？`)) return
    await deleteDoc(doc.id)
    await refresh()
  }

  const doExport = async () => {
    const data = await exportAll()
    downloadText(`ykr-os-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8')
    setMsg('バックアップを書き出しました')
  }

  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      if ((data?.app !== 'WebX' && data?.app !== 'YKR-OS') || !Array.isArray(data.docs)) throw new Error('bad format')
      await importAll(data)
      setMsg('バックアップから復元しました')
      await refresh()
    } catch {
      setMsg('復元できませんでした。WebX のバックアップファイルを選んでください')
    }
  }

  return (
    <div className="files-window">
      <section className="explorer-storage">
        <h3>ストレージ</h3>
        {info ? (
          <>
            <div className="storage-bar"><span style={{ width: `${usagePct}%` }} /></div>
            <p>
              使用量 {formatBytes(info.usage)} / 上限の目安 {info.quota ? formatBytes(info.quota) : '不明'}（{usagePct.toFixed(1)}%）
              ／ 保存方式：{info.backend} ／ 永続化：{info.persisted ? '有効' : '未設定'}
            </p>
            <p>
              ファイル {docs.length} 件（{formatBytes(docsSize)}）／ フォルダ {folders.length} 個 ／ カレンダーの予定 {eventCount} 件
            </p>
            <div className="explorer-actions">
              {!info.persisted && (
                <button onClick={() => { void requestPersist().then(() => refresh()) }}>永続化をリクエスト</button>
              )}
              <button onClick={() => void doExport()}>バックアップを書き出し</button>
              <button onClick={() => importRef.current?.click()}>バックアップから復元</button>
              <input
                ref={importRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void doImport(f)
                  e.target.value = ''
                }}
              />
              {msg && <span className="fm-message">{msg}</span>}
            </div>
            <p className="explorer-note">
              保存は OPFS（使える環境では大容量・高速）優先で、使えない環境では IndexedDB を使います。
              容量が心配なときは、バックアップ書き出しで端末の外にも控えを残せます。
            </p>
          </>
        ) : (
          <p>読み込み中…</p>
        )}
      </section>

      <div className="fm-folders">
        <button className={filter === '__all__' ? 'chip on' : 'chip'} onClick={() => setFilter('__all__')}>すべて</button>
        <button className={filter === '' ? 'chip on' : 'chip'} onClick={() => setFilter('')}>ルート</button>
        {folders.map((f) => (
          <button key={f} className={filter === f ? 'chip on' : 'chip'} onClick={() => setFilter(f)}>📁 {f}</button>
        ))}
        <button className="chip" onClick={() => void refresh()}>更新</button>
      </div>
      {visible.length === 0 ? (
        <p className="fm-empty">保存されたファイルはまだありません。各アプリの「ホーム」から保存できます。</p>
      ) : (
        <ul className="fm-list">
          {visible.map((d) => (
            <li key={d.id}>
              <span className={`app-icon small ${d.kind}`}>{KIND_ICON[d.kind]}</span>
              <span className="fm-meta">
                <strong>{d.name}</strong>
                <small>{KIND_LABEL[d.kind]} / {d.folder || 'ルート'} / {new Date(d.updatedAt).toLocaleString('ja-JP')}</small>
              </span>
              <button onClick={() => open(d)}>開く</button>
              <button onClick={() => void remove(d)}>削除</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
