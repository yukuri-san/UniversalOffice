import { useEffect, useMemo, useRef, useState } from 'react'
import { createStore, get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import { notifyOs } from '../../lib/notify'
import { listDocs, type LocalDoc } from '../../lib/store'

// YVM（YukkuriVoiceMaker）
// ゆっくりボイス（AquesTalk）をブラウザで生成するメーカー。
// エンジン本体（aquestalk.js / kanji2koe-openjtalk、y52en氏・MIT）は重いバイナリを含むため
// WebX 本体には同梱せず、自前 CDN（このサイトの /cdn/yvm/）から必要時にだけ読み込む。
// 音声合成: AquesTalk © 株式会社アクエスト

const CDN = 'https://yukuri-san.github.io/UniversalOffice/cdn/yvm/'
const LS_KEY = 'webx-yvm-v1'

export const YVM_VOICES = ['f1', 'f2', 'm1', 'm2', 'dvd', 'imd1', 'jgr', 'r1'] as const
const VOICE_LABEL: Record<string, string> = {
  f1: '女声1(aq1-f1)', f2: '女声2(aq1-f2)', m1: '男声1(aq1-m1)', m2: '男声2(aq1-m2)',
  dvd: 'dvd(aq1-dvd)', imd1: 'imd1(aq1-imd1)', jgr: 'jgr(aq1-jgr)', r1: 'ロボ(aq1-r1)',
}

// 純正 AquesTalk2 パック（新エンジン = aquestalk2 / Unicorn ベース）
// 声は phont ファイルごとに分かれる。CDN の aquestalk2/voices/aq2/ に配置。
const AQ2_DIR = 'https://yukuri-san.github.io/UniversalOffice/cdn/yvm/aquestalk2/voices/aq2/'
export const YVM_AQ2_VOICES: { phont: string; label: string }[] = [
  { phont: 'aq_yukkuri', label: 'ゆっくり(aq2-aq_yukkuri)' },
  { phont: 'ar_f4', label: '標準(aq2-ar_f4)' },
  { phont: 'aq_f1b', label: '女声1b(aq2-aq_f1b)' },
  { phont: 'aq_f1c', label: '女声1c(aq2-aq_f1c)' },
  { phont: 'aq_f3a', label: '女声3a(aq2-aq_f3a)' },
  { phont: 'ar_mf2', label: '中性(aq2-ar_mf2)' },
  { phont: 'aq_mf1', label: '中性1(aq2-aq_mf1)' },
  { phont: 'aq_m3', label: '男声3(aq2-aq_m3)' },
  { phont: 'aq_m4', label: '男声4(aq2-aq_m4)' },
  { phont: 'aq_m4b', label: '男声4b(aq2-aq_m4b)' },
  { phont: 'ar_m5', label: '男声5(aq2-ar_m5)' },
  { phont: 'ar_rm3', label: 'rm3(aq2-ar_rm3)' },
  { phont: 'aq_rm', label: 'rm(aq2-aq_rm)' },
  { phont: 'aq_rb2', label: 'ロボ2(aq2-aq_rb2)' },
  { phont: 'aq_rb3', label: 'ロボ3(aq2-aq_rb3)' },
  { phont: 'aq_robo', label: 'ロボ(aq2-aq_robo)' },
  { phont: 'aq_teto1', label: 'テト(aq2-aq_teto1)' },
  { phont: 'aq_momo1', label: 'モモ(aq2-aq_momo1)' },
  { phont: 'aq_huskey', label: 'ハスキー(aq2-aq_huskey)' },
  { phont: 'aq_defo1', label: 'デフォ(aq2-aq_defo1)' },
]
const aq2Label = (phont: string): string => YVM_AQ2_VOICES.find((v) => v.phont === phont)?.label ?? phont

interface YChar { id: string; name: string; voice: string; speed: number; pitch: number }
interface YLine { id: string; charId: string; text: string; koeEdit: string | null }
interface YDict { id: string; word: string; reading: string }
interface GenInfo { key: string; url: string; bytes: number; sec: number }

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36)

function colorOf(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return `hsl(${h} 65% 45%)`
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else field += c
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function escapeCSVField(field: string): string {
  const str = field ?? ''
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// ---------- WAV ユーティリティ（AquesTalk出力は PCM 16bit） ----------
interface WavInfo { channels: number; sampleRate: number; bits: number; dataOff: number; dataLen: number; fmt: number }

function parseWav(bytes: Uint8Array): WavInfo | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < 44 || String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF') return null
  let fmt = 1, channels = 1, sampleRate = 8000, bits = 16, dataOff = -1, dataLen = 0
  let off = 12
  while (off + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(...bytes.slice(off, off + 4))
    const size = dv.getUint32(off + 4, true)
    if (id === 'fmt ') {
      fmt = dv.getUint16(off + 8, true)
      channels = dv.getUint16(off + 10, true)
      sampleRate = dv.getUint32(off + 12, true)
      bits = dv.getUint16(off + 22, true)
    } else if (id === 'data') {
      dataOff = off + 8
      dataLen = Math.min(size, bytes.byteLength - dataOff)
      break
    }
    off += 8 + size + (size % 2)
  }
  if (dataOff < 0) return null
  return { channels, sampleRate, bits, dataOff, dataLen, fmt }
}

function buildWav(info: WavInfo, pcm: Uint8Array): Uint8Array {
  const out = new Uint8Array(44 + pcm.byteLength)
  const dv = new DataView(out.buffer)
  const wstr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i) }
  wstr(0, 'RIFF'); dv.setUint32(4, 36 + pcm.byteLength, true); wstr(8, 'WAVE')
  wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true)
  dv.setUint16(22, info.channels, true); dv.setUint32(24, info.sampleRate, true)
  const byteRate = info.sampleRate * info.channels * (info.bits / 8)
  dv.setUint32(28, byteRate, true); dv.setUint16(32, info.channels * (info.bits / 8), true)
  dv.setUint16(34, info.bits, true)
  wstr(36, 'data'); dv.setUint32(40, pcm.byteLength, true)
  out.set(pcm, 44)
  return out
}

