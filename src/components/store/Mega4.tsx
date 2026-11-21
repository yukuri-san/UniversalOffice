import { useEffect, useRef, useState } from 'react'

function load<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')
    return v ?? fallback
  } catch { return fallback }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignore */ }
}
const shuffle = <T,>(arr: T[]): T[] => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
const copyText = (s: string) => { void navigator.clipboard?.writeText(s) }

/* ---------- テキスト変換 ---------- */
export function TextTools() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const toHalf = (s: string) => s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ')
  const toFull = (s: string) => s.replace(/[A-Za-z0-9]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0)).replace(/ /g, '　')
  const apply = (fn: (s: string) => string) => setOutput(fn(input))
  return (
    <div className="sa-app">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={5} placeholder="変換したいテキストを入力" />
      <div className="sa-row">
        <button className="btn" onClick={() => apply((s) => s.toUpperCase())}>大文字</button>
        <button className="btn" onClick={() => apply((s) => s.toLowerCase())}>小文字</button>
        <button className="btn" onClick={() => apply(toHalf)}>全角→半角</button>
        <button className="btn" onClick={() => apply(toFull)}>半角→全角</button>
        <button className="btn" onClick={() => apply((s) => s.replace(/\r?\n/g, ''))}>改行を削除</button>
        <button className="btn" onClick={() => apply((s) => [...s].reverse().join(''))}>文字を逆順</button>
        <button className="btn" onClick={() => apply((s) => s.split('\n').reverse().join('\n'))}>行を逆順</button>
      </div>
      <textarea value={output} readOnly rows={5} placeholder="変換結果" />
      <div className="sa-row">
        <button className="btn" onClick={() => copyText(output)} disabled={!output}>結果をコピー</button>
        <span className="sa-note">入力 {input.length} 文字／結果 {output.length} 文字</span>
      </div>
      <p className="sa-note">よく使う文字列変換をまとめたツールです。変換は端末内で行われます。</p>
    </div>
  )
}

/* ---------- JSON整形 ---------- */
export function JsonFmt() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [err, setErr] = useState('')
  const run = (indent: number | null) => {
    try {
      const obj: unknown = JSON.parse(input)
      setOutput(indent === null ? JSON.stringify(obj) : JSON.stringify(obj, null, indent))
      setErr('')
    } catch (e) {
      setErr(`JSONの形式が正しくありません：${e instanceof Error ? e.message : String(e)}`)
      setOutput('')
    }
  }
  return (
    <div className="sa-app">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={6} placeholder='{"name":"WebX"} のようなJSONを貼り付け' className="sa-mono" />
      <div className="sa-row">
        <button className="btn accent" onClick={() => run(2)}>整形（2スペース）</button>
        <button className="btn" onClick={() => run(4)}>整形（4スペース）</button>
        <button className="btn" onClick={() => run(null)}>圧縮</button>
        <button className="btn" onClick={() => copyText(output)} disabled={!output}>結果をコピー</button>
      </div>
      {err && <p className="sa-note" style={{ color: '#dc2626' }}>{err}</p>}
      <textarea value={output} readOnly rows={8} placeholder="結果" className="sa-mono" />
      <p className="sa-note">JSONの整形・圧縮・形式チェックを行います。</p>
    </div>
  )
}

/* ---------- Base64変換 ---------- */
function toB64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin)
}
function fromB64(s: string): string {
  const bin = atob(s.replace(/\s/g, ''))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
export function Base64Tool() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [err, setErr] = useState('')
  const run = (encode: boolean) => {
    try {
      setOutput(encode ? toB64(input) : fromB64(input))
      setErr('')
    } catch { setErr('変換できませんでした。入力を確認してください。'); setOutput('') }
  }
  return (
    <div className="sa-app">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={5} placeholder="テキスト、または Base64 文字列を入力" />
      <div className="sa-row">
        <button className="btn accent" onClick={() => run(true)}>エンコード（→Base64）</button>
        <button className="btn" onClick={() => run(false)}>デコード（Base64→）</button>
        <button className="btn" onClick={() => copyText(output)} disabled={!output}>結果をコピー</button>
      </div>
      {err && <p className="sa-note" style={{ color: '#dc2626' }}>{err}</p>}
      <textarea value={output} readOnly rows={5} placeholder="結果" className="sa-mono" />
      <p className="sa-note">日本語などのマルチバイト文字にも対応しています。</p>
    </div>
  )
}

