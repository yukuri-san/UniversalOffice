import { useEffect, useState } from 'react'
import type { CalEvent } from '../lib/store'
import { EVENT_COLORS } from '../lib/store'
import { WEATHER_CITIES, type WidgetConfig, type WidgetId } from '../lib/widgets'
import { timeLabel } from './Calendar'

export interface LauncherAppInfo { id: string; name: string; icon: string; cls: string }

interface Props {
  id: WidgetId
  now: Date
  clock: string
  dateLabel: string
  events: CalEvent[]
  config: WidgetConfig
  launcherAppsInfo: LauncherAppInfo[]
  onOpenApp: (id: string) => void
}

interface BatteryLike {
  level: number
  charging: boolean
  addEventListener: (type: string, fn: () => void) => void
  removeEventListener: (type: string, fn: () => void) => void
}

function BatteryWidget() {
  const [bat, setBat] = useState<BatteryLike | null>(null)
  useEffect(() => {
    let b: BatteryLike | null = null
    let alive = true
    const update = () => { if (alive && b) setBat({ ...b }) }
    const getBattery = (navigator as unknown as { getBattery?: () => Promise<BatteryLike> }).getBattery
    if (getBattery) {
      void getBattery.call(navigator).then((x) => {
        b = x
        update()
        x.addEventListener('levelchange', update)
        x.addEventListener('chargingchange', update)
      }).catch(() => { /* ignore */ })
    }
    return () => {
      alive = false
      if (b) {
        b.removeEventListener('levelchange', update)
        b.removeEventListener('chargingchange', update)
      }
    }
  }, [])
  if (localStorage.getItem('webx-permit-hwinfo') === 'off') return <div className="dwidget"><div className="dw-title">🔋 バッテリー</div><div className="dw-note">端末情報の利用が許可されていません</div></div>
  if (!bat) return <div className="dwidget"><div className="dw-title">🔋 バッテリー</div><div className="dw-note">取得できません</div></div>
  const pct = Math.round(bat.level * 100)
  if (!Number.isFinite(pct)) return <div className="dwidget"><div className="dw-title">🔋 バッテリー</div><div className="dw-note">取得できません</div></div>
  return (
    <div className="dwidget">
      <div className="dw-title">🔋 バッテリー{bat.charging ? '（充電中）' : ''}</div>
      <div className="dw-battery-row">
        <div className="dw-battery-bar"><span style={{ width: `${pct}%` }} className={pct <= 20 ? 'low' : ''} /></div>
        <strong>{pct}%</strong>
      </div>
    </div>
  )
}

function SysMonWidget() {
  const [heap, setHeap] = useState<number | null>(null)
  useEffect(() => {
    const read = () => {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      setHeap(mem ? mem.usedJSHeapSize : null)
    }
    read()
    const iv = window.setInterval(read, 3000)
    return () => window.clearInterval(iv)
  }, [])
  const nav = navigator as unknown as { hardwareConcurrency?: number; deviceMemory?: number }
  if (localStorage.getItem('webx-permit-hwinfo') === 'off') {
    return (
      <div className="dwidget">
        <div className="dw-title">📊 システムモニター</div>
        <div className="dw-note">端末情報の利用が許可されていません</div>
      </div>
    )
  }
  return (
    <div className="dwidget">
      <div className="dw-title">📊 システムモニター</div>
      <div className="dw-note">CPU {nav.hardwareConcurrency ? `${nav.hardwareConcurrency} コア` : '—'}／メモリ {nav.deviceMemory ? `約${nav.deviceMemory}GB` : '—'}</div>
      <div className="dw-note">JSヒープ {heap !== null ? `${(heap / 1024 / 1024).toFixed(1)} MB` : '取得できません'}</div>
    </div>
  )
}

const WEATHER_LABELS: Record<number, [string, string]> = {
  0: ['☀️', '快晴'], 1: ['🌤', '晴れ'], 2: ['⛅', '晴れ時々曇り'], 3: ['☁️', '曇り'],
  45: ['🌫', '霧'], 48: ['🌫', '霧'], 51: ['🌦', '小雨'], 53: ['🌦', '小雨'], 55: ['🌦', '雨'],
  61: ['🌧', '雨'], 63: ['🌧', '雨'], 65: ['🌧', '大雨'], 71: ['🌨', '雪'], 73: ['🌨', '雪'], 75: ['🌨', '大雪'],
  77: ['🌨', '雪'], 80: ['🌧', 'にわか雨'], 81: ['🌧', 'にわか雨'], 82: ['🌧', '激しいにわか雨'], 95: ['⛈', '雷雨'],
}

