import { LANGUAGES, translate, type Lang } from '../lib/i18n'
import { clearAllStoredData, ownUsageBytes, requestPersist, storageInfo } from '../lib/store'
import { notifyOs } from '../lib/notify'
import { TIMEZONES } from './SetupWizard'
import { useEffect, useRef, useState } from 'react'
import { APP_VERSION } from '../lib/version'

export type ThemeId = 'light' | 'dark' | 'ipados' | 'macos' | 'win11' | 'win7' | 'winxp' | 'win95' | 'cyber' | 'sakura' | 'ocean' | 'sunset'

export const THEMES: { id: ThemeId; label: string; desc: string }[] = [
  { id: 'light', label: 'ライト', desc: '標準のガラス風テーマ' },
  { id: 'dark', label: 'ダーク', desc: '暗いガラス風テーマ' },
  { id: 'ipados', label: 'パッド 27', desc: '明るく透明感のあるグラス風デザイン' },
  { id: 'macos', label: 'デスクトップ 27', desc: '丸いウィンドウボタンと半透明メニュー' },
  { id: 'win11', label: 'フラット 11', desc: '淡いグレーと青のフラットデザイン' },
  { id: 'win7', label: 'グラス 7', desc: 'ガラス質感の青い光沢' },
  { id: 'winxp', label: 'グリーンヒル', desc: '青空と緑の丘のなつかしい配色' },
  { id: 'win95', label: 'クラシック 95', desc: 'クラシックグレーと立体ボタン' },
  { id: 'cyber', label: 'サイバーパンク', desc: 'ネオンが光る近未来ダーク' },
  { id: 'sakura', label: '桜', desc: '淡いピンクのやさしい配色' },
  { id: 'ocean', label: '深海', desc: '深い青とティールのダーク' },
  { id: 'sunset', label: '夕焼け', desc: 'オレンジと紫の温かい配色' },
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
  onOpenStore: () => void
  uiScale: string
  onUiScale: (value: string) => void
  userName: string
  setUserName: (v: string) => void
  timezone: string
  setTimezone: (v: string) => void
  iconSize: string
  setIconSize: (v: string) => void
  iconClick: string
  setIconClick: (v: string) => void
  onShowSetup: () => void
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

export default function Settings({ lang, setLang, theme, setTheme, wpPreset, onSelectPreset, hasCustom, wpUseCustom, onCustom, onUseCustom, onRemoveCustom, openDocs, openAbout, onOpenStore, uiScale, onUiScale, userName, setUserName, timezone, setTimezone, iconSize, setIconSize, iconClick, setIconClick, onShowSetup }: Props) {
  const [info, setInfo] = useState<{ usage: number; quota: number; persisted: boolean; backend: string } | null>(null)
  const [ownBytes, setOwnBytes] = useState(0)
  const wpFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void storageInfo().then(setInfo)
    void ownUsageBytes().then(setOwnBytes)
  }, [])

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`

  const SETTINGS_KEYS = ['ykr-theme', 'ykr-lang', 'webx-wp-preset', 'webx-wp-custom', 'webx-wp-use', 'webx-ui-scale', 'webx-user-name', 'webx-timezone', 'webx-icon-size', 'webx-icon-click', 'webx-installed-apps', 'webx-app-versions', 'webx-setup-done']
  const resetSettingsOnly = () => {
    if (!window.confirm(translate(lang, 'resetSettingsDesc'))) return
    for (const k of SETTINGS_KEYS) localStorage.removeItem(k)
    location.reload()
  }
  const resetStorageOnly = async () => {
    if (!window.confirm(translate(lang, 'resetStorageDesc'))) return
    await clearAllStoredData()
    notifyOs(translate(lang, 'resetDoneMsg'), 'settings')
    window.setTimeout(() => location.reload(), 700)
  }
  const resetEverything = async () => {
    if (!window.confirm(translate(lang, 'resetAllDesc'))) return
    await clearAllStoredData()
    localStorage.clear()
    location.reload()
  }

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
        <h3>{translate(lang, 'userSection')}</h3>
        <label className="setup-label">{translate(lang, 'userName')}</label>
        <input className="setup-input" value={userName} placeholder={translate(lang, 'userNamePh')}
          onChange={(e) => setUserName(e.target.value)} />
        <label className="setup-label">{translate(lang, 'timezone')}</label>
        <select className="setup-input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          <option value="">{translate(lang, 'tzAuto')}</option>
          {TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <label className="setup-label">{translate(lang, 'iconSize')}</label>
        <div className="settings-options">
          {(['s', 'm', 'l'] as const).map((s) => (
            <button key={s} className={iconSize === s ? 'opt on' : 'opt'} onClick={() => setIconSize(s)}>
              {s === 's' ? translate(lang, 'sizeSmall') : s === 'm' ? translate(lang, 'sizeMedium') : translate(lang, 'sizeLarge')}
            </button>
          ))}
        </div>
        <label className="setup-label">{translate(lang, 'iconClickMode')}</label>
        <div className="settings-options">
          <button className={iconClick === 'double' ? 'opt on' : 'opt'} onClick={() => setIconClick('double')}>{translate(lang, 'clickDouble')}</button>
          <button className={iconClick === 'single' ? 'opt on' : 'opt'} onClick={() => setIconClick('single')}>{translate(lang, 'clickSingle')}</button>
        </div>
        <div className="settings-options" style={{ marginTop: 10 }}>
          <button className="opt" onClick={onShowSetup}>{translate(lang, 'setupAgain')}</button>
        </div>
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
        <h3>{translate(lang, 'uiScale')}</h3>
        <div className="settings-options">
          {['auto', '70', '80', '90', '100', '110', '125'].map((v) => (
            <button key={v} className={uiScale === v ? 'opt on' : 'opt'} onClick={() => onUiScale(v)}>
              {v === 'auto' ? translate(lang, 'uiAuto') : `${v}%`}
            </button>
          ))}
        </div>
        <p className="settings-note">{translate(lang, 'uiScaleNote')}</p>
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
        <h3>{translate(lang, 'updateSection')}</h3>
        <p className="settings-note">WebX / {translate(lang, 'versionLabel')} {APP_VERSION}</p>
        <p className="settings-note">更新の確認と適用は「ストア」アプリで行います。</p>
        <div className="settings-options" style={{ marginTop: 10 }}>
          <button className="opt" onClick={onOpenStore}>ストアを開く</button>
        </div>
      </section>

      <section className="settings-section">
        <h3>{translate(lang, 'resetSection')}</h3>
        <div className="settings-options">
          <button className="opt danger" onClick={resetSettingsOnly}>{translate(lang, 'resetSettingsBtn')}</button>
          <button className="opt danger" onClick={() => void resetStorageOnly()}>{translate(lang, 'resetStorageBtn')}</button>
          <button className="opt danger" onClick={() => void resetEverything()}>{translate(lang, 'resetAllBtn')}</button>
        </div>
        <p className="settings-note">{translate(lang, 'resetSettingsDesc')}</p>
        <p className="settings-note">{translate(lang, 'resetStorageDesc')}</p>
        <p className="settings-note">{translate(lang, 'resetAllDesc')}</p>
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