/* ---------- URLエンコード ---------- */
export function UrlTool() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [err, setErr] = useState('')
  const run = (fn: (s: string) => string) => {
    try { setOutput(fn(input)); setErr('') } catch { setErr('デコードできませんでした。％エンコードされた文字列か確認してください。'); setOutput('') }
  }
  return (
    <div className="sa-app">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={4} placeholder="URLやテキストを入力" />
      <div className="sa-row">
        <button className="btn accent" onClick={() => run(encodeURIComponent)}>エンコード（部品用）</button>
        <button className="btn" onClick={() => run(encodeURI)}>エンコード（URL全体）</button>
        <button className="btn" onClick={() => run(decodeURIComponent)}>デコード</button>
        <button className="btn" onClick={() => copyText(output)} disabled={!output}>結果をコピー</button>
      </div>
      {err && <p className="sa-note" style={{ color: '#dc2626' }}>{err}</p>}
      <textarea value={output} readOnly rows={4} placeholder="結果" className="sa-mono" />
      <p className="sa-note">URLエンコード（パーセントエンコーディング）の変換ツールです。</p>
    </div>
  )
}

/* ---------- UUID生成 ---------- */
function genUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}
export function UuidGen() {
  const [count, setCount] = useState('5')
  const [list, setList] = useState<string[]>(() => Array.from({ length: 5 }, genUuid))
  const generate = () => {
    const n = Math.min(100, Math.max(1, Math.round(Number(count) || 1)))
    setList(Array.from({ length: n }, genUuid))
  }
  return (
    <div className="sa-app">
      <div className="sa-row">
        <label>個数 <input type="number" className="sa-num" value={count} onChange={(e) => setCount(e.target.value)} /></label>
        <button className="btn accent" onClick={generate}>生成する</button>
        <button className="btn" onClick={() => copyText(list.join('\n'))}>全部コピー</button>
      </div>
      <div className="sa-log">
        {list.map((u) => (
          <div key={u} className="sa-cardrow"><span className="sa-mono">{u}</span><button className="btn small" onClick={() => copyText(u)}>コピー</button></div>
        ))}
      </div>
      <p className="sa-note">UUID（バージョン4）を端末内で生成します。通信はしません。</p>
    </div>
  )
}

