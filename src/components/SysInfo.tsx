import { useEffect, useState } from 'react'
import { listDocs, listEvents, listTrashedDocs, ownUsageBytes, storageInfo } from '../lib/store'
import { APP_BUILD, APP_VERSION } from '../lib/version'
import { editionLabel } from '../lib/edition'
import { STORE_APPS } from '../lib/storeApps'

interface BatteryLike {
  level: number
  charging: boolean
  chargingTime: number
  dischargingTime: number
  addEventListener: (type: string, fn: () => void) => void
  removeEventListener: (type: string, fn: () => void) => void
}
interface NavExt {
  getBattery?: () => Promise<BatteryLike>
  deviceMemory?: number
  hardwareConcurrency?: number
  connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }
  platform?: string
  maxTouchPoints?: number
  languages?: string[]
  onLine?: boolean
}

function gpuInfo(): { vendor: string; renderer: string } {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return { vendor: '取得できません', renderer: 'WebGL が使えません' }
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const vendor = ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) ?? '') : String(gl.getParameter(gl.VENDOR) ?? '')
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '') : String(gl.getParameter(gl.RENDERER) ?? '')
    return { vendor: vendor || '不明', renderer: renderer || '不明' }
  } catch {
    return { vendor: '取得できません', renderer: '取得できません' }
  }
}

const fmtTime = (sec: number) => {
  if (!Number.isFinite(sec) || sec < 0) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h > 0 ? `約${h}時間${m}分` : `約${m}分`
}

