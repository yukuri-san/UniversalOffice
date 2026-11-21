import { useState } from 'react'
import { STORE_APPS } from '../lib/storeApps'
import { notifyOs } from '../lib/notify'
import { APP_VERSION } from '../lib/version'
import { compareVersions, fetchLatestVersion, performUpdate } from '../lib/updateCheck'

interface Props {
  installed: string[]
  versions: Record<string, string>
  coreApps: { id: string; name: string; icon: string; cls: string }[]
  onInstall: (id: string) => void
  onUninstall: (id: string) => void
  onUpdateApp: (id: string) => void
}

type CheckState = 'idle' | 'checking' | 'done' | 'error'

// アプリの入手・削除・更新はすべてこのストアで処理する。
// WebX 本体の更新確認・適用もここで行う（設定からは移管済み）。
export default function AppStore({ installed, versions, coreApps, onInstall, onUninstall, onUpdateApp }: Props) {
  const [check, setCheck] = useState<CheckState>('idle')
  const [latest, setLatest] = useState('')
  const [summary, setSummary] = useState('')

  const outdatedApps = STORE_APPS.filter((a) => installed.includes(a.id) && versions[a.id] !== a.version)
  const webxOutdated = latest !== '' && compareVersions(latest, APP_VERSION) > 0

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
    const parts: string[] = []
    parts.push(compareVersions(v, APP_VERSION) > 0 ? `WebX v${v} があります` : 'WebX は最新です')
    parts.push(outdatedApps.length > 0 ? `更新できるアプリが ${outdatedApps.length} 件あります` : 'アプリはすべて最新です')
    setSummary(parts.join('／'))
  }

  const doWebxUpdate = async () => {
    if (!window.confirm(`WebX を v${latest} に更新しますか？（キャッシュを消して再読み込みします）`)) return
    await performUpdate()
  }

  return (
    <div className="store-app">
      <h3 className="store-head">WebX 本体</h3>
      <div className="store-row">
        <span className="app-icon store">W</span>
        <div className="store-meta">
          <div className="store-name">
            WebX
            <span className="store-ver">現在のバージョン v{APP_VERSION}</span>
            {webxOutdated && <span className="store-state">v{latest} があります</span>}
          </div>
          <div className="store-desc">本体の更新確認と適用はこのストアで行います</div>
        </div>
        <div className="store-actions">
          <button className="btn" onClick={() => void runCheck()} disabled={check === 'checking'}>
            {check === 'checking' ? '確認中…' : '更新確認'}
          </button>
          {webxOutdated && (
            <button className="btn accent" onClick={() => void doWebxUpdate()}>今すぐ更新</button>
          )}
        </div>
      </div>
      {summary && <p className="store-note">{summary}</p>}

      <h3 className="store-head">ストアアプリ</h3>
      <p className="store-note">インストールしたアプリだけがデスクトップやスタートメニューに表示されます。更新はアプリごとに個別に行います。</p>
      <div className="store-list">
        {STORE_APPS.map((app) => {
          const isIn = installed.includes(app.id)
          const cur = versions[app.id]
          const outdated = isIn && cur !== app.version
          return (
            <div className="store-row" key={app.id}>
              <span className={`app-icon ${app.cls}`}>{app.icon}</span>
              <div className="store-meta">
                <div className="store-name">
                  {app.name}
                  <span className="store-ver">v{app.version}</span>
                  {isIn && <span className="store-state">{outdated ? `インストール済み v${cur ?? '?'}（更新あり）` : 'インストール済み'}</span>}
                </div>
                <div className="store-desc">{app.desc}</div>
              </div>
              <div className="store-actions">
                {!isIn && (
                  <button
                    className="btn accent"
                    onClick={() => {
                      onInstall(app.id)
                      notifyOs(`「${app.name}」をインストールしました`)
                    }}
                  >
                    インストール
                  </button>
                )}
                {isIn && outdated && (
                  <button
                    className="btn accent"
                    onClick={() => {
                      onUpdateApp(app.id)
                      notifyOs(`「${app.name}」を v${app.version} に更新しました`)
                    }}
                  >
                    更新する
                  </button>
                )}
                {isIn && (
                  <button
                    className="btn"
                    onClick={() => {
                      if (window.confirm(`「${app.name}」をアンインストールしますか？`)) onUninstall(app.id)
                    }}
                  >
                    アンインストール
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {STORE_APPS.length === 0 && <p className="store-note">まだストアアプリはありません。</p>}
      </div>

      <h3 className="store-head">標準アプリ（アンインストール不可）</h3>
      <div className="store-list">
        {coreApps.map((app) => (
          <div className="store-row" key={app.id}>
            <span className={`app-icon ${app.cls}`}>{app.icon}</span>
            <div className="store-meta">
              <div className="store-name">{app.name}</div>
              <div className="store-desc">WebX に標準で含まれます</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
