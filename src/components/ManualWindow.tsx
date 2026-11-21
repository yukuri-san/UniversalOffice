import { marked } from 'marked'
import { useLang } from '../lib/i18n'
import manualText from '../../MANUAL.md?raw'
import { useMemo, useState } from 'react'

interface Page { id: string; group: string; title: string; body: string }

/** MANUAL.md を ## （分野）と ### （ページ）に分解する */
function parseManual(md: string): Page[] {
  const lines = md.split('\n')
  const pages: Page[] = []
  let group = 'はじめに'
  let title = 'はじめに'
  let buf: string[] = []
  const flush = () => {
    const body = buf.join('\n').trim()
    if (body || pages.length === 0) pages.push({ id: `${group}-${title}-${pages.length}`, group, title, body })
    buf = []
  }
  for (const line of lines) {
    if (line.startsWith('# ')) continue // 冊子タイトルは捨てる
    const h2 = line.match(/^## (.+)/)
    const h3 = line.match(/^### (.+)/)
    if (h2) {
      flush()
      group = h2[1].trim()
      title = group
    } else if (h3) {
      flush()
      title = h3[1].trim()
    } else {
      buf.push(line)
    }
  }
  flush()
  return pages
}

export default function ManualWindow() {
  const { t } = useLang()
  const pages = useMemo(() => parseManual(manualText as string), [])
  const [sel, setSel] = useState(0)
  const [query, setQuery] = useState('')
  const page = pages[Math.min(sel, pages.length - 1)]
  const html = useMemo(() => (page ? (marked.parse(page.body) as string) : ''), [page])
  const visible = pages.map((p, i) => ({ p, i })).filter(({ p }) => !query || p.title.includes(query) || p.group.includes(query))
  const groups: string[] = []
  for (const { p } of visible) if (!groups.includes(p.group)) groups.push(p.group)

  return (
    <div className="manual-app">
      <aside className="manual-side">
        <input
          className="manual-search"
          type="search"
          placeholder={t('manualSearchPh')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <nav className="manual-nav">
          {groups.map((g) => (
            <div key={g} className="manual-group">
              <div className="manual-group-title">{g}</div>
              {visible.filter(({ p }) => p.group === g).map(({ p, i }) => (
                <button key={p.id} className={i === sel ? 'manual-link on' : 'manual-link'} onClick={() => setSel(i)}>
                  {p.title}
                </button>
              ))}
            </div>
          ))}
          {visible.length === 0 && <p className="manual-noresult">見つかりませんでした</p>}
        </nav>
      </aside>
      <article className="manual-article">
        <div className="manual-crumb">{page.group} › {page.title}</div>
        <h1 className="manual-title">{page.title}</h1>
        <div className="manual-body" dangerouslySetInnerHTML={{ __html: html }} />
        <div className="manual-pager">
          <button className="btn" disabled={sel <= 0} onClick={() => setSel(sel - 1)}>← {t('prevPage')}</button>
          <span className="manual-count">{sel + 1} / {pages.length}</span>
          <button className="btn" disabled={sel >= pages.length - 1} onClick={() => setSel(sel + 1)}>{t('nextPage')} →</button>
        </div>
      </article>
    </div>
  )
}
