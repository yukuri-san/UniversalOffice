import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createStore, get as idbGet, set as idbSet } from 'idb-keyval'
import {
  YmmProject, YmmItem, YmmSerifItem, YmmCharaItem, YmmAudioItem,
  createProject, projectDuration, activeItems, frameSize, ymmUid, mouthOpenAt,
} from '../../lib/ymm'
import { synthesizeYukkuri, AQ1_VOICES, AQ1_LABEL, AQ2_VOICES } from '../../lib/yukkuri'
import { loadPsdDoc, renderPsdComposite, type PsdDoc } from '../../lib/psd'
import { notifyOs } from '../../lib/notify'

// WME (WebMovieEditor) v0.1 — YMM4再現の動画編集アプリ
// 描画は drawWmeFrame に集約し、プレビューと書き出しで同じ関数を使う。
// 音声合成: AquesTalk © 株式会社アクエスト

const LS_KEY = 'webx-wme-project'
const assetStore = createStore('webx-wme-assets', 'kv')

const KIND_LABEL: Record<YmmItem['kind'], string> = {
  serif: 'セリフ', chara: '立ち絵', image: '画像', text: 'テキスト', audio: '音声',
}
const KIND_COLOR: Record<YmmItem['kind'], string> = {
  serif: '#7c5cd6', chara: '#2f9e6e', image: '#3e7cb1', text: '#c7742c', audio: '#8a6d3b',
}
const LAYERS = 6

type ImgLike = CanvasImageSource & { width: number; height: number }

function loadProject(): YmmProject {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as YmmProject
      if (p && p.settings && Array.isArray(p.items) && Array.isArray(p.charas)) return p
    }
  } catch { /* ignore */ }
  return createProject()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    let cur = ''
    for (const ch of rawLine) {
      if (ctx.measureText(cur + ch).width > maxWidth && cur) { lines.push(cur); cur = ch }
      else cur += ch
    }
    lines.push(cur)
  }
  return lines
}