/* ---------- 簡易ハッシュ ---------- */
function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}
export function HashTool() {
  const [input, setInput] = useState('')
  const [sha, setSha] = useState('')
  useEffect(() => {
    let alive = true
    if (!input) { setSha(''); return }
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
      .then((buf) => { if (alive) setSha([...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')) })
      .catch(() => { if (alive) setSha('（計算できませんでした）') })
    return () => { alive = false }
  }, [input])
  return (
    <div className="sa-app">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={4} placeholder="ハッシュを計算したいテキスト" />
      <div className="sa-log">
        <div className="sa-cardrow"><span>SHA-256</span><b className="sa-mono" style={{ fontSize: 11 }}>{input ? sha : '―'}</b></div>
        <div className="sa-cardrow"><span>djb2</span><b className="sa-mono">{input ? djb2(input) : '―'}</b></div>
        <div className="sa-cardrow"><span>FNV-1a</span><b className="sa-mono">{input ? fnv1a(input) : '―'}</b></div>
      </div>
      <p className="sa-note">SHA-256はブラウザ標準機能で計算します。djb2／FNV-1aは簡易チェック用です（パスワード保存には使わないでください）。</p>
    </div>
  )
}

/* ---------- パスワード強度 ---------- */
export function PassCheck() {
  const [pw, setPw] = useState('')
  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/[0-9]/.test(pw)) pool += 10
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33
  const entropy = pool > 0 ? Math.round(pw.length * Math.log2(pool)) : 0
  const score = pw.length === 0 ? 0 : entropy < 35 ? 1 : entropy < 55 ? 2 : entropy < 80 ? 3 : 4
  const labels = ['―', '弱い', 'ふつう', '強い', 'とても強い']
  const colors = ['#e5e7eb', '#ef4444', '#f59e0b', '#22c55e', '#16a34a']
  return (
    <div className="sa-app">
      <input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="チェックしたいパスワードを入力" autoComplete="off" />
      <div style={{ display: 'flex', gap: 6 }}>
        {[1, 2, 3, 4].map((i) => <div key={i} style={{ flex: 1, height: 10, borderRadius: 5, background: i <= score ? colors[score] : '#e5e7eb' }} />)}
      </div>
      <div className="sa-stats">
        <span>強さ <b>{labels[score]}</b></span>
        <span>長さ <b>{pw.length}</b> 文字</span>
        <span>推定エントロピー <b>{entropy}</b> ビット</span>
      </div>
      <p className="sa-note">入力したパスワードは端末の外に送信されません。長くて文字の種類が多いほど強くなります。よくある単語や誕生日は避けましょう。</p>
    </div>
  )
}

/* ---------- ライト ---------- */
export function Flashlight() {
  const [on, setOn] = useState(false)
  const [warm, setWarm] = useState(false)
  return (
    <div className="sa-app">
      <div style={{ height: 280, borderRadius: 12, border: '1px solid #cbd5e1', background: on ? (warm ? '#fde68a' : '#ffffff') : '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .2s' }}>
        <span style={{ fontSize: 40 }}>{on ? '💡' : '🌙'}</span>
      </div>
      <div className="sa-row sa-center">
        <button className="btn accent" onClick={() => setOn(!on)}>{on ? '消す' : '点ける'}</button>
        <button className={`btn ${warm ? 'accent' : ''}`} onClick={() => setWarm(!warm)}>暖色</button>
      </div>
      <p className="sa-note">画面を明るく光らせる簡易ライトです。暗い場所での手元照らしにどうぞ（端末の画面の明るさ設定も上げると効果的です）。</p>
    </div>
  )
}

/* ---------- 定規 ---------- */
export function Ruler() {
  const [pxPerCm, setPxPerCm] = useState(() => load('webx-ruler-scale', 37.8))
  const setScale = (v: number) => { setPxPerCm(v); save('webx-ruler-scale', v) }
  const ticks = []
  for (let mm = 0; mm <= 150; mm++) {
    const isCm = mm % 10 === 0
    const is5 = mm % 5 === 0
    ticks.push(
      <div key={mm} style={{ position: 'absolute', left: mm * pxPerCm / 10, top: 0, width: 1, height: isCm ? 26 : is5 ? 18 : 11, background: '#334155' }}>
        {isCm && <span style={{ position: 'absolute', top: 28, left: -4, fontSize: 11 }}>{mm / 10}</span>}
      </div>,
    )
  }
  return (
    <div className="sa-app">
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div style={{ position: 'relative', width: 150 * pxPerCm / 10 + 2, height: 52, background: '#fef9c3', border: '1px solid #eab308', borderRadius: 6 }}>{ticks}</div>
      </div>
      <div className="sa-row">
        <label>目盛りの調整 <input type="range" min={25} max={55} step={0.1} value={pxPerCm} onChange={(e) => setScale(Number(e.target.value))} /></label>
        <span className="sa-note">1cm = {pxPerCm.toFixed(1)}px</span>
      </div>
      <p className="sa-note">画面に実物を当てて測る定規です。端末によって表示サイズが違うため、最初に本物の定規で「1cm」の長さを調整してください。調整値は保存されます。</p>
    </div>
  )
}

/* ---------- ミラー ---------- */
export function Mirror() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [on, setOn] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()) }, [])
  const start = async () => {
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setOn(true)
    } catch {
      setErr('カメラの使用が許可されませんでした。ブラウザの設定でこのサイトのカメラを許可してください。')
    }
  }
  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setOn(false)
  }
  return (
    <div className="sa-app">
      <div style={{ background: '#0f172a', borderRadius: 12, overflow: 'hidden', minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', maxHeight: 340, transform: 'scaleX(-1)', display: on ? 'block' : 'none' }} />
        {!on && <span style={{ color: '#94a3b8', fontSize: 40 }}>🪞</span>}
      </div>
      {err && <p className="sa-note" style={{ color: '#dc2626' }}>{err}</p>}
      <div className="sa-row sa-center">
        {on ? <button className="btn" onClick={stop}>カメラを止める</button> : <button className="btn accent" onClick={start}>カメラを起動</button>}
      </div>
      <p className="sa-note">内側カメラの映像を鏡のように左右反転して表示します。映像は端末の外に送信されません。</p>
    </div>
  )
}

/* ---------- ボイスレコーダー ---------- */
export function VoiceRec() {
  const [recording, setRecording] = useState(false)
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const start = async () => {
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return URL.createObjectURL(new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' }))
        })
        setRecording(false)
      }
      mrRef.current = mr
      mr.start()
      setRecording(true)
    } catch {
      setErr('マイクの使用が許可されませんでした。ブラウザの設定でこのサイトのマイクを許可してください。')
    }
  }
  const stop = () => mrRef.current?.stop()
  return (
    <div className="sa-app">
      <div className="sa-center-col">
        <div className="sa-big">{recording ? '🔴 録音中…' : '🎙️ ボイスレコーダー'}</div>
        {recording
          ? <button className="btn accent" onClick={stop}>⏹ 停止する</button>
          : <button className="btn accent" onClick={start}>⏺ 録音をはじめる</button>}
      </div>
      {err && <p className="sa-note" style={{ color: '#dc2626' }}>{err}</p>}
      {url && !recording && (
        <div className="sa-log">
          <audio src={url} controls style={{ width: '100%' }} />
          <a className="btn" href={url} download="webx-voice.webm" style={{ textAlign: 'center', textDecoration: 'none' }}>音声を保存する</a>
        </div>
      )}
      <p className="sa-note">録音した音声はこの画面の中だけにあり、外部に送信されません。必要な場合は「音声を保存する」からダウンロードしてください。</p>
    </div>
  )
}

