import { useCallback, useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { useLang } from '../lib/i18n'
import { STORE_APPS } from '../lib/storeApps'
import { catalogEntry, outdatedFromCatalog, type StoreCatalog } from '../lib/storeCheck'
import { APP_VERSION } from '../lib/version'
import { compareVersions, fetchLatestVersion, performUpdate } from '../lib/updateCheck'
import { notifyOs } from '../lib/notify'
import changelogText from '../../CHANGELOG.md?raw'

export type UpdateTarget = { kind: 'webx' } | { kind: 'app'; id: string } | { kind: 'apps' }

interface Props {
  target: UpdateTarget
  installed: string[]
  versions: Record<string, string>
  onUpdateApp: (id: string) => void
  // ストアアプリの最新情報は store.json 由来のカタログから取る（OS 更新とは別系統）
  catalog: StoreCatalog | null
}

function changelogSection(version: string): string {
  const re = new RegExp(`## v${version.replace(/\./g, '\\.')}([^#]*?)(?=\\n## v|$)`)
  const m = changelogText.match(re)
  return m ? m[1].trim() : ''
}

export default function UpdateInfoWindow({ target, installed, versions, onUpdateApp, catalog }: Props) {
  const { t } = useLang()
  const [latest, setLatest] = useState<string | null>(null)
  const [fetchState, setFetchState] = useState<'loading' | 'done' | 'failed'>('loading')
  const [remoteNotes, setRemoteNotes] = useState('')
  const [doneApps, setDoneApps] = useState<string[]>([])
  const [webxDone, setWebxDone] = useState(false)

  // 表示対象が変わったら状態をリセットする（ウィンドウを開いたまま別の「更新する」を押した場合）
  useEffect(() => {
    setDoneApps([])
    setWebxDone(false)
  }, [target])

  const loadWebx = useCallback(async () => {
    setFetchState('loading')
    const v = await fetchLatestVersion()
    if (!v) { setFetchState('failed'); return }
    setLatest(v)
    setFetchState('done')
    try {
      const res = await fetch(`release-notes.json?ts=${Date.now()}`, { cache: 'no-store' })
      if (res.ok) {
        const data = (await res.json()) as { version?: string; notes?: string }
        if (data.version === v && data.notes) setRemoteNotes(data.notes)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (target.kind === 'webx') void loadWebx()
  }, [target, loadWebx])

  const outdated = useMemo(
    () => outdatedFromCatalog(catalog, installed, versions),
    [catalog, installed, versions]
  )

  const notesHtml = (md: string) => ({ __html: marked.parse(md) as string })

  if (target.kind === 'webx') {
    const hasUpdate = latest !== null && compareVersions(latest, APP_VERSION) > 0
    const notes = remoteNotes || (latest ? changelogSection(latest) : '') || changelogSection(APP_VERSION)
    return (
      <div className="update-info">
        <h2>🆙 {t('updTitle')} — WebX</h2>
        <p className="update-ver">
          {t('stCurrentVer')} v{APP_VERSION}
          {latest && <> → {t('updNewVer')} v{latest}</>}
        </p>
        <h3>{t('updWhatsNew')}</h3>
        {notes
          ? <div className="manual-body update-notes" dangerouslySetInnerHTML={notesHtml(notes)} />
          : <p className="hint">{t('updNoNotes')}</p>}
        {fetchState === 'loading' && <p className="hint">{t('loading')}</p>}
        {fetchState === 'failed' && (
          <>
            <p className="hint">{t('updCheckFailed')}</p>
            <button className="btn" onClick={() => void loadWebx()}>{t('retryBtn')}</button>
          </>
        )}
        {fetchState === 'done' && !hasUpdate && <p className="hint">{t('latestVersion')}</p>}
        {hasUpdate && !webxDone && (
          <button
            className="btn accent"
            onClick={() => {
              if (window.confirm(t('updateConfirmQ'))) { setWebxDone(true); void performUpdate() }
            }}
          >
            {t('updateNow')}
          </button>
        )}
      </div>
    )
  }

  if (target.kind === 'app') {
    const app = STORE_APPS.find((a) => a.id === target.id)
    if (!app) return <div className="update-info"><p className="hint">{t('updNoNotes')}</p></div>
    const entry = catalogEntry(catalog, app.id)
    const latestVer = entry?.version ?? app.version
    const notes = entry?.notes ?? app.notes
    const cur = versions[app.id]
    const done = doneApps.includes(app.id) || cur === latestVer
    return (
      <div className="update-info">
        <h2><span className={`app-icon ${app.cls}`}>{app.icon}</span> {app.name}</h2>
        <p className="update-ver">v{cur ?? '?'} → {t('updNewVer')} v{latestVer}</p>
        <h3>{t('updWhatsNew')}</h3>
        {notes ? <p className="update-note-text">{notes}</p> : <p className="hint">{t('updNoNotes')}</p>}
        {!done ? (
          <button
            className="btn accent"
            onClick={() => { onUpdateApp(app.id); setDoneApps((p) => [...p, app.id]); notifyOs(`${app.name} v${latestVer}: ${t('updDone')}`); void performUpdate() }}
          >
            {t('stUpdateBtn')}
          </button>
        ) : (
          <p className="update-done">✓ {t('updDone')}</p>
        )}
        <p className="hint">{t('storeStaleDesc')}</p>
      </div>
    )
  }

  // kind === 'apps'（一括）
  const remaining = outdated.filter((a) => !doneApps.includes(a.id))
  return (
    <div className="update-info">
      <h2>🆙 {t('updTitle')}</h2>
      {outdated.length === 0 && <p className="hint">{t('stAllLatest')}</p>}
      {outdated.map((a) => {
        const local = STORE_APPS.find((x) => x.id === a.id)
        return (
          <div key={a.id} className="update-row">
            <span className={`app-icon ${local?.cls ?? ''}`}>{local?.icon ?? ''}</span>
            <div className="update-row-main">
              <strong>{a.name}</strong>
              <span className="update-ver">v{versions[a.id] ?? '?'} → v{a.version}</span>
              {a.notes && <p className="update-note-text">{a.notes}</p>}
            </div>
            {doneApps.includes(a.id) && <span className="update-done">✓</span>}
          </div>
        )
      })}
      {remaining.length > 0 && (
        <button
          className="btn accent"
          onClick={() => { remaining.forEach((a) => onUpdateApp(a.id)); setDoneApps(outdated.map((a) => a.id)); void performUpdate() }}
        >
          {t('stBulkUpdate')}（{remaining.length}）
        </button>
      )}
      {outdated.length > 0 && remaining.length === 0 && <p className="update-done">✓ {t('updDone')}</p>}
    </div>
  )
}
