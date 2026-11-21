import { useEffect, useState } from 'react'
import { WEATHER_CITIES } from '../../lib/widgets'

/* ---------- 天気（Open-Meteo） ---------- */
interface Place { name: string; lat: number; lon: number }
interface WxData {
  cur: { temp: number; feels: number; hum: number; wind: number; code: number }
  hourly: { time: string; temp: number; code: number }[]
  daily: { date: string; code: number; max: number; min: number }[]
}
const WMO: Record<number, [string, string]> = {
  0: ['☀️', '快晴'], 1: ['🌤️', '晴れ'], 2: ['⛅', '一部曇り'], 3: ['☁️', '曇り'],
  45: ['🌫️', '霧'], 48: ['🌫️', '霧氷'], 51: ['🌦️', '霧雨'], 53: ['🌦️', '霧雨'], 55: ['🌦️', '霧雨'],
  61: ['🌧️', '雨'], 63: ['🌧️', '雨'], 65: ['🌧️', '大雨'], 66: ['🌧️', '雨'], 67: ['🌧️', '雨'],
  71: ['🌨️', '雪'], 73: ['🌨️', '雪'], 75: ['❄️', '大雪'], 77: ['🌨️', '雪'],
  80: ['🌦️', 'にわか雨'], 81: ['🌦️', 'にわか雨'], 82: ['🌧️', '激しいにわか雨'],
  85: ['🌨️', 'にわか雪'], 86: ['🌨️', 'にわか雪'],
  95: ['⛈️', '雷雨'], 96: ['⛈️', '雷雨（雹）'], 99: ['⛈️', '雷雨（雹）'],
}
const wmo = (c: number): [string, string] => WMO[c] ?? ['🌡️', '—']
const KEY = 'webx-weather-app-place'

function loadPlace(): Place {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Place | null
    if (v && typeof v.lat === 'number') return v
  } catch { /* ignore */ }
  return { name: WEATHER_CITIES[0].name, lat: WEATHER_CITIES[0].lat, lon: WEATHER_CITIES[0].lon }
}

export function WeatherApp() {
  const [place, setPlace] = useState<Place>(loadPlace)
  const [data, setData] = useState<WxData | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])

  useEffect(() => {
    let alive = true
    setError('')
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`
    fetch(url)
      .then((r) => r.json())
      .then((j: { current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number }; hourly: { time: string[]; temperature_2m: number[]; weather_code: number[] }; daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] } }) => {
        if (!alive) return
        const nowH = new Date().toISOString().slice(0, 13)
        const startIdx = Math.max(0, j.hourly.time.findIndex((t) => t.slice(0, 13) >= nowH))
        setData({
          cur: { temp: j.current.temperature_2m, feels: j.current.apparent_temperature, hum: j.current.relative_humidity_2m, wind: j.current.wind_speed_10m, code: j.current.weather_code },
          hourly: j.hourly.time.slice(startIdx, startIdx + 24).map((t, i) => ({ time: t, temp: j.hourly.temperature_2m[startIdx + i], code: j.hourly.weather_code[startIdx + i] })),
          daily: j.daily.time.map((d, i) => ({ date: d, code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i] })),
        })
      })
      .catch(() => { if (alive) setError('天気を取得できませんでした（通信環境を確認してください）') })
    return () => { alive = false }
  }, [place])

  const choose = (pl: Place) => {
    setPlace(pl)
    localStorage.setItem(KEY, JSON.stringify(pl))
    setResults([])
    setQuery('')
  }
  const search = () => {
    if (!query.trim()) return
    fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=6&language=ja&format=json`)
      .then((r) => r.json())
      .then((j: { results?: { name: string; latitude: number; longitude: number; country?: string; admin1?: string }[] }) => {
        setResults((j.results ?? []).map((x) => ({ name: `${x.name}${x.admin1 ? `（${x.admin1}）` : ''}`, lat: x.latitude, lon: x.longitude })))
      })
      .catch(() => setError('地名を検索できませんでした'))
  }

  const [ci, cl] = data ? wmo(data.cur.code) : ['🌡️', '']
  return (
    <div className="wxapp">
      <div className="wxapp-chips">
        {WEATHER_CITIES.map((c) => (
          <button key={c.name} className={place.name === c.name ? 'chip on' : 'chip'} onClick={() => choose({ name: c.name, lat: c.lat, lon: c.lon })}>{c.name}</button>
        ))}
      </div>
      <div className="wxapp-search">
        <input type="search" value={query} placeholder="地名で検索（例：京都）" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search() }} />
        <button className="btn" onClick={search}>検索</button>
      </div>
      {results.length > 0 && (
        <div className="wxapp-results">
          {results.map((r) => <button key={`${r.lat},${r.lon}`} className="chip" onClick={() => choose(r)}>{r.name}</button>)}
        </div>
      )}
      {error && <p className="wxapp-error">{error}</p>}
      {!data && !error && <p>読み込み中…</p>}
      {data && (
        <>
          <div className="wx-current">
            <div className="wx-current-icon">{ci}</div>
            <div>
              <div className="wx-current-place">{place.name}</div>
              <div className="wx-current-temp">{Math.round(data.cur.temp)}°</div>
              <div className="wx-current-label">{cl}　体感 {Math.round(data.cur.feels)}°</div>
              <div className="wx-current-sub">湿度 {data.cur.hum}%　風速 {Math.round(data.cur.wind)} km/h</div>
            </div>
          </div>
          <h4>この先24時間</h4>
          <div className="wx-hourly">
            {data.hourly.map((h) => (
              <div key={h.time} className="wx-hour">
                <span>{h.time.slice(11, 13)}時</span>
                <span className="wx-hour-icon">{wmo(h.code)[0]}</span>
                <span>{Math.round(h.temp)}°</span>
              </div>
            ))}
          </div>
          <h4>7日間予報</h4>
          <div className="wx-daily">
            {data.daily.map((d) => (
              <div key={d.date} className="wx-day">
                <span className="wx-day-date">{d.date.slice(5).replace('-', '/')}</span>
                <span>{wmo(d.code)[0]} {wmo(d.code)[1]}</span>
                <span className="wx-day-temp">{Math.round(d.max)}° / {Math.round(d.min)}°</span>
              </div>
            ))}
          </div>
          <p className="wxapp-note">天気データ：Open-Meteo（無料API）。観測ではなく予報値です。</p>
        </>
      )}
    </div>
  )
}