/* ---------- あみだくじ ---------- */
interface AmidaState { names: string[]; prizes: string[]; rungs: boolean[][] }
function amidaRun(names: string[], prizes: string[]): AmidaState {
  const n = names.length
  const levels = 8
  const rungs: boolean[][] = []
  for (let lv = 0; lv < levels; lv++) {
    const row: boolean[] = Array(Math.max(0, n - 1)).fill(false)
    for (let i = 0; i < n - 1; i++) {
      if (Math.random() < 0.45 && (i === 0 || !row[i - 1])) row[i] = true
    }
    rungs.push(row)
  }
  return { names, prizes, rungs }
}
function amidaResult(state: AmidaState, start: number): number {
  let pos = start
  state.rungs.forEach((row) => {
    if (pos > 0 && row[pos - 1]) pos--
    else if (pos < row.length && row[pos]) pos++
  })
  return pos
}
export function Amida() {
  const [namesText, setNamesText] = useState('Aさん\nBさん\nCさん\nDさん')
  const [prizesText, setPrizesText] = useState('1等\n2等\n3等\n4等')
  const [state, setState] = useState<AmidaState | null>(null)
  const [err, setErr] = useState('')
  const run = () => {
    const names = namesText.split('\n').map((s) => s.trim()).filter(Boolean)
    const prizes = prizesText.split('\n').map((s) => s.trim()).filter(Boolean)
    if (names.length < 2 || names.length > 8) { setErr('参加者は2〜8人で入力してください。'); return }
    if (prizes.length !== names.length) { setErr('景品の数は参加者と同じにしてください。'); return }
    setErr('')
    setState(amidaRun(names, prizes))
  }
  const W = state ? Math.max(320, state.names.length * 70) : 320
  const colX = (i: number) => 40 + i * ((W - 80) / Math.max(1, (state?.names.length ?? 2) - 1))
  return (
    <div className="sa-app">
      <div className="sa-row" style={{ alignItems: 'flex-start' }}>
        <label style={{ flex: 1 }}>参加者（1行に1人）<textarea value={namesText} onChange={(e) => setNamesText(e.target.value)} rows={4} style={{ width: '100%' }} /></label>
        <label style={{ flex: 1 }}>景品（1行に1つ）<textarea value={prizesText} onChange={(e) => setPrizesText(e.target.value)} rows={4} style={{ width: '100%' }} /></label>
      </div>
      <button className="btn accent" onClick={run}>あみだを作る</button>
      {err && <p className="sa-note" style={{ color: '#dc2626' }}>{err}</p>}
      {state && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <svg width={W} height={300} style={{ background: '#f8fafc', borderRadius: 10 }}>
              {state.names.map((nm, i) => (
                <g key={i}>
                  <text x={colX(i)} y={20} textAnchor="middle" fontSize={12} fontWeight={700}>{nm}</text>
                  <line x1={colX(i)} y1={28} x2={colX(i)} y2={258} stroke="#334155" strokeWidth={2} />
                  <text x={colX(i)} y={282} textAnchor="middle" fontSize={12}>{state.prizes[i]}</text>
                </g>
              ))}
              {state.rungs.map((row, lv) => row.map((on, i) => on
                ? <line key={`${lv}-${i}`} x1={colX(i)} y1={52 + lv * 26} x2={colX(i + 1)} y2={52 + lv * 26} stroke="#ef4444" strokeWidth={3} />
                : null))}
            </svg>
          </div>
          <div className="sa-log">
            {state.names.map((nm, i) => (
              <div key={i} className="sa-cardrow"><span>{nm}</span><b>→ {state.prizes[amidaResult(state, i)]}</b></div>
            ))}
          </div>
        </>
      )}
      <p className="sa-note">横線はランダムに引かれます。結果は下の一覧で確認できます。</p>
    </div>
  )
}

