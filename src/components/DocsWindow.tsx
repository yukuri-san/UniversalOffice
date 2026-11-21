import { marked } from 'marked'
import licenseText from '../../LICENSE?raw'
import readmeText from '../../README.md?raw'
import changelogText from '../../CHANGELOG.md?raw'
import architectureText from '../../ARCHITECTURE.md?raw'
import developerText from '../../DEVELOPER.md?raw'
import { useMemo, useState } from 'react'
import { useLang } from '../lib/i18n'

export type DocKind = 'license' | 'readme' | 'changelog' | 'architecture' | 'developer'

export default function DocsWindow() {
  const { t } = useLang()
  const [doc, setDoc] = useState<DocKind>(() => {
    const initial = localStorage.getItem('webx-docs-initial') as DocKind | null
    return initial === 'readme' || initial === 'changelog' ? initial : 'license'
  })

  const html = useMemo(() => {
    if (doc === 'license') return ''
    return marked.parse(doc === 'readme' ? (readmeText as string) : doc === 'architecture' ? (architectureText as string) : doc === 'developer' ? (developerText as string) : (changelogText as string)) as string
  }, [doc])

  return (
    <div className="docs-window">
      <div className="docs-tabs">
        <button className={doc === 'license' ? 'on' : ''} onClick={() => setDoc('license')}>LICENSE</button>
        <button className={doc === 'readme' ? 'on' : ''} onClick={() => setDoc('readme')}>README</button>
        <button className={doc === 'changelog' ? 'on' : ''} onClick={() => setDoc('changelog')}>{t('viewChangelog')}</button>
        <button className={doc === 'architecture' ? 'on' : ''} onClick={() => setDoc('architecture')}>ARCHITECTURE</button>
        <button className={doc === 'developer' ? 'on' : ''} onClick={() => setDoc('developer')}>DEVELOPER</button>
      </div>
      {doc === 'license' ? (
        <pre className="docs-license">{licenseText as string}</pre>
      ) : (
        <div className="docs-body" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  )
}
