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
export function Morse() {
  const [text, setText] = useState('SOS')
  const [playing, setPlaying] = useState(false)
  const [msg, setMsg] = useState('')
  const ctxRef = useRef<AudioContext | null>(null)
  const keyerRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null)
  const code = text.toUpperCase().split('').map((c) => MORSE[c] ?? '').filter(Boolean).join(' ')
  useEffect(() => () => { void ctxRef.current?.close().catch(() => undefined) }, [])
  const ensureCtx = (): AudioContext | null => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctxRef.current ??= new AC()
      return ctxRef.current
    } catch { return null }
  }
  const keyer = (ctx: AudioContext) => {
    if (!keyerRef.current) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 660
      const gain = ctx.createGain()
      gain.gain.value = 0
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start()
      keyerRef.current = { osc, gain }
    }
    return keyerRef.current
  }
  const play = async () => {
    if (playing) return
    const ctx = ensureCtx()
    if (!ctx) { setMsg('この端末・ブラウザでは音声（Web Audio）が使えませんでした'); return }
    await ctx.resume()
    if (ctx.state !== 'running') { setMsg('音声を開始できませんでした。もう一度「音で再生」を押してみてください'); return }
    setMsg('')
    const { gain } = keyer(ctx)
    setPlaying(true)
    const unit = 0.09
    let t = ctx.currentTime + 0.06
    const g = gain.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(0, t)
    for (const ch of code) {
      if (ch === ' ') { t += unit * 3; continue }
      if (ch === '/') { t += unit * 4; continue }
      const dur = ch === '.' ? unit : unit * 3
      g.setValueAtTime(0.5, t)
      g.setValueAtTime(0.5, Math.max(t, t + dur - 0.008))
      g.setValueAtTime(0, t + dur)
      t += dur + unit
    }
    window.setTimeout(() => setPlaying(false), (t - ctx.currentTime) * 1000 + 80)
  }
  const keyDown = async () => {
    const ctx = ensureCtx()
    if (!ctx) { setMsg('この端末・ブラウザでは音声（Web Audio）が使えませんでした'); return }
    await ctx.resume()
    if (ctx.state !== 'running') { setMsg('音声を開始できませんでした。もう一度押してみてください'); return }
    setMsg('')
    keyer(ctx).gain.gain.setTargetAtTime(0.5, ctx.currentTime, 0.005)
  }
  const keyUp = () => {
    const ctx = ctxRef.current
    if (!ctx || !keyerRef.current) return
    keyerRef.current.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.005)
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
      <p className="sa-note">対応は A〜Z と 0〜9 とスペースのみです。音が出ないときは端末のメディア音量も確認してみてください。電鍵ボタンで音が出るか試せます。</p>
    </div>
  )
}