/* ---------- チーム分け ---------- */
export function Teams() {
  const [text, setText] = useState('')
  const [teamCount, setTeamCount] = useState('2')
  const [teams, setTeams] = useState<string[][]>([])
  const [err, setErr] = useState('')
  const run = () => {
    const names = text.split('\n').map((s) => s.trim()).filter(Boolean)
    const n = Math.round(Number(teamCount) || 0)
    if (names.length < 2) { setErr('名前を2人以上入力してください。'); return }
    if (n < 2 || n > names.length) { setErr('チーム数は2以上、人数以下にしてください。'); return }
    setErr('')
    const mixed = shuffle(names)
    const out: string[][] = Array.from({ length: n }, () => [])
    mixed.forEach((nm, i) => out[i % n].push(nm))
    setTeams(out)
  }
  return (
    <div className="sa-app">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={'名前を1行に1人ずつ入力\n例）\n田中\n佐藤\n鈴木\n高橋'} />
      <div className="sa-row">
        <label>チーム数 <input type="number" className="sa-num" value={teamCount} onChange={(e) => setTeamCount(e.target.value)} /></label>
        <button className="btn accent" onClick={run}>チーム分けする</button>
      </div>
      {err && <p className="sa-note" style={{ color: '#dc2626' }}>{err}</p>}
      <div className="sa-log">
        {teams.map((t, i) => (
          <div key={i} className="sa-cardrow"><span><b>チーム{i + 1}</b>（{t.length}人）</span><b>{t.join('、')}</b></div>
        ))}
      </div>
      <p className="sa-note">名前をシャッフルして均等に振り分けます。もう一度押すと分け直します。</p>
    </div>
  )
}

/* ---------- スコアボード ---------- */
interface SBPlayer { id: number; name: string; score: number }
export function Scoreboard() {
  const [players, setPlayers] = useState<SBPlayer[]>(() => load('webx-scoreboard', [
    { id: 1, name: 'プレイヤー1', score: 0 }, { id: 2, name: 'プレイヤー2', score: 0 },
  ]))
  const persist = (next: SBPlayer[]) => { setPlayers(next); save('webx-scoreboard', next) }
  const sorted = players.slice().sort((a, b) => b.score - a.score)
  return (
    <div className="sa-app">
      <div className="sa-log">
        {sorted.map((p, rank) => (
          <div key={p.id} className="sa-cardrow">
            <span>{rank + 1}位 <input type="text" value={p.name} style={{ width: 110 }} onChange={(e) => persist(players.map((x) => x.id === p.id ? { ...x, name: e.target.value } : x))} /></span>
            <span className="sa-row">
              <button className="btn small" onClick={() => persist(players.map((x) => x.id === p.id ? { ...x, score: x.score - 1 } : x))}>−1</button>
              <b className="sa-big">{p.score}</b>
              <button className="btn small" onClick={() => persist(players.map((x) => x.id === p.id ? { ...x, score: x.score + 1 } : x))}>＋1</button>
              <button className="btn small" onClick={() => persist(players.map((x) => x.id === p.id ? { ...x, score: x.score + 5 } : x))}>＋5</button>
              <button className="btn small" onClick={() => persist(players.filter((x) => x.id !== p.id))}>削除</button>
            </span>
          </div>
        ))}
      </div>
      <div className="sa-row">
        <button className="btn" onClick={() => persist([...players, { id: Date.now(), name: `プレイヤー${players.length + 1}`, score: 0 }])}>プレイヤーを追加</button>
        <button className="btn" onClick={() => persist(players.map((p) => ({ ...p, score: 0 })))}>スコアをリセット</button>
      </div>
      <p className="sa-note">ゲームの得点管理に。スコア順に並び替え表示され、端末内に保存されます。</p>
    </div>
  )
}

