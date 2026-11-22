// ゆっくり音声合成の共有ライブラリ（YVM / WME 共用）
// エンジン本体は自前 CDN（/cdn/yvm/）から必要時にだけ読み込む。
// 音声合成: AquesTalk © 株式会社アクエスト（Aquestalkのプログラムを使用しています）
// Legacy = aquestalk.js（v86）、新エンジン = aquestalk2（Unicorn 専用ローダー）

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any

export const YUKKURI_CDN = 'https://yukuri-san.github.io/UniversalOffice/cdn/yvm/'
const AQ2_DIR = `${YUKKURI_CDN}aquestalk2/voices/aq2/`

export const AQ1_VOICES = ['f1', 'f2', 'm1', 'm2', 'dvd', 'imd1', 'jgr', 'r1'] as const
export const AQ1_LABEL: Record<string, string> = {
  f1: '女声1(aq1-f1)', f2: '女声2(aq1-f2)', m1: '男声1(aq1-m1)', m2: '男声2(aq1-m2)',
  dvd: 'dvd(aq1-dvd)', imd1: 'imd1(aq1-imd1)', jgr: 'jgr(aq1-jgr)', r1: 'ロボ(aq1-r1)',
}
export const AQ2_VOICES: { phont: string; label: string }[] = [
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

// ---------- WAV ユーティリティ ----------
interface WavInfo { channels: number; sampleRate: number; bits: number; dataOff: number; dataLen: number }

export function parseWav(bytes: Uint8Array): WavInfo | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < 44 || String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF') return null
  let channels = 1, sampleRate = 8000, bits = 16, dataOff = -1, dataLen = 0
  let off = 12
  while (off + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(...bytes.slice(off, off + 4))
    const size = dv.getUint32(off + 4, true)
    if (id === 'fmt ') {
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
  return { channels, sampleRate, bits, dataOff, dataLen }
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

export function wavSeconds(bytes: Uint8Array): number {
  const info = parseWav(bytes)
  if (!info) return 0
  return info.dataLen / (info.sampleRate * info.channels * (info.bits / 8))
}

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

function timeStretchPcm(src: Float32Array, ratio: number): Float32Array {
  if (ratio === 1 || src.length < 512) return src
  const WIN = 256
  const HOP_S = 64
  const HOP_A = HOP_S / ratio
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

/** ピッチ変更（長さを変えずに音程だけ変える） */
export function applyPitch(bytes: Uint8Array, factor: number): Uint8Array {
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

function sjisLen(s: string): number {
  let n = 0
  for (const c of s) n += c.charCodeAt(0) < 0x80 ? 1 : 2
  return n
}

function splitKoe(koe: string, limit = 3000): string[] {
  const parts = koe.split(/(?<=。)/).filter((p) => p.length > 0)
  const chunks: string[] = []
  let cur = ''
  for (const p of parts) {
    if (sjisLen(cur + p) > limit && cur) { chunks.push(cur); cur = '' }
    if (sjisLen(p) > limit) {
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

// ---------- エンジン読み込み ----------
let convPromise: Promise<AnyMod> | null = null
const aqCache = new Map<string, Promise<AnyMod>>()

/** 漢字→音声記号の変換器（初回は約20MBの読み込みが要る） */
export function loadKoeConverter(): Promise<AnyMod> {
  if (!convPromise) {
    convPromise = import(/* @vite-ignore */ `${YUKKURI_CDN}kanji2koe/dist/index.js`)
      .then((m: AnyMod) => (m.load() as AnyMod))
  }
  return convPromise
}

export async function textToKoe(text: string): Promise<string> {
  const conv = await loadKoeConverter()
  return conv.convert(text) as string
}

async function loadUcEngine(dll: ArrayBuffer, phont: ArrayBuffer | null): Promise<AnyMod> {
  const m = await import(/* @vite-ignore */ `${YUKKURI_CDN}aquestalk2/aquestalk-uc.js`) as AnyMod
  return m.loadAquesTalkUC({ dll, phont }) as AnyMod
}

/** 声IDから合成器を得る（'f1' 等の Aq1 / 'aq2:<phont>'）。カスタム声 cv_ は YVM 側で対応 */
export function loadYukkuriVoice(voiceId: string): Promise<AnyMod> {
  let p = aqCache.get(voiceId)
  if (!p) {
    if (voiceId.startsWith('aq2:')) {
      const phont = voiceId.slice(4)
      p = (async () => {
        const [dll, ph] = await Promise.all([
          fetch(`${AQ2_DIR}AquesTalk2.dll`).then((r) => { if (!r.ok) throw new Error('AquesTalk2.dll の取得に失敗'); return r.arrayBuffer() }),
          fetch(`${AQ2_DIR}phont/${phont}.phont`).then((r) => { if (!r.ok) throw new Error('phont の取得に失敗'); return r.arrayBuffer() }),
        ])
        return loadUcEngine(dll, ph)
      })()
    } else {
      p = import(/* @vite-ignore */ `${YUKKURI_CDN}aquestalk/dist/index.js`).then((m: AnyMod) => m.load(voiceId))
    }
    aqCache.set(voiceId, p)
  }
  return p
}

export interface SynthOptions {
  voiceId: string
  speed: number // 50..300
  pitch: number // 50..200 (%)
  koeEdit?: string | null // 読みの手動上書き（音声記号）
}

/** テキスト（または読み上書き）から WAV を生成する。長文は分割して連結 */
export async function synthesizeYukkuri(text: string, opts: SynthOptions): Promise<{ wav: Uint8Array; koe: string; seconds: number }> {
  const koe = opts.koeEdit && opts.koeEdit.trim() ? opts.koeEdit : await textToKoe(text)
  const aq = await loadYukkuriVoice(opts.voiceId)
  const chunks = splitKoe(koe)
  const wavs = chunks.map((ch) => aq.run(ch, opts.speed) as Uint8Array)
  const joined = concatWavs(wavs)
  const wav = opts.pitch === 100 ? joined : applyPitch(joined, opts.pitch / 100)
  return { wav, koe, seconds: wavSeconds(wav) }
}
