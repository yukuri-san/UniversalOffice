import { useEffect, useRef, useState } from 'react'
import { createStore, get, set, del } from 'idb-keyval'

/* ---------- ミュージック（音声ファイルは端末内 IndexedDB に保存） ---------- */
const tracksStore = createStore('webx-music-db', 'tracks')
const META_KEY = 'webx-music-meta'
interface TrackMeta { id: string; name: string }
interface TrackRec { name: string; blob: Blob }

function loadMeta(): TrackMeta[] {
  try {
    const v = JSON.parse(localStorage.getItem(META_KEY) ?? '[]') as TrackMeta[]
    return Array.isArray(v) ? v.filter((t) => t && typeof t.id === 'string') : []
  } catch { return [] }
}
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function MusicApp() {
  const [tracks, setTracks] = useState<TrackMeta[]>(loadMeta)
  const [current, setCurrent] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)
  const [volume, setVolume] = useState(1)
  const audioRef = useRef<HTMLAudioElement>(null)
  const urlRef = useRef<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  const saveMeta = (list: TrackMeta[]) => { setTracks(list); localStorage.setItem(META_KEY, JSON.stringify(list)) }

  const playTrack = async (id: string) => {
    const rec = (await get(id, tracksStore)) as TrackRec | undefined
    if (!rec) return
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const url = URL.createObjectURL(rec.blob)
    urlRef.current = url
    setCurrent(id)
    requestAnimationFrame(() => {
      const a = audioRef.current
      if (a) { a.src = url; void a.play().catch(() => { /* ignore */ }) }
    })
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: rec.name, artist: 'WebX ミュージック' })
    }
  }

  const step = (dir: 1 | -1) => {
    if (tracks.length === 0) return
    const idx = current ? tracks.findIndex((t) => t.id === current) : -1
    const next = tracks[(idx + dir + tracks.length) % tracks.length]
    void playTrack(next.id)
  }

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('nexttrack', () => step(1))
      navigator.mediaSession.setActionHandler('previoustrack', () => step(-1))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, current])

  const addFiles = async (files: FileList | null) => {
    if (!files) return
    const list = [...tracks]
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg|flac)$/i.test(f.name)) continue
      const id = crypto.randomUUID()
      const rec: TrackRec = { name: f.name.replace(/\.[^.]+$/, ''), blob: f }
      await set(id, rec, tracksStore)
      list.push({ id, name: rec.name })
    }
    saveMeta(list)
  }

  const remove = async (id: string) => {
    await del(id, tracksStore)
    if (current === id) { audioRef.current?.pause(); setCurrent(null); setPlaying(false) }
    saveMeta(tracks.filter((t) => t.id !== id))
  }

  return (
    <div className="wxapp">
      <div className="wxapp-toolbar">
        <button className="btn" onClick={() => fileRef.current?.click()}>＋ 曲を追加</button>
        <span className="wxapp-count">{tracks.length} 曲（端末内に保存）</span>
        <input ref={fileRef} type="file" accept="audio/*" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }} />
      </div>
      {tracks.length === 0 && <p className="wxapp-empty">曲がありません。MP3などの音声ファイルを追加してください。</p>}
      <div className="mu-list">
        {tracks.map((t) => (
          <div key={t.id} className={current === t.id ? 'mu-row on' : 'mu-row'}>
            <button className="mu-main" onClick={() => void playTrack(t.id)}>
              <span className="mu-note">{current === t.id && playing ? '▶' : '♪'}</span>
              <span className="mu-name">{t.name}</span>
            </button>
            <button className="mu-del" onClick={() => void remove(t.id)}>✕</button>
          </div>
        ))}
      </div>
      <div className="mu-player">
        <div className="mu-controls">
          <button className="btn" onClick={() => step(-1)}>⏮</button>
          <button className="btn primary" onClick={() => { const a = audioRef.current; if (!a) return; if (a.paused) { if (!current && tracks.length > 0) { void playTrack(tracks[0].id); return } void a.play().catch(() => { /* ignore */ }) } else a.pause() }}>
            {playing ? '⏸' : '▶'}
          </button>
          <button className="btn" onClick={() => step(1)}>⏭</button>
          <span className="mu-time">{fmt(pos)} / {fmt(dur)}</span>
          <input type="range" min={0} max={1} step={0.05} value={volume} aria-label="音量"
            onChange={(e) => { const v = Number(e.target.value); setVolume(v); if (audioRef.current) audioRef.current.volume = v }} />
        </div>
        <input type="range" className="mu-seek" min={0} max={Math.max(0, dur)} step={0.1} value={pos}
          onChange={(e) => { const v = Number(e.target.value); setPos(v); if (audioRef.current) audioRef.current.currentTime = v }} />
        <div className="mu-now">{current ? tracks.find((t) => t.id === current)?.name ?? '' : '未再生'}</div>
      </div>
      <audio ref={audioRef}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onEnded={() => step(1)} />
    </div>
  )
}
