import { useEffect, useRef, useState } from 'react'
import { notifyOs } from '../../lib/notify'

function beep(freq = 880, dur = 0.15, when = 0) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = freq
    osc.connect(gain); gain.connect(ctx.destination)
    const t = ctx.currentTime + when
    osc.start(t); osc.stop(t + dur)
    window.setTimeout(() => void ctx.close(), (when + dur + 0.2) * 1000)
  } catch { /* 音が出ない環境では何もしない */ }
}
const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

/* ---------- ポモドーロ ---------- */
export function Pomodoro() {
  const [workMin, setWorkMin] = useState(25)
  const [breakMin, setBreakMin] = useState(5)
  const [phase, setPhase] = useState<'work' | 'break'>('work')
  const [left, setLeft] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [cycles, setCycles] = useState(0)
  const leftRef = useRef(left); leftRef.current = left
  const phaseRef = useRef(phase); phaseRef.current = phase
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      if (leftRef.current > 1) { setLeft(leftRef.current - 1); return }
      // フェーズ終了
      beep(880, 0.2); beep(880, 0.2, 0.3)
      if (phaseRef.current === 'work') {
        setCycles((c) => c + 1)
        notifyOs('ポモドーロ：作業が終わりました。休憩しましょう', 'pomodoro')
        setPhase('break'); setLeft(breakMin * 60)
      } else {
        notifyOs('ポモドーロ：休憩が終わりました。次の作業へ', 'pomodoro')
        setPhase('work'); setLeft(workMin * 60)
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [running, workMin, breakMin])
  const reset = () => { setRunning(false); setPhase('work'); setLeft(workMin * 60) }
  return (
    <div className="sa-app sa-center-col">
      <div className={phase === 'work' ? 'sa-phase work' : 'sa-phase rest'}>{phase === 'work' ? '🍅 作業中' : '☕ 休憩中'}</div>
      <div className="sa-timer">{mmss(left)}</div>
      <div className="sa-row sa-center">
        <button className="btn accent" onClick={() => setRunning((r) => !r)}>{running ? '一時停止' : 'スタート'}</button>
        <button className="btn" onClick={reset}>リセット</button>
      </div>
      <div className="sa-row sa-center">
        <label>作業 <input type="number" value={workMin} min={1} max={180} onChange={(e) => { const v = Number(e.target.value); setWorkMin(v); if (phase === 'work' && !running) setLeft(v * 60) }} className="sa-num" /> 分</label>
        <label>休憩 <input type="number" value={breakMin} min={1} max={60} onChange={(e) => { const v = Number(e.target.value); setBreakMin(v); if (phase === 'break' && !running) setLeft(v * 60) }} className="sa-num" /> 分</label>
      </div>
      <p className="sa-note">完了した作業サイクル：{cycles}</p>
    </div>
  )
}

/* ---------- メトロノーム ---------- */
export function Metronome() {
  const [bpm, setBpm] = useState(100)
  const [on, setOn] = useState(false)
  const [beat, setBeat] = useState(0)
  useEffect(() => {
    if (!on) return
    const id = window.setInterval(() => {
      beep(1200, 0.05)
      setBeat((b) => b + 1)
    }, 60000 / bpm)
    return () => window.clearInterval(id)
  }, [on, bpm])
  return (
    <div className="sa-app sa-center-col">
      <div className="sa-timer">{bpm} <span className="sa-unit">BPM</span></div>
      <div className={on && beat % 2 === 0 ? 'sa-beat on' : 'sa-beat'} />
      <input type="range" min={40} max={208} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="sa-range" />
      <div className="sa-row sa-center">
        <button className="btn" onClick={() => setBpm((b) => Math.max(40, b - 5))}>-5</button>
        <button className="btn accent" onClick={() => setOn((o) => !o)}>{on ? 'ストップ' : 'スタート'}</button>
        <button className="btn" onClick={() => setBpm((b) => Math.min(208, b + 5))}>+5</button>
      </div>
    </div>
  )
}

