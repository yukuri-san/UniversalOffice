interface WinLike { id: string; minimized: boolean; maximized: boolean; z: number }
interface Props {
  windows: WinLike[]
  activeId: string | null
  nameOf: (id: string) => string
  iconOf: (id: string) => { icon: string; cls: string }
  onFocus: (id: string) => void
  onMinimize: (id: string) => void
  onClose: (id: string) => void
  onCloseAll: () => void
}

export default function TaskManager({ windows, activeId, nameOf, iconOf, onFocus, onMinimize, onClose, onCloseAll }: Props) {
  const sorted = [...windows].sort((a, b) => b.z - a.z)
  return (
    <div className="settings-app">
      <h2>タスクマネージャー</h2>
      <section className="settings-section">
        <p className="settings-note">開いているウィンドウ：{windows.length} 件</p>
        <div className="sa-log" style={{ marginTop: 8 }}>
          {sorted.map((w) => {
            const meta = iconOf(w.id)
            return (
              <div key={w.id} className="sa-cardrow">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span className={`app-icon tiny ${meta.cls}`}>{meta.icon}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nameOf(w.id)}
                    {w.id === activeId ? '（前面）' : ''}
                    {w.minimized ? '（最小化）' : ''}
                    {w.maximized ? '（最大化）' : ''}
                  </span>
                </span>
                <span className="sa-row">
                  <button className="btn small" onClick={() => onFocus(w.id)}>前面へ</button>
                  {!w.minimized && <button className="btn small" onClick={() => onMinimize(w.id)}>最小化</button>}
                  <button className="btn small" onClick={() => onClose(w.id)}>閉じる</button>
                </span>
              </div>
            )
          })}
          {windows.length === 0 && <p className="sa-note">開いているウィンドウはありません。</p>}
        </div>
        {windows.length > 1 && (
          <div className="settings-options" style={{ marginTop: 10 }}>
            <button className="opt danger" onClick={onCloseAll}>すべて閉じる</button>
          </div>
        )}
      </section>
      <p className="sa-note">タスクマネージャー自身も一覧に含まれます。</p>
    </div>
  )
}
