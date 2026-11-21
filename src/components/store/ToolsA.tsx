import { useEffect, useMemo, useRef, useState } from 'react'

/* ---------- パスワード生成 ---------- */
export function PassGen() {
  const [len, setLen] = useState(16)
  const [opts, setOpts] = useState({ lower: true, upper: true, digits: true, symbols: false })
  const [pw, setPw] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const generate = () => {
    let chars = ''
    if (opts.lower) chars += 'abcdefghijkmnopqrstuvwxyz'
    if (opts.upper) chars += 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    if (opts.digits) chars += '23456789'
    if (opts.symbols) chars += '!@#$%^&*()-_=+[]{}'
    if (!chars) return
    const arr = new Uint32Array(len)
    crypto.getRandomValues(arr)
    const out = Array.from(arr, (n) => chars[n % chars.length]).join('')
    setPw(out)
    setHistory((h) => [out, ...h].slice(0, 8))
  }
  return (
    <div className="sa-app">
      <div className="sa-pw">{pw || '生成ボタンを押してください'}</div>
      <div className="sa-row">
        <label>長さ {len}
          <input type="range" min={8} max={64} value={len} onChange={(e) => setLen(Number(e.target.value))} />
        </label>
      </div>
      <div className="sa-row">
        {([['lower', '小文字'], ['upper', '大文字'], ['digits', '数字'], ['symbols', '記号']] as const).map(([k, label]) => (
          <label key={k} className="sa-check">
            <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {label}
          </label>
        ))}
      </div>
      <div className="sa-row">
        <button className="btn accent" onClick={generate}>生成</button>
        {pw && <button className="btn" onClick={() => void navigator.clipboard?.writeText(pw)}>コピー</button>}
      </div>
      {history.length > 0 && <div className="sa-log">{history.map((h, i) => <div key={i} className="sa-mono">{h}</div>)}</div>}
      <p className="sa-note">生成は端末内だけで行われ、履歴もこの画面を閉じると消えます。</p>
    </div>
  )
}

/* ---------- 文字数カウント ---------- */
export function TextCount() {
  const [text, setText] = useState('')
  const stats = useMemo(() => ({
    chars: text.length,
    noSpace: text.replace(/\s/g, '').length,
    words: text.trim() === '' ? 0 : text.trim().split(/\s+/).length,
    lines: text === '' ? 0 : text.split('\n').length,
    bytes: new TextEncoder().encode(text).length,
  }), [text])
  return (
    <div className="sa-app">
      <textarea className="sa-textarea" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder="ここにテキストを入力" />
      <div className="sa-stats">
        <span>文字数 <b>{stats.chars}</b></span>
        <span>空白除く <b>{stats.noSpace}</b></span>
        <span>単語 <b>{stats.words}</b></span>
        <span>行 <b>{stats.lines}</b></span>
        <span>バイト(UTF-8) <b>{stats.bytes}</b></span>
      </div>
    </div>
  )
}

/* ---------- カラーピッカー ---------- */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  else if (max === gn) h = ((bn - rn) / d + 2) * 60
  else h = ((rn - gn) / d + 4) * 60
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
}
export function ColorPicker() {
  const [hex, setHex] = useState('#3b82f6')
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  const [h, s, l] = rgbToHsl(r, g, b)
  const shades = [90, 70, 50, 30, 12].map((lv) => `hsl(${h} ${s}% ${lv}%)`)
  const copy = (v: string) => void navigator.clipboard?.writeText(v)
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} className="sa-color-input" />
        <div className="sa-swatch" style={{ background: hex }} />
      </div>
      <div className="sa-stats sa-col">
        <button className="sa-copyrow" onClick={() => copy(hex)}>HEX　<b>{hex}</b>（タップでコピー）</button>
        <button className="sa-copyrow" onClick={() => copy(`rgb(${r}, ${g}, ${b})`)}>RGB　<b>rgb({r}, {g}, {b})</b></button>
        <button className="sa-copyrow" onClick={() => copy(`hsl(${h}, ${s}%, ${l}%)`)}>HSL　<b>hsl({h}, {s}%, {l}%)</b></button>
      </div>
      <div>
        <p className="sa-note">同じ色の濃淡</p>
        <div className="sa-row">{shades.map((c) => <div key={c} className="sa-swatch small" style={{ background: c }} title={c} />)}</div>
      </div>
    </div>
  )
}

