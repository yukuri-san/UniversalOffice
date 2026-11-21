import { useEffect, useRef, useState } from 'react'
import { clearAllStoredData, exportAll, importAll, listDocs, listEvents, storageInfo, type BackupData } from '../lib/store'
import { resetSettingsOnly } from '../lib/reset'
import { APP_EDITION, APP_VERSION } from '../lib/version'

// BIOS 風セットアップ画面（起動前に開くファームウェア設定の再現）
export function BiosScreen({ onExit }: { onExit: () => void }) {
  const [now, setNow] = useState(new Date())
  const [splash, setSplash] = useState(() => localStorage.getItem('webx-boot-delay') ?? '1100')
  const [safe, setSafe] = useState(() => localStorage.getItem('webx-safe-mode') ?? 'off')
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(iv)
  }, [])
  const nav = navigator as unknown as { hardwareConcurrency?: number }
  const saveAndExit = () => {
    localStorage.setItem('webx-boot-delay', splash)
    if (safe === 'off') localStorage.removeItem('webx-safe-mode')
    else localStorage.setItem('webx-safe-mode', safe)
    onExit()
  }
  const rows: [string, string][] = [
    ['WebX Version', `${APP_VERSION} (${APP_EDITION})`],
    ['System Time', now.toLocaleTimeString('ja-JP', { hour12: false })],
    ['System Date', now.toLocaleDateString('ja-JP')],
    ['Language', localStorage.getItem('ykr-lang') ?? 'ja'],
    ['Timezone', localStorage.getItem('webx-timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone],
    ['CPU Cores', nav.hardwareConcurrency ? String(nav.hardwareConcurrency) : 'Unknown'],
    ['Display', `${window.screen.width} x ${window.screen.height}`],
    ['User Agent', navigator.userAgent.slice(0, 64) + '…'],
  ]
  return (
    <div className="bios-screen">
      <div className="bios-frame">
        <header className="bios-header">
          <span>WebX UEFI Setup Utility</span>
          <span className="bios-header-sub">ファームウェア設定（再現）</span>
        </header>
        <div className="bios-body">
          <section className="bios-panel">
            <h3>Main — システム情報</h3>
            {rows.map(([k, v]) => (
              <div key={k} className="bios-row"><span className="bios-key">{k}</span><span className="bios-val">{v}</span></div>
            ))}
          </section>
          <section className="bios-panel">
            <h3>Boot — 起動設定</h3>
            <div className="bios-row">
              <span className="bios-key">Splash Screen（起動ロゴの表示時間）</span>
              <span className="bios-opts">
                {[['0', 'オフ'], ['500', '0.5秒'], ['1100', '1.1秒'], ['2000', '2秒']].map(([v, label]) => (
                  <button key={v} className={splash === v ? 'bios-opt on' : 'bios-opt'} onClick={() => setSplash(v)}>{label}</button>
                ))}
              </span>
            </div>
            <div className="bios-row">
              <span className="bios-key">Safe Mode（セーフモード）</span>
              <span className="bios-opts">
                {[['off', 'オフ'], ['once', '次回のみ'], ['always', '常時']].map(([v, label]) => (
                  <button key={v} className={safe === v ? 'bios-opt on' : 'bios-opt'} onClick={() => setSafe(v)}>{label}</button>
                ))}
              </span>
            </div>
            <p className="bios-note">セーフモードではウィジェットとアニメーションを無効にして起動します（トラブル時の切り分け用）。</p>
          </section>
          <section className="bios-panel">
            <h3>Exit — 終了</h3>
            <div className="bios-actions">
              <button className="bios-btn primary" onClick={saveAndExit}>Save Changes and Exit（保存して起動）</button>
              <button className="bios-btn" onClick={onExit}>Discard Changes and Exit（保存せず起動）</button>
              <button className="bios-btn" onClick={() => { localStorage.setItem('webx-boot-target', 'recovery'); location.reload() }}>Boot to Recovery（回復環境で起動）</button>
            </div>
          </section>
        </div>
        <footer className="bios-footer">F10: Save &amp; Exit相当はボタンから ／ この画面は再現UIです。実際の設定は端末内に保存されます</footer>
      </div>
    </div>
  )
}

// 回復環境（トラブル時に使う専用画面）
export function RecoveryScreen({ onExit }: { onExit: () => void }) {
  const [info, setInfo] = useState('')
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    void (async () => {
      const [si, docs, events] = await Promise.all([storageInfo(), listDocs(), listEvents()])
      setInfo(`WebX ${APP_VERSION} ／ 保存方式：${si.backend} ／ ドキュメント ${docs.length} 件 ／ 予定 ${events.length} 件`)
    })().catch(() => setInfo(`WebX ${APP_VERSION}`))
  }, [])
  const doExport = async () => {
    try {
      const data = await exportAll()
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'webx-backup.json'
      a.click()
      URL.revokeObjectURL(url)
      setMsg('バックアップを書き出しました')
    } catch { setMsg('バックアップの書き出しに失敗しました') }
  }
  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as BackupData
      await importAll(data)
      setMsg('バックアップを読み込みました。再起動します…')
      window.setTimeout(() => location.reload(), 800)
    } catch { setMsg('バックアップを読み込めませんでした（ファイルを確認してください）') }
  }
  const factoryReset = async () => {
    if (!window.confirm('すべてのデータ（ドキュメント・予定・設定・保存データ）を消去して初期状態に戻します。よろしいですか？')) return
    if (!window.confirm('本当に実行しますか？この操作は取り消せません。')) return
    await clearAllStoredData().catch(() => { /* ignore */ })
    localStorage.clear()
    location.reload()
  }
  return (
    <div className="recovery-screen">
      <div className="recovery-frame">
        <h1>WebX Recovery</h1>
        <p className="recovery-info">{info}</p>
        <div className="recovery-list">
          <button className="recovery-btn" onClick={onExit}>▶ 通常起動に戻る</button>
          <button className="recovery-btn" onClick={() => { localStorage.setItem('webx-safe-mode', 'once'); onExit() }}>🛟 セーフモードで起動する（次回のみ）</button>
          <button className="recovery-btn" onClick={() => { if (window.confirm('設定だけをリセットします（データは消えません）。よろしいですか？')) { resetSettingsOnly(); location.reload() } }}>⚙ 設定だけをリセットする</button>
          <button className="recovery-btn" onClick={() => void doExport()}>💾 バックアップを書き出す</button>
          <button className="recovery-btn" onClick={() => fileRef.current?.click()}>📥 バックアップを読み込む</button>
          <button className="recovery-btn danger" onClick={() => void factoryReset()}>⚠ 工場出荷状態に戻す（全データ消去）</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = '' }} />
        {msg && <p className="recovery-msg">{msg}</p>}
        <p className="recovery-note">PINを忘れてロックを解除できない場合も、ここの「設定だけをリセットする」で復旧できます。</p>
      </div>
    </div>
  )
}
