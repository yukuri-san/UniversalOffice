import { useState } from 'react'
import { STORE_APPS, STORE_CATEGORIES, type StoreCategory } from '../lib/storeApps'
import { bundledGaps, catalogEntry, outdatedFromCatalog, type StoreCatalog } from '../lib/storeCheck'
import { performUpdate } from '../lib/updateCheck'
import { notifyOs } from '../lib/notify'
import { APP_VERSION } from '../lib/version'
import { compareVersions, fetchLatestVersion } from '../lib/updateCheck'
import { useLang } from '../lib/i18n'
import { PRO_DEFAULT_APPS, type EditionId } from '../lib/edition'

interface Props {
  installed: string[]
  versions: Record<string, string>
  coreApps: { id: string; name: string; icon: string; cls: string }[]
  onInstall: (id: string) => void
  onUninstall: (id: string) => void
  onUpdateApp: (id: string) => void
  onShowUpdate: (target: { kind: 'webx' } | { kind: 'app'; id: string } | { kind: 'apps' }) => void
  // ストア情報は OS の更新とは別系統（store.json）で扱う
  catalog: StoreCatalog | null
  onRefreshCatalog: () => Promise<StoreCatalog | null>
  edition: EditionId
  proExtra: string[]
  onInstallCore: (id: string) => void
  onUninstallCore: (id: string) => void
}

type CheckState = 'idle' | 'checking' | 'done' | 'error'

