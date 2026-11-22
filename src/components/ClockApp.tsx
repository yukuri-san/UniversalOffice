import { useEffect, useRef, useState } from 'react'
import { LOCALES, useLang } from '../lib/i18n'
import { notifyOs } from '../lib/notify'

type AlarmRepeat = 'once' | 'daily' | 'weekdays' | 'weekends'
type Alarm = { id: string; time: string; label: string; repeat: AlarmRepeat; enabled: boolean }

const ALARM_KEY = 'webx-alarms'

function loadAlarms(): Alarm[] {
  try {
    const raw = localStorage.getItem(ALARM_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as Alarm[]
    return Array.isArray(list) ? list.filter((a) => a && typeof a.time === 'string') : []
  } catch { return [] }
}

function beepAlarm() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.3, 0.6].forEach((delay, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880 + i * 110
      gain.gain.setValueAtTime(0.15, ctx.currentTime + delay)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + 0.25)
    })
  } catch { /* ignore */ }
}

function repeatMatches(repeat: AlarmRepeat, day: number): boolean {
  if (repeat === 'daily' || repeat === 'once') return true
  if (repeat === 'weekdays') return day >= 1 && day <= 5
  return day === 0 || day === 6
}

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
  const [tab, setTab] = useState<'world' | 'stopwatch' | 'timer' | 'alarm'>('world')
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 500)
    return () => window.clearInterval(id)
  }, [])

  // alarm
  const [alarms, setAlarms] = useState<Alarm[]>(() => loadAlarms())
  const [alarmTime, setAlarmTime] = useState('07:00')
  const [alarmLabel, setAlarmLabel] = useState('')
  const [alarmRepeat, setAlarmRepeat] = useState<AlarmRepeat>('daily')
  const firedRef = useRef<Set<string>>(new Set())

  const persistAlarms = (next: Alarm[]) => {
    setAlarms(next)
    try { localStorage.setItem(ALARM_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  useEffect(() => {
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    const day = now.getDay()
    let changed = false
    const next = alarms.map((a) => {
      if (!a.enabled || a.time !== `${hh}:${mm}`) return a
      if (!repeatMatches(a.repeat, day)) return a
      const key = `${a.id}:${today}`
      if (firedRef.current.has(key)) return a
      firedRef.current.add(key)
      notifyOs(`⏰ ${a.label || a.time}`, 'clock')
      beepAlarm()
      if (a.repeat === 'once') { changed = true; return { ...a, enabled: false } }
      return a
    })
    if (changed) persistAlarms(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now])

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
        notifyOs(`⏰ ${t('timer')}`, 'clock')
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
        <button className={tab === 'alarm' ? 'on' : ''} onClick={() => setTab('alarm')}>{t('alarm')}</button>
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

      {tab === 'alarm' && (
        <div className="alarm-wrap">
          <div className="alarm-form">
            <label>
              {t('alarmTime')}
              <input type="time" value={alarmTime} onChange={(e) => setAlarmTime(e.target.value)} />
            </label>
            <label>
              {t('alarmLabel')}
              <input type="text" value={alarmLabel} onChange={(e) => setAlarmLabel(e.target.value)} placeholder={t('alarmLabelPh')} />
            </label>
            <label>
              {t('alarmRepeat')}
              <select value={alarmRepeat} onChange={(e) => setAlarmRepeat(e.target.value as AlarmRepeat)}>
                <option value="once">{t('alarmOnce')}</option>
                <option value="daily">{t('alarmDaily')}</option>
                <option value="weekdays">{t('alarmWeekdays')}</option>
                <option value="weekends">{t('alarmWeekends')}</option>
              </select>
            </label>
            <button onClick={() => {
              if (!alarmTime) return
              const alarm: Alarm = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                time: alarmTime, label: alarmLabel.trim(), repeat: alarmRepeat, enabled: true,
              }
              persistAlarms([...alarms, alarm].sort((a, b) => a.time.localeCompare(b.time)))
              setAlarmLabel('')
            }}>{t('addBtn')}</button>
          </div>
          {alarms.length === 0 ? (
            <p className="alarm-empty">{t('alarmNoAlarms')}</p>
          ) : (
            <ul className="alarm-list">
              {alarms.map((a) => (
                <li key={a.id} className={a.enabled ? '' : 'off'}>
                  <label className="alarm-toggle">
                    <input type="checkbox" checked={a.enabled} onChange={() => persistAlarms(alarms.map((x) => x.id === a.id ? { ...x, enabled: !x.enabled } : x))} />
                  </label>
                  <strong>{a.time}</strong>
                  <span className="alarm-meta">{a.label || '—'} · {t(a.repeat === 'once' ? 'alarmOnce' : a.repeat === 'daily' ? 'alarmDaily' : a.repeat === 'weekdays' ? 'alarmWeekdays' : 'alarmWeekends')}</span>
                  <button onClick={() => persistAlarms(alarms.filter((x) => x.id !== a.id))}>{t('deleteBtn')}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
