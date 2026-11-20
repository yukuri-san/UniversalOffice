export interface BackstageAction {
  label: string
  hint?: string
  onClick: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  current: 'word' | 'sheet'
  onSwitch: (app: 'word' | 'sheet') => void
  actions: BackstageAction[]
  fileManager?: React.ReactNode
}

export default function Backstage({ open, onClose, current, onSwitch, actions, fileManager }: Props) {
  if (!open) return null
  return (
    <div className="backstage" role="dialog" aria-label="ホーム">
      <div className="backstage-side">
        <button className="backstage-back" onClick={onClose}>← 戻る</button>
        <h2>ホーム</h2>
        <p className="backstage-sub">アプリの切り替えとファイル操作</p>
        <div className="backstage-apps">
          <button
            className={current === 'word' ? 'app-card active' : 'app-card'}
            onClick={() => { onSwitch('word'); onClose() }}
          >
            <span className="app-icon word">W</span>
            <span>
              <strong>ワードプロセッサ</strong>
              <small>文書を作る（Word 風）</small>
            </span>
          </button>
          <button
            className={current === 'sheet' ? 'app-card active' : 'app-card'}
            onClick={() => { onSwitch('sheet'); onClose() }}
          >
            <span className="app-icon sheet">S</span>
            <span>
              <strong>スプレッドシート</strong>
              <small>表を作る（CSV 対応）</small>
            </span>
          </button>
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
        <p className="backstage-note">文書は自動でこのブラウザに保存されます。サーバーには送信されません。</p>
        {fileManager}
      </div>
    </div>
  )
}
