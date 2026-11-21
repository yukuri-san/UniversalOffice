import { useEffect, useState } from 'react'
import { LANGUAGES, useLang, type Lang } from '../lib/i18n'
import { THEMES, WALLPAPERS, type ThemeId } from './Settings'
import { APP_VERSION } from '../lib/version'

// セットアップの版。上げると全ユーザーに再実施させる（データは引き継がれ、
// 既存ユーザーは mode='permissions' で許可の確認だけを行う）。
export const SETUP_VERSION = '2'

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
  // 'permissions' のときは許可の確認ステップだけを表示する（既存ユーザーの再実施用）
  mode?: 'full' | 'permissions'
}

function PermissionsStep() {
  const { t } = useLang()
  const [notif, setNotif] = useState<string>(() => ('Notification' in window ? Notification.permission : 'na'))
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [hw, setHw] = useState(() => localStorage.getItem('webx-permit-hwinfo') !== 'off')
  useEffect(() => {
    if (navigator.storage?.persisted) {
      void navigator.storage.persisted().then(setPersisted).catch(() => setPersisted(null))
    }
  }, [])
  const notifLabel = notif === 'granted' ? t('permGranted') : notif === 'denied' ? t('permDenied') : notif === 'na' ? t('permNa') : t('permDefault')
  return (
    <div className="setup-body">
      <h2>{t('setupPermTitle')}</h2>
      <p>{t('setupPermDesc')}</p>
      <div className="setup-perm-row">
        <span>🔔 {t('permNotif')}</span>
        <span className="setup-perm-state">{notifLabel}</span>
        {notif === 'default' && (
          <button className="chip primary" onClick={() => { void Notification.requestPermission().then((r) => setNotif(r)).catch(() => { /* ignore */ }) }}>{t('permAllowBtn')}</button>
        )}
      </div>
      <div className="setup-perm-row">
        <span>💾 {t('permStorage')}</span>
        <span className="setup-perm-state">{persisted === null ? t('permNa') : persisted ? t('permGranted') : t('permDefault')}</span>
        {persisted === false && (
          <button className="chip primary" onClick={() => { void navigator.storage.persist().then(() => navigator.storage.persisted()).then(setPersisted).catch(() => { /* ignore */ }) }}>{t('permAllowBtn')}</button>
        )}
      </div>
      <div className="setup-perm-row">
        <span>📊 {t('permHwInfo')}</span>
        <span className="settings-options">
          <button className={hw ? 'opt on' : 'opt'} onClick={() => { setHw(true); localStorage.setItem('webx-permit-hwinfo', 'on') }}>{t('onOffOn')}</button>
          <button className={!hw ? 'opt on' : 'opt'} onClick={() => { setHw(false); localStorage.setItem('webx-permit-hwinfo', 'off') }}>{t('onOffOff')}</button>
        </span>
      </div>
    </div>
  )
}

export default function SetupWizard(p: Props) {
  const { lang, t } = useLang()
  const [step, setStep] = useState(0)
  const permOnly = p.mode === 'permissions'
  const steps = permOnly ? 1 : 6

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

        {permOnly && (
          <>
            <p className="setup-permonly-note">{t('setupPermOnlyNote')}</p>
            <PermissionsStep />
          </>
        )}

        {!permOnly && step === 0 && (
          <div className="setup-body">
            <h2>{t('setupWelcome')}</h2>
            <p>{t('setupDesc')}</p>
            <p className="hint">{t('dataLocal')}</p>
          </div>
        )}

        {!permOnly && step === 1 && (
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

        {!permOnly && step === 2 && (
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

        {!permOnly && step === 3 && (
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

        {!permOnly && step === 4 && <PermissionsStep />}

        {!permOnly && step === 5 && (
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
          {!permOnly && step > 0 && <button className="chip" onClick={() => setStep(step - 1)}>{t('setupBack')}</button>}
          <span className="setup-spacer" />
          {!permOnly && step === 0 && <button className="chip primary" onClick={() => setStep(1)}>{t('setupStartBtn')}</button>}
          {!permOnly && step > 0 && step < steps - 1 && <button className="chip primary" onClick={() => setStep(step + 1)}>{t('setupNext')}</button>}
          {(permOnly || step === steps - 1) && <button className="chip primary" onClick={p.onFinish}>{t('setupFinishBtn')}</button>}
        </div>
      </div>
    </div>
  )
}