/** リサンプル（factor>1 で短く・高く、<1 で長く・低くなる） */
function resamplePcm(src: Float32Array, factor: number): Float32Array {
  const outLen = Math.max(1, Math.floor(src.length / factor))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * factor
    const i0 = Math.floor(pos)
    const i1 = Math.min(src.length - 1, i0 + 1)
    const frac = pos - i0
    out[i] = src[i0] * (1 - frac) + src[i1] * frac
  }
  return out
}

/** WSOLA タイムストレッチ（音程を変えずに長さを ratio 倍にする） */
function timeStretchPcm(src: Float32Array, ratio: number): Float32Array {
  if (ratio === 1 || src.length < 512) return src
  const WIN = 256
  const HOP_S = 64 // 合成ホップ
  const HOP_A = HOP_S / ratio // 解析ホップ
  const SEARCH = 128
  const targetLen = Math.round(src.length * ratio)
  const out = new Float32Array(targetLen + WIN)
  const norm = new Float32Array(targetLen + WIN)
  const win = new Float32Array(WIN)
  for (let i = 0; i < WIN; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1))
  let outPos = 0
  let inPos = 0
  while (outPos + WIN <= out.length && inPos + WIN <= src.length + SEARCH) {
    let bestOff = 0
    if (outPos > 0) {
      // 直前の合成末尾と最も似た位置を探す（波形類似度）
      let best = -Infinity
      const base = Math.round(inPos)
      for (let off = -SEARCH; off <= SEARCH; off++) {
        const p = base + off
        if (p < 0 || p + HOP_S + WIN > src.length) continue
        let corr = 0
        for (let i = 0; i < WIN - HOP_S; i += 4) corr += out[outPos + HOP_S + i] * src[p + HOP_S + i]
        if (corr > best) { best = corr; bestOff = off }
      }
    }
    const p = Math.min(src.length - WIN, Math.max(0, Math.round(inPos) + bestOff))
    if (p < 0) break
    for (let i = 0; i < WIN; i++) {
      out[outPos + i] += src[p + i] * win[i]
      norm[outPos + i] += win[i]
    }
    outPos += HOP_S
    inPos += HOP_A
  }
  const res = new Float32Array(targetLen)
  for (let i = 0; i < targetLen; i++) res[i] = norm[i] > 0.2 ? out[i] / norm[i] : out[i]
  return res
}

/**
 * ピッチ変更（長さを変えずに音程だけを変える。YMM4 の音程に近い方式）
 * リサンプルで音程を変えたあと、WSOLA で元の長さに戻す。
 */
function applyPitch(bytes: Uint8Array, factor: number): Uint8Array {
  if (factor === 1) return bytes
  const info = parseWav(bytes)
  if (!info || info.bits !== 16) return bytes
  const raw = new Int16Array(bytes.buffer, bytes.byteOffset + info.dataOff, info.dataLen / 2)
  const src = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i++) src[i] = raw[i] / 32768
  const shifted = resamplePcm(src, factor)
  const restored = timeStretchPcm(shifted, factor)
  const out = new Int16Array(restored.length)
  for (let i = 0; i < restored.length; i++) {
    const v = Math.max(-1, Math.min(1, restored[i]))
    out[i] = Math.round(v * 32767)
  }
  return buildWav(info, new Uint8Array(out.buffer))
}

function concatWavs(list: Uint8Array[]): Uint8Array {
  if (list.length === 1) return list[0]
  const info = parseWav(list[0])
  if (!info) return list[0]
  const total = list.reduce((s, w) => {
    const wi = parseWav(w)
    return s + (wi ? wi.dataLen : 0)
  }, 0)
  const pcm = new Uint8Array(total)
  let off = 0
  for (const w of list) {
    const wi = parseWav(w)
    if (!wi) continue
    pcm.set(w.subarray(wi.dataOff, wi.dataOff + wi.dataLen), off)
    off += wi.dataLen
  }
  return buildWav(info, pcm)
}

function wavSeconds(bytes: Uint8Array): number {
  const info = parseWav(bytes)
  if (!info) return 0
  return info.dataLen / (info.sampleRate * info.channels * (info.bits / 8))
}

/** Shift-JIS 換算の概算バイト数（AquesTalk の入力上限 4094 bytes 対策） */
function sjisLen(s: string): number {
  let n = 0
  for (const c of s) n += c.charCodeAt(0) < 0x80 ? 1 : 2
  return n
}

/** koe を「。」区切りで上限以内に分割する */
function splitKoe(koe: string, limit = 3000): string[] {
  const parts = koe.split(/(?<=。)/).filter((p) => p.length > 0)
  const chunks: string[] = []
  let cur = ''
  for (const p of parts) {
    if (sjisLen(cur + p) > limit && cur) { chunks.push(cur); cur = '' }
    if (sjisLen(p) > limit) {
      // 1文でも長すぎる場合は「/」境界で割る
      const subs = p.split(/(?<=\/)/)
      for (const sub of subs) {
        if (sjisLen(cur + sub) > limit && cur) { chunks.push(cur); cur = '' }
        cur += sub
      }
    } else cur += p
  }
  if (cur) chunks.push(cur)
  return chunks.length > 0 ? chunks : [koe]
}

// ---------- エンジン（CDNから遅延読み込み） ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any
let k2kPromise: Promise<AnyMod> | null = null
let convPromise: Promise<AnyMod> | null = null
const aqCache = new Map<string, Promise<AnyMod>>()

function loadConverter(): Promise<AnyMod> {
  if (!k2kPromise) {
    k2kPromise = import(/* @vite-ignore */ `${CDN}kanji2koe/dist/index.js`)
    convPromise = k2kPromise.then((m: AnyMod) => m.load())
  }
  return convPromise as Promise<AnyMod>
}

