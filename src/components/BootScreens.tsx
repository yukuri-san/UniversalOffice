import { useEffect, useRef, useState } from 'react'
import { clearAllStoredData, deleteDoc, exportAll, importAll, listDocs, listEvents, ownUsageBytes, saveDoc, storageInfo, trashDoc, type BackupData, type LocalDoc } from '../lib/store'
import { resetSettingsOnly, SETTINGS_KEYS } from '../lib/reset'
import { APP_EDITION, APP_VERSION } from '../lib/version'
import { execCommand, type ShellState } from '../lib/shell'
import { hashPin } from '../lib/pin'

type BiosTab = 'main' | 'advanced' | 'boot' | 'security' | 'diag' | 'exit'

// BIOS 風セットアップ画面（タブ構成）
export function BiosScreen({ onExit }: { onExit: () => void }) {
  const pinGate = localStorage.getItem('webx-bios-pin') === 'on' && !!localStorage.getItem('webx-pin-hash')
  const [unlocked, setUnlocked] = useState(!pinGate)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)
  const [tab, setTab] = useState<BiosTab>('main')
  const [now, setNow] = useState(new Date())
  const [splash, setSplash] = useState(() => localStorage.getItem('webx-boot-delay') ?? '1100')
  const [safe, setSafe] = useState(() => localStorage.getItem('webx-safe-mode') ?? 'off')
  const [fastBoot, setFastBoot] = useState(() => localStorage.getItem('webx-fast-boot') === 'on')
  const [bootDefault, setBootDefault] = useState(() => localStorage.getItem('webx-boot-default') ?? 'os')
  const [devEnabled, setDevEnabled] = useState(() => localStorage.getItem('webx-dev-enabled') !== 'off')
  const [biosPin, setBiosPin] = useState(() => localStorage.getItem('webx-bios-pin') === 'on')
  const [memTest, setMemTest] = useState(0) // 0=未実施, 1..100=進行, 101=完了
  const [storageTest, setStorageTest] = useState('')
  const [battery, setBattery] = useState('')

  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(iv)
  }, [])
  useEffect(() => {
    const nav = navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean }> }
    if (nav.getBattery) void nav.getBattery().then((b) => setBattery(`${Math.round(b.level * 100)}%（${b.charging ? '充電中' : '放電中'}）`)).catch(() => setBattery('取得不可'))
    else setBattery('取得不可')
  }, [])

  const tryUnlock = () => {
    if (hashPin(pinInput) === localStorage.getItem('webx-pin-hash')) { setUnlocked(true); setPinError(false) }
    else { setPinError(true); setPinInput('') }
  }
  const saveAndExit = () => {
    localStorage.setItem('webx-boot-delay', splash)
    if (safe === 'off') localStorage.removeItem('webx-safe-mode')
    else localStorage.setItem('webx-safe-mode', safe)
    localStorage.setItem('webx-fast-boot', fastBoot ? 'on' : 'off')
    localStorage.setItem('webx-boot-default', bootDefault)
    localStorage.setItem('webx-dev-enabled', devEnabled ? 'on' : 'off')
    localStorage.setItem('webx-bios-pin', biosPin ? 'on' : 'off')
    onExit()
  }
  const runMemTest = () => {
    setMemTest(1)
    let p = 0
    const iv = window.setInterval(() => {
      p += 4
      if (p >= 100) { window.clearInterval(iv); setMemTest(101) } else setMemTest(p)
    }, 60)
  }
  const runStorageTest = async () => {
    setStorageTest('測定中…')
    try {
      const payload = 'x'.repeat(200_000)
      const t0 = performance.now()
      const doc = await saveDoc({ name: '__biostest__', kind: 'note', folder: '', content: payload })
      const t1 = performance.now()
      await deleteDoc(doc.id)
      const t2 = performance.now()
      const own = await ownUsageBytes()
      setStorageTest(`書き込み ${(200 / (t1 - t0) * 1000).toFixed(0)} KB/s ／ 削除 ${Math.round(t2 - t1)} ms ／ WebX データ実測 ${(own / 1024).toFixed(1)} KB — 正常`)
    } catch { setStorageTest('ストレージにアクセスできませんでした') }
  }

  if (!unlocked) {
    return (
      <div className="bios-screen">
        <div className="bios-frame bios-lock">
          <header className="bios-header"><span>WebX UEFI Setup Utility</span></header>
          <p className="bios-note">BIOS パスワード（ロック画面の PIN）を入力してください。</p>
          <div className="bios-lock-row">
            <input type="password" inputMode="numeric" value={pinInput} autoFocus
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') tryUnlock() }} placeholder="PIN" />
            <button className="bios-btn primary" onClick={tryUnlock}>Enter</button>
            <button className="bios-btn" onClick={onExit}>起動に戻る</button>
          </div>
          {pinError && <p className="bios-error">パスワードが違います</p>}
        </div>
      </div>
    )
  }

  const nav = navigator as unknown as { hardwareConcurrency?: number; deviceMemory?: number }
  const mainRows: [string, string][] = [
    ['WebX Version', `${APP_VERSION} (${APP_EDITION})`],
    ['System Time', now.toLocaleTimeString('ja-JP', { hour12: false })],
    ['System Date', now.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })],
    ['Language', localStorage.getItem('ykr-lang') ?? 'ja'],
    ['Timezone', localStorage.getItem('webx-timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone],
    ['CPU Cores', nav.hardwareConcurrency ? String(nav.hardwareConcurrency) : 'Unknown'],
    ['Memory (目安)', nav.deviceMemory ? `${nav.deviceMemory} GB` : 'Unknown'],
    ['Display', `${window.screen.width} x ${window.screen.height}`],
    ['Battery', battery || '…'],
    ['User Agent', navigator.userAgent.slice(0, 72) + '…'],
  ]
  const optRow = (label: string, value: string, set: (v: string) => void, opts: [string, string][]) => (
    <div className="bios-row">
      <span className="bios-key">{label}</span>
      <span className="bios-opts">
        {opts.map(([v, l]) => <button key={v} className={value === v ? 'bios-opt on' : 'bios-opt'} onClick={() => set(v)}>{l}</button>)}
      </span>
    </div>
  )
  const boolRow = (label: string, value: boolean, set: (v: boolean) => void) => (
    <div className="bios-row">
      <span className="bios-key">{label}</span>
      <span className="bios-opts">
        <button className={value ? 'bios-opt on' : 'bios-opt'} onClick={() => set(true)}>有効</button>
        <button className={!value ? 'bios-opt on' : 'bios-opt'} onClick={() => set(false)}>無効</button>
      </span>
    </div>
  )

  return (
    <div className="bios-screen">
      <div className="bios-frame">
        <header className="bios-header">
          <span>WebX UEFI Setup Utility</span>
          <span className="bios-header-sub">ファームウェア設定（再現）</span>
        </header>
        <nav className="bios-tabs">
          {([['main', 'Main'], ['advanced', 'Advanced'], ['boot', 'Boot'], ['security', 'Security'], ['diag', 'Diagnostics'], ['exit', 'Exit']] as [BiosTab, string][]).map(([id, label]) => (
            <button key={id} className={tab === id ? 'bios-tab on' : 'bios-tab'} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        <div className="bios-body">
          {tab === 'main' && (
            <section className="bios-panel">
              <h3>Main — システム情報</h3>
              {mainRows.map(([k, v]) => (
                <div key={k} className="bios-row"><span className="bios-key">{k}</span><span className="bios-val">{v}</span></div>
              ))}
            </section>
          )}
          {tab === 'advanced' && (
            <section className="bios-panel">
              <h3>Advanced — 詳細設定</h3>
              {optRow('Safe Mode（セーフモード）', safe, setSafe, [['off', 'オフ'], ['once', '次回のみ'], ['always', '常時']])}
              {boolRow('開発者アプリ（Developer）を表示', devEnabled, setDevEnabled)}
              <p className="bios-note">セーフモードではウィジェットとアニメーションを無効にして起動します（トラブル時の切り分け用）。</p>
            </section>
          )}
          {tab === 'boot' && (
            <section className="bios-panel">
              <h3>Boot — 起動設定</h3>
              {optRow('Splash Screen（起動ロゴの表示時間）', splash, setSplash, [['0', 'オフ'], ['500', '0.5秒'], ['1100', '1.1秒'], ['2000', '2秒']])}
              {boolRow('Fast Boot（高速ブート：ロゴを省略）', fastBoot, setFastBoot)}
              {optRow('既定のブート先', bootDefault, setBootDefault, [['os', 'WebX'], ['recovery', '回復環境']])}
              <p className="bios-note">既定のブート先を回復環境にすると、起動のたびに回復環境が開きます（通常起動ボタンで WebX に入れます）。</p>
            </section>
          )}
          {tab === 'security' && (
            <section className="bios-panel">
              <h3>Security — セキュリティ</h3>
              <div className="bios-row"><span className="bios-key">ロック画面 PIN</span><span className="bios-val">{localStorage.getItem('webx-pin-hash') ? '設定済み' : '未設定（ロック画面の設定で作成）'}</span></div>
              {boolRow('BIOS パスワード（PIN で BIOS を保護）', biosPin, setBiosPin)}
              <p className="bios-note">有効にすると、この画面を開くときにロック画面の PIN 入力を求めます。PIN 未設定の場合は保護されません。</p>
            </section>
          )}
          {tab === 'diag' && (
            <section className="bios-panel">
              <h3>Diagnostics — 診断</h3>
              <div className="bios-row">
                <span className="bios-key">メモリ簡易チェック</span>
                <span className="bios-opts">
                  <button className="bios-opt" onClick={runMemTest} disabled={memTest > 0 && memTest <= 100}>実行</button>
                  <span className="bios-val">{memTest === 0 ? '未実施' : memTest <= 100 ? `チェック中… ${memTest}%` : '全ブロック OK'}</span>
                </span>
              </div>
              {memTest > 0 && memTest <= 100 && <div className="bios-progress"><span style={{ width: `${memTest}%` }} /></div>}
              <div className="bios-row">
                <span className="bios-key">ストレージテスト（実測）</span>
                <span className="bios-opts"><button className="bios-opt" onClick={() => void runStorageTest()}>実行</button></span>
              </div>
              {storageTest && <p className="bios-note">{storageTest}</p>}
              <div className="bios-row"><span className="bios-key">バッテリー</span><span className="bios-val">{battery || '…'}</span></div>
              <p className="bios-note">メモリチェックは表示上の簡易チェックです。ストレージテストは実際に書き込み・削除して測定します。</p>
            </section>
          )}
          {tab === 'exit' && (
            <section className="bios-panel">
              <h3>Exit — 終了</h3>
              <div className="bios-actions">
                <button className="bios-btn primary" onClick={saveAndExit}>Save Changes and Exit（保存して起動）</button>
                <button className="bios-btn" onClick={onExit}>Discard Changes and Exit（保存せず起動）</button>
                <button className="bios-btn" onClick={() => { localStorage.setItem('webx-boot-target', 'recovery'); location.reload() }}>Boot to Recovery（回復環境で起動）</button>
              </div>
            </section>
          )}
        </div>
        <footer className="bios-footer">この画面は再現UIです。設定は端末内に保存されます</footer>
      </div>
    </div>
  )
}

interface RestorePoint { name: string; ts: number; data: Record<string, string | null> }
const RP_KEY = 'webx-restore-points'
function loadPoints(): RestorePoint[] {
  try { return JSON.parse(localStorage.getItem(RP_KEY) ?? '[]') as RestorePoint[] } catch { return [] }
}

// 回復環境（拡張版：復旧ポイント／データ管理／ネットワークテスト／コンソール／診断ログ）
export function RecoveryScreen({ onExit }: { onExit: () => void }) {
  const [info, setInfo] = useState('')
  const [msg, setMsg] = useState('')
  const [points, setPoints] = useState<RestorePoint[]>(loadPoints)
  const [docs, setDocs] = useState<LocalDoc[]>([])
  const [netTest, setNetTest] = useState('')
  const [bootLog, setBootLog] = useState<string[]>([])
  const [consoleLines, setConsoleLines] = useState<string[]>(['WebX 回復コンソール — help でコマンド一覧'])
  const [consoleInput, setConsoleInput] = useState('')
  const [shellState, setShellState] = useState<ShellState>({ cwd: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  const refreshDocs = async () => setDocs((await listDocs()).filter((d) => !d.deletedAt))
  useEffect(() => {
    void (async () => {
      const [si, ds, events] = await Promise.all([storageInfo(), listDocs(), listEvents()])
      setInfo(`WebX ${APP_VERSION} ／ 保存方式：${si.backend} ／ 永続化：${si.persisted ? '有効' : '未許可'} ／ ドキュメント ${ds.length} 件 ／ 予定 ${events.length} 件`)
      setDocs(ds.filter((d) => !d.deletedAt))
      setBootLog([
        `[boot] WebX v${APP_VERSION} (${APP_EDITION})`,
        `[boot] boot target: recovery`,
        `[storage] backend: ${si.backend} / persisted: ${si.persisted}`,
        `[storage] usage: ${(si.usage / 1024).toFixed(1)} KB`,
        `[setup] done: ${localStorage.getItem('webx-setup-done') === '1'} / version: ${localStorage.getItem('webx-setup-version') ?? '-'}`,
        `[safe-mode] ${localStorage.getItem('webx-safe-mode') ?? 'off'}`,
        `[ua] ${navigator.userAgent}`,
      ])
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
  const createPoint = () => {
    const data: Record<string, string | null> = {}
    for (const k of SETTINGS_KEYS) data[k] = localStorage.getItem(k)
    const point: RestorePoint = { name: new Date().toLocaleString('ja-JP'), ts: Date.now(), data }
    const next = [point, ...points].slice(0, 3)
    localStorage.setItem(RP_KEY, JSON.stringify(next))
    setPoints(next)
    setMsg(`復旧ポイントを作成しました（${point.name}）`)
  }
  const restorePoint = (p: RestorePoint) => {
    if (!window.confirm(`復旧ポイント「${p.name}」に設定を戻しますか？（データは消えません）`)) return
    for (const [k, v] of Object.entries(p.data)) {
      if (v === null) localStorage.removeItem(k)
      else localStorage.setItem(k, v)
    }
    setMsg('復旧ポイントを適用しました。再起動します…')
    window.setTimeout(() => location.reload(), 800)
  }
  const runNetTest = async () => {
    setNetTest('測定中…')
    try {
      const t0 = performance.now()
      const res = await fetch(`version.json?ts=${Date.now()}`, { cache: 'no-store' })
      const t1 = performance.now()
      if (!res.ok) throw new Error('bad')
      await res.text()
      setNetTest(`オンライン：${navigator.onLine ? 'はい' : 'いいえ'} ／ サーバー応答：${Math.round(t1 - t0)} ms ／ 接続：正常`)
    } catch { setNetTest('サーバーへの接続を確認できませんでした（オフラインの可能性があります）') }
  }
  const clearCache = async () => {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
      setMsg(`キャッシュを ${keys.length} 件消去しました`)
    } catch { setMsg('キャッシュを消去できませんでした') }
  }
  const runConsole = async () => {
    const cmd = consoleInput
    setConsoleInput('')
    setConsoleLines((p) => [...p, `recovery:\\${shellState.cwd}> ${cmd}`])
    if (!cmd.trim()) return
    const res = await execCommand(cmd, shellState, {
      apps: [], openApp: () => undefined, notify: (t) => setMsg(t),
      clear: () => setConsoleLines([]),
      exit: () => onExit(),
      action: (name) => { if (name === 'reboot' || name === 'bios') location.reload() },
      recovery: true,
    })
    setShellState(res.state)
    if (res.out.length) setConsoleLines((p) => [...p, ...res.out])
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
          <button className="recovery-btn" onClick={() => void clearCache()}>🧹 キャッシュを消去する</button>
          <button className="recovery-btn danger" onClick={() => void factoryReset()}>⚠ 工場出荷状態に戻す（全データ消去）</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = '' }} />

        <h2 className="recovery-h">復旧ポイント（設定のスナップショット）</h2>
        <div className="recovery-list">
          <button className="recovery-btn" onClick={createPoint}>＋ 現在の設定で復旧ポイントを作成（最大3件）</button>
          {points.map((p) => (
            <div key={p.ts} className="recovery-row">
              <span>{p.name}</span>
              <button className="btn" onClick={() => restorePoint(p)}>復元</button>
              <button className="btn danger" onClick={() => { const next = points.filter((x) => x.ts !== p.ts); localStorage.setItem(RP_KEY, JSON.stringify(next)); setPoints(next) }}>削除</button>
            </div>
          ))}
        </div>

        <h2 className="recovery-h">データ管理</h2>
        <div className="recovery-docs">
          {docs.map((d) => (
            <div key={d.id} className="recovery-row">
              <span>{d.name}（{d.kind}／{(new TextEncoder().encode(d.content).length / 1024).toFixed(1)} KB）</span>
              <button className="btn danger" onClick={() => { void trashDoc(d.id).then(refreshDocs) }}>ゴミ箱へ</button>
            </div>
          ))}
          {docs.length === 0 && <p className="recovery-note">ドキュメントはありません</p>}
        </div>

        <h2 className="recovery-h">ネットワークテスト</h2>
        <div className="recovery-list">
          <button className="recovery-btn" onClick={() => void runNetTest()}>🌐 接続テストを実行</button>
        </div>
        {netTest && <p className="recovery-msg">{netTest}</p>}

        <h2 className="recovery-h">回復コンソール</h2>
        <div className="recovery-console">
          {consoleLines.map((l, i) => <div key={i}>{l}</div>)}
          <div className="recovery-console-row">
            <span>{`recovery:\\${shellState.cwd}>`}</span>
            <input value={consoleInput} onChange={(e) => setConsoleInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void runConsole() }} aria-label="回復コンソール入力" />
          </div>
          <p className="recovery-note">使えるコマンド：help / dir / type / storage / reset-settings / clear-cache / boot-normal など</p>
        </div>

        <h2 className="recovery-h">診断ログ</h2>
        <pre className="recovery-log">{bootLog.join('\n')}</pre>

        {msg && <p className="recovery-msg">{msg}</p>}
        <p className="recovery-note">PINを忘れてロックを解除できない場合も、ここの「設定だけをリセットする」で復旧できます。</p>
      </div>
    </div>
  )
}
