import { useState } from 'react'
import { useLang } from '../lib/i18n'

const PRESETS: { name: string; url: string; external?: boolean }[] = [
  { name: 'Wikipedia', url: 'https://ja.wikipedia.org' },
  { name: 'Google', url: 'https://www.google.com', external: true },
  { name: 'Gmail', url: 'https://mail.google.com', external: true },
  { name: 'Google Maps', url: 'https://maps.google.com', external: true },
  { name: 'X', url: 'https://x.com', external: true },
]

export default function BrowserPanel() {
  const { t } = useLang()
  const [input, setInput] = useState('https://example.com')
  const [src, setSrc] = useState('https://example.com')

  const open = () => {
    let url = input.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    setInput(url)
    setSrc(url)
  }

  return (
    <div className="browser-panel">
      <div className="browser-bar">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') open() }}
          placeholder="URLを入力（例：example.com）"
          aria-label="URL"
        />
        <button onClick={open}>開く</button>
        <a href={src} target="_blank" rel="noreferrer">{t('openExternal')}</a>
      </div>
      <iframe title="内蔵ブラウザ" src={src} className="browser-frame" />
      <p className="browser-note">サイトによっては埋め込み表示が禁止されていて真っ白になることがあります。その場合は「外部で開く」を使ってください。</p>
    </div>
  )
}