const voiceStore = createStore('webx-yvm-voices', 'kv')

async function openZip(buf: ArrayBuffer): Promise<AnyMod> {
  const JSZipMod = await import(/* @vite-ignore */ `${CDN}deps/jszip.js`)
  const JSZip = JSZipMod.default ?? JSZipMod
  return new JSZip().loadAsync(buf) as AnyMod
}

async function findDllPath(buf: ArrayBuffer): Promise<string | null> {
  const zip = await openZip(buf)
  return Object.keys(zip.files).find((n) => /(^|\/)AquesTalk\.dll$/i.test(n)) ?? null
}

/** 新エンジン（aquestalk2 / Unicorn）で DLL バイト列から合成器を作る */
async function loadUcEngine(dll: ArrayBuffer, phont: ArrayBuffer | null): Promise<AnyMod> {
  const m = await import(/* @vite-ignore */ `${CDN}aquestalk2/aquestalk-uc.js`) as AnyMod
  return m.loadAquesTalkUC({ dll, phont }) as AnyMod
}

function loadVoice(voice: string, customVoices: { id: string; name: string; engine?: string }[]): Promise<AnyMod> {
  let p = aqCache.get(voice)
  if (!p) {
    if (voice.startsWith('aq2:')) {
      // 純正 AquesTalk2（内蔵パック）: 新エンジンで DLL + phont を CDN から読む
      const phont = voice.slice(4)
      p = (async () => {
        const [dll, ph] = await Promise.all([
          fetch(`${AQ2_DIR}AquesTalk2.dll`).then((r) => { if (!r.ok) throw new Error('AquesTalk2.dll の取得に失敗'); return r.arrayBuffer() }),
          fetch(`${AQ2_DIR}phont/${phont}.phont`).then((r) => { if (!r.ok) throw new Error('phont の取得に失敗'); return r.arrayBuffer() }),
        ])
        return loadUcEngine(dll, ph)
      })()
    } else if (voice.startsWith('cv_')) {
      const rec = customVoices.find((v) => v.id === voice)
      if (rec?.engine === 'uc') {
        // カスタム声（AquesTalk2形式）: 端末内に保存した DLL + phont を新エンジンで読む
        p = (async () => {
          const data = await idbGet(voice, voiceStore) as { dll: ArrayBuffer; phont: ArrayBuffer } | undefined
          if (!data) throw new Error('カスタム声のデータが端末内にありません')
          return loadUcEngine(data.dll, data.phont)
        })()
      } else {
        // カスタム声（Legacy形式）: 端末内に保存した声zipを blob URL 経由で読み込む
        p = (async () => {
          const buf = await idbGet(voice, voiceStore) as ArrayBuffer | undefined
          if (!buf) throw new Error('カスタム声のデータが端末内にありません')
          const dllPath = await findDllPath(buf)
          if (!dllPath) throw new Error('zip内に AquesTalk.dll が見つかりません')
          const url = URL.createObjectURL(new Blob([buf], { type: 'application/zip' }))
          const m = await import(/* @vite-ignore */ `${CDN}aquestalk/dist/index.js`) as AnyMod
          return m.loadAquesTalk(url, dllPath, { wasmPath: `${CDN}aquestalk/voices/v86.wasm` })
        })()
      }
    } else {
      p = import(/* @vite-ignore */ `${CDN}aquestalk/dist/index.js`).then((m: AnyMod) => m.load(voice))
    }
    aqCache.set(voice, p)
  }
  return p
}

const DEFAULT_CHARS: YChar[] = [
  { id: 'reimu', name: '霊夢', voice: 'f1', speed: 100, pitch: 100 },
  { id: 'marisa', name: '魔理沙', voice: 'f2', speed: 100, pitch: 100 },
]

