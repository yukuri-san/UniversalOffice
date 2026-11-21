// デスクトップウィジェットの定義と設定（保存先は端末内のみ）
export type WidgetId = 'clock' | 'agenda' | 'battery' | 'sysmon' | 'stickynote' | 'launcher' | 'worldclock' | 'countdown' | 'weather' | 'minical'

export interface WidgetDef {
  id: WidgetId
  icon: string
  name: string
  desc: string
}

export const WIDGET_DEFS: WidgetDef[] = [
  { id: 'clock', icon: '🕒', name: '時計', desc: '大きな時計と日付を表示します' },
  { id: 'agenda', icon: '📅', name: '今日の予定', desc: 'カレンダーの今日の予定を一覧表示します' },
  { id: 'battery', icon: '🔋', name: 'バッテリー', desc: 'バッテリー残量と充電状態を表示します' },
  { id: 'sysmon', icon: '📊', name: 'システムモニター', desc: 'CPUコア数・メモリ使用量などを表示します' },
  { id: 'weather', icon: '🌤', name: '天気', desc: '選んだ都市の現在の天気と気温を表示します（通信が必要）' },
  { id: 'minical', icon: '🗓', name: 'ミニカレンダー', desc: '今月のカレンダーを小さく表示します（予定のある日に印）' },
  { id: 'worldclock', icon: '🌐', name: '世界時計', desc: '東京・ロンドン・ニューヨークの時刻を表示します' },
  { id: 'countdown', icon: '⏳', name: 'カウントダウン', desc: '目標日まであと何日かを表示します' },
  { id: 'stickynote', icon: '🗒', name: '付箋メモ', desc: 'デスクトップに貼れる小さなメモです（その場で編集できます）' },
  { id: 'launcher', icon: '🚀', name: 'クイックランチャー', desc: 'よく使うアプリを並べてすぐ開けるようにします' },
]

export const WEATHER_CITIES: { id: string; name: string; lat: number; lon: number }[] = [
  { id: 'tokyo', name: '東京', lat: 35.68, lon: 139.69 },
  { id: 'osaka', name: '大阪', lat: 34.69, lon: 135.5 },
  { id: 'sapporo', name: '札幌', lat: 43.06, lon: 141.35 },
  { id: 'fukuoka', name: '福岡', lat: 33.59, lon: 130.4 },
  { id: 'naha', name: '那覇', lat: 26.21, lon: 127.68 },
]

export interface WidgetConfig {
  order: WidgetId[]
  enabled: Record<WidgetId, boolean>
  countdownDate: string
  countdownLabel: string
  weatherCity: string
  launcherApps: string[]
}

const KEY = 'webx-widget-config'

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  order: ['clock', 'agenda', 'battery', 'sysmon', 'weather', 'minical', 'worldclock', 'countdown', 'stickynote', 'launcher'],
  enabled: { clock: true, agenda: true, battery: false, sysmon: false, weather: false, minical: false, worldclock: false, countdown: false, stickynote: false, launcher: false },
  countdownDate: '',
  countdownLabel: '目標日',
  weatherCity: 'tokyo',
  launcherApps: ['word', 'sheet', 'calendar', 'store'],
}

export function loadWidgetConfig(): WidgetConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(DEFAULT_WIDGET_CONFIG)
    const parsed = JSON.parse(raw) as Partial<WidgetConfig>
    const ids = WIDGET_DEFS.map((d) => d.id)
    const order = (Array.isArray(parsed.order) ? parsed.order.filter((x): x is WidgetId => ids.includes(x as WidgetId)) : [])
    for (const id of ids) if (!order.includes(id)) order.push(id)
    return {
      order,
      enabled: { ...DEFAULT_WIDGET_CONFIG.enabled, ...(parsed.enabled ?? {}) },
      countdownDate: typeof parsed.countdownDate === 'string' ? parsed.countdownDate : '',
      countdownLabel: typeof parsed.countdownLabel === 'string' && parsed.countdownLabel ? parsed.countdownLabel : '目標日',
      weatherCity: typeof parsed.weatherCity === 'string' ? parsed.weatherCity : 'tokyo',
      launcherApps: Array.isArray(parsed.launcherApps) ? parsed.launcherApps.filter((x) => typeof x === 'string').slice(0, 8) : [...DEFAULT_WIDGET_CONFIG.launcherApps],
    }
  } catch {
    return structuredClone(DEFAULT_WIDGET_CONFIG)
  }
}

export function saveWidgetConfig(cfg: WidgetConfig): void {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
}