// アプリの入手・削除・更新はすべてこのストアで処理する。
// WebX 本体の更新確認（version.json）とストア情報の確認（store.json）は別系統で行う。
export default function AppStore({ installed, versions, coreApps, onInstall, onUninstall, onUpdateApp, onShowUpdate, catalog, onRefreshCatalog, edition, proExtra, onInstallCore, onUninstallCore }: Props) {
  const { t } = useLang()
  const [check, setCheck] = useState<CheckState>('idle')
  const [storeCheck, setStoreCheck] = useState<CheckState>('idle')
  const [category, setCategory] = useState<StoreCategory | 'all' | 'updates'>('all')
  const [query, setQuery] = useState('')
  const [latest, setLatest] = useState('')
  const [summary, setSummary] = useState('')
  const [storeSummary, setStoreSummary] = useState('')

  const outdatedApps = outdatedFromCatalog(catalog, installed, versions)
  const gaps = bundledGaps(catalog)
  const webxOutdated = latest !== '' && compareVersions(latest, APP_VERSION) > 0

  // OS 本体の更新確認（version.json のみを見る）
  const runCheck = async () => {
    setCheck('checking')
    const v = await fetchLatestVersion()
    if (v === null) {
      setCheck('error')
      setSummary('更新を確認できませんでした（通信状態を確認してください）')
      return
    }
    setLatest(v)
    setCheck('done')
    setSummary(compareVersions(v, APP_VERSION) > 0 ? `WebX v${v}${t('stHasUpdateSuffix')}` : `WebX: ${t('latestVersion')}`)
  }

  // ストア情報の更新確認（store.json のみを見る）
  const runStoreCheck = async () => {
    setStoreCheck('checking')
    const c = await onRefreshCatalog()
    if (c === null) {
      setStoreCheck('error')
      setStoreSummary('ストア情報を取得できませんでした（通信状態を確認してください）')
      return
    }
    setStoreCheck('done')
    const outdated = outdatedFromCatalog(c, installed, versions)
    setStoreSummary(outdated.length > 0 ? `${outdated.length} × ${t('stUpdateBtn')}` : t('stAllLatest'))
  }

  return (
    <div className="store-app">
      <h3 className="store-head">{t('stWebxBody')}</h3>
      <div className="store-row">
        <span className="app-icon store">W</span>
        <div className="store-meta">
          <div className="store-name">
            WebX
            <span className="store-ver">{t('stCurrentVer')} v{APP_VERSION}</span>
            {webxOutdated && <span className="store-state">v{latest}{t('stHasUpdateSuffix')}</span>}
          </div>
          <div className="store-desc">{t('stBodyNote')}</div>
        </div>
        <div className="store-actions">
          <button className="btn" onClick={() => void runCheck()} disabled={check === 'checking'}>
            {check === 'checking' ? t('checkingUpdate') : t('checkUpdate')}
          </button>
          {webxOutdated && (
            <button className="btn accent" onClick={() => onShowUpdate({ kind: 'webx' })}>{t('updateNow')}</button>
          )}
        </div>
      </div>
      {summary && <p className="store-note">{summary}</p>}

      {edition === 'lite' ? (
        <>
          <h3 className="store-head">{t('stStoreApps')}</h3>
          <div className="store-stale">
            <strong>🔒 {t('liteStoreOff')}</strong>
            <p>{t('liteStoreOffDesc')}</p>
          </div>
        </>
      ) : (
      <>
      <h3 className="store-head">{t('stStoreApps')}</h3>
      <p className="store-note">{t('stNoteText')}</p>
      <div style={{ marginBottom: 8 }}>
        <button className="btn" onClick={() => void runStoreCheck()} disabled={storeCheck === 'checking'}>
          {storeCheck === 'checking' ? t('checkingUpdate') : 'ストアの更新を確認'}
        </button>
      </div>
      {storeSummary && <p className="store-note">{storeSummary}</p>}
      {gaps.length > 0 && (
        <div className="store-stale">
          <strong>🆕 {t('storeStaleTitle')}</strong>
          <p>{t('storeStaleDesc')}</p>
          <button className="btn accent" onClick={() => void performUpdate()}>{t('storeStaleBtn')}</button>
        </div>
      )}
      <div className="store-search-row">
        <input
          className="store-search"
          type="search"
          placeholder="🔍 アプリ名で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && <button className="btn" onClick={() => setQuery('')}>クリア</button>}
      </div>
      <div className="store-cats">
        <button className={category === 'all' ? 'chip on' : 'chip'} onClick={() => setCategory('all')}>すべて（{STORE_APPS.length}）</button>
        {outdatedApps.length > 0 && (
          <button className={category === 'updates' ? 'chip on update' : 'chip update'} onClick={() => setCategory('updates')}>🔄 更新あり（{outdatedApps.length}）</button>
        )}
        {STORE_CATEGORIES.map((c) => (
          <button key={c.id} className={category === c.id ? 'chip on' : 'chip'} onClick={() => setCategory(c.id)}>
            {c.emoji} {t(c.key)}（{STORE_APPS.filter((a) => a.category === c.id).length}）
          </button>
        ))}
      </div>
      {category === 'updates' && outdatedApps.length > 0 && (
        <div className="store-bulk">
          <span>{outdatedApps.length} × {t('stUpdateBtn')}</span>
          <button className="btn accent" onClick={() => onShowUpdate({ kind: 'apps' })}>{t('stBulkUpdate')}</button>
        </div>
      )}
      {category === 'updates' && outdatedApps.length === 0 && (
        <p className="store-note">{t('stAllLatest')}</p>
      )}
      {query.trim() && (
        <p className="store-note">「{query.trim()}」の検索結果：{STORE_APPS.filter((a) => (a.name + ' ' + a.desc + ' ' + a.id).toLowerCase().includes(query.trim().toLowerCase())).length}件</p>
      )}
      <div className="store-list">
        {STORE_APPS.filter((a) => category === 'all' || (category === 'updates' ? outdatedApps.some((o) => o.id === a.id) : a.category === category)).filter((a) => !query.trim() || (a.name + ' ' + a.desc + ' ' + a.id).toLowerCase().includes(query.trim().toLowerCase())).map((app) => {
          const isIn = installed.includes(app.id)
          const cur = versions[app.id]
          const latestVer = catalogEntry(catalog, app.id)?.version ?? app.version
          const outdated = isIn && cur !== latestVer
          return (
            <div className="store-row" key={app.id}>
              <span className={`app-icon ${app.cls}`}>{app.icon}</span>
              <div className="store-meta">
                <div className="store-name">
                  {app.name}
                  <span className="store-ver">v{latestVer}</span>
                  {app.proOnly && <span className="store-state pro">👑 Pro限定</span>}
                  {isIn && <span className="store-state">{outdated ? `${t('stInstalled')} v${cur ?? '?'} (${t('stUpdateBtn')})` : t('stInstalled')}</span>}
                </div>
                <div className="store-desc">{app.desc}</div>
              </div>
              <div className="store-actions">
                {!isIn && app.proOnly && edition !== 'pro' && (
                  <button className="btn" onClick={() => notifyOs('このアプリは Pro Edition でのみ利用できます。設定の「エディション」から切り替えてください')}>
                    👑 Pro限定
                  </button>
                )}
                {!isIn && !(app.proOnly && edition !== 'pro') && (
                  <button
                    className="btn accent"
                    onClick={() => {
                      onInstall(app.id)
                      notifyOs(`「${app.name}」をインストールしました`)
                    }}
                  >
                    {t('stInstall')}
                  </button>
                )}
                {isIn && outdated && (
                  <button
                    className="btn accent"
                    onClick={() => onShowUpdate({ kind: 'app', id: app.id })}
                  >
                    {t('stUpdateBtn')}
                  </button>
                )}
                {isIn && (
                  <button
                    className="btn"
                    onClick={() => {
                      if (window.confirm(`${app.name}${t('stUninstallQ')}`)) onUninstall(app.id)
                    }}
                  >
                    {t('stUninstall')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {STORE_APPS.length === 0 && <p className="store-note">{t('stEmpty')}</p>}
        {query.trim() && STORE_APPS.filter((a) => (a.name + ' ' + a.desc + ' ' + a.id).toLowerCase().includes(query.trim().toLowerCase())).length === 0 && (
          <p className="store-note">「{query.trim()}」に一致するアプリはありませんでした。</p>
        )}
      </div>
      </>
      )}

      <h3 className="store-head">{t('stBuiltIn')}</h3>
      {edition === 'pro' && <p className="store-note">{t('proStoreNote')}</p>}
      <div className="store-list">
        {coreApps.map((app) => {
          const isDefault = PRO_DEFAULT_APPS.includes(app.id)
          const isAdded = proExtra.includes(app.id)
          return (
            <div className="store-row" key={app.id}>
              <span className={`app-icon ${app.cls}`}>{app.icon}</span>
              <div className="store-meta">
                <div className="store-name">
                  {app.name}
                  {edition === 'pro' && isDefault && <span className="store-state">{t('coreDefaultBadge')}</span>}
                  {edition === 'pro' && isAdded && <span className="store-state">{t('stInstalled')}</span>}
                </div>
                <div className="store-desc">WebX に標準で含まれます</div>
              </div>
              {edition === 'pro' && !isDefault && (
                <div className="store-actions">
                  {!isAdded && (
                    <button className="btn accent" onClick={() => { onInstallCore(app.id); notifyOs(`「${app.name}」を追加しました`) }}>
                      {t('coreAddBtn')}
                    </button>
                  )}
                  {isAdded && (
                    <button className="btn" onClick={() => { if (window.confirm(`${app.name}${t('stUninstallQ')}`)) onUninstallCore(app.id) }}>
                      {t('coreRemoveBtn')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
