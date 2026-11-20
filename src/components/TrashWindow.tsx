import { useCallback, useEffect, useState } from 'react'
import {
  deleteDoc, listTrashedDocs, purgeOldTrash, restoreDoc, type LocalDoc,
} from '../lib/store'
import { notifyOs } from '../lib/notify'
import { LOCALES, useLang } from '../lib/i18n'

const KIND_ICON: Record<LocalDoc['kind'], string> = { word: 'W', sheet: 'S', note: 'メ' }

export default function TrashWindow() {
  const { lang, t } = useLang()
  const [docs, setDocs] = useState<LocalDoc[]>([])

  const refresh = useCallback(async () => {
    await purgeOldTrash()
    setDocs(await listTrashedDocs())
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 4000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const restore = async (doc: LocalDoc) => {
    await restoreDoc(doc.id)
    notifyOs(`${doc.name}：${t('restoredMsg')}`)
    await refresh()
  }

  const removeForever = async (doc: LocalDoc) => {
    if (!window.confirm(`「${doc.name}」${t('deleteConfirm')}`)) return
    await deleteDoc(doc.id)
    await refresh()
  }

  const emptyAll = async () => {
    if (docs.length === 0) return
    if (!window.confirm(t('deleteConfirm'))) return
    for (const d of docs) await deleteDoc(d.id)
    notifyOs(t('emptiedTrash'))
    await refresh()
  }

  return (
    <div className="files-window">
      <div className="trash-head">
        <h3>🗑 {t('trash')}</h3>
        {docs.length > 0 && <button onClick={() => void emptyAll()}>{t('emptyTrash')}</button>}
      </div>
      <p className="explorer-note">{t('trashNote')}</p>
      {docs.length === 0 ? (
        <p className="fm-empty">{t('trashEmpty')}</p>
      ) : (
        <ul className="fm-list">
          {docs.map((d) => (
            <li key={d.id}>
              <span className={`app-icon small ${d.kind}`}>{KIND_ICON[d.kind]}</span>
              <span className="fm-meta">
                <strong>{d.name}</strong>
                <small>
                  {t(d.kind)} / {d.folder || t('root')} / {t('deletedAtLabel')}：
                  {d.deletedAt ? new Date(d.deletedAt).toLocaleString(LOCALES[lang]) : ''}
                </small>
              </span>
              <button onClick={() => void restore(d)}>{t('restoreFile')}</button>
              <button onClick={() => void removeForever(d)}>{t('deleteForever')}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
