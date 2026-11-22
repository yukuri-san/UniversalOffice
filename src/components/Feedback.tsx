import { useEffect, useState} from 'react'
import { APP_VERSION} from '../lib/version'
import { STORE_APPS} from '../lib/storeApps'
import { ownUsageBytes, storageInfo} from '../lib/store'
import { notifyOs} from '../lib/notify'
import { editionLabel } from '../lib/edition'

// 報告・要望：不具合報告・アプリ改善・追加要望を「報告画像（PNG）」として書き出す。
// 画像にはシステム情報・ユーザー情報・ストレージ使用状況・バージョン情報を添付する。
// 送信は自動では行わない（利用者が Discord サポートサーバーへ画像を送る）。

type Kind = 'bug' | 'improve' | 'request'
const KINDS: { id: Kind; label: string; emoji: string}[] = [
{ id: 'bug', label: '不具合報告', emoji: '🐞'},
{ id: 'improve', label: 'アプリ改善', emoji: '🛠'},
{ id: 'request', label: '追加要望', emoji: '💡'},
]
const CORE_TARGETS = ['WebX本体', 'ワードプロセッサ', '表計算', 'メモ帳', 'メモDB', 'カレンダー', 'ペイント', 'コマンドプロンプト', 'エクスプローラー', 'ブラウザ', 'YouTube', 'ストア', '設定', 'その他']

const fmtMB = (b: number) => (b >= 1024 ** 3? `${(b / 1024 ** 3).toFixed(2)} GB`: b >= 1024 ** 2? `${(b / 1024 ** 2).toFixed(1)} MB`: `${Math.max(0, Math.round(b / 1024))} KB`)
const ls = (k: string) => { try { return localStorage.getItem(k)?? ''} catch { return ''}}

interface ReportData { sys: string[]; user: string[]; storage: string[]; versions: string[]}

async function gatherData(): Promise<ReportData> {
const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string}}
const sys = [
`画面: ${window.screen.width}×${window.screen.height}（表示 ${window.innerWidth}×${window.innerHeight}）`,
`ブラウザ言語: ${navigator.language}`,
`タイムゾーン: ${Intl.DateTimeFormat().resolvedOptions().timeZone?? '不明'}`,
`CPUコア数: ${navigator.hardwareConcurrency?? '不明'}`,
`メモリ目安: ${nav.deviceMemory? `約 ${nav.deviceMemory} GB`: '取得不可'}`,
`接続: ${nav.connection?.effectiveType?? '不明'} / オンライン: ${navigator.onLine? 'はい': 'いいえ'}`,
`タッチ対応: ${'ontouchstart' in window? 'あり': 'なし'}`,
`UA: ${navigator.userAgent}`,
]
const user = [
`ユーザー名: ${ls('webx-user-name') || '（未設定）'}`,
`WebXの言語: ${ls('ykr-lang') || 'ja'}`,
`エディション: ${editionLabel()}`,
`テーマ: ${ls('ykr-theme') || '既定'}`,
`UIシステム: ${ls('webx-ui-mode') || 'auto'}`,
`UI拡大率: ${ls('webx-ui-scale') || 'auto'}`,
]
let storage: string[] = []
try {
const [info, own] = await Promise.all([storageInfo(), ownUsageBytes()])
storage = [
`WebXの使用量（概算）: ${fmtMB(own)}`,
`このサイト全体の使用量: ${fmtMB(info.usage)} / 上限 ${fmtMB(info.quota)}${info.quota > 0? `（${Math.round((info.usage / info.quota) * 1000) / 10}%）`: ''}`,
`保存方式: ${info.backend}`,
`永続化: ${info.persisted? '許可済み': '未許可'}`,
]
} catch { storage = ['ストレージ情報: 取得できませんでした']}
let installed: string[] = []
try {
const ids = JSON.parse(ls('webx-installed-apps') || '[]') as string[]
const vers = JSON.parse(ls('webx-app-versions') || '{}') as Record<string, string>
installed = ids
.map((id) => STORE_APPS.find((a) => a.id === id))
.filter((a): a is NonNullable<typeof a> =>!!a)
.map((a) => `${a.name} v${vers[a.id]?? a.version}`)
} catch { /* ignore */}
const versions = [
`WebX本体: v${APP_VERSION}（${editionLabel()}）`,
`インストール済みストアアプリ: ${installed.length}本`,
...installed.map((x) => `・${x}`),
]
return { sys, user, storage, versions}
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
const out: string[] = []
for (const para of text.split('\n')) {
if (!para) { out.push(''); continue}
let line = ''
for (const ch of para) {
const test = line + ch
if (ctx.measureText(test).width > maxWidth && line) { out.push(line); line = ch} else line = test
}
out.push(line)
}
return out
}

