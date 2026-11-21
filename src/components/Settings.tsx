import { LANGUAGES, translate, type Lang } from '../lib/i18n'
import { ownUsageBytes, requestPersist, storageInfo } from '../lib/store'
import { useEffect, useRef, useState } from 'react'
import { APP_VERSION } from '../lib/version'

export type ThemeId = 'light' | 'dark' | 'ipados' | 'macos' | 'win11' | 'win7' | 'winxp' | 'win95'

export const THEMES: { id: ThemeId; label: string; desc: string }[] = [
  { id: 'light', label: 'ライト', desc: '標準のガラス風テーマ' },
  { id: 'dark', label: 'ダーク', desc: '暗いガラス風テーマ' },
  { id: 'ipados', label: 'パッド 27', desc: '明るく透明感のあるグラス風デザイン' },
  { id: 'macos', label: 'デスクトップ 27', desc: '丸いウィンドウボタンと半透明メニュー' },
  { id: 'win11', label: 'フラット 11', desc: '淡いグレーと青のフラットデザイン' },
  { id: 'win7', label: 'グラス 7', desc: 'ガラス質感の青い光沢' },
  { id: 'winxp', label: 'グリーンヒル', desc: '青空と緑の丘のなつかしい配色' },
  { id: 'win95', label: 'クラシック 95', desc: 'クラシックグレーと立体ボタン' },
]

interface Props {
  lang: Lang
  setLang: (l: Lang) => void
  theme: ThemeId
  setTheme: (t: ThemeId) => void
  wpPreset: string
  onSelectPreset: (id: string) => void
  hasCustom: boolean
  wpUseCustom: boolean
  onCustom: (dataUrl: string) => void
  onUseCustom: () => void
  onRemoveCustom: () => void
  openDocs: (doc: 'license' | 'readme' | 'changelog') => void
  openAbout: () => void
}

export const WALLPAPERS: { id: string; key: string }[] = [
  { id: 'aurora', key: 'wpAurora' },
  { id: 'sunset', key: 'wpSunset' },
  { id: 'ocean', key: 'wpOcean' },
  { id: 'forest', key: 'wpForest' },
  { id: 'sakura', key: 'wpSakura' },
  { id: 'mono', key: 'wpMono' },
]

async function fileToWallpaper(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    const max = 1920
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function Settings({ lang, setLang, theme, setTheme, wpPreset, onSelectPreset, hasCustom, wpUseCustom, onCustom, onUseCustom, onRemoveCustom, openDocs, openAbout }: Props) {
  const [info, setInfo] = useState<{ usage: number; quota: number; persisted: boolean; backend: string } | null>(null)
  const [ownBytes, setOwnBytes] = useState(0)
  const wpFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void storageInfo().then(setInfo)
    void ownUsageBytes().then(setOwnBytes)
  }, [])

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`

  return (
    <div className="settings-app">
      <h2>{translate(lang, 'settingsTitle')}</h2>

      <section className="settings-section">
        <h3>{translate(lang, 'language')} / Language</h3>
        <div className="settings-options">
          {LANGUAGES.map((l) => (
            <button key={l.id} className={lang === l.id ? 'opt on' : 'opt'} onClick={() => setLang(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
        <p className="settings-note">{translate(lang, 'langNote')}</p>
      </section>

      <section className="settings-section">
        <h3>{translate(lang, 'theme')}</h3>
        <div className="settings-themes">
          {THEMES.map((t) => (
            <button key={t.id} className={theme === t.id ? 'theme-card on' : 'theme-card'} onClick={() => setTheme(t.id)}>
              <span className={`theme-swatch ${t.id}`} />
              <strong>{t.label}</strong>
              <small>{t.desc}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>{translate(lang, 'wallpaper')}</h3>
        <div className="settings-themes">
          {WALLPAPERS.map((w) => (
            <button
              key={w.id}
              className={!wpUseCustom && wpPreset === w.id ? 'theme-card on' : 'theme-card'}
              onClick={() => onSelectPreset(w.id)}
            >
              <span className={`theme-swatch wp-${w.id}`} />
              <strong>{translate(lang, w.key)}</strong>
            </button>
          ))}
          {hasCustom && (
            <button className={wpUseCustom ? 'theme-card on' : 'theme-card'} onClick={onUseCustom}>
              <span className="theme-swatch wp-custom" />
              <strong>Custom</strong>
            </button>
          )}
        </div>
        <div className="settings-options" style={{ marginTop: 10 }}>
          <button className="opt" onClick={() => wpFileRef.current?.click()}>{translate(lang, 'chooseImage')}</button>
          {hasCustom && <button className="opt" onClick={onRemoveCustom}>{translate(lang, 'removeCustom')}</button>}
        </div>
        <input
          ref={wpFileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void fileToWallpaper(f).then((d) => { if (d) onCustom(d) })
            e.target.value = ''
          }}
        />
      </section>

      <section className="settings-section">
        <h3>{translate(lang, 'storageSection')}</h3>
        {info ? (
          <p className="settings-note">
            {translate(lang, 'backend')}：{info.backend} / {translate(lang, 'webxUsage')}：{mb(ownBytes)} / {info.quota ? mb(info.quota) : translate(lang, 'quotaUnknown')} /
            {translate(lang, 'persisted')}：{info.persisted ? translate(lang, 'enabled') : translate(lang, 'notSet')}
          </p>
        ) : (
          <p className="settings-note">{translate(lang, 'loading')}</p>
        )}
        <button
          className="opt"
          onClick={() => {
            void requestPersist().then(() => storageInfo().then(setInfo))
          }}
        >
          {translate(lang, 'persistRequest')}
        </button>
        <p className="settings-note">{translate(lang, 'settingsStorageNote')}</p>
      </section>

      <section className="settings-section">
        <h3>{translate(lang, 'about')}</h3>
        <p className="settings-note">WebX / {translate(lang, 'versionLabel')} {APP_VERSION}</p>
        <div className="settings-options" style={{ marginTop: 10 }}>
          <button className="opt" onClick={() => openAbout()}>{translate(lang, 'aboutWebX')}</button>
          <button className="opt" onClick={() => openDocs('license')}>{translate(lang, 'viewLicense')}</button>
          <button className="opt" onClick={() => openDocs('readme')}>{translate(lang, 'viewReadme')}</button>
          <button className="opt" onClick={() => openDocs('changelog')}>{translate(lang, 'viewChangelog')}</button>
        </div>
      </section>
    </div>
  )
}
