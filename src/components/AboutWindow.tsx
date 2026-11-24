import { useEffect, useState } from 'react'
import { ownUsageBytes, storageInfo } from '../lib/store'
import { APP_BUILD, APP_VERSION } from '../lib/version'
import { editionLabel } from '../lib/edition'
import { useLang } from '../lib/i18n'
import type { DocKind } from './DocsWindow'

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

export default function AboutWindow({ openDocs }: { openDocs: (doc: DocKind) => void }) {
  const { t } = useLang()
  const [info, setInfo] = useState<{ backend: string; own: number } | null>(null)

  useEffect(() => {
    void (async () => {
      const [s, own] = await Promise.all([storageInfo(), ownUsageBytes()])
      setInfo({ backend: s.backend, own })
    })()
  }, [])

  return (
    <div className="about-window">
      <div className="about-logo">W</div>
      <h1>WebX</h1>
      <p className="about-tagline">UniversalOffice Web OS</p>
      <dl className="about-specs">
        <div><dt>{t('versionLabel')}</dt><dd>v{APP_VERSION} (build {APP_BUILD})</dd></div>
        <div><dt>{t('edition')}</dt><dd>{editionLabel()}</dd></div>
        <div><dt>{t('backend')}</dt><dd>{info ? info.backend : '…'}</dd></div>
        <div><dt>{t('webxUsage')}</dt><dd>{info ? formatBytes(info.own) : '…'}</dd></div>
      </dl>
      <p className="about-copy">© 2026 yukuri-san — Apache License 2.0</p>
      <div className="about-actions">
        <button onClick={() => openDocs('license')}>{t('viewLicense')}</button>
        <button onClick={() => openDocs('readme')}>{t('viewReadme')}</button>
        <button onClick={() => openDocs('changelog')}>{t('viewChangelog')}</button>
      </div>
    </div>
  )
}
