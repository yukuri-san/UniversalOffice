import { STORE_APPS } from '../lib/storeApps'
import { notifyOs } from '../lib/notify'

interface Props {
  installed: string[]
  versions: Record<string, string>
  coreApps: { id: string; name: string; icon: string; cls: string }[]
  onInstall: (id: string) => void
  onUninstall: (id: string) => void
  onUpdateApp: (id: string) => void
}

// アプリの入手・削除・更新はすべてこのストアで、アプリごとに個別処理する。
export default function AppStore({ installed, versions, coreApps, onInstall, onUninstall, onUpdateApp }: Props) {
  return (
    <div className="store-app">
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
