export type AppId = 'word' | 'sheet' | 'note' | 'calendar'

export interface BackstageAction {
  label: string
  hint?: string
  onClick: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  current: AppId
  onSwitch: (app: AppId) => void
  actions: BackstageAction[]
  fileManager?: React.ReactNode
}

const APPS: { id: AppId; icon: string; cls: string; name: string; desc: string }[] = [
  { id: 'word', icon: 'W', cls: 'word', name: 'ワードプロセッサ', desc: '文書を作る（Word 風）' },
  { id: 'sheet', icon: 'S', cls: 'sheet', name: 'スプレッドシート', desc: '表と数式（CSV 対応）' },
  { id: 'note', icon: 'メ', cls: 'note', name: 'メモ帳', desc: 'プレーンテキストのメモ' },
  { id: 'calendar', icon: 'カ', cls: 'calendar', name: 'カレンダー', desc: '予定の管理' },
]

export default function Backstage({ open, onClose, current, onSwitch, actions, fileManager }: Props) {
  if (!open) return null
  return (
    <div className="backstage" role="dialog" aria-label="ホーム">
      <div className="backstage-side">
        <button className="backstage-back" onClick={onClose}>← 戻る</button>
        <h2>ホーム</h2>
        <p className="backstage-sub">アプリの切り替えとファイル操作</p>
        <div className="backstage-apps">
          {APPS.map((app) => (
            <button
              key={app.id}
              className={current === app.id ? 'app-card active' : 'app-card'}
              onClick={() => { onSwitch(app.id); onClose() }}
            >
              <span className={`app-icon ${app.cls}`}>{app.icon}</span>
              <span>
                <strong>{app.name}</strong>
                <small>{app.desc}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="backstage-main">
        <h3>ファイル</h3>
        <div className="backstage-actions">
          {actions.map((a) => (
            <button key={a.label} className="file-action" onClick={() => { a.onClick(); onClose() }}>
              <strong>{a.label}</strong>
              {a.hint && <small>{a.hint}</small>}
            </button>
          ))}
        </div>
        <p className="backstage-note">データはすべて端末内に保存されます。サーバーには送信されません。</p>
        {fileManager}
      </div>
    </div>
  )
}
