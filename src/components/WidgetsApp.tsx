import { WEATHER_CITIES, WIDGET_DEFS, type WidgetConfig, type WidgetId } from '../lib/widgets'
import type { LauncherAppInfo } from './DesktopWidgets'

interface Props {
  config: WidgetConfig
  onChange: (cfg: WidgetConfig) => void
  appsInfo: LauncherAppInfo[]
}

export default function WidgetsApp({ config, onChange, appsInfo }: Props) {
  const set = (patch: Partial<WidgetConfig>) => onChange({ ...config, ...patch })
  const toggle = (id: WidgetId, v: boolean) => set({ enabled: { ...config.enabled, [id]: v } })
  const move = (id: WidgetId, dir: -1 | 1) => {
    const order = [...config.order]
    const i = order.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    set({ order })
  }
  const toggleLauncherApp = (id: string) => {
    const has = config.launcherApps.includes(id)
    const next = has ? config.launcherApps.filter((x) => x !== id) : [...config.launcherApps, id].slice(0, 8)
    set({ launcherApps: next })
  }
  const enabledCount = WIDGET_DEFS.filter((d) => config.enabled[d.id]).length
  return (
    <div className="settings-app">
      <h2>ウィジェット管理</h2>
      <p className="settings-note">デスクトップに表示するウィジェットを選んだり、並び替えたり、個別の設定ができます（表示中 {enabledCount} / {WIDGET_DEFS.length}）。</p>
      {config.order.map((id, idx) => {
        const def = WIDGET_DEFS.find((d) => d.id === id)!
        const on = config.enabled[id]
        return (
          <section key={id} className="settings-section widget-admin-row">
            <div className="widget-admin-head">
              <span className="widget-admin-name">{def.icon} {def.name}</span>
              <span className="settings-options">
                <button className="opt" disabled={idx === 0} onClick={() => move(id, -1)}>↑ 上へ</button>
                <button className="opt" disabled={idx === config.order.length - 1} onClick={() => move(id, 1)}>↓ 下へ</button>
                <button className={on ? 'opt on' : 'opt'} onClick={() => toggle(id, true)}>表示</button>
                <button className={!on ? 'opt on' : 'opt'} onClick={() => toggle(id, false)}>非表示</button>
              </span>
            </div>
            <p className="settings-note" style={{ margin: '6px 0 0' }}>{def.desc}</p>
            {on && id === 'countdown' && (
              <div className="sa-row" style={{ marginTop: 8 }}>
                <input type="date" value={config.countdownDate} onChange={(e) => set({ countdownDate: e.target.value })} />
                <input type="text" value={config.countdownLabel} placeholder="名前（例：誕生日）" onChange={(e) => set({ countdownLabel: e.target.value })} />
              </div>
            )}
            {on && id === 'weather' && (
              <div className="sa-row" style={{ marginTop: 8 }}>
                <span className="sa-note">都市：</span>
                <select value={config.weatherCity} onChange={(e) => set({ weatherCity: e.target.value })}>
                  {WEATHER_CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span className="sa-note">天気は Open-Meteo の公開データを使います（30分キャッシュ）</span>
              </div>
            )}
            {on && id === 'launcher' && (
              <div className="widget-launcher-picker">
                {appsInfo.map((a) => (
                  <button
                    key={a.id}
                    className={config.launcherApps.includes(a.id) ? 'chip on' : 'chip'}
                    onClick={() => toggleLauncherApp(a.id)}
                  >
                    {a.icon} {a.name}
                  </button>
                ))}
                <span className="sa-note">最大8つまで（{config.launcherApps.length} 選択中）</span>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