/* ---------- モールス信号 ---------- */
const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.', ' ': '/',
}
/* モールス音声は WAV をその場で合成し、音声ファイルとして再生する。
   Web Audio（AudioContext）経由では音が出ない端末・環境があるための方式。
   音楽アプリ等と同じメディア再生の経路を使う。 */
const MORSE_SR = 22050
function encodeWav(samples: number[]): string {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const wstr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
  wstr(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); wstr(8, 'WAVE'); wstr(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, MORSE_SR, true); v.setUint32(28, MORSE_SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  wstr(36, 'data'); v.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true))
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}
function morseWavUrl(code: string): string {
  const unit = 0.09
  const freq = 660
  const samples: number[] = []
  const pushSilence = (sec: number) => { const n = Math.floor(MORSE_SR * sec); for (let i = 0; i < n; i++) samples.push(0) }
  const pushTone = (sec: number) => {
    const n = Math.floor(MORSE_SR * sec)
    const fade = Math.max(1, Math.floor(MORSE_SR * 0.005))
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / fade, (n - i) / fade)
      samples.push(Math.sin(2 * Math.PI * freq * i / MORSE_SR) * 0.5 * env)
    }
  }
  for (const ch of code) {
    if (ch === ' ') { pushSilence(unit * 3); continue }
    if (ch === '/') { pushSilence(unit * 4); continue }
    pushTone(ch === '.' ? unit : unit * 3)
    pushSilence(unit)
  }
  pushSilence(0.05)
  return encodeWav(samples)
}
function toneLoopUrl(): string {
  // 660Hz × 1秒 ＝ ちょうど660周期で継ぎ目なくループする
  const samples: number[] = []
  for (let i = 0; i < MORSE_SR; i++) samples.push(Math.sin(2 * Math.PI * 660 * i / MORSE_SR) * 0.5)
  return encodeWav(samples)
}
export function Morse() {
  const [text, setText] = useState('SOS')
  const [playing, setPlaying] = useState(false)
  const [msg, setMsg] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const keyAudioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const keyUrlRef = useRef<string | null>(null)
  const code = text.toUpperCase().split('').map((c) => MORSE[c] ?? '').filter(Boolean).join(' ')
  useEffect(() => () => {
    audioRef.current?.pause()
    keyAudioRef.current?.pause()
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    if (keyUrlRef.current) URL.revokeObjectURL(keyUrlRef.current)
  }, [])
  const play = async () => {
    if (playing || !code) return
    try {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = morseWavUrl(code)
      urlRef.current = url
      audioRef.current ??= new Audio()
      const a = audioRef.current
      a.src = url
      a.onended = () => setPlaying(false)
      setPlaying(true)
      await a.play()
      setMsg('')
    } catch (e) {
      setPlaying(false)
      setMsg(`再生できませんでした（${e instanceof Error ? e.name : 'エラー'}）。端末のメディア音量を確認してみてください`)
    }
  }
  const keyDown = async () => {
    try {
      if (!keyUrlRef.current) keyUrlRef.current = toneLoopUrl()
      keyAudioRef.current ??= new Audio()
      const a = keyAudioRef.current
      if (!a.src) { a.src = keyUrlRef.current; a.loop = true }
      await a.play()
      setMsg('')
    } catch (e) {
      setMsg(`再生できませんでした（${e instanceof Error ? e.name : 'エラー'}）。端末のメディア音量を確認してみてください`)
    }
  }
  const keyUp = () => {
    const a = keyAudioRef.current
    if (!a) return
    a.pause()
    a.currentTime = 0
  }
  return (
    <div className="sa-app">
      <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="英数字で入力（例: SOS）" />
      <div className="sa-morse">{code || '—'}</div>
      <div className="sa-row">
        <button className="btn accent" onClick={() => void play()} disabled={playing || !code}>{playing ? '再生中…' : '音で再生'}</button>
        <button className="btn" style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
          onPointerDown={(e) => { e.preventDefault(); void keyDown() }}
          onPointerUp={keyUp} onPointerLeave={keyUp} onPointerCancel={keyUp}
          onContextMenu={(e) => e.preventDefault()}>
          🔑 電鍵（押している間鳴る）
        </button>
      </div>
      {msg && <p className="sa-note" style={{ color: '#dc2626' }}>{msg}</p>}
      <p className="sa-note">対応は A〜Z と 0〜9 とスペースのみです。再生は音声ファイル（WAV）をメディア再生する方式です。音が出ないときは端末のメディア音量も確認してみてください。電鍵ボタンで音が出るか試せます。</p>
    </div>
  )
}
