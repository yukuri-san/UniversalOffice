import { useCallback, useEffect, useState } from 'react'
import { deleteDoc, listDocs, listFolders, type LocalDoc } from '../lib/store'
import type { AppId } from './Backstage'

const KIND_LABEL: Record<LocalDoc['kind'], string> = {
  word: 'ワードプロセッサ',
  sheet: 'スプレッドシート',
  note: 'メモ帳',
}
const KIND_ICON: Record<LocalDoc['kind'], string> = { word: 'W', sheet: 'S', note: 'メ' }

export default function FilesWindow({ openApp }: { openApp: (app: AppId) => void }) {
  const [docs, setDocs] = useState<LocalDoc[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [filter, setFilter] = useState('__all__')

  const refresh = useCallback(async () => {
    setDocs(await listDocs())
    setFolders(await listFolders())
  }, [])

  useEffect(() => {
    void refresh()
    const t = window.setInterval(() => void refresh(), 3000)
    return () => window.clearInterval(t)
  }, [refresh])

  const visible = docs.filter((d) => filter === '__all__' || d.folder === filter)

  const open = (doc: LocalDoc) => {
    localStorage.setItem('uo-pending-open', doc.id)
    openApp(doc.kind)
  }

  const remove = async (doc: LocalDoc) => {
    if (!window.confirm(`「${doc.name}」を削除しますか？`)) return
    await deleteDoc(doc.id)
    await refresh()
  }

  return (
    <div className="files-window">
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