/* ---------- トーナメント表 ---------- */
interface TourneyState { players: string[]; winners: (string | null)[][] }
export function Tournament() {
  const [text, setText] = useState('')
  const [state, setState] = useState<TourneyState | null>(() => load<TourneyState | null>('webx-tournament', null))
  const [err, setErr] = useState('')
  const persist = (next: TourneyState | null) => { setState(next); save('webx-tournament', next) }
  const start = () => {
    const names = text.split('\n').map((s) => s.trim()).filter(Boolean)
    if (names.length !== 4 && names.length !== 8) { setErr('参加者は4人または8人ちょうどで入力してください。'); return }
    setErr('')
    const players = shuffle(names)
    const rounds = Math.log2(players.length)
    const winners: (string | null)[][] = Array.from({ length: rounds }, (_, r) => Array(players.length / 2 ** (r + 1)).fill(null))
    persist({ players, winners })
  }
  const roundPlayers = (st: TourneyState, r: number): string[] => (r === 0 ? st.players : (st.winners[r - 1] as string[]))
  const pick = (r: number, m: number, name: string) => {
    if (!state) return
    const next: TourneyState = { players: state.players, winners: state.winners.map((row) => row.slice()) }
    next.winners[r][m] = name
    // その先のラウンドで、その試合由来の勝者が変わったら下流をリセット
    for (let rr = r + 1; rr < next.winners.length; rr++) next.winners[rr] = next.winners[rr].map(() => null)
    persist(next)
  }
  const champion = state && state.winners.length > 0 ? state.winners[state.winners.length - 1][0] : null
  return (
    <div className="sa-app">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={'参加者を1行に1人（4人か8人）\n例）\nA\nB\nC\nD'} />
      <div className="sa-row">
        <button className="btn accent" onClick={start}>トーナメントを作る</button>
        {state && <button className="btn" onClick={() => persist(null)}>表を消す</button>}
      </div>
      {err && <p className="sa-note" style={{ color: '#dc2626' }}>{err}</p>}
      {state && state.winners.map((row, r) => (
        <div key={r} className="sa-log">
          <h3 className="sa-h">{r === state.winners.length - 1 ? '決勝' : `${r + 1}回戦`}</h3>
          {row.map((win, m) => {
            const ps = roundPlayers(state, r)
            const a = ps[m * 2]; const b = ps[m * 2 + 1]
            return (
              <div key={m} className="sa-cardrow">
                <span className="sa-row">
                  <button className={`btn small ${win === a && a ? 'accent' : ''}`} disabled={!a} onClick={() => a && pick(r, m, a)}>{a ?? '（未定）'}</button>
                  <span className="sa-vs">vs</span>
                  <button className={`btn small ${win === b && b ? 'accent' : ''}`} disabled={!b} onClick={() => b && pick(r, m, b)}>{b ?? '（未定）'}</button>
                </span>
                <b>{win ? `勝者：${win}` : ''}</b>
              </div>
            )
          })}
        </div>
      ))}
      {champion && <div className="sa-big" style={{ textAlign: 'center' }}>🏆 優勝：{champion}</div>}
      <p className="sa-note">勝った人の名前を押すと次のラウンドに進みます。表は端末内に保存されます。</p>
    </div>
  )
}
