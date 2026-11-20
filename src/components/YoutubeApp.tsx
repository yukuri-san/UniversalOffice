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

export default function YoutubeApp() {
  const { t } = useLang()
  const [input, setInput] = useState('')
  const [videoId, setVideoId] = useState<string | null>(null)
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
    if (!id) {
      setError(t('ytInvalid'))
      return
    }
    setError('')
    setVideoId(id)
    setHistory((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 10)
      localStorage.setItem('webx-youtube-history', JSON.stringify(next))
      return next
    })
  }

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
      {videoId ? (
        <div className="yt-player">
          <iframe
            key={videoId}
            src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
            title="YouTube"
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
                <button key={id} onClick={() => setVideoId(id)}>
                  <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt={id} loading="lazy" />
                  <span>{id}</span>
                </button>
              ))}
            </div>
          </div>
        )
      )}
      {videoId && history.length > 1 && (
        <div className="yt-history">
          <h4>{t('ytHistory')}</h4>
          <div className="yt-grid">
            {history.filter((id) => id !== videoId).map((id) => (
              <button key={id} onClick={() => setVideoId(id)}>
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
