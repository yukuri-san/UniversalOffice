import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { useLang } from '../lib/i18n'
import { STORE_APPS } from '../lib/storeApps'
import { APP_VERSION } from '../lib/version'
import { compareVersions, fetchLatestVersion, performUpdate } from '../lib/updateCheck'
import { notifyOs } from '../lib/notify'
import changelogText from '../../CHANGELOG.md?raw'

interface Props {
  installed: string[]
  versions: Record<string, string>
  onUpdateApp: (id: string) => void
}

type Target = { kind: 'webx' } | { kind: 'app'; id: string } | { kind: 'apps' }

function readTarget(): Target {
  try {
    const raw = localStorage.getItem('webx-update-target')
    if (raw) {
      const p = JSON.parse(raw) as { kind?: string; id?: string }
      if (p.kind === 'app' && p.id) return { kind: 'app', id: p.id }
      if (p.kind === 'apps') return { kind: 'apps' }
    }
  } catch { /* ignore */ }
  return { kind: 'webx' }
}

function changelogSection(version: string): string {
  const re = new RegExp(`## v${version.replace(/\./g, '\\.')}([^#]*?)(?=\\n## v|$)`)
  const m = changelogText.match(re)
  return m ? m[1].trim() : ''
}

export default function UpdateInfoWindow({ installed, versions, onUpdateApp }: Props) {
  const { t } = useLang()
  const [target] = useState<Target>(readTarget)
  const [latest, setLatest] = useState<string | null>(null)
  const [remoteNotes, setRemoteNotes] = useState('')
  const [doneApps, setDoneApps] = useState<string[]>([])
  const [webxDone, setWebxDone] = useState(false)

  useEffect(() => {
    if (target.kind !== 'webx') return
    void (async () => {
      const v = await fetchLatestVersion()
      setLatest(v)
      if (v) {
        try {
          const res = await fetch(`release-notes.json?ts=${Date.now()}`, { cache: 'no-store' })
          if (res.ok) {
            const data = (await res.json()) as { version?: string; notes?: string }
            if (data.version === v && data.notes) setRemoteNotes(data.notes)
          }
        } catch { /* ignore */ }
      }
    })()
  }, [target.kind])

  const outdated = useMemo(
    () => STORE_APPS.filter((a) => installed.includes(a.id) && versions[a.id] !== a.version),
    [installed, versions]
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
        {latest !== null && !hasUpdate && <p className="hint">{t('latestVersion')}</p>}
        {latest === null && <p className="hint">{t('loading')}</p>}
      </div>
    )
  }

  if (target.kind === 'app') {
    const app = STORE_APPS.find((a) => a.id === target.id)
    if (!app) return <div className="update-info"><p className="hint">{t('updNoNotes')}</p></div>
    const cur = versions[app.id]
    const done = doneApps.includes(app.id) || cur === app.version
    return (
      <div className="update-info">
        <h2><span className={`app-icon ${app.cls}`}>{app.icon}</span> {app.name}</h2>
        <p className="update-ver">v{cur ?? '?'} → {t('updNewVer')} v{app.version}</p>
        <h3>{t('updWhatsNew')}</h3>
        {app.notes ? <p className="update-note-text">{app.notes}</p> : <p className="hint">{t('updNoNotes')}</p>}
        {!done ? (
          <button
            className="btn accent"
            onClick={() => { onUpdateApp(app.id); setDoneApps((p) => [...p, app.id]); notifyOs(`${app.name} v${app.version}: ${t('updDone')}`) }}
          >
            {t('stUpdateBtn')}
          </button>
        ) : (
          <p className="update-done">✓ {t('updDone')}</p>
        )}
      </div>
    )
  }

  // kind === 'apps'（一括）
  const remaining = outdated.filter((a) => !doneApps.includes(a.id))
  return (
    <div className="update-info">
      <h2>🆙 {t('updTitle')}</h2>
      {outdated.length === 0 && <p className="hint">{t('stAllLatest')}</p>}
      {outdated.map((a) => (
        <div key={a.id} className="update-row">
          <span className={`app-icon ${a.cls}`}>{a.icon}</span>
          <div className="update-row-main">
            <strong>{a.name}</strong>
            <span className="update-ver">v{versions[a.id] ?? '?'} → v{a.version}</span>
            {a.notes && <p className="update-note-text">{a.notes}</p>}
          </div>
          {doneApps.includes(a.id) && <span className="update-done">✓</span>}
        </div>
      ))}
      {remaining.length > 0 && (
        <button
          className="btn accent"
          onClick={() => { remaining.forEach((a) => onUpdateApp(a.id)); setDoneApps(outdated.map((a) => a.id)) }}
        >
          {t('stBulkUpdate')}（{remaining.length}）
        </button>
      )}
      {outdated.length > 0 && remaining.length === 0 && <p className="update-done">✓ {t('updDone')}</p>}
    </div>
  )
}