function WeatherWidget({ cityId }: { cityId: string }) {
  const city = WEATHER_CITIES.find((c) => c.id === cityId) ?? WEATHER_CITIES[0]
  const [data, setData] = useState<{ temp: number; code: number } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    // 30分以内の成功データは再取得を省くためのスロットルとして保持するだけ。
    // 取得に失敗したときは古いデータを表示せず、プレースホルダにする（ポップアップも出さない）
    const cacheKey = 'webx-widget-weather'
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') as { city: string; temp: number; code: number; at: number } | null
      if (cached && cached.city === city.id && Date.now() - cached.at < 30 * 60 * 1000) {
        setData({ temp: cached.temp, code: cached.code })
        return
      }
    } catch { /* ignore */ }
    void (async () => {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code`)
        if (!res.ok) throw new Error('bad')
        const json = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number } }
        const temp = json.current?.temperature_2m
        const code = json.current?.weather_code
        if (typeof temp !== 'number' || typeof code !== 'number') throw new Error('bad')
        if (!alive) return
        setData({ temp, code })
        setFailed(false)
        try { localStorage.setItem(cacheKey, JSON.stringify({ city: city.id, temp, code, at: Date.now() })) } catch { /* ignore */ }
      } catch {
        if (!alive) return
        setData(null)
        setFailed(true)
      }
    })()
    return () => { alive = false }
  }, [city])
  const w = data ? (WEATHER_LABELS[data.code] ?? ['🌡', '不明']) : null
  return (
    <div className="dwidget">
      <div className="dw-title">🌤 天気（{city.name}）</div>
      {data && w
        ? <div className="dw-weather"><span className="dw-weather-icon">{w[0]}</span><strong>{Math.round(data.temp)}℃</strong><span>{w[1]}</span></div>
        : <div className="dw-note">{failed ? '取得できませんでした' : '読み込み中…'}</div>}
    </div>
  )
}

function MiniCalWidget({ now, events }: { now: Date; events: CalEvent[] }) {
  const y = now.getFullYear()
  const m = now.getMonth()
  const first = new Date(y, m, 1)
  const startDay = first.getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const eventDays = new Set(events.filter((e) => e.date.startsWith(`${y}-${String(m + 1).padStart(2, '0')}-`)).map((e) => Number(e.date.slice(8, 10))))
  const cells: (number | null)[] = [...Array<null>(startDay).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  return (
    <div className="dwidget">
      <div className="dw-title">🗓 {y}年{m + 1}月</div>
      <div className="dw-minical">
        {['日', '月', '火', '水', '木', '金', '土'].map((d) => <span key={d} className="dw-mc-head">{d}</span>)}
        {cells.map((d, i) => (
          <span key={i} className={`dw-mc-cell${d === now.getDate() ? ' today' : ''}${d !== null && eventDays.has(d) ? ' has-event' : ''}`}>{d ?? ''}</span>
        ))}
      </div>
    </div>
  )
}

function WorldClockWidget({ now }: { now: Date }) {
  const fmt = (tz: string) => new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(now)
  return (
    <div className="dwidget">
      <div className="dw-title">🌐 世界時計</div>
      <div className="dw-wc-row"><span>東京</span><strong>{fmt('Asia/Tokyo')}</strong></div>
      <div className="dw-wc-row"><span>ロンドン</span><strong>{fmt('Europe/London')}</strong></div>
      <div className="dw-wc-row"><span>ニューヨーク</span><strong>{fmt('America/New_York')}</strong></div>
    </div>
  )
}

function CountdownWidget({ config }: { config: WidgetConfig }) {
  if (!config.countdownDate) {
    return (
      <div className="dwidget">
        <div className="dw-title">⏳ カウントダウン</div>
        <div className="dw-note">ウィジェット管理で目標日を設定してください</div>
      </div>
    )
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${config.countdownDate}T00:00:00`)
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000)
  return (
    <div className="dwidget">
      <div className="dw-title">⏳ {config.countdownLabel}</div>
      <div className="dw-countdown">
        {diff > 0 ? <>あと <strong>{diff}</strong> 日</> : diff === 0 ? <strong>今日です！</strong> : <>{Math.abs(diff)} 日経過</>}
      </div>
      <div className="dw-note">{config.countdownDate}</div>
    </div>
  )
}

function StickyNoteWidget() {
  const [text, setText] = useState(() => localStorage.getItem('webx-widget-note') ?? '')
  return (
    <div className="dwidget dw-sticky">
      <div className="dw-title">🗒 付箋メモ</div>
      <textarea
        value={text}
        placeholder="ここにメモ…"
        onChange={(e) => { setText(e.target.value); try { localStorage.setItem('webx-widget-note', e.target.value) } catch { /* ignore */ } }}
      />
    </div>
  )
}

export default function DesktopWidget({ id, now, clock, dateLabel, events, config, launcherAppsInfo, onOpenApp }: Props) {
  switch (id) {
    case 'clock':
      return (
        <div className="dwidget dw-clock">
          <span className="widget-clock">{clock}</span>
          <span className="widget-date">{dateLabel}</span>
        </div>
      )
    case 'agenda': {
      const items = [...events].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')).slice(0, 4)
      return (
        <div className="dwidget">
          <div className="dw-title">📅 今日の予定</div>
          {items.length > 0
            ? items.map((e) => <div key={e.id} className="agenda-item"><span className="cal-color-dot" style={{ backgroundColor: EVENT_COLORS.find((c) => c.id === (e.color ?? 'blue'))?.hex ?? '#3b82f6' }} />{timeLabel(e) ? `${timeLabel(e)} ` : ''}{e.title}</div>)
            : <div className="dw-note">今日の予定はありません</div>}
        </div>
      )
    }
    case 'battery': return <BatteryWidget />
    case 'sysmon': return <SysMonWidget />
    case 'weather': return <WeatherWidget cityId={config.weatherCity} />
    case 'minical': return <MiniCalWidget now={now} events={events} />
    case 'worldclock': return <WorldClockWidget now={now} />
    case 'countdown': return <CountdownWidget config={config} />
    case 'stickynote': return <StickyNoteWidget />
    case 'launcher':
      return (
        <div className="dwidget">
          <div className="dw-title">🚀 クイックランチャー</div>
          <div className="dw-launcher">
            {launcherAppsInfo.map((a) => (
              <button key={a.id} className="dw-launch-btn" onClick={() => onOpenApp(a.id)} title={a.name}>
                <span className={`app-icon ${a.cls}`}>{a.icon}</span>
                <span className="dw-launch-name">{a.name}</span>
              </button>
            ))}
            {launcherAppsInfo.length === 0 && <div className="dw-note">ウィジェット管理でアプリを選んでください</div>}
          </div>
        </div>
      )
    default: return null
  }
}