export default function Feedback() {
const [kind, setKind] = useState<Kind>('bug')
const [target, setTarget] = useState('WebX本体')
const [title, setTitle] = useState('')
const [body, setBody] = useState('')
const [data, setData] = useState<ReportData | null>(null)
const [imgUrl, setImgUrl] = useState('')
const [imgName, setImgName] = useState('')

useEffect(() => { void gatherData().then(setData)}, [])

const kindLabel = KINDS.find((k) => k.id === kind)!

const generate = () => {
if (!title.trim() &&!body.trim()) { notifyOs('タイトルか内容を入力してください', 'feedback'); return}
if (!data) return
const W = 1040
const PAD = 48
const scale = 2
const scratch = document.createElement('canvas').getContext('2d')!
const sections: { head: string; lines: string[]; font: string; lh: number}[] = []
scratch.font = '25px sans-serif'
sections.push({ head: '内容', lines: wrapText(scratch, body.trim() || '（未入力）', W - PAD * 2), font: '25px sans-serif', lh: 38})
const dataFont = '21px ui-monospace, monospace'
const mk = (head: string, arr: string[]) => {
scratch.font = dataFont
return { head, lines: arr.flatMap((x) => wrapText(scratch, x, W - PAD * 2)), font: dataFont, lh: 31}
}
sections.push(mk('システム情報', data.sys), mk('ユーザー情報', data.user), mk('ストレージ使用状況', data.storage), mk('バージョン情報', data.versions))

let H = 150 + 64 + 46 // ヘッダー＋タイトル＋対象
for (const s of sections) H += 44 + s.lines.length * s.lh + 18
H += 84 // フッター

const canvas = document.createElement('canvas')
canvas.width = W * scale
canvas.height = H * scale
const ctx = canvas.getContext('2d')!
ctx.scale(scale, scale)
ctx.fillStyle = '#ffffff'
ctx.fillRect(0, 0, W, H)
const grad = ctx.createLinearGradient(0, 0, W, 0)
grad.addColorStop(0, '#0ea5e9')
grad.addColorStop(1, '#34d399')
ctx.fillStyle = grad
ctx.fillRect(0, 0, W, 110)
ctx.fillStyle = '#ffffff'
ctx.font = '800 34px sans-serif'
ctx.fillText(`WebX ${kindLabel.emoji} ${kindLabel.label}`, PAD, 52)
ctx.font = '21px sans-serif'
const now = new Date()
const stamp = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
ctx.fillText(`${stamp} / WebX v${APP_VERSION}`, PAD, 88)

let y = 110 + 52
ctx.fillStyle = '#111827'
ctx.font = '800 29px sans-serif'
for (const line of wrapText(ctx, title.trim() || '（タイトル未入力）', W - PAD * 2)) { ctx.fillText(line, PAD, y); y += 40}
ctx.font = '22px sans-serif'
ctx.fillStyle = '#374151'
ctx.fillText(`対象: ${target}`, PAD, y)
y += 30

for (const s of sections) {
y += 14
ctx.fillStyle = '#0ea5e9'
ctx.font = '800 23px sans-serif'
ctx.fillText(`■ ${s.head}`, PAD, y)
y += 10
ctx.fillStyle = '#1f2937'
ctx.font = s.font
for (const line of s.lines) { y += s.lh; ctx.fillText(line, PAD, y - 8)}
y += 8
}
y += 26
ctx.fillStyle = '#6b7280'
ctx.font = '20px sans-serif'
ctx.fillText('この画像は WebX「報告・要望」アプリで作成されました。Discordサポートサーバーにて送信願います。', PAD, y)

canvas.toBlob((blob) => {
if (!blob) return
if (imgUrl) URL.revokeObjectURL(imgUrl)
setImgUrl(URL.createObjectURL(blob))
const d = new Date()
setImgName(`webx-report-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.png`)
notifyOs('報告画像を作成しました', 'feedback')
}, 'image/png')
}

const saveImage = () => {
if (!imgUrl) return
const a = document.createElement('a')
a.href = imgUrl
a.download = imgName || 'webx-report.png'
a.click()
}

const dataText = data? [
'',...data.sys,
'',...data.user,
'',...data.storage,
'',...data.versions,
].join('\n'): '読み込み中…'

return (
<div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflowY: 'auto', padding: 2}}>
<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap'}}>
{KINDS.map((k) => (
<button key={k.id} className={kind === k.id? 'chip on': 'chip'} onClick={() => setKind(k.id)}>{k.emoji} {k.label}</button>
))}
</div>
<label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 700}}>
対象
<select value={target} onChange={(e) => setTarget(e.target.value)} style={{ fontSize: 13, padding: '7px 8px'}}>
{CORE_TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
{STORE_APPS.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
</select>
</label>
<label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 700}}>
タイトル
<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：カレンダーで予定が保存できない" style={{ fontSize: 13.5, padding: '8px 10px'}} />
</label>
<label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 700}}>
内容
<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder={'詳しい内容を書いてください。\n不具合の場合は、起きた操作の手順があると助かります。'} style={{ fontSize: 13.5, padding: '8px 10px'}} />
</label>

<details>
<summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700}}>画像に添付される情報（システム情報・ユーザー情報・ストレージ・バージョン）</summary>
<pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11.5, background: 'rgba(127,127,127,.08)', borderRadius: 10, padding: 10, margin: '6px 0 0'}}>{dataText}</pre>
</details>

<button className="btn accent" onClick={generate} style={{ padding: '11px', fontSize: 14, borderRadius: 12}}>📷 報告画像を作成する</button>

{imgUrl && (
<div style={{ display: 'flex', flexDirection: 'column', gap: 8}}>
<img src={imgUrl} alt="報告画像" style={{ width: '100%', borderRadius: 12, border: '1px solid rgba(127,127,127,.3)'}} />
<button className="btn accent" onClick={saveImage} style={{ padding: '11px', fontSize: 14, borderRadius: 12}}>⬇ 画像を保存する</button>
</div>
)}

<p className="hint" style={{ lineHeight: 1.7}}>
送信は自動では行われません。作成した画像を保存して、<strong>Discordサポートサーバーにて送信願います</strong>（「Discordサポート」アプリから開けます）。
画像に写っている情報だけが伝わります（この画面の「添付される情報」で事前に確認できます）。
</p>
</div>
)
}
