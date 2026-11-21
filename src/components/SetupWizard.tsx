import { useState } from 'react'
import { LANGUAGES, useLang, type Lang } from '../lib/i18n'
import { THEMES, WALLPAPERS, type ThemeId } from './Settings'
import { APP_VERSION } from '../lib/version'

export const TIMEZONES = [
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Seoul', 'Asia/Taipei', 'Asia/Bangkok', 'Asia/Singapore',
  'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Pacific/Auckland', 'Australia/Sydney', 'UTC',
]

interface Props {
  setLang: (l: Lang) => void
  theme: ThemeId
  setTheme: (t: ThemeId) => void
  wpPreset: string
  onSelectPreset: (id: string) => void
  userName: string
  setUserName: (s: string) => void
  timezone: string
  setTimezone: (s: string) => void
  iconSize: string
  setIconSize: (s: string) => void
  iconClick: string
  setIconClick: (s: string) => void
  onFinish: () => void
}

export default function SetupWizard(p: Props) {
  const { lang, t } = useLang()
  const [step, setStep] = useState(0)
  const steps = 5

  return (
    <div className="setup-overlay">
      <div className="setup-card">
        <div className="setup-head">
          <span className="setup-logo">W</span>
          <div>
            <strong>{t('setupTitle')}</strong>
            <span className="setup-ver">WebX v{APP_VERSION}</span>
          </div>
          <span className="setup-dots">{Array.from({ length: steps }, (_, i) => <i key={i} className={i === step ? 'on' : ''} />)}</span>
        </div>

        {step === 0 && (
          <div className="setup-body">
            <h2>{t('setupWelcome')}</h2>
            <p>{t('setupDesc')}</p>
            <p className="hint">{t('dataLocal')}</p>
          </div>
        )}

        {step === 1 && (
          <div className="setup-body">
            <h2>{t('userSection')}</h2>
            <label className="setup-label">{t('userName')}</label>
            <input className="setup-input" value={p.userName} placeholder={t('userNamePh')}
              onChange={(e) => p.setUserName(e.target.value)} />
            <label className="setup-label">{t('language')}</label>
            <div className="setup-chips">
              {LANGUAGES.map((l) => (
                <button key={l.id} className={lang === l.id ? 'chip on' : 'chip'} onClick={() => p.setLang(l.id)}>{l.label}</button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="setup-body">
            <h2>{t('timezone')} / {t('theme')}</h2>
            <label className="setup-label">{t('timezone')}</label>
            <select className="setup-input" value={p.timezone} onChange={(e) => p.setTimezone(e.target.value)}>
              <option value="">{t('tzAuto')}</option>
              {TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            <label className="setup-label">{t('theme')}</label>
            <div className="setup-chips">
              {THEMES.map((th) => (
                <button key={th.id} className={p.theme === th.id ? 'chip on' : 'chip'} onClick={() => p.setTheme(th.id)}>{th.label}</button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="setup-body">
            <h2>{t('wallpaper')} / {t('iconSize')}</h2>
            <label className="setup-label">{t('wallpaper')}</label>
            <div className="setup-chips">
              {WALLPAPERS.map((w) => (
                <button key={w.id} className={p.wpPreset === w.id ? 'chip on' : 'chip'} onClick={() => p.onSelectPreset(w.id)}>{t(w.key)}</button>
              ))}
            </div>
            <label className="setup-label">{t('iconSize')}</label>
            <div className="setup-chips">
              {(['s', 'm', 'l'] as const).map((s) => (
                <button key={s} className={p.iconSize === s ? 'chip on' : 'chip'} onClick={() => p.setIconSize(s)}>
                  {s === 's' ? t('sizeSmall') : s === 'm' ? t('sizeMedium') : t('sizeLarge')}
                </button>
              ))}
            </div>
            <label className="setup-label">{t('iconClickMode')}</label>
            <div className="setup-chips">
              <button className={p.iconClick === 'double' ? 'chip on' : 'chip'} onClick={() => p.setIconClick('double')}>{t('clickDouble')}</button>
              <button className={p.iconClick === 'single' ? 'chip on' : 'chip'} onClick={() => p.setIconClick('single')}>{t('clickSingle')}</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="setup-body">
            <h2>{t('setupDoneMsg')}</h2>
            <ul className="setup-summary">
              {p.userName && <li>{t('userName')}: {p.userName}</li>}
              <li>{t('language')}: {LANGUAGES.find((l) => l.id === lang)?.label}</li>
              <li>{t('timezone')}: {p.timezone || t('tzAuto')}</li>
              <li>{t('theme')}: {THEMES.find((th) => th.id === p.theme)?.label}</li>
            </ul>
          </div>
        )}

        <div className="setup-nav">
          {step > 0 && <button className="chip" onClick={() => setStep(step - 1)}>{t('setupBack')}</button>}
          <span className="setup-spacer" />
          {step === 0 && <button className="chip primary" onClick={() => setStep(1)}>{t('setupStartBtn')}</button>}
          {step > 0 && step < steps - 1 && <button className="chip primary" onClick={() => setStep(step + 1)}>{t('setupNext')}</button>}
          {step === steps - 1 && <button className="chip primary" onClick={p.onFinish}>{t('setupFinishBtn')}</button>}
        </div>
      </div>
    </div>
  )
}