export default function Yvm() {
  const [chars, setChars] = useState<YChar[]>(DEFAULT_CHARS)
  const [lines, setLines] = useState<YLine[]>([
    { id: uid(), charId: 'reimu', text: 'ゆっくりしていってね！', koeEdit: null },
  ])
  const [dict, setDict] = useState<YDict[]>([])
  const [customVoices, setCustomVoices] = useState<{ id: string; name: string; engine?: string }[]>([])
  const [view, setView] = useState<'lines' | 'chars' | 'dict'>('lines')
  const [showInfo, setShowInfo] = useState(false)
  const [engine, setEngine] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [engineMsg, setEngineMsg] = useState('')
  const [busyLine, setBusyLine] = useState<string | null>(null)
  const [busyAll, setBusyAll] = useState(false)
  const [koeMap, setKoeMap] = useState<Record<string, string>>({})
  const [genMap, setGenMap] = useState<Record<string, GenInfo>>({})
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [newWord, setNewWord] = useState('')
  const [newReading, setNewReading] = useState('')
  const [loaded, setLoaded] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stopAllRef = useRef(false)
  const voiceRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<number | null>(null)

  // 初回読み込み
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const d = JSON.parse(raw) as { chars?: YChar[]; lines?: YLine[]; dict?: YDict[]; customVoices?: { id: string; name: string; engine?: string }[] }
        if (Array.isArray(d.chars) && d.chars.length > 0) setChars(d.chars)
        if (Array.isArray(d.lines)) setLines(d.lines)
        if (Array.isArray(d.dict)) setDict(d.dict)
        if (Array.isArray(d.customVoices)) setCustomVoices(d.customVoices)
      }
    } catch { /* ignore */ }
    setLoaded(true)
  }, [])

  // 自動保存
  useEffect(() => {
    if (!loaded) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify({ chars, lines, dict, customVoices })) } catch { /* ignore */ }
    }, 400)
  }, [chars, lines, dict, customVoices, loaded])

  const charOf = (id: string): YChar => chars.find((c) => c.id === id) ?? chars[0] ?? DEFAULT_CHARS[0]

  /** ユーザー辞書を適用（長い単語を優先） */
  const applyDict = (text: string): string => {
    let out = text
    const sorted = [...dict].filter((d) => d.word).sort((a, b) => b.word.length - a.word.length)
    for (const d of sorted) out = out.split(d.word).join(d.reading)
    return out
  }

  const ensureEngine = async (): Promise<boolean> => {
    if (engine === 'ready') return true
    setEngine('loading')
    setEngineMsg('読み変換エンジンを読み込み中…（初回は約20MB）')
    try {
      await loadConverter()
      setEngine('ready')
      setEngineMsg('')
      return true
    } catch {
      setEngine('error')
      setEngineMsg('エンジンの読み込みに失敗しました。通信環境を確認してください。')
      return false
    }
  }

  /** 行の自動読み（koe）を計算して koeMap に反映 */
  const refreshKoe = async (target: YLine[]) => {
    if (!(await ensureEngine())) return
    const conv = await loadConverter()
    setKoeMap((prev) => {
      const next = { ...prev }
      for (const l of target) {
        if (l.koeEdit === null && l.text.trim()) next[l.id] = conv.convert(applyDict(l.text))
      }
      return next
    })
  }

  useEffect(() => {
    if (engine !== 'ready') return
    const t = window.setTimeout(() => { void refreshKoe(lines) }, 500)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, dict, engine])

  const effectiveKoe = (l: YLine): string => l.koeEdit ?? koeMap[l.id] ?? ''
  const genKey = (l: YLine): string => {
    const c = charOf(l.charId)
    return JSON.stringify([c.voice, c.speed, c.pitch, effectiveKoe(l)])
  }

  /** 1行分の WAV を生成（長文は分割して連結） */
  const synthLine = async (l: YLine): Promise<Uint8Array> => {
    const c = charOf(l.charId)
    let koe = effectiveKoe(l)
    if (!koe) {
      if (!(await ensureEngine())) throw new Error('engine')
      const conv = await loadConverter()
      koe = l.koeEdit ?? conv.convert(applyDict(l.text))
      if (l.koeEdit === null) setKoeMap((p) => ({ ...p, [l.id]: koe }))
    }
    setEngineMsg(`音声エンジン（${c.voice}）を準備中…`)
    const aq = await loadVoice(c.voice, customVoices)
    setEngineMsg('')
    const chunks = splitKoe(koe)
    const wavs = chunks.map((ch) => aq.run(ch, c.speed) as Uint8Array)
    const joined = concatWavs(wavs)
    return c.pitch === 100 ? joined : applyPitch(joined, c.pitch / 100)
  }

  const generateLine = async (l: YLine, silent = false): Promise<GenInfo | null> => {
    if (!l.text.trim() && !l.koeEdit) { if (!silent) notifyOs('セリフが空です', 'yvm'); return null }
    setBusyLine(l.id)
    try {
      const wav = await synthLine(l)
      const prev = genMap[l.id]
      if (prev) URL.revokeObjectURL(prev.url)
      const bytes = new Uint8Array(wav)
      const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' }))
      const info: GenInfo = { key: genKey(l), url, bytes: bytes.byteLength, sec: wavSeconds(bytes) }
      setGenMap((p) => ({ ...p, [l.id]: info }))
      return info
    } catch (e) {
      if (!silent) notifyOs(`生成に失敗しました: ${e instanceof Error ? e.message : ''}`, 'yvm')
      return null
    } finally {
      setBusyLine(null)
    }
  }

  const playLine = async (l: YLine) => {
    stopAllRef.current = true
    const info = genMap[l.id]?.key === genKey(l) ? genMap[l.id] : await generateLine(l)
    if (!info) return
    if (!audioRef.current) audioRef.current = new Audio()
    const audio = audioRef.current
    audio.src = info.url
    setPlayingId(l.id)
    audio.onended = () => setPlayingId((p) => (p === l.id ? null : p))
    try { await audio.play() } catch { setPlayingId(null) }
  }

  const playAll = async () => {
    if (playingId === '__all__') { stopAllRef.current = true; audioRef.current?.pause(); setPlayingId(null); return }
    stopAllRef.current = false
    setPlayingId('__all__')
    for (const l of lines) {
      if (stopAllRef.current) break
      if (!l.text.trim() && !l.koeEdit) continue
      const info = genMap[l.id]?.key === genKey(l) ? genMap[l.id] : await generateLine(l, true)
      if (!info || stopAllRef.current) break
      await new Promise<void>((resolve) => {
        if (!audioRef.current) audioRef.current = new Audio()
        const audio = audioRef.current as HTMLAudioElement
        audio.src = info.url
        audio.onended = () => resolve()
        audio.onpause = () => resolve()
        void audio.play().catch(() => resolve())
      })
    }
    setPlayingId(null)
  }

  const generateAll = async () => {
    setBusyAll(true)
    for (const l of lines) {
      if (!l.text.trim() && !l.koeEdit) continue
      if (genMap[l.id]?.key !== genKey(l)) await generateLine(l, true)
    }
    setBusyAll(false)
    notifyOs('全行の生成が終わりました', 'yvm')
  }

  const downloadLine = async (l: YLine, idx: number) => {
    const info = genMap[l.id]?.key === genKey(l) ? genMap[l.id] : await generateLine(l)
    if (!info) return
    const a = document.createElement('a')
    a.href = info.url
    a.download = `${String(idx + 1).padStart(3, '0')}_${charOf(l.charId).name}.wav`
    a.click()
  }

  const downloadZip = async () => {
    setBusyAll(true)
    try {
      await generateAll()
      const JSZipMod = await import(/* @vite-ignore */ `${CDN}deps/jszip.js`)
      const JSZip = JSZipMod.default ?? JSZipMod
      const zip = new JSZip()
      const list: string[] = []
      let n = 0
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]
        if (!l.text.trim() && !l.koeEdit) continue
        const info = genMap[l.id]
        const fresh = info && info.key === genKey(l) ? info : await generateLine(l, true)
        if (!fresh) continue
        n++
        const fname = `${String(i + 1).padStart(3, '0')}_${charOf(l.charId).name}.wav`
        const buf = await (await fetch(fresh.url)).arrayBuffer()
        zip.file(fname, buf)
        list.push(`${fname}\t${charOf(l.charId).name}\t${l.text}`)
      }
      if (n === 0) { notifyOs('出力する音声がありません', 'yvm'); return }
      zip.file('セリフ一覧.txt', list.join('\r\n') + '\r\n')
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      download('yvm-voices.zip', blob)
      notifyOs(`ZIPを出力しました（${n}件）`, 'yvm')
    } catch {
      notifyOs('ZIPの出力に失敗しました', 'yvm')
    } finally {
      setBusyAll(false)
    }
  }

  // ---------- 行操作 ----------
  const addLine = (afterId?: string) => {
    const nl: YLine = { id: uid(), charId: lines[lines.length - 1]?.charId ?? chars[0]?.id ?? '', text: '', koeEdit: null }
    setLines((prev) => {
      const rows = [...prev]
      const i = afterId ? rows.findIndex((r) => r.id === afterId) : -1
      if (i >= 0) { nl.charId = rows[i].charId; rows.splice(i + 1, 0, nl) } else rows.push(nl)
      return rows
    })
  }
  const patchLine = (id: string, patch: Partial<YLine>) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const moveLine = (id: string, dir: -1 | 1) => setLines((prev) => {
    const rows = [...prev]
    const i = rows.findIndex((r) => r.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= rows.length) return prev
    ;[rows[i], rows[j]] = [rows[j], rows[i]]
    return rows
  })
  const deleteLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id))

  // ---------- キャラ操作 ----------
  const addChar = () => {
    const c: YChar = { id: uid(), name: `キャラ${chars.length + 1}`, voice: 'f1', speed: 100, pitch: 100 }
    setChars((p) => [...p, c])
  }
  const patchChar = (id: string, patch: Partial<YChar>) => setChars((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  // ---------- カスタム声zip ----------
  const onVoiceZipPicked = (file: File) => {
    void (async () => {
      try {
        const buf = await file.arrayBuffer()
        const zip = await openZip(buf)
        const names = Object.keys(zip.files)
        const baseName = file.name.replace(/\.zip$/i, '') || 'カスタム声'
        // AquesTalk2形式（AquesTalk2.dll + phont）: 新エンジン用に phont ごとに声を登録
        const aq2DllPath = names.find((n) => /(^|\/)AquesTalk2\.dll$/i.test(n))
        if (aq2DllPath) {
          const phontPaths = names.filter((n) => /\.phont$/i.test(n) && !zip.files[n].dir)
          if (phontPaths.length === 0) { notifyOs('AquesTalk2のzipに phont ファイルがありませんでした', 'yvm'); return }
          const dllBuf = await zip.files[aq2DllPath].async('arraybuffer') as ArrayBuffer
          const added: { id: string; name: string; engine?: string }[] = []
          for (const pp of phontPaths) {
            const phontBuf = await zip.files[pp].async('arraybuffer') as ArrayBuffer
            const id = `cv_${uid()}`
            await idbSet(id, { dll: dllBuf, phont: phontBuf }, voiceStore)
            const phontName = pp.split('/').pop()?.replace(/\.phont$/i, '') ?? 'phont'
            added.push({ id, name: `${baseName} / ${phontName}`, engine: 'uc' })
          }
          setCustomVoices((p) => [...p, ...added])
          notifyOs(`AquesTalk2の声を${added.length}件追加しました。キャラ設定の声から選べます`, 'yvm')
          return
        }
        const dllPath = await findDllPath(buf)
        if (!dllPath) { notifyOs('zip内に AquesTalk.dll / AquesTalk2.dll が見つかりませんでした。通常の声zipと同じ構成のものを選んでください', 'yvm'); return }
        const id = `cv_${uid()}`
        await idbSet(id, buf, voiceStore)
        setCustomVoices((p) => [...p, { id, name: baseName }])
        notifyOs(`声「${baseName}」を追加しました。キャラ設定の声から選べます`, 'yvm')
      } catch { notifyOs('声zipを読み込めませんでした', 'yvm') }
    })()
  }
  const deleteCustomVoice = (id: string) => {
    const v = customVoices.find((x) => x.id === id)
    if (!window.confirm(`カスタム声「${v?.name ?? id}」を削除しますか？（使っているキャラは f1 に戻ります）`)) return
    void idbDel(id, voiceStore)
    aqCache.delete(id)
    setChars((prev) => prev.map((c) => (c.voice === id ? { ...c, voice: 'f1' } : c)))
    setCustomVoices((prev) => prev.filter((x) => x.id !== id))
  }
  const deleteChar = (id: string) => {
    if (chars.length <= 1) { notifyOs('キャラは最低1つ必要です', 'yvm'); return }
    if (!window.confirm('このキャラ設定を削除しますか？（このキャラの行は先頭のキャラに切り替わります）')) return
    const fallback = chars.find((c) => c.id !== id)?.id ?? ''
    setLines((prev) => prev.map((l) => (l.charId === id ? { ...l, charId: fallback } : l)))
    setChars((prev) => prev.filter((c) => c.id !== id))
  }

  // ---------- CSV / JSON ----------
  /** [キャラ名, セリフ] のペア列を行に展開し、既存の行をリセットして置き換える（CSV・WebX内読込共通） */
  const importPairs = (pairs: [string, string][], label: string) => {
    const newChars: YChar[] = []
    const findOrCreateChar = (name: string): string => {
      const found = [...chars, ...newChars].find((c) => c.name === name)
      if (found) return found.id
      const c: YChar = {
        id: uid(), name,
        voice: YVM_VOICES[(chars.length + newChars.length) % YVM_VOICES.length],
        speed: 100, pitch: 100,
      }
      newChars.push(c)
      return c.id
    }
    const newLines: YLine[] = pairs
      .filter(([, text]) => text && text.trim())
      .map(([name, text]) => ({ id: uid(), charId: findOrCreateChar(name.trim() || 'キャラ1'), text, koeEdit: null }))
    if (newLines.length === 0) { notifyOs('取り込める行がありませんでした', 'yvm'); return }
    if (newChars.length > 0) setChars((p) => [...p, ...newChars])
    setLines(newLines)
    notifyOs(`${label}を取り込みました（${newLines.length}行・既存の行はリセット）`, 'yvm')
  }

  const importText = (text: string, isCsv: boolean, label: string) => {
    if (isCsv) {
      const pairs: [string, string][] = []
      for (const cols of parseCSV(text)) {
        if (cols.every((c) => !c.trim())) continue
        if (cols.length >= 2) pairs.push([cols[0], cols[1]])
        else if (cols[0].trim()) pairs.push([chars[0]?.name ?? 'キャラ1', cols[0]])
      }
      importPairs(pairs, label)
    } else {
      const pairs: [string, string][] = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => [chars[0]?.name ?? 'キャラ1', l] as [string, string])
      importPairs(pairs, label)
    }
  }

  const onCsvPicked = (file: File) => {
    void (async () => {
      const text = await file.text()
      importText(text, /\.csv$/i.test(file.name) || text.includes(','), 'CSV')
    })()
  }

  // ---------- WebX 内データからの読み込み（YMM4辞書CSVアプリ連携・OPFSドキュメント） ----------
  interface YmmFileLite { id: string; name: string; rows: { charId: string; text: string }[]; updatedAt: number }
  const [pickerOpen, setPickerOpen] = useState(false)
  const [ymmFiles, setYmmFiles] = useState<YmmFileLite[]>([])
  const [webDocs, setWebDocs] = useState<LocalDoc[]>([])
  const openPicker = () => {
    setPickerOpen(true)
    void (async () => {
      try {
        const files = await idbGet('files', createStore('webx-ymm-db', 'kv')) as YmmFileLite[] | undefined
        setYmmFiles(Array.isArray(files) ? files : [])
      } catch { setYmmFiles([]) }
      try {
        const docs = await listDocs()
        setWebDocs(docs.filter((d) => /\.(csv|txt)$/i.test(d.name)))
      } catch { setWebDocs([]) }
    })()
  }
  const importYmmFile = (f: YmmFileLite) => {
    importPairs(f.rows.map((r) => [r.charId, r.text] as [string, string]), `YMM4辞書「${f.name}」`)
    setPickerOpen(false)
  }
  const importWebDoc = (d: LocalDoc) => {
    importText(d.content, /\.csv$/i.test(d.name) || d.content.includes(','), `ドキュメント「${d.name}」`)
    setPickerOpen(false)
  }

  const exportCSV = () => {
    const body = lines.map((l) => `${escapeCSVField(charOf(l.charId).name)},${escapeCSVField(l.text)}`).join('\r\n') + '\r\n'
    download('yvm-lines.csv', new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), body], { type: 'text/csv;charset=utf-8;' }))
  }

  const exportJSON = () => download('yvm-project.json', new Blob([JSON.stringify({ chars, lines, dict }, null, 2)], { type: 'application/json' }))
  const onJsonPicked = (file: File) => {
    void (async () => {
      try {
        const d = JSON.parse(await file.text()) as { chars?: YChar[]; lines?: YLine[]; dict?: YDict[] }
        if (!Array.isArray(d.chars) || !Array.isArray(d.lines)) throw new Error('bad')
        if (!window.confirm('現在のプロジェクトを、このファイルで置き換えますか？')) return
        setChars(d.chars); setLines(d.lines); setDict(Array.isArray(d.dict) ? d.dict : [])
        setGenMap({})
        notifyOs('プロジェクトを復元しました', 'yvm')
      } catch { notifyOs('プロジェクトファイルを読み込めませんでした', 'yvm') }
    })()
  }

  const generatedCount = useMemo(
    () => lines.filter((l) => genMap[l.id]?.key === genKey(l)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, genMap, koeMap, chars],
  )

  return (
    <div className="yvm-root">
      <div className="yvm-head">
        <div className="yvm-logo">🎙️</div>
        <div>
          <div className="yvm-title">YVM ゆっくりボイスメーカー</div>
          <div className="yvm-sub">YukkuriVoiceMaker ・ AquesTalk で音声生成</div>
        </div>
        <span className="yvm-engine">
          {engine === 'ready' ? '🟢 エンジン準備完了' : engine === 'loading' ? '🟡 読み込み中…' : engine === 'error' ? '🔴 読み込み失敗' : '⚪ エンジン未読込'}
        </span>
        <button className="yvm-iconbtn" title="説明・クレジット" onClick={() => setShowInfo(true)}>ⓘ</button>
      </div>

      <div className="yvm-tabs">
        <button className={view === 'lines' ? 'chip on' : 'chip'} onClick={() => setView('lines')}>💬 セリフ</button>
        <button className={view === 'chars' ? 'chip on' : 'chip'} onClick={() => setView('chars')}>🎭 キャラ設定</button>
        <button className={view === 'dict' ? 'chip on' : 'chip'} onClick={() => setView('dict')}>📖 ユーザー辞書（{dict.length}）</button>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => void ensureEngine()}>エンジン読込</button>
        <button className="btn" onClick={exportJSON}>JSON保存</button>
        <button className="btn" onClick={() => jsonRef.current?.click()}>JSON復元</button>
      </div>
      {engineMsg && <p className="hint" style={{ margin: '0 10px' }}>{engineMsg}</p>}

      {view === 'lines' && (
        <>
          <div className="yvm-toolbar">
            <button className="btn accent" disabled={busyAll} onClick={() => void generateAll()}>🔊 全行を生成</button>
            <button className="btn" onClick={() => void playAll()}>{playingId === '__all__' ? '⏹ 停止' : '▶ 全行再生'}</button>
            <button className="btn accent" disabled={busyAll} onClick={() => void downloadZip()}>⬇ ZIPで一括出力</button>
            <button className="btn" onClick={() => csvRef.current?.click()}>CSV取込</button>
            <button className="btn" onClick={openPicker}>WebX内から読込</button>
            <button className="btn" onClick={exportCSV}>CSV出力</button>
            <span className="hint">生成済み {generatedCount}/{lines.length}行 ・ データは端末内に自動保存</span>
          </div>
          {pickerOpen && (
            <div className="yvm-picker">
              <div className="yvm-picker-head">
                <strong>WebX 内のデータから読み込む</strong>
                <button className="yvm-iconbtn" onClick={() => setPickerOpen(false)}>✕ 閉じる</button>
              </div>
              <div className="yvm-picker-sec">🗣 YMM4辞書CSVアプリのファイル</div>
              {ymmFiles.length === 0 && <p className="hint" style={{ margin: 0 }}>YMM4辞書CSVアプリに保存されたファイルはありません。</p>}
              {ymmFiles.map((f) => (
                <button key={f.id} className="yvm-picker-item" onClick={() => importYmmFile(f)}>
                  <span>{f.name || '（無題）'}</span>
                  <span className="hint">{f.rows.length}行 ・ {new Date(f.updatedAt).toLocaleDateString()}</span>
                </button>
              ))}
              <div className="yvm-picker-sec">📁 ドキュメント（OPFS / 本体保存の .csv / .txt）</div>
              {webDocs.length === 0 && <p className="hint" style={{ margin: 0 }}>拡張子が .csv / .txt のドキュメントはありません。</p>}
              {webDocs.map((d) => (
                <button key={d.id} className="yvm-picker-item" onClick={() => importWebDoc(d)}>
                  <span>{d.name}</span>
                  <span className="hint">{new Date(d.updatedAt).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          )}
          <div className="yvm-rows">
            {lines.map((l, i) => {
              const c = charOf(l.charId)
              const info = genMap[l.id]
              const fresh = info && info.key === genKey(l)
              return (
                <div key={l.id} className="yvm-row">
                  <span className="yvm-row-bar" style={{ background: colorOf(c.name) }} />
                  <span className="yvm-idx">{i + 1}</span>
                  <select className="yvm-sel" value={l.charId} onChange={(e) => patchLine(l.id, { charId: e.target.value })}>
                    {chars.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                  </select>
                  <div className="yvm-row-main">
                    <input
                      className="yvm-txt"
                      value={l.text}
                      placeholder="セリフを入力"
                      onChange={(e) => patchLine(l.id, { text: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLine(l.id) } }}
                    />
                    <div className="yvm-koe">
                      {l.koeEdit !== null ? (
                        <>
                          <input className="yvm-koe-input" value={l.koeEdit} onChange={(e) => patchLine(l.id, { koeEdit: e.target.value })} placeholder="読み（音声記号）を直接指定" />
                          <button className="yvm-mini" title="自動読みに戻す" onClick={() => patchLine(l.id, { koeEdit: null })}>自動に戻す</button>
                        </>
                      ) : (
                        <>
                          <span className="yvm-koe-txt">{koeMap[l.id] ? `読み: ${koeMap[l.id]}` : '読み: （エンジン読込後に自動表示）'}</span>
                          <button className="yvm-mini" title="読みを手動で修正" onClick={() => patchLine(l.id, { koeEdit: koeMap[l.id] ?? '' })}>✏️ 読み修正</button>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="yvm-status">{busyLine === l.id ? '生成中…' : fresh ? `✓ ${info.sec.toFixed(1)}秒` : '未生成'}</span>
                  <span className="yvm-rowacts">
                    <button className="yvm-iconbtn" title="生成して再生" onClick={() => void playLine(l)}>{playingId === l.id ? '🔊' : '▶'}</button>
                    <button className="yvm-iconbtn" title="WAVをダウンロード" onClick={() => void downloadLine(l, i)}>⬇</button>
                    <button className="yvm-iconbtn" title="上へ" onClick={() => moveLine(l.id, -1)}>↑</button>
                    <button className="yvm-iconbtn" title="下へ" onClick={() => moveLine(l.id, 1)}>↓</button>
                    <button className="yvm-iconbtn" title="削除" onClick={() => deleteLine(l.id)}>✕</button>
                  </span>
                </div>
              )
            })}
          </div>
          <button className="yvm-addrow" onClick={() => addLine()}>＋ 行を追加</button>
          <p className="hint" style={{ margin: '0 10px 10px' }}>
            YMM4辞書CSV（1列目=キャラ名、2列目=セリフ）を取り込むと行に展開されます（今の行はリセットされ、読み込んだ内容だけになります）。ZIP出力は「001_キャラ名.wav」のような分割ファイル＋セリフ一覧.txtです。
          </p>
        </>
      )}

      {view === 'chars' && (
        <div className="yvm-pane">
          <p className="hint" style={{ margin: 0 }}>キャラごとに声の種類・速さ・ピッチを保存できます。ピッチは長さを変えずに音程だけを変える方式（YMM4の音程に近い処理）です。</p>
          {chars.map((c) => (
            <div key={c.id} className="yvm-char">
              <span className="yvm-ava" style={{ background: colorOf(c.name) }}>{c.name.slice(0, 1)}</span>
              <input className="yvm-char-name" value={c.name} onChange={(e) => patchChar(c.id, { name: e.target.value })} />
              <label className="yvm-lab">声
                <select value={c.voice} onChange={(e) => patchChar(c.id, { voice: e.target.value })}>
                  <optgroup label="Aq2（純正AquesTalk2）">
                    {YVM_AQ2_VOICES.map((v) => <option key={v.phont} value={`aq2:${v.phont}`}>{v.label}</option>)}
                  </optgroup>
                  <optgroup label="Aq1（同梱・Legacy）">
                    {YVM_VOICES.map((v) => <option key={v} value={v}>{VOICE_LABEL[v]}</option>)}
                  </optgroup>
                  {customVoices.length > 0 && (
                    <optgroup label="カスタム">
                      {customVoices.map((v) => <option key={v.id} value={v.id}>{v.name}({v.engine === 'uc' ? 'aq2' : 'aq1'})</option>)}
                    </optgroup>
                  )}
                </select>
              </label>
              <label className="yvm-lab">速さ
                <span className="yvm-slider-row">
                  <input type="range" min={50} max={300} step={5} value={c.speed} onChange={(e) => patchChar(c.id, { speed: Number(e.target.value) })} />
                  <input className="yvm-num" type="number" min={50} max={300} step={1} value={c.speed} onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) patchChar(c.id, { speed: Math.min(300, Math.max(50, Math.round(v))) }) }} />
                </span>
              </label>
              <label className="yvm-lab">ピッチ
                <span className="yvm-slider-row">
                  <input type="range" min={50} max={200} step={5} value={c.pitch} onChange={(e) => patchChar(c.id, { pitch: Number(e.target.value) })} />
                  <span className="yvm-num-wrap"><input className="yvm-num" type="number" min={50} max={200} step={1} value={c.pitch} onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) patchChar(c.id, { pitch: Math.min(200, Math.max(50, Math.round(v))) }) }} />%</span>
                </span>
              </label>
              <button className="yvm-iconbtn" title="試し聞き" onClick={() => {
                const sample: YLine = { id: '__sample__', charId: c.id, text: 'ゆっくりしていってね', koeEdit: null }
                void playLine(sample)
              }}>▶ 試聴</button>
              <button className="yvm-iconbtn" title="削除" onClick={() => deleteChar(c.id)}>✕</button>
            </div>
          ))}
          <button className="yvm-addrow" onClick={addChar}>＋ キャラを追加</button>
          <div className="yvm-picker-sec" style={{ marginTop: 14 }}>カスタム声（AquesTalkの声zip）</div>
          <p className="hint" style={{ margin: 0 }}>中身が通常の声zipと同じ構成（フォルダ内に AquesTalk.dll を含むzip）を追加すると、その声をキャラに割り当てられます。AquesTalk2形式（AquesTalk2.dll と phont フォルダを含むzip）にも対応し、phontごとに声が登録されます。zipは端末内に保存されます。</p>
          {customVoices.map((v) => (
            <div key={v.id} className="yvm-char">
              <span className="yvm-ava" style={{ background: colorOf(v.name) }}>{v.name.slice(0, 1)}</span>
              <span style={{ flex: 1 }}>{v.name}</span>
              <button className="yvm-iconbtn" title="削除" onClick={() => deleteCustomVoice(v.id)}>✕</button>
            </div>
          ))}
          <button className="yvm-addrow" onClick={() => voiceRef.current?.click()}>＋ 声zipを追加</button>
        </div>
      )}

      {view === 'dict' && (
        <div className="yvm-pane">
          <p className="hint" style={{ margin: 0 }}>変な読み方をする単語を登録すると、読み変換の前に「読み」へ置き換えます。読みはひらがなで書いてください（例: 単語「魔理沙」→ 読み「まりさ」）。長い単語から優先して適用されます。</p>
          <div className="yvm-dict-add">
            <input value={newWord} placeholder="単語" onChange={(e) => setNewWord(e.target.value)} />
            <span>→</span>
            <input value={newReading} placeholder="読み（ひらがな）" onChange={(e) => setNewReading(e.target.value)} />
            <button className="btn accent" onClick={() => {
              const w = newWord.trim(); const r = newReading.trim()
              if (!w || !r) return
              setDict((p) => [...p.filter((d) => d.word !== w), { id: uid(), word: w, reading: r }])
              setNewWord(''); setNewReading('')
            }}>＋ 登録</button>
          </div>
          {dict.map((d) => (
            <div key={d.id} className="yvm-dict-row">
              <span className="yvm-dict-word">{d.word}</span>
              <span>→</span>
              <span>{d.reading}</span>
              <span style={{ flex: 1 }} />
              <button className="yvm-iconbtn" title="削除" onClick={() => setDict((p) => p.filter((x) => x.id !== d.id))}>✕</button>
            </div>
          ))}
          {dict.length === 0 && <p className="hint">まだ登録がありません。</p>}
        </div>
      )}

      {showInfo && (
        <div className="yvm-info-overlay" onClick={() => setShowInfo(false)}>
          <div className="yvm-info-card" onClick={(e) => e.stopPropagation()}>
            <div className="yvm-info-title">説明・クレジット</div>
            <p>Aquestalkのプログラムを使用しています。</p>
            <p>音声合成エンジン: AquesTalk（© 株式会社アクエスト）／ ライブラリ: aquestalk.js・kanji2koe-openjtalk（y52en氏、MIT License）、Unicorn Engine（GPLv2）。</p>
            <p>エンジンのファイルは自前CDN（yukuri-san.github.io/UniversalOffice/cdn）から読み込みます（初回のみ約23MB、新エンジンは声ごとに約1.3MB）。</p>
            <p>声の表記: 「女声1(aq1-f1)」は Aq1（AquesTalk1系・同梱）の声、「ゆっくり(aq2-aq_yukkuri)」は Aq2（純正AquesTalk2）の声です。カスタム声zipは Aq1形式・Aq2形式の両方に対応します。</p>
            <button className="btn accent" onClick={() => setShowInfo(false)}>閉じる</button>
          </div>
        </div>
      )}

      <input ref={voiceRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onVoiceZipPicked(f) }} />
      <input ref={csvRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onCsvPicked(f) }} />
      <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onJsonPicked(f) }} />
    </div>
  )
}
