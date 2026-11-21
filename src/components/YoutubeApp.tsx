import { useState } from 'react'
import { useLang } from '../lib/i18n'

function extractId(input: string): string | null {
  const trimmed = input.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /shorts\/([A-Za-z0-9_-]{11})/,
    /embed\/([A-Za-z0-9_-]{11})/,
    /live\/([A-Za-z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = trimmed.match(p)
    if (m) return m[1]
  }
  return null
}

function extractList(input: string): string | null {
  const m = input.trim().match(/[?&]list=([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

type PlayTarget = { type: 'video'; id: string; list?: string } | { type: 'playlist'; list: string }

export default function YoutubeApp() {
  const { t } = useLang()
  const [input, setInput] = useState('')
  const [target, setTarget] = useState<PlayTarget | null>(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('webx-youtube-history') ?? '[]') as string[]
    } catch {
      return []
    }
  })

  const play = (raw: string) => {
    const id = extractId(raw)
    const list = extractList(raw)
    if (!id && !list) {
      setError(t('ytInvalid'))
      return
    }
    setError('')
    if (id) {
      setTarget({ type: 'video', id, list: list ?? undefined })
      setHistory((prev) => {
        const next = [id, ...prev.filter((x) => x !== id)].slice(0, 10)
        localStorage.setItem('webx-youtube-history', JSON.stringify(next))
        return next
      })
    } else if (list) {
      setTarget({ type: 'playlist', list })
      setError(t('ytPlaylistOk'))
    }
  }

  const embedSrc = target
    ? target.type === 'video'
      ? `https://www.youtube-nocookie.com/embed/${target.id}?rel=0${target.list ? `&list=${target.list}` : ''}`
      : `https://www.youtube-nocookie.com/embed/videoseries?list=${target.list}&rel=0`
    : ''

  return (
    <div className="youtube-app">
      <form
        className="browser-bar"
        onSubmit={(e) => {
          e.preventDefault()
          play(input)
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('ytPh')} />
        <button type="submit">{t('ytPlay')}</button>
      </form>
      <p className="browser-note">{t('ytNote')}</p>
      {error && <p className="yt-error">{error}</p>}
      {target ? (
        <div className="yt-player">
          <iframe
            key={embedSrc}
            src={embedSrc}
            title="YouTube"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : (
        history.length > 0 && (
          <div className="yt-history">
            <h4>{t('ytHistory')}</h4>
            <div className="yt-grid">
              {history.map((id) => (
                <button key={id} onClick={() => setTarget({ type: 'video', id })}>
                  <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt={id} loading="lazy" />
                  <span>{id}</span>
                </button>
              ))}
            </div>
          </div>
        )
      )}
      {target && history.length > 1 && (
        <div className="yt-history">
          <h4>{t('ytHistory')}</h4>
          <div className="yt-grid">
            {history.filter((id) => !(target?.type === 'video' && id === target.id)).map((id) => (
              <button key={id} onClick={() => setTarget({ type: 'video', id })}>
                <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt={id} loading="lazy" />
                <span>{id}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
