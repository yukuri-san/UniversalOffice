import { useEffect, useRef, useState } from 'react'

/* センサー系＋速度テスト（v1.22.0ex 追加のストアアプリ） */

type OrientEvent = DeviceOrientationEvent & { webkitCompassHeading?: number }
interface OrientCtor { requestPermission?: () => Promise<'granted' | 'denied'> }

function useOrientation() {
  const [data, setData] = useState<{ alpha: number | null; beta: number | null; gamma: number | null; heading: number | null }>({ alpha: null, beta: null, gamma: null, heading: null })
  const [needPerm, setNeedPerm] = useState(false)
  const [listening, setListening] = useState(false)
  useEffect(() => {
    const ctor = DeviceOrientationEvent as unknown as OrientCtor
    if (typeof ctor.requestPermission === 'function') setNeedPerm(true)
  }, [])
  const start = async () => {
    const ctor = DeviceOrientationEvent as unknown as OrientCtor
    if (typeof ctor.requestPermission === 'function') {
      const res = await ctor.requestPermission().catch(() => 'denied' as const)
      if (res !== 'granted') return
    }
    const on = (e: DeviceOrientationEvent) => {
      const ev = e as OrientEvent
      const heading = typeof ev.webkitCompassHeading === 'number' ? ev.webkitCompassHeading : (ev.alpha !== null ? (360 - ev.alpha) % 360 : null)
      setData({ alpha: ev.alpha, beta: ev.beta, gamma: ev.gamma, heading })
    }
    window.addEventListener('deviceorientationabsolute', on as EventListener)
    window.addEventListener('deviceorientation', on as EventListener)
    setListening(true)
    setNeedPerm(false)
  }
  return { data, needPerm, listening, start }
}

export function LevelApp() {
  const { data, needPerm, listening, start } = useOrientation()
  const beta = data.beta ?? 0
  const gamma = data.gamma ?? 0
  const level = Math.abs(beta) < 1.5 && Math.abs(gamma) < 1.5
  const bx = Math.max(-64, Math.min(64, gamma * 2.2))
  const by = Math.max(-64, Math.min(64, beta * 2.2))
  return (
    <div className="wxapp sensor-app">
      <p className="wxapp-note">端末の傾きを測る水平器です。机などに置いて使ってください。</p>
      {(!listening) && <button className="btn primary" onClick={() => void start()}>{needPerm ? 'センサーの許可をして開始' : '測定開始'}</button>}
      <div className={`level-disc ${level ? 'ok' : ''}`}>
        <div className="level-cross-h" /><div className="level-cross-v" />
        <div className="level-bubble" style={{ transform: `translate(calc(-50% + ${bx}px), calc(-50% + ${by}px))` }} />
      </div>
      <p className="sensor-big">{level ? '水平です ✓' : `前後 ${beta.toFixed(1)}° ／ 左右 ${gamma.toFixed(1)}°`}</p>
    </div>
  )
}

const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西']
export function CompassApp() {
  const { data, needPerm, listening, start } = useOrientation()
  const heading = data.heading
  return (
    <div className="wxapp sensor-app">
      <p className="wxapp-note">端末の向いている方角を表示します。8の字に振ると精度が上がります。</p>
      {(!listening) && <button className="btn primary" onClick={() => void start()}>{needPerm ? 'センサーの許可をして開始' : '測定開始'}</button>}
      <div className="compass-disc">
        <div className="compass-dial" style={{ transform: `rotate(${heading !== null ? -heading : 0}deg)` }}>
          <span className="compass-n">N</span><span className="compass-e">E</span>
          <span className="compass-s">S</span><span className="compass-w">W</span>
        </div>
        <div className="compass-needle" />
      </div>
      <p className="sensor-big">{heading !== null ? `${Math.round(heading)}° ${DIRS[Math.round(heading / 45) % 8]}` : '— °'}</p>
    </div>
  )
}

