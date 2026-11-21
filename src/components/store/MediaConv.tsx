import { useRef, useState } from 'react'

/* ================================================================
   メディア変換（FFmpeg WASM）
   - @ffmpeg/ffmpeg 0.11 の UMD を CDN から動的読み込み（npm 依存なし）
   - 変換処理はすべて端末内。ファイルは外部送信されない
   ================================================================ */

const FFMPEG_SCRIPT = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.0/dist/ffmpeg.min.js'
const FFMPEG_CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'

declare global {
  interface Window { FFmpeg?: any }
}

let loadPromise: Promise<any> | null = null
function loadFFmpegLib(): Promise<any> {
  if (window.FFmpeg) return Promise.resolve(window.FFmpeg)
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = FFMPEG_SCRIPT
    s.onload = () => (window.FFmpeg ? resolve(window.FFmpeg) : reject(new Error('FFmpeg の読み込みに失敗しました')))
    s.onerror = () => { loadPromise = null; reject(new Error('FFmpeg 本体の読み込みに失敗しました（ネット接続を確認してください）')) }
    document.head.appendChild(s)
  })
  return loadPromise
}

type Mode = 'gif' | 'mp3' | 'webm'
interface OutFile { url: string; name: string; mime: string; kind: 'image' | 'audio' | 'video' }

export function MediaConv() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<Mode>('gif')
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<OutFile | null>(null)
  const ffRef = useRef<any>(null)

  const ensureFF = async () => {
    if (ffRef.current) return ffRef.current
    setStatus('FFmpeg コアを読み込んでいます…（初回はネット接続が必要です）')
    const lib = await loadFFmpegLib()
    const ff = lib.createFFmpeg({ log: false, corePath: FFMPEG_CORE })
    ff.setProgress(({ ratio }: { ratio: number }) => {
      if (ratio >= 0 && ratio <= 1) setProgress(Math.round(ratio * 100))
    })
    await ff.load()
    ffRef.current = ff
    return ff
  }

  const convert = async () => {
    if (!file || busy) return
    setBusy(true); setOut(null); setProgress(0)
    try {
      const ff = await ensureFF()
      const ext = (file.name.split('.').pop() ?? 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4'
      const inName = `input.${ext}`
      const buf = new Uint8Array(await file.arrayBuffer())
      ff.FS('writeFile', inName, buf)
      const lib = window.FFmpeg
      void lib
      const run = async (args: string[], outName: string, mime: string, kind: OutFile['kind']) => {
        await ff.run(...args)
        const data = ff.FS('readFile', outName)
        const blob = new Blob([data.buffer as ArrayBuffer], { type: mime })
        return { url: URL.createObjectURL(blob), name: outName, mime, kind } as OutFile
      }
      setStatus('変換しています…')
      let result: OutFile
      if (mode === 'gif') {
        result = await run(['-i', inName, '-vf', 'fps=10,scale=480:-1', 'out.gif'], 'out.gif', 'image/gif', 'image')
      } else if (mode === 'webm') {
        result = await run(['-i', inName, '-codec:v', 'libvpx', '-codec:a', 'libvorbis', '-b:v', '1M', 'out.webm'], 'out.webm', 'video/webm', 'video')
      } else {
        try {
          result = await run(['-i', inName, '-vn', '-codec:a', 'libmp3lame', '-q:a', '4', 'out.mp3'], 'out.mp3', 'audio/mpeg', 'audio')
        } catch {
          setStatus('MP3 エンコーダが使えないため、AAC（.m4a）で書き出します…')
          result = await run(['-i', inName, '-vn', '-codec:a', 'aac', 'out.m4a'], 'out.m4a', 'audio/mp4', 'audio')
        }
      }
      try { ff.FS('unlink', inName) } catch { /* ignore */ }
      setOut(result)
      setStatus('変換が完了しました。')
    } catch (err) {
      setStatus(`変換に失敗しました：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false); setProgress(-1)
    }
  }

  return (
    <div className="sa-app">
      <p className="sa-note">動画を GIF／音声／WebM に変換します。変換は <b>すべて端末内</b> で行われ、ファイルが外部に送信されることはありません。ただし初回のみ、変換エンジン（FFmpeg）の読み込みにネット接続が必要です。</p>
      <div className="sa-row">
        <input type="file" accept="video/*,audio/*" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setOut(null) }} />
      </div>
      {file && <p className="sa-note">選択中：{file.name}（{(file.size / 1024 / 1024).toFixed(2)} MB）</p>}
      <div className="sa-row">
        <button className={mode === 'gif' ? 'chip on' : 'chip'} onClick={() => setMode('gif')}>GIFに変換</button>
        <button className={mode === 'mp3' ? 'chip on' : 'chip'} onClick={() => setMode('mp3')}>音声を抽出（MP3）</button>
        <button className={mode === 'webm' ? 'chip on' : 'chip'} onClick={() => setMode('webm')}>WebMに変換</button>
      </div>
      <div className="sa-row">
        <button className="btn accent" onClick={convert} disabled={!file || busy}>{busy ? '処理中…' : '変換する'}</button>
      </div>
      {progress >= 0 && (
        <div className="sa-progress"><div className="sa-progress-bar" style={{ width: `${progress}%` }} /><span>{progress}%</span></div>
      )}
      {status && <p className="sa-note">{status}</p>}
      {out && (
        <div className="sa-col">
          {out.kind === 'image' && <img src={out.url} alt="変換結果" style={{ maxWidth: '100%', borderRadius: 8 }} />}
          {out.kind === 'video' && <video src={out.url} controls style={{ maxWidth: '100%', borderRadius: 8 }} />}
          {out.kind === 'audio' && <audio src={out.url} controls style={{ width: '100%' }} />}
          <a className="btn accent" href={out.url} download={out.name}>⬇ {out.name} をダウンロード</a>
        </div>
      )}
    </div>
  )
}
