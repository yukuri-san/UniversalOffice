import { useEffect, useRef, useState } from 'react'
import { LOCALES, useLang } from '../lib/i18n'
import { notifyOs } from '../lib/notify'

const ZONES: { label: string; tz: string }[] = [
  { label: '東京', tz: 'Asia/Tokyo' },
  { label: 'ソウル', tz: 'Asia/Seoul' },
  { label: '北京', tz: 'Asia/Shanghai' },
  { label: 'バンコク', tz: 'Asia/Bangkok' },
  { label: 'ロンドン', tz: 'Europe/London' },
  { label: 'ニューヨーク', tz: 'America/New_York' },
  { label: 'ロサンゼルス', tz: 'America/Los_Angeles' },
  { label: 'シドニー', tz: 'Australia/Sydney' },
]

function fmtElapsed(ms: number): string {
  const total = Math.max(0, ms)
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const cs = Math.floor((total % 1000) / 10)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export default function ClockApp() {
  const { lang, t } = useLang()
  const [tab, setTab] = useState<'world' | 'stopwatch' | 'timer'>('world')
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 500)
    return () => window.clearInterval(id)
  }, [])

  // stopwatch
  const [swStart, setSwStart] = useState<number | null>(null)
  const [swAccum, setSwAccum] = useState(0)
  const [laps, setLaps] = useState<number[]>([])
  const swElapsed = swAccum + (swStart ? Date.now() - swStart : 0)

  // timer
  const [timerMin, setTimerMin] = useState('5')
  const [timerEnd, setTimerEnd] = useState<number | null>(null)
  const [timerLeft, setTimerLeft] = useState<number | null>(null)
  const timerDoneRef = useRef(false)

  useEffect(() => {
    if (!timerEnd) return
    const id = window.setInterval(() => {
      const left = timerEnd - Date.now()
      setTimerLeft(left)
      if (left <= 0 && !timerDoneRef.current) {
        timerDoneRef.current = true
        setTimerEnd(null)
        notifyOs(`⏰ ${t('timer')}`)
        try {
          const ctx = new AudioContext()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.frequency.value = 880
          gain.gain.setValueAtTime(0.15, ctx.currentTime)
          osc.start()
          osc.stop(ctx.currentTime + 0.6)
        } catch { /* ignore */ }
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [timerEnd, t])

  return (
    <div className="clock-app">
      <div className="docs-tabs">
        <button className={tab === 'world' ? 'on' : ''} onClick={() => setTab('world')}>{t('worldClock')}</button>
        <button className={tab === 'stopwatch' ? 'on' : ''} onClick={() => setTab('stopwatch')}>{t('stopwatch')}</button>
        <button className={tab === 'timer' ? 'on' : ''} onClick={() => setTab('timer')}>{t('timer')}</button>
      </div>

      {tab === 'world' && (
        <ul className="world-list">
          {ZONES.map((z) => (
            <li key={z.tz}>
              <span>{z.label}</span>
              <strong>{new Intl.DateTimeFormat(LOCALES[lang], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: z.tz }).format(now)}</strong>
              <small>{new Intl.DateTimeFormat(LOCALES[lang], { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: z.tz }).format(now)}</small>
            </li>
          ))}
        </ul>
      )}

      {tab === 'stopwatch' && (
        <div className="sw-wrap">
          <div className="sw-display">{fmtElapsed(swElapsed)}</div>
          <div className="sw-buttons">
            {swStart ? (
              <button onClick={() => { setSwAccum(swElapsed); setSwStart(null) }}>{t('stopBtn')}</button>
            ) : (
              <button onClick={() => setSwStart(Date.now())}>{t('startBtn')}</button>
            )}
            <button onClick={() => { if (swStart) setLaps((l) => [swElapsed, ...l]) }} disabled={!swStart}>{t('lapBtn')}</button>
            <button onClick={() => { setSwStart(null); setSwAccum(0); setLaps([]) }}>{t('resetBtn')}</button>
          </div>
          <ul className="sw-laps">
            {laps.map((lap, i) => <li key={i}><span>Lap {laps.length - i}</span><span>{fmtElapsed(lap)}</span></li>)}
          </ul>
        </div>
      )}

      {tab === 'timer' && (
        <div className="sw-wrap">
          <div className="sw-display">{timerLeft !== null ? fmtElapsed(Math.max(0, timerLeft)) : fmtElapsed(parseFloat(timerMin || '0') * 60000)}</div>
          <div className="sw-buttons">
            <label>
              <input type="number" min={0} max={999} value={timerMin} onChange={(e) => setTimerMin(e.target.value)} disabled={!!timerEnd} />
              {t('minutes')}
            </label>
            {timerEnd ? (
              <button onClick={() => { setTimerEnd(null); setTimerLeft(null) }}>{t('stopBtn')}</button>
            ) : (
              <button onClick={() => {
                const ms = parseFloat(timerMin || '0') * 60000
                if (ms > 0) {
                  timerDoneRef.current = false
                  setTimerEnd(Date.now() + ms)
                  setTimerLeft(ms)
                }
              }}>{t('startBtn')}</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