export function NoiseApp() {
  const [db, setDb] = useState<number | null>(null)
  const [max, setMax] = useState(0)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef(0)

  const stop = () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    void ctxRef.current?.close().catch(() => { /* ignore */ })
    streamRef.current = null
    ctxRef.current = null
    setRunning(false)
  }
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    void ctxRef.current?.close().catch(() => { /* ignore */ })
  }, [])

  const start = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = new AudioContext()
      ctxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      src.connect(analyser)
      const buf = new Float32Array(analyser.fftSize)
      const tick = () => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        const rms = Math.sqrt(sum / buf.length)
        const level = rms > 0 ? Math.max(0, Math.round(20 * Math.log10(rms) + 95)) : 0
        setDb(level)
        setMax((m) => Math.max(m, level))
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
      setRunning(true)
    } catch { setError('マイクを使えませんでした（許可が必要です）') }
  }

  const label = db === null ? '' : db < 40 ? '静か' : db < 60 ? '普通の会話くらい' : db < 80 ? 'にぎやか' : 'かなりうるさい'
  return (
    <div className="wxapp sensor-app">
      <p className="wxapp-note">マイクで周りの音の大きさを測ります（目安値で、専門の騒音計とは誤差があります）。音声は録音・送信されません。</p>
      {error && <p className="wxapp-error">{error}</p>}
      <p className="sensor-big">{db !== null ? `${db} dB` : '— dB'}</p>
      <p className="wxapp-note">{label}{running && ` ／ 最大 ${max} dB`}</p>
      <div className="noise-bar"><span style={{ width: `${Math.min(100, db ?? 0)}%` }} /></div>
      {running
        ? <button className="btn" onClick={stop}>停止</button>
        : <button className="btn primary" onClick={() => void start()}>測定開始</button>}
    </div>
  )
}

interface SpeedResult { ping: number; down: number; up: number; at: string }
export function SpeedTestApp() {
  const [phase, setPhase] = useState('')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<SpeedResult | null>(() => {
    try { return JSON.parse(localStorage.getItem('webx-speed-last') ?? 'null') as SpeedResult | null } catch { return null }
  })
  const [error, setError] = useState('')

  const run = async () => {
    setError('')
    setResult(null)
    try {
      // Ping（3回の平均）
      setPhase('応答速度を測定中…')
      const pings: number[] = []
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now()
        await fetch('https://speed.cloudflare.com/__down?bytes=0', { cache: 'no-store' })
        pings.push(performance.now() - t0)
        setProgress((i + 1) / 3 * 20)
      }
      const ping = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length)
      // Download（10MB をストリームで読みながら計測）
      setPhase('ダウンロード速度を測定中…')
      const bytes = 10_000_000
      const t0 = performance.now()
      const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}`, { cache: 'no-store' })
      if (!res.body) throw new Error('no body')
      const reader = res.body.getReader()
      let received = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        received += value?.length ?? 0
        setProgress(20 + (received / bytes) * 50)
      }
      const downSec = (performance.now() - t0) / 1000
      const down = Math.round((received * 8 / downSec) / 1_000_000 * 10) / 10
      // Upload（2MB）
      setPhase('アップロード速度を測定中…')
      const payload = new Blob([new Uint8Array(2_000_000)], { type: 'application/octet-stream' })
      const t1 = performance.now()
      await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: payload })
      const upSec = (performance.now() - t1) / 1000
      const up = Math.round((2_000_000 * 8 / upSec) / 1_000_000 * 10) / 10
      setProgress(100)
      const r: SpeedResult = { ping, down, up, at: new Date().toLocaleString('ja-JP') }
      setResult(r)
      localStorage.setItem('webx-speed-last', JSON.stringify(r))
      setPhase('')
    } catch {
      setPhase('')
      setProgress(0)
      setError('測定できませんでした（通信環境を確認してください）')
    }
  }

  return (
    <div className="wxapp sensor-app">
      <p className="wxapp-note">通信速度を測定します（測定用サーバー Cloudflare を利用。約12MBの通信が発生します）。</p>
      {error && <p className="wxapp-error">{error}</p>}
      {phase && <p className="wxapp-note">{phase}</p>}
      {phase && <div className="noise-bar"><span style={{ width: `${progress}%` }} /></div>}
      {result && (
        <div className="speed-results">
          <div><span>応答速度</span><strong>{result.ping} ms</strong></div>
          <div><span>ダウンロード</span><strong>{result.down} Mbps</strong></div>
          <div><span>アップロード</span><strong>{result.up} Mbps</strong></div>
          <p className="wxapp-note">測定日時：{result.at}</p>
        </div>
      )}
      <button className="btn primary" onClick={() => void run()} disabled={!!phase}>{phase ? '測定中…' : '速度テスト開始'}</button>
    </div>
  )
}
