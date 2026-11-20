import { useCallback, useEffect, useRef, useState } from 'react'
import {
  exportAll, importAll, listDocs, listEvents, listFolders, purgeOldTrash, trashDoc,
  ownUsageBytes, requestPersist, storageInfo, type LocalDoc,
} from '../lib/store'
import { downloadText } from '../lib/files'
import { notifyOs } from '../lib/notify'
import type { AppId } from './Backstage'
import { useLang } from '../lib/i18n'

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
  const { t } = useLang()
  const [docs, setDocs] = useState<LocalDoc[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [eventCount, setEventCount] = useState(0)
  const [filter, setFilter] = useState('__all__')
  const [info, setInfo] = useState<{ usage: number; quota: number; persisted: boolean; backend: string } | null>(null)
  const [ownBytes, setOwnBytes] = useState(0)
  const [msg, setMsg] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    await purgeOldTrash()
    const [d, f, e, i, own] = await Promise.all([listDocs(), listFolders(), listEvents(), storageInfo(), ownUsageBytes()])
    setDocs(d)
    setFolders(f)
    setEventCount(e.length)
    setInfo(i)
    setOwnBytes(own)
  }, [])

  useEffect(() => {
    void refresh()
    const t = window.setInterval(() => void refresh(), 4000)
    return () => window.clearInterval(t)
  }, [refresh])

  const visible = docs.filter((d) => filter === '__all__' || d.folder === filter)
  const docsSize = docs.reduce((sum, d) => sum + new Blob([d.content]).size, 0)
  const usagePct = info && info.quota > 0 ? Math.min(100, (ownBytes / info.quota) * 100) : 0

  const open = (doc: LocalDoc) => {
    localStorage.setItem('uo-pending-open', doc.id)
    openApp(doc.kind)
  }

  const remove = async (doc: LocalDoc) => {
    await trashDoc(doc.id)
    notifyOs(`${doc.name}：${t('movedToTrash')}`)
    await refresh()
  }

  const doExport = async () => {
    const data = await exportAll()
    downloadText(`ykr-os-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8')
    setMsg(t('exported'))
  }

  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      if ((data?.app !== 'WebX' && data?.app !== 'YKR-OS') || !Array.isArray(data.docs)) throw new Error('bad format')
      await importAll(data)
      setMsg(t('imported'))
      await refresh()
    } catch {
      setMsg(t('importFailed'))
    }
  }

  return (
    <div className="files-window">
      <section className="explorer-storage">
        <h3>{t('storage')}</h3>
        {info ? (
          <>
            {info.quota > 0 && <div className="storage-bar"><span style={{ width: `${usagePct}%` }} /></div>}
            <p>
              {t('webxUsage')} {formatBytes(ownBytes)}
              {info.quota > 0
                ? ` / 上限の目安 ${formatBytes(info.quota)}（${usagePct.toFixed(2)}%）`
                : ` / ${t('quotaUnknown')}`}
              ／ {t('backend')}：{info.backend} ／ {t('persisted')}：{info.persisted ? t('enabled') : t('notSet')}
            </p>
            <p>
              {t('filesCount')} {docs.length}（{t('bodySize')} {formatBytes(docsSize)}）／ {t('foldersCount')} {folders.length} ／ {t('eventsCount')} {eventCount}
            </p>
            <div className="explorer-actions">
              {!info.persisted && (
                <button onClick={() => { void requestPersist().then(() => refresh()) }}>{t('persistRequest')}</button>
              )}
              <button onClick={() => void doExport()}>{t('exportBackup')}</button>
              <button onClick={() => importRef.current?.click()}>{t('importBackup')}</button>
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
            <p className="explorer-note">{t('storageNote')}</p>
          </>
        ) : (
          <p>{t('loading')}</p>
        )}
      </section>

      <div className="fm-folders">
        <button className={filter === '__all__' ? 'chip on' : 'chip'} onClick={() => setFilter('__all__')}>{t('all')}</button>
        <button className={filter === '' ? 'chip on' : 'chip'} onClick={() => setFilter('')}>{t('root')}</button>
        {folders.map((f) => (
          <button key={f} className={filter === f ? 'chip on' : 'chip'} onClick={() => setFilter(f)}>📁 {f}</button>
        ))}
        <button className="chip" onClick={() => void refresh()}>{t('refresh')}</button>
      </div>
      {visible.length === 0 ? (
        <p className="fm-empty">{t('noFiles')}</p>
      ) : (
        <ul className="fm-list">
          {visible.map((d) => (
            <li key={d.id}>
              <span className={`app-icon small ${d.kind}`}>{KIND_ICON[d.kind]}</span>
              <span className="fm-meta">
                <strong>{d.name}</strong>
                <small>{KIND_LABEL[d.kind]} / {d.folder || 'ルート'} / {new Date(d.updatedAt).toLocaleString('ja-JP')}</small>
              </span>
              <button onClick={() => open(d)}>{t('openBtn')}</button>
              <button onClick={() => void remove(d)}>{t('deleteBtn')}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
