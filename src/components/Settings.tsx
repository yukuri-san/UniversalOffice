import { LANGUAGES, translate, type Lang } from '../lib/i18n'
import { ownUsageBytes, requestPersist, storageInfo } from '../lib/store'
import { useEffect, useState } from 'react'

export type ThemeId = 'light' | 'dark' | 'ipados' | 'macos' | 'win11' | 'win7' | 'winxp' | 'win95'

export const THEMES: { id: ThemeId; label: string; desc: string }[] = [
  { id: 'light', label: 'ライト', desc: '標準のガラス風テーマ' },
  { id: 'dark', label: 'ダーク', desc: '暗いガラス風テーマ' },
  { id: 'ipados', label: 'iPadOS 27', desc: '明るく透明感のある Liquid Glass' },
  { id: 'macos', label: 'macOS 27', desc: '信号機ボタンと半透明メニュー' },
  { id: 'win11', label: 'Windows 11', desc: 'Fluent 風の淡いグレーと青' },
  { id: 'win7', label: 'Windows 7', desc: 'Aero グラスの青い光沢' },
  { id: 'winxp', label: 'Windows XP', desc: 'Luna の青と緑のスタート' },
  { id: 'win95', label: 'Windows 95', desc: 'クラシックグレーと立体ボタン' },
]

interface Props {
  lang: Lang
  setLang: (l: Lang) => void
  theme: ThemeId
  setTheme: (t: ThemeId) => void
}

export default function Settings({ lang, setLang, theme, setTheme }: Props) {
  const [info, setInfo] = useState<{ usage: number; quota: number; persisted: boolean; backend: string } | null>(null)
  const [ownBytes, setOwnBytes] = useState(0)

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
    </div>
  )
}