/* ---------- 環境音 ---------- */
type NoiseKind = 'white' | 'pink' | 'brown'
export function WhiteNoise() {
  const [kind, setKind] = useState<NoiseKind>('white')
  const [volume, setVolume] = useState(0.3)
  const [playing, setPlaying] = useState(false)
  const nodes = useRef<{ ctx: AudioContext; gain: GainNode; src: AudioBufferSourceNode } | null>(null)
  const stop = () => {
    if (nodes.current) {
      try { nodes.current.src.stop() } catch { /* noop */ }
      void nodes.current.ctx.close()
      nodes.current = null
    }
    setPlaying(false)
  }
  const start = (k: NoiseKind) => {
    stop()
    const ctx = new AudioContext()
    const len = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      if (k === 'white') data[i] = white
      else if (k === 'brown') { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5 }
      else { b0 = 0.997 * b0 + 0.029 * white; b1 = 0.985 * b1 + 0.032 * white; b2 = 0.95 * b2 + 0.048 * white; data[i] = (b0 + b1 + b2 + white * 0.05) * 0.7 }
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer; src.loop = true
    const gain = ctx.createGain()
    gain.gain.value = volume
    src.connect(gain); gain.connect(ctx.destination)
    src.start()
    nodes.current = { ctx, gain, src }
    setPlaying(true)
  }
  useEffect(() => () => { if (nodes.current) { try { nodes.current.src.stop() } catch { /* noop */ } void nodes.current.ctx.close() } }, [])
  useEffect(() => { if (nodes.current) nodes.current.gain.gain.value = volume }, [volume])
  return (
    <div className="sa-app">
      <div className="sa-row">
        {([['white', 'ホワイト（シャー）'], ['pink', 'ピンク（雨っぽい）'], ['brown', 'ブラウン（川・風）']] as [NoiseKind, string][]).map(([k, label]) => (
          <button key={k} className={kind === k ? 'chip on' : 'chip'} onClick={() => { setKind(k); if (playing) start(k) }}>{label}</button>
        ))}
      </div>
      <div className="sa-row">
        <button className="btn accent" onClick={() => (playing ? stop() : start(kind))}>{playing ? '停止' : '再生'}</button>
        <label>音量 <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} /></label>
      </div>
      <p className="sa-note">音は端末内で合成しています（録音ファイルは使いません）。</p>
    </div>
  )
}

/* ---------- 単語カード ---------- */
interface Card { front: string; back: string }
const KEY = 'webx-flashcards'
function loadCards(): Card[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((c) => c && typeof c.front === 'string') : []
  } catch { return [] }
}
export function Flashcards() {
  const [cards, setCards] = useState<Card[]>(loadCards)
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [study, setStudy] = useState(false)
  const [ioMsg, setIoMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const save = (next: Card[]) => { setCards(next); localStorage.setItem(KEY, JSON.stringify(next)) }
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(cards, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'webx-flashcards.json'
    a.click()
    URL.revokeObjectURL(a.href)
    setIoMsg(`書き出しました（${cards.length}枚）`)
  }
  const importJson = async (f: File) => {
    try {
      const v = JSON.parse(await f.text())
      const list: Card[] = (Array.isArray(v) ? v : []).filter((c) => c && typeof c.front === 'string' && typeof c.back === 'string')
        .map((c) => ({ front: c.front, back: c.back }))
      if (!list.length) { setIoMsg('読み込めるカードがありませんでした'); return }
      save([...cards, ...list])
      setIoMsg(`${list.length}枚を追加しました（合計 ${cards.length + list.length}枚）`)
    } catch { setIoMsg('JSON の読み込みに失敗しました') }
  }
  const add = () => {
    if (!front.trim() || !back.trim()) return
    save([...cards, { front: front.trim(), back: back.trim() }])
    setFront(''); setBack('')
  }
  const cur = cards[Math.min(idx, Math.max(0, cards.length - 1))]
  return (
    <div className="sa-app">
      <div className="sa-row">
        <button className={study ? 'chip' : 'chip on'} onClick={() => setStudy(false)}>カード管理（{cards.length}）</button>
        <button className={study ? 'chip on' : 'chip'} onClick={() => { setStudy(true); setFlipped(false) }} disabled={cards.length === 0}>学習モード</button>
      </div>
      {!study ? (
        <>
          <div className="sa-row">
            <input type="text" value={front} onChange={(e) => setFront(e.target.value)} placeholder="表（問題）" />
            <input type="text" value={back} onChange={(e) => setBack(e.target.value)} placeholder="裏（答え）" />
            <button className="btn accent" onClick={add}>追加</button>
          </div>
          <div className="sa-row">
            <button className="btn" onClick={exportJson} disabled={cards.length === 0}>⬇ JSON書き出し</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>⬆ JSON読み込み</button>
            <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = '' }} />
            {ioMsg && <span className="sa-note">{ioMsg}</span>}
          </div>
          <div className="sa-log">
            {cards.map((c, i) => (
              <div key={i} className="sa-cardrow">
                <span>{c.front} → {c.back}</span>
                <button className="btn small" onClick={() => save(cards.filter((_, j) => j !== i))}>削除</button>
              </div>
            ))}
            {cards.length === 0 && <p className="sa-note">まだカードがありません。</p>}
          </div>
        </>
      ) : cur ? (
        <>
          <button className="sa-flashcard" onClick={() => setFlipped((f) => !f)}>
            {flipped ? cur.back : cur.front}
            <span className="sa-flash-hint">{flipped ? '裏面（タップで表へ）' : '表面（タップで答え）'}</span>
          </button>
          <div className="sa-row sa-center">
            <button className="btn" onClick={() => { setIdx((i) => (i - 1 + cards.length) % cards.length); setFlipped(false) }}>← 前</button>
            <span>{Math.min(idx, cards.length - 1) + 1} / {cards.length}</span>
            <button className="btn" onClick={() => { setIdx((i) => (i + 1) % cards.length); setFlipped(false) }}>次 →</button>
          </div>
        </>
      ) : null}
    </div>
  )
}