export default function SysInfo() {
  const permitHw = localStorage.getItem('webx-permit-hwinfo') !== 'off'
  const nav = navigator as unknown as NavExt
  const [info, setInfo] = useState<{ backend: string; own: number; quota: number; persisted: boolean; docs: number; trash: number; events: number } | null>(null)
  const [battery, setBattery] = useState<BatteryLike | null>(null)
  const [heap, setHeap] = useState<{ used: number; total: number; limit: number } | null>(null)
  const [gpu] = useState(gpuInfo)

  useEffect(() => {
    void (async () => {
      const [si, own, docs, trash, events] = await Promise.all([storageInfo(), ownUsageBytes(), listDocs(), listTrashedDocs(), listEvents()])
      setInfo({ backend: si.backend, own, quota: si.quota, persisted: si.persisted, docs: docs.length, trash: trash.length, events: events.length })
    })()
  }, [])

  useEffect(() => {
    let bat: BatteryLike | null = null
    let alive = true
    const update = () => { if (alive && bat) setBattery({ ...bat }) }
    if (nav.getBattery) {
      void nav.getBattery().then((b) => {
        bat = b
        update()
        b.addEventListener('levelchange', update)
        b.addEventListener('chargingchange', update)
        b.addEventListener('chargingtimechange', update)
        b.addEventListener('dischargingtimechange', update)
      }).catch(() => { /* ignore */ })
    }
    const readHeap = () => {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory
      if (mem) setHeap({ used: mem.usedJSHeapSize, total: mem.totalJSHeapSize, limit: mem.jsHeapSizeLimit })
    }
    readHeap()
    const iv = window.setInterval(readHeap, 3000)
    return () => {
      alive = false
      window.clearInterval(iv)
      if (bat) {
        bat.removeEventListener('levelchange', update)
        bat.removeEventListener('chargingchange', update)
        bat.removeEventListener('chargingtimechange', update)
        bat.removeEventListener('dischargingtimechange', update)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`
  const installed: string[] = (() => {
    try { return JSON.parse(localStorage.getItem('webx-installed-apps') ?? '[]') as string[] } catch { return [] }
  })()
  const conn = nav.connection
  const sections: { title: string; rows: [string, string][] }[] = [
    {
      title: 'WebX とストレージ',
      rows: [
        ['OS', `WebX v${APP_VERSION} (build ${APP_BUILD})`],
        ['エディション', editionLabel()],
        ['保存方式', info ? info.backend : '読み込み中…'],
        ['WebX の使用量', info ? mb(info.own) : '…'],
        ['ブラウザの上限', info ? (info.quota ? mb(info.quota) : '取得できません') : '…'],
        ['永続化', info ? (info.persisted ? '有効' : '未設定') : '…'],
        ['ドキュメント', info ? `${info.docs} 件（ゴミ箱 ${info.trash} 件）` : '…'],
        ['カレンダーの予定', info ? `${info.events} 件` : '…'],
        ['ストアアプリ', `${STORE_APPS.length} 本（インストール済み ${installed.length} 本）`],
      ],
    },
    {
      title: 'ハードウェア',
      rows: [
        ['CPU コア数', nav.hardwareConcurrency ? `${nav.hardwareConcurrency} コア` : '取得できません'],
        ['GPU ベンダー', gpu.vendor],
        ['GPU レンダラー', gpu.renderer],
        ['端末メモリ（目安）', nav.deviceMemory ? `約 ${nav.deviceMemory} GB` : '取得できません'],
        ['JS ヒープ使用量', heap ? `${mb(heap.used)} ／ 上限 ${mb(heap.limit)}` : '取得できません'],
        ['バッテリー残量', battery && Number.isFinite(battery.level) ? `${Math.round(battery.level * 100)}%` : '取得できません'],
        ['充電状態', battery ? (battery.charging ? '充電中' : '放電中（バッテリー駆動）') : '取得できません'],
        ['充電完了まで', battery ? (battery.charging ? fmtTime(battery.chargingTime) : '—') : '取得できません'],
        ['残り使用可能時間', battery ? (!battery.charging ? fmtTime(battery.dischargingTime) : '—') : '取得できません'],
      ],
    },
    {
      title: 'ディスプレイと端末',
      rows: [
        ['画面解像度', `${window.screen.width} × ${window.screen.height}`],
        ['表示領域', `${window.innerWidth} × ${window.innerHeight}`],
        ['デバイスピクセル比', String(window.devicePixelRatio || 1)],
        ['色深度', `${window.screen.colorDepth} bit`],
        ['向き', window.screen.orientation?.type ?? '不明'],
        ['タッチポイント数', String(nav.maxTouchPoints ?? 0)],
        ['プラットフォーム', nav.platform || '不明'],
      ],
    },
    {
      title: 'ネットワークとブラウザ',
      rows: [
        ['オンライン状態', nav.onLine === false ? 'オフライン' : 'オンライン'],
        ['回線種別（推定）', conn?.effectiveType ?? '取得できません'],
        ['下り速度（推定）', conn?.downlink ? `約 ${conn.downlink} Mbps` : '取得できません'],
        ['応答時間（推定）', conn?.rtt ? `約 ${conn.rtt} ms` : '取得できません'],
        ['データセーバー', conn ? (conn.saveData ? 'オン' : 'オフ') : '取得できません'],
        ['言語', (nav.languages && nav.languages.length > 0 ? nav.languages.join(', ') : navigator.language) || '不明'],
        ['タイムゾーン', localStorage.getItem('webx-timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone],
        ['ユーザーエージェント', navigator.userAgent],
      ],
    },
  ]
  if (!permitHw) {
    const hw = sections.find((s) => s.title === 'ハードウェア')
    if (hw) hw.rows = hw.rows.map(([k]) => [k, '許可されていません（設定 → システムで許可できます）'] as [string, string])
  }
  return (
    <div className="settings-app">
      <h2>システム情報</h2>
      {sections.map((s) => (
        <section key={s.title} className="settings-section">
          <h3>{s.title}</h3>
          {s.rows.map(([k, v]) => (
            <div key={k} className="sysinfo-row">
              <span className="sysinfo-key">{k}</span>
              <span className="sysinfo-val">{v}</span>
            </div>
          ))}
        </section>
      ))}
      <p className="sa-note">バッテリー・メモリ・回線などの情報はブラウザが公開している範囲で表示しています（端末やブラウザによっては取得できない項目があります）。この情報は端末の外に送信されません。</p>
    </div>
  )
}