/** 1フレームを描く（プレビュー・書き出し共用）。images は assetKey → 画像/合成済みキャンバス */
export function drawWmeFrame(
  ctx: CanvasRenderingContext2D,
  project: YmmProject,
  t: number,
  images: Map<string, ImgLike>,
) {
  const { width: W, height: H } = frameSize(project.settings)
  ctx.fillStyle = '#101014'
  ctx.fillRect(0, 0, W, H)
  const items = activeItems(project, t)
  for (const it of items) {
    if (it.kind === 'chara' || it.kind === 'image') {
      const img = images.get(it.assetKey)
      const cx = it.x * W
      const baseY = it.y * H
      if (img) {
        const h = it.scale * H
        const w = (img.width / img.height) * h
        ctx.save()
        if (it.kind === 'image') ctx.globalAlpha = it.opacity
        ctx.drawImage(img, cx - w / 2, baseY - h, w, h)
        ctx.restore()
      } else {
        const h = it.scale * H
        const w = h * 0.62
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.beginPath()
        ctx.roundRect(cx - w / 2, baseY - h, w, h, 12)
        ctx.fill(); ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.font = `bold ${Math.round(H * 0.03)}px sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        const label = it.kind === 'chara' ? (project.charas.find((c) => c.id === it.charId)?.name ?? '立ち絵') : '画像'
        ctx.fillText(`🖼 ${label}`, cx, baseY - h / 2)
        ctx.restore()
      }
    } else if (it.kind === 'text') {
      ctx.save()
      const size = it.fontSize * H
      ctx.font = `${it.bold ? 'bold ' : ''}${size}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.lineWidth = size / 10; ctx.strokeStyle = 'rgba(0,0,0,0.8)'
      const lines = wrapText(ctx, it.text, W * 0.92)
      lines.forEach((ln, i) => {
        const y = it.y * H + (i - (lines.length - 1) / 2) * size * 1.25
        ctx.strokeText(ln, it.x * W, y)
        ctx.fillStyle = it.color
        ctx.fillText(ln, it.x * W, y)
      })
      ctx.restore()
    }
  }
  const serif = items.filter((i): i is YmmSerifItem => i.kind === 'serif' && i.showSubtitle)
  if (serif.length > 0) {
    const it = serif[serif.length - 1]
    ctx.save()
    const size = H * 0.052
    ctx.font = `bold ${size}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    const lines = wrapText(ctx, it.text, W * 0.9)
    ctx.lineWidth = size / 7; ctx.strokeStyle = 'rgba(0,0,0,0.9)'
    lines.forEach((ln, i) => {
      const y = H - H * 0.045 - (lines.length - 1 - i) * size * 1.3
      ctx.strokeText(ln, W / 2, y)
      ctx.fillStyle = '#fff'
      ctx.fillText(ln, W / 2, y)
    })
    ctx.restore()
  }
}

export default function Wme() {
  const [project, setProject] = useState<YmmProject>(loadProject)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pxPerSec, setPxPerSec] = useState(64)
  const [genBusy, setGenBusy] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [assetTick, setAssetTick] = useState(0)
  const [exporting, setExporting] = useState<number | null>(null) // 0..1 進捗 / null は未実行
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef(0)
  const imagesRef = useRef(new Map<string, ImgLike>())
  const psdRef = useRef(new Map<string, PsdDoc>())
  const compositeRef = useRef(new Map<string, HTMLCanvasElement>())
  const fileRef = useRef<HTMLInputElement>(null)
  const fileTargetRef = useRef<string | null>(null) // アイテムID
  const actxRef = useRef<AudioContext | null>(null)
  const buffersRef = useRef(new Map<string, AudioBuffer>())
  const sourcesRef = useRef<AudioBufferSourceNode[]>([])
  const exportCancelRef = useRef(false)

  const duration = projectDuration(project)
  const { width: FW, height: FH } = frameSize(project.settings)
  const selected = project.items.find((i) => i.id === selectedId) ?? null
  const selectedCharaDef = selected && (selected.kind === 'serif' || selected.kind === 'chara')
    ? project.charas.find((c) => c.id === selected.charId) : undefined
  const selectedPsd: PsdDoc | undefined = selected?.kind === 'chara' && selected.isPsd
    ? psdRef.current.get(selected.assetKey) : undefined

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(project)) } catch { /* ignore */ }
  }, [project])

  // ---------- 素材読み込み ----------
  const ensureImage = useCallback(async (key: string) => {
    if (!key || imagesRef.current.has(key)) return
    try {
      const data = await idbGet(key, assetStore) as ArrayBuffer | undefined
      if (!data) return
      const url = URL.createObjectURL(new Blob([data]))
      const img = new Image()
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = url })
      imagesRef.current.set(key, img as unknown as ImgLike)
      setAssetTick((v) => v + 1)
    } catch { /* ignore */ }
  }, [])

  const ensurePsd = useCallback(async (key: string) => {
    if (!key || psdRef.current.has(key)) return
    try {
      const data = await idbGet(key, assetStore) as ArrayBuffer | undefined
      if (!data) return
      psdRef.current.set(key, loadPsdDoc(data))
      setAssetTick((v) => v + 1)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    for (const it of project.items) {
      if (it.kind === 'chara') { if (it.isPsd) void ensurePsd(it.assetKey); else void ensureImage(it.assetKey) }
      else if (it.kind === 'image') void ensureImage(it.assetKey)
    }
  }, [project.items, ensureImage, ensurePsd])

  /** その時刻のフレーム用画像マップ（PSDは表情＋口パクで合成して差し込む） */
  const frameImages = useCallback((proj: YmmProject, t: number): Map<string, ImgLike> => {
    const map = new Map(imagesRef.current)
    for (const it of proj.items) {
      if (it.kind !== 'chara' || !it.isPsd || !it.assetKey) continue
      const doc = psdRef.current.get(it.assetKey)
      if (!doc) continue
      const def = proj.charas.find((c) => c.id === it.charId)
      const mouthOpen = def?.mouthOpen ?? []
      const mouthClosed = def?.mouthClosed ?? []
      const exprLayers = new Set<string>(def?.expressions?.[it.expression] ?? [])
      const variable = new Set<string>([...mouthOpen, ...mouthClosed])
      for (const layers of Object.values(def?.expressions ?? {})) for (const n of layers) variable.add(n)
      // 口パク：同じキャラのセリフアイテムの間だけ 0.25 秒ごとに開閉
      let mouth: 'open' | 'closed' = 'closed'
      if (it.lipSync) {
        const serif = proj.items.find((s) => s.kind === 'serif' && s.charId === it.charId && t >= s.start && t < s.start + s.length) as YmmSerifItem | undefined
        if (serif) mouth = mouthOpenAt(serif.start, t) ? 'open' : 'closed'
      }
      const cacheKey = `${it.assetKey}|${it.expression}|${mouth}`
      let cv = compositeRef.current.get(cacheKey)
      if (!cv) {
        const visible = new Set<string>()
        for (const l of doc.layers) if (!variable.has(l.name)) visible.add(l.name)
        for (const n of exprLayers) visible.add(n)
        for (const n of (mouth === 'open' ? mouthOpen : mouthClosed)) visible.add(n)
        cv = renderPsdComposite(doc, visible)
        compositeRef.current.set(cacheKey, cv)
      }
      map.set(it.assetKey, cv)
    }
    return map
  }, [])

  // プレビュー描画
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    drawWmeFrame(ctx, project, time, frameImages(project, time))
  }, [project, time, frameImages, assetTick])

  // ---------- 音声プレビュー ----------
  const ensureBuffer = useCallback(async (key: string): Promise<AudioBuffer | null> => {
    const cached = buffersRef.current.get(key)
    if (cached) return cached
    try {
      const data = await idbGet(key, assetStore) as ArrayBuffer | undefined
      if (!data) return null
      if (!actxRef.current) actxRef.current = new AudioContext()
      const buf = await actxRef.current.decodeAudioData(data.slice(0))
      buffersRef.current.set(key, buf)
      return buf
    } catch { return null }
  }, [])

  const stopAudio = useCallback(() => {
    for (const s of sourcesRef.current) { try { s.stop() } catch { /* ignore */ } }
    sourcesRef.current = []
  }, [])

  const startAudio = useCallback(async (fromTime: number, proj: YmmProject) => {
    stopAudio()
    if (!actxRef.current) actxRef.current = new AudioContext()
    const ctx = actxRef.current
    if (ctx.state === 'suspended') await ctx.resume()
    const now = ctx.currentTime
    const schedule = async (key: string, start: number, length: number, volume: number, loop: boolean) => {
      if (start + length <= fromTime) return
      const buf = await ensureBuffer(key)
      if (!buf) return
      const src = ctx.createBufferSource()
      src.buffer = buf
      const gain = ctx.createGain()
      gain.gain.value = volume
      src.connect(gain); gain.connect(ctx.destination)
      const offset = Math.max(0, fromTime - start)
      const delay = Math.max(0, start - fromTime)
      try {
        if (loop) {
          src.loop = true
          src.start(now + delay, offset % buf.duration, length - offset)
        } else {
          src.start(now + delay, offset)
        }
      } catch { /* ignore */ }
      sourcesRef.current.push(src)
    }
    for (const it of proj.items) {
      if (it.kind === 'serif' && it.audioKey) void schedule(it.audioKey, it.start, it.length, 1, false)
      else if (it.kind === 'audio' && it.assetKey) void schedule(it.assetKey, it.start, it.length, it.volume, it.loop)
    }
  }, [ensureBuffer, stopAudio])

  // 再生ループ
  useEffect(() => {
    if (!playing) { stopAudio(); return }
    void startAudio(time, project)
    lastRef.current = performance.now()
    const step = (now: number) => {
      const dt = (now - lastRef.current) / 1000
      lastRef.current = now
      setTime((prev) => {
        const next = prev + dt
        if (next >= duration) { setPlaying(false); return duration }
        return next
      })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(rafRef.current); stopAudio() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration])

  // ---------- 編集操作 ----------
  const patchProject = (patch: Partial<YmmProject>) =>
    setProject((p) => ({ ...p, ...patch, updatedAt: Date.now() }))
  const patchItem = useCallback((id: string, patch: Partial<YmmItem>) => {
    setProject((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? ({ ...i, ...patch } as YmmItem) : i)), updatedAt: Date.now() }))
  }, [])
  const patchCharaDef = useCallback((id: string, patch: Partial<YmmProject['charas'][number]>) => {
    setProject((p) => ({ ...p, charas: p.charas.map((c) => (c.id === id ? { ...c, ...patch } : c)), updatedAt: Date.now() }))
    compositeRef.current.clear()
  }, [])
  const deleteItem = (id: string) => {
    setProject((p) => ({ ...p, items: p.items.filter((i) => i.id !== id) }))
    if (selectedId === id) setSelectedId(null)
  }

  const addItem = (kind: YmmItem['kind']) => {
    const start = Math.round(time * 10) / 10
    const base = { id: ymmUid(), start, layer: 1 }
    let item: YmmItem
    if (kind === 'serif') {
      const ch = project.charas[0]
      item = { ...base, kind, length: 3, charId: ch?.id ?? '', text: 'セリフを入力', koeEdit: null, voiceId: ch?.voiceId ?? 'f1', speed: ch?.speed ?? 100, pitch: ch?.pitch ?? 100, audioKey: null, showSubtitle: true } satisfies YmmSerifItem
    } else if (kind === 'chara') {
      item = { ...base, kind, length: 5, charId: project.charas[0]?.id ?? '', assetKey: '', isPsd: false, x: 0.5, y: 1, scale: 0.85, expression: '通常', lipSync: true } satisfies YmmCharaItem
    } else if (kind === 'image') {
      item = { ...base, kind, length: 5, assetKey: '', x: 0.5, y: 1, scale: 0.6, opacity: 1 }
    } else if (kind === 'text') {
      item = { ...base, kind, length: 3, text: 'テキスト', x: 0.5, y: 0.5, fontSize: 0.07, color: '#ffffff', bold: true }
    } else {
      item = { ...base, kind, length: 10, assetKey: '', name: 'BGM', volume: 0.7, loop: false } satisfies YmmAudioItem
    }
    setProject((p) => ({ ...p, items: [...p.items, item] }))
    setSelectedId(item.id)
  }

  /** 素材ファイルの読み込み（立ち絵/画像/音声アイテム共通） */
  const onAssetFile = async (file: File) => {
    const targetId = fileTargetRef.current
    fileTargetRef.current = null
    if (!targetId) return
    const it = project.items.find((i) => i.id === targetId)
    if (!it) return
    const buf = await file.arrayBuffer()
    const key = `asset_${ymmUid()}`
    await idbSet(key, buf, assetStore)
    if (it.kind === 'chara') {
      const isPsd = /\.psd$/i.test(file.name)
      patchItem(it.id, { assetKey: key, isPsd })
      if (isPsd) {
        try {
          const doc = loadPsdDoc(buf.slice(0))
          psdRef.current.set(key, doc)
          // 口レイヤーの自動割り当て（名前に「口」を含み、開/閉が分かるもの）
          const def = project.charas.find((c) => c.id === it.charId)
          if (def && !(def.mouthOpen?.length || def.mouthClosed?.length)) {
            const names = doc.layers.map((l) => l.name)
            const open = names.filter((n) => n.includes('口') && (n.includes('開') || n.includes('あ')))
            const closed = names.filter((n) => n.includes('口') && n.includes('閉'))
            if (open.length || closed.length) patchCharaDef(def.id, { mouthOpen: open, mouthClosed: closed })
          }
          setStatusMsg(`PSDを読み込みました（レイヤー${doc.layers.length}枚）`)
        } catch { setStatusMsg('PSDの解析に失敗しました') }
      } else {
        imagesRef.current.delete(key)
        await ensureImage(key)
      }
    } else if (it.kind === 'image') {
      imagesRef.current.delete(key)
      patchItem(it.id, { assetKey: key })
      await ensureImage(key)
    } else if (it.kind === 'audio') {
      patchItem(it.id, { assetKey: key, name: file.name })
      const bufAudio = await ensureBuffer(key)
      if (bufAudio) patchItem(it.id, { length: Math.max(0.5, Math.ceil(bufAudio.duration * 10) / 10) })
    }
    setAssetTick((v) => v + 1)
  }

  const generateSerif = async (it: YmmSerifItem) => {
    if (!it.text.trim()) { notifyOs('セリフが空です', 'wme'); return }
    setGenBusy(it.id)
    setStatusMsg('音声を生成中…（初回はエンジン読込で時間がかかります）')
    try {
      const { wav, seconds } = await synthesizeYukkuri(it.text, {
        voiceId: it.voiceId, speed: it.speed, pitch: it.pitch, koeEdit: it.koeEdit,
      })
      const key = `audio_${it.id}`
      await idbSet(key, wav.buffer as ArrayBuffer, assetStore)
      buffersRef.current.delete(key)
      patchItem(it.id, { audioKey: key, length: Math.max(0.5, Math.ceil(seconds * 10) / 10) })
      setStatusMsg(`生成しました（${seconds.toFixed(1)}秒）`)
      notifyOs('セリフ音声を生成しました', 'wme')
    } catch {
      setStatusMsg('音声生成に失敗しました。通信環境を確認してください。')
    } finally {
      setGenBusy(null)
    }
  }

  const previewSerif = async (it: YmmSerifItem) => {
    if (!it.audioKey) return
    const buf = await ensureBuffer(it.audioKey)
    if (!buf || !actxRef.current) return
    const ctx = actxRef.current
    if (ctx.state === 'suspended') await ctx.resume()
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start()
  }

  // ---------- MP4書き出し（WebCodecs + mp4-muxer） ----------
  const exportMp4 = async () => {
    const W = window as unknown as Record<string, unknown>
    if (!W.VideoEncoder || !W.AudioEncoder) {
      setStatusMsg('この端末・ブラウザは WebCodecs に未対応のため書き出せません（Chrome系で開いてください）')
      return
    }
    setExporting(0)
    exportCancelRef.current = false
    setStatusMsg('書き出しの準備中…')
    try {
      const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
      const fps = project.settings.fps
      const totalFrames = Math.max(1, Math.round(duration * fps))
      const SR = 44100
      // 音声ミックス（OfflineAudioContext）
      const off = new OfflineAudioContext(2, Math.ceil(duration * SR), SR)
      const mixOne = async (key: string, start: number, length: number, volume: number, loop: boolean) => {
        const data = await idbGet(key, assetStore) as ArrayBuffer | undefined
        if (!data) return
        const buf = await off.decodeAudioData(data.slice(0))
        const src = off.createBufferSource()
        src.buffer = buf
        const g = off.createGain()
        g.gain.value = volume
        src.connect(g); g.connect(off.destination)
        if (loop) { src.loop = true; src.start(start, 0, length) }
        else src.start(start)
      }
      for (const it of project.items) {
        if (it.kind === 'serif' && it.audioKey) await mixOne(it.audioKey, it.start, it.length, 1, false)
        else if (it.kind === 'audio' && it.assetKey) await mixOne(it.assetKey, it.start, it.length, it.volume, it.loop)
      }
      const mixed = await off.startRendering()
      // 素材を全部読み込んでおく
      for (const it of project.items) {
        if (it.kind === 'chara') { if (it.isPsd) await ensurePsd(it.assetKey); else await ensureImage(it.assetKey) }
        else if (it.kind === 'image') await ensureImage(it.assetKey)
      }
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: FW, height: FH },
        audio: { codec: 'aac', sampleRate: SR, numberOfChannels: 2 },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      })
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { throw e },
      })
      videoEncoder.configure({
        codec: FH >= 1080 ? 'avc1.640033' : FH >= 720 ? 'avc1.640028' : 'avc1.64001f',
        width: FW, height: FH, framerate: fps,
        bitrate: Math.min(12_000_000, Math.max(800_000, Math.round(FW * FH * fps * 0.15))),
      })
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => { throw e },
      })
      audioEncoder.configure({ codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate: 128_000 })
      // 音声エンコード
      const CHUNK = 2048
      const ch0 = mixed.getChannelData(0)
      const ch1 = mixed.numberOfChannels > 1 ? mixed.getChannelData(1) : ch0
      for (let offFrames = 0; offFrames < mixed.length; offFrames += CHUNK) {
        const n = Math.min(CHUNK, mixed.length - offFrames)
        const data = new Float32Array(n * 2)
        data.set(ch0.subarray(offFrames, offFrames + n), 0)
        data.set(ch1.subarray(offFrames, offFrames + n), n)
        const ad = new AudioData({
          format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2,
          timestamp: Math.round((offFrames / SR) * 1e6),
          data: data.buffer as ArrayBuffer,
        })
        audioEncoder.encode(ad)
        ad.close()
      }
      await audioEncoder.flush()
      // 映像エンコード
      const cv = document.createElement('canvas')
      cv.width = FW; cv.height = FH
      const ctx = cv.getContext('2d')
      if (!ctx) throw new Error('canvas')
      for (let i = 0; i < totalFrames; i++) {
        if (exportCancelRef.current) { setStatusMsg('書き出しを中止しました'); setExporting(null); return }
        const t = i / fps
        drawWmeFrame(ctx, project, t, frameImages(project, t))
        const frame = new VideoFrame(cv, { timestamp: Math.round((i / fps) * 1e6), duration: Math.round(1e6 / fps) })
        videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })
        frame.close()
        if (videoEncoder.encodeQueueSize > 6) {
          await new Promise((r) => { const f = () => { videoEncoder.removeEventListener('dequeue', f); r(null) }; videoEncoder.addEventListener('dequeue', f) })
        }
        if (i % 10 === 0) setExporting(i / totalFrames)
      }
      await videoEncoder.flush()
      muxer.finalize()
      const blob = new Blob([(muxer.target as InstanceType<typeof ArrayBufferTarget>).buffer], { type: 'video/mp4' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${project.name || 'wme'}.mp4`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      setStatusMsg('MP4を書き出しました')
      notifyOs('MP4を書き出しました', 'wme')
    } catch {
      setStatusMsg('書き出しに失敗しました')
    } finally {
      setExporting(null)
    }
  }

  // タイムライン上のドラッグ
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; startX: number; origStart: number; origLen: number } | null>(null)
  const onItemPointerDown = (e: React.PointerEvent, it: YmmItem, mode: 'move' | 'resize') => {
    e.stopPropagation()
    setSelectedId(it.id)
    dragRef.current = { id: it.id, mode, startX: e.clientX, origStart: it.start, origLen: it.length }
    const move = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const dt = (ev.clientX - d.startX) / pxPerSec
      if (d.mode === 'move') patchItem(d.id, { start: Math.max(0, Math.round((d.origStart + dt) * 10) / 10) })
      else patchItem(d.id, { length: Math.max(0.5, Math.round((d.origLen + dt) * 10) / 10) })
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`
  const ruler = useMemo(() => {
    const marks: number[] = []
    for (let s = 0; s <= Math.ceil(duration); s += 1) marks.push(s)
    return marks
  }, [duration])

  const toggleLayer = (list: string[] | undefined, name: string): string[] => {
    const cur = list ?? []
    return cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]
  }
  const [exprEdit, setExprEdit] = useState('通常')
  const [newExprName, setNewExprName] = useState('')

  return (
    <div className="wme-root">
      <div className="wme-head">
        <span className="wme-logo">🎬</span>
        <input className="wme-name" value={project.name} onChange={(e) => patchProject({ name: e.target.value })} />
        <label>比率
          <select value={project.settings.aspect} onChange={(e) => patchProject({ settings: { ...project.settings, aspect: e.target.value as YmmProject['settings']['aspect'] } })}>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
          </select>
        </label>
        <label>画質
          <select value={project.settings.res} onChange={(e) => patchProject({ settings: { ...project.settings, res: Number(e.target.value) as YmmProject['settings']['res'] } })}>
            <option value={360}>360p</option>
            <option value={480}>480p</option>
            <option value={720}>720p</option>
            <option value={1080}>1080p</option>
          </select>
        </label>
        <label>fps
          <select value={project.settings.fps} onChange={(e) => patchProject({ settings: { ...project.settings, fps: Number(e.target.value) as YmmProject['settings']['fps'] } })}>
            <option value={20}>20</option>
            <option value={24}>24</option>
            <option value={30}>30</option>
          </select>
        </label>
        <span className="wme-res">{FW}×{FH} / {project.settings.fps}fps</span>
        <button className="btn" onClick={() => { if (confirm('プロジェクトを初期化しますか？')) { setProject(createProject()); setSelectedId(null); setTime(0) } }}>新規</button>
        {exporting === null
          ? <button className="btn accent" onClick={() => void exportMp4()}>🎞 MP4書き出し</button>
          : <button className="btn danger" onClick={() => { exportCancelRef.current = true }}>書き出し中 {Math.round(exporting * 100)}%（中止）</button>}
      </div>

      <div className="wme-main">
        <div className="wme-preview">
          <canvas ref={canvasRef} width={FW} height={FH} className="wme-canvas" />
          <div className="wme-transport">
            <button className="btn" onClick={() => setTime(0)}>⏮</button>
            <button className="btn accent" onClick={() => { if (time >= duration) setTime(0); setPlaying(!playing) }}>{playing ? '⏸ 一時停止' : '▶ 再生'}</button>
            <span className="wme-time">{fmt(time)} / {fmt(duration)}</span>
            <input type="range" min={0} max={duration} step={0.05} value={time} onChange={(e) => { setPlaying(false); setTime(Number(e.target.value)) }} className="wme-seek" />
          </div>
          {statusMsg && <p className="hint" style={{ margin: 0 }}>{statusMsg}</p>}
        </div>

        <div className="wme-props">
          {selected ? (
            <>
              <div className="wme-props-title">{KIND_LABEL[selected.kind]}アイテム
                <button className="btn danger" onClick={() => deleteItem(selected.id)}>削除</button>
              </div>
              <label>開始（秒）<input type="number" min={0} step={0.1} value={selected.start} onChange={(e) => patchItem(selected.id, { start: Math.max(0, Number(e.target.value) || 0) })} /></label>
              <label>長さ（秒）<input type="number" min={0.5} step={0.1} value={selected.length} onChange={(e) => patchItem(selected.id, { length: Math.max(0.5, Number(e.target.value) || 0.5) })} /></label>
              <label>レイヤー
                <select value={selected.layer} onChange={(e) => patchItem(selected.id, { layer: Number(e.target.value) })}>
                  {Array.from({ length: LAYERS }, (_, i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </label>
              {(selected.kind === 'serif' || selected.kind === 'text') && (
                <label>テキスト<textarea rows={3} value={selected.text} onChange={(e) => patchItem(selected.id, { text: e.target.value })} /></label>
              )}
              {selected.kind === 'serif' && (
                <>
                  <label>キャラ
                    <select value={selected.charId} onChange={(e) => {
                      const c = project.charas.find((x) => x.id === e.target.value)
                      patchItem(selected.id, c ? { charId: c.id, voiceId: c.voiceId, speed: c.speed, pitch: c.pitch } : { charId: e.target.value })
                    }}>
                      {project.charas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label>声
                    <select value={selected.voiceId} onChange={(e) => patchItem(selected.id, { voiceId: e.target.value })}>
                      <optgroup label="Aq2（純正AquesTalk2）">
                        {AQ2_VOICES.map((v) => <option key={v.phont} value={`aq2:${v.phont}`}>{v.label}</option>)}
                      </optgroup>
                      <optgroup label="Aq1（同梱・Legacy）">
                        {AQ1_VOICES.map((v) => <option key={v} value={v}>{AQ1_LABEL[v]}</option>)}
                      </optgroup>
                    </select>
                  </label>
                  <label>速さ（50〜300）<input type="number" min={50} max={300} value={selected.speed} onChange={(e) => patchItem(selected.id, { speed: Math.min(300, Math.max(50, Number(e.target.value) || 100)) })} /></label>
                  <label>ピッチ（50〜200%）<input type="number" min={50} max={200} value={selected.pitch} onChange={(e) => patchItem(selected.id, { pitch: Math.min(200, Math.max(50, Number(e.target.value) || 100)) })} /></label>
                  <label>読み（音声記号・空欄で自動）<input type="text" value={selected.koeEdit ?? ''} placeholder="自動" onChange={(e) => patchItem(selected.id, { koeEdit: e.target.value === '' ? null : e.target.value })} /></label>
                  <label className="wme-check"><input type="checkbox" checked={selected.showSubtitle} onChange={(e) => patchItem(selected.id, { showSubtitle: e.target.checked })} /> 字幕を表示</label>
                  <div className="wme-genrow">
                    <button className="btn accent" disabled={genBusy === selected.id} onClick={() => void generateSerif(selected)}>
                      {genBusy === selected.id ? '生成中…' : selected.audioKey ? '🔊 音声を再生成' : '🔊 音声生成'}
                    </button>
                    {selected.audioKey && <button className="btn" onClick={() => void previewSerif(selected)}>▶ 試聴</button>}
                  </div>
                  <p className="hint">生成するとアイテムの長さが音声の尺に合います。Aquestalkのプログラムを使用しています。</p>
                </>
              )}
              {(selected.kind === 'chara' || selected.kind === 'image') && (
                <>
                  <button className="btn" onClick={() => { fileTargetRef.current = selected.id; fileRef.current?.click() }}>
                    {selected.kind === 'chara' ? '🖼 画像 / PSD を読み込む' : '🖼 画像を読み込む'}
                  </button>
                  {selected.kind === 'chara' && (
                    <label>キャラ
                      <select value={selected.charId} onChange={(e) => patchItem(selected.id, { charId: e.target.value })}>
                        {project.charas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </label>
                  )}
                  <label>X（0〜1）<input type="number" min={0} max={1} step={0.05} value={selected.x} onChange={(e) => patchItem(selected.id, { x: Number(e.target.value) })} /></label>
                  <label>Y（0〜1）<input type="number" min={0} max={1} step={0.05} value={selected.y} onChange={(e) => patchItem(selected.id, { y: Number(e.target.value) })} /></label>
                  <label>大きさ<input type="number" min={0.1} max={2} step={0.05} value={selected.scale} onChange={(e) => patchItem(selected.id, { scale: Number(e.target.value) })} /></label>
                  {selected.kind === 'image' && (
                    <label>不透明度<input type="number" min={0} max={1} step={0.1} value={selected.opacity} onChange={(e) => patchItem(selected.id, { opacity: Number(e.target.value) })} /></label>
                  )}
                  {selected.kind === 'chara' && selected.isPsd && selectedCharaDef && (
                    <>
                      <label>表情
                        <select value={selected.expression} onChange={(e) => patchItem(selected.id, { expression: e.target.value })}>
                          {['通常', ...Object.keys(selectedCharaDef.expressions ?? {}).filter((n) => n !== '通常')].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                      <label className="wme-check"><input type="checkbox" checked={selected.lipSync} onChange={(e) => patchItem(selected.id, { lipSync: e.target.checked })} /> 口パク（セリフ中 0.25秒切替）</label>
                      {selectedPsd ? (
                        <details className="wme-psd">
                          <summary>PSDレイヤー割り当て（{selectedPsd.layers.length}枚）</summary>
                          <div className="wme-psd-sec">口パク用レイヤー</div>
                          <div className="wme-layerlist">
                            {selectedPsd.layers.map((l) => (
                              <div key={l.name} className="wme-layerrow">
                                <span className="wme-layername">{l.name}</span>
                                <label><input type="checkbox" checked={(selectedCharaDef.mouthOpen ?? []).includes(l.name)} onChange={() => patchCharaDef(selectedCharaDef.id, { mouthOpen: toggleLayer(selectedCharaDef.mouthOpen, l.name) })} /> 開</label>
                                <label><input type="checkbox" checked={(selectedCharaDef.mouthClosed ?? []).includes(l.name)} onChange={() => patchCharaDef(selectedCharaDef.id, { mouthClosed: toggleLayer(selectedCharaDef.mouthClosed, l.name) })} /> 閉</label>
                              </div>
                            ))}
                          </div>
                          <div className="wme-psd-sec">表情プリセット</div>
                          <div className="wme-genrow">
                            <select value={exprEdit} onChange={(e) => setExprEdit(e.target.value)}>
                              {Object.keys(selectedCharaDef.expressions ?? { '通常': [] }).map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <input type="text" placeholder="新しい表情名" value={newExprName} onChange={(e) => setNewExprName(e.target.value)} />
                            <button className="btn" onClick={() => {
                              const name = newExprName.trim()
                              if (!name) return
                              patchCharaDef(selectedCharaDef.id, { expressions: { ...(selectedCharaDef.expressions ?? {}), [name]: [] } })
                              setExprEdit(name); setNewExprName('')
                            }}>追加</button>
                          </div>
                          <div className="wme-layerlist">
                            {selectedPsd.layers.map((l) => (
                              <div key={l.name} className="wme-layerrow">
                                <span className="wme-layername">{l.name}</span>
                                <label><input type="checkbox"
                                  checked={(selectedCharaDef.expressions?.[exprEdit] ?? []).includes(l.name)}
                                  onChange={() => patchCharaDef(selectedCharaDef.id, {
                                    expressions: { ...(selectedCharaDef.expressions ?? {}), [exprEdit]: toggleLayer(selectedCharaDef.expressions?.[exprEdit], l.name) },
                                  })} /> 「{exprEdit}」で表示</label>
                              </div>
                            ))}
                          </div>
                          <p className="hint">割り当てたレイヤー以外は常時表示されます。PSDTool形式の口レイヤーは読み込み時に自動で割り当てます。</p>
                        </details>
                      ) : <p className="hint">PSDを解析中…</p>}
                    </>
                  )}
                  {selected.kind === 'chara' && !selected.isPsd && <p className="hint">PSDを読み込むと表情切り替えと口パクが使えます。</p>}
                </>
              )}
              {selected.kind === 'audio' && (
                <>
                  <button className="btn" onClick={() => { fileTargetRef.current = selected.id; fileRef.current?.click() }}>🎵 音声ファイル（BGM）を読み込む</button>
                  <label>名前<input type="text" value={selected.name} onChange={(e) => patchItem(selected.id, { name: e.target.value })} /></label>
                  <label>音量（0〜1）<input type="number" min={0} max={1} step={0.05} value={selected.volume} onChange={(e) => patchItem(selected.id, { volume: Number(e.target.value) })} /></label>
                  <label className="wme-check"><input type="checkbox" checked={selected.loop} onChange={(e) => patchItem(selected.id, { loop: e.target.checked })} /> ループ再生</label>
                </>
              )}
              {selected.kind === 'text' && (
                <>
                  <label>X（0〜1）<input type="number" min={0} max={1} step={0.05} value={selected.x} onChange={(e) => patchItem(selected.id, { x: Number(e.target.value) })} /></label>
                  <label>Y（0〜1）<input type="number" min={0} max={1} step={0.05} value={selected.y} onChange={(e) => patchItem(selected.id, { y: Number(e.target.value) })} /></label>
                  <label>文字サイズ<input type="number" min={0.02} max={0.3} step={0.005} value={selected.fontSize} onChange={(e) => patchItem(selected.id, { fontSize: Number(e.target.value) })} /></label>
                  <label>色<input type="color" value={selected.color} onChange={(e) => patchItem(selected.id, { color: e.target.value })} /></label>
                </>
              )}
            </>
          ) : (
            <p className="hint">タイムラインのアイテムを選ぶと、ここで編集できます。下の「＋」ボタンでアイテムを追加できます。</p>
          )}
        </div>
      </div>

      <div className="wme-toolbar">
        {(Object.keys(KIND_LABEL) as YmmItem['kind'][]).map((k) => (
          <button key={k} className="btn" onClick={() => addItem(k)}>＋{KIND_LABEL[k]}</button>
        ))}
        <span className="wme-zoom">ズーム
          <input type="range" min={24} max={160} value={pxPerSec} onChange={(e) => setPxPerSec(Number(e.target.value))} />
        </span>
      </div>

      <div className="wme-timeline" onClick={() => setSelectedId(null)}>
        <div className="wme-ruler" style={{ width: duration * pxPerSec }}>
          {ruler.map((s) => (
            <span key={s} className="wme-tick" style={{ left: s * pxPerSec }}>{s}s</span>
          ))}
          <div className="wme-playhead" style={{ left: time * pxPerSec }} />
        </div>
        {Array.from({ length: LAYERS }, (_, li) => LAYERS - 1 - li).map((layer) => (
          <div key={layer} className="wme-track" style={{ width: duration * pxPerSec }}>
            <span className="wme-track-label">L{layer}</span>
            {project.items.filter((i) => i.layer === layer).map((it) => (
              <div
                key={it.id}
                className={`wme-item${selectedId === it.id ? ' sel' : ''}`}
                style={{ left: it.start * pxPerSec, width: Math.max(18, it.length * pxPerSec), background: KIND_COLOR[it.kind] }}
                onPointerDown={(e) => onItemPointerDown(e, it, 'move')}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="wme-item-label">{it.kind === 'serif' || it.kind === 'text' ? it.text : it.kind === 'audio' ? it.name : KIND_LABEL[it.kind]}</span>
                <span className="wme-item-resize" onPointerDown={(e) => onItemPointerDown(e, it, 'resize')} />
              </div>
            ))}
            <div className="wme-playhead" style={{ left: time * pxPerSec }} />
          </div>
        ))}
      </div>
      <input ref={fileRef} type="file" hidden
        accept={selected?.kind === 'audio' ? 'audio/*' : 'image/*,.psd'}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onAssetFile(f) }} />
      <p className="hint wme-foot-hint">WME v0.1：茶番劇が作れる基本セット（セリフ音声・立ち絵PSD＋口パク・BGM・MP4書き出し）。Aquestalkのプログラムを使用しています。</p>
    </div>
  )
}
