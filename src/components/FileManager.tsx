import { useCallback, useEffect, useState } from 'react'
import { addFolder, deleteDoc, listDocs, listFolders, saveDoc, type LocalDoc } from '../lib/store'
import { useLang } from '../lib/i18n'

interface Props {
  kind: 'word' | 'sheet'
  currentName: string
  getContent: () => string
  onOpen: (doc: LocalDoc) => void
}

const ROOT = ''

export default function FileManager({ kind, currentName, getContent, onOpen }: Props) {
  const { t } = useLang()
  const [docs, setDocs] = useState<LocalDoc[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [filter, setFilter] = useState<string>('__all__')
  const [saveName, setSaveName] = useState(currentName)
  const [saveFolder, setSaveFolder] = useState(ROOT)
  const [newFolder, setNewFolder] = useState('')
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    setDocs(await listDocs())
    setFolders(await listFolders())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setSaveName(currentName)
  }, [currentName])

  const visible = docs.filter((d) => filter === '__all__' || d.folder === filter)

  const doSave = async () => {
    const name = saveName.trim() || '無題'
    await saveDoc({ kind, name, folder: saveFolder, content: getContent() })
    setMessage(`「${name}」を端末内に保存しました`)
    await refresh()
  }

  const doAddFolder = async () => {
    if (!newFolder.trim()) return
    await addFolder(newFolder)
    setNewFolder('')
    await refresh()
  }

  const doDelete = async (doc: LocalDoc) => {
    if (!window.confirm(`「${doc.name}」を削除しますか？`)) return
    await deleteDoc(doc.id)
    await refresh()
  }

  return (
    <div className="file-manager">
      <h3>{t('sectionDocs')}</h3>

      <div className="fm-save">
        <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder={t('docName')} aria-label={t('docName')} />
        <select value={saveFolder} onChange={(e) => setSaveFolder(e.target.value)} aria-label="保存先フォルダ">
          <option value={ROOT}>{t('root')}</option>
          {folders.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <button onClick={() => void doSave()}>{t('saveAs')}</button>
        {message && <span className="fm-message">{message}</span>}
      </div>

      <div className="fm-folders">
        <button className={filter === '__all__' ? 'chip on' : 'chip'} onClick={() => setFilter('__all__')}>{t('all')}</button>
        <button className={filter === ROOT ? 'chip on' : 'chip'} onClick={() => setFilter(ROOT)}>{t('root')}</button>
        {folders.map((f) => (
          <button key={f} className={filter === f ? 'chip on' : 'chip'} onClick={() => setFilter(f)}>📁 {f}</button>
        ))}
        <span className="fm-newfolder">
          <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder={t('newFolderName')} aria-label={t('newFolderName')} />
          <button onClick={() => void doAddFolder()}>{t('addFolder')}</button>
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="fm-empty">{t('noDocs')}</p>
      ) : (
        <ul className="fm-list">
          {visible.map((d) => (
            <li key={d.id}>
              <span className={`app-icon small ${d.kind}`}>{d.kind === 'word' ? 'W' : d.kind === 'sheet' ? 'S' : 'メ'}</span>
              <span className="fm-meta">
                <strong>{d.name}</strong>
                <small>
                  {d.kind === 'word' ? 'ワードプロセッサ' : d.kind === 'sheet' ? 'スプレッドシート' : 'メモ帳'} / {d.folder || 'ルート'} /{' '}
                  {new Date(d.updatedAt).toLocaleString('ja-JP')}
                </small>
              </span>
              <button onClick={() => onOpen(d)}>{t('openBtn')}</button>
              <button onClick={() => void doDelete(d)}>{t('deleteBtn')}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
