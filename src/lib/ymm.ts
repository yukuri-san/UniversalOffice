// YMM4再現アプリ（仮称 YME）コア型定義・プロジェクト生成
// 設計: workspace/goals/universaloffice-and-webx-web-os/files/ymm4-repro-design.md
// 時間はすべて秒（number, 小数可）。描画は Canvas 2D、プレビューと書き出しで drawFrame を共用する。

export type YmmAspect = '16:9' | '9:16'
export type YmmRes = 360 | 480 | 720 | 1080
export type YmmFps = 20 | 24 | 30

export interface YmmProjectSettings {
  aspect: YmmAspect
  res: YmmRes // 短辺ではなく「p」表記: 16:9なら高さ、9:16なら幅がこの値
  fps: YmmFps
}

export function frameSize(s: YmmProjectSettings): { width: number; height: number } {
  if (s.aspect === '16:9') {
    const height = s.res
    const width = Math.round((height * 16) / 9 / 2) * 2
    return { width, height }
  }
  const width = s.res
  const height = Math.round((width * 16) / 9 / 2) * 2
  return { width, height }
}

// ---------- アイテム ----------
export type YmmItemKind = 'serif' | 'chara' | 'image' | 'text' | 'audio'

export interface YmmItemBase {
  id: string
  kind: YmmItemKind
  start: number // 秒
  length: number // 秒
  layer: number // 大きいほど手前
}

/** セリフ：テキスト＋生成音声＋字幕。length は生成音声の尺に連動（未生成時は推定） */
export interface YmmSerifItem extends YmmItemBase {
  kind: 'serif'
  charId: string // キャラ定義（声・立ち絵）の参照
  text: string
  koeEdit: string | null // 読み（音声記号）の手動上書き
  voiceId: string // 'f1' などの Aq1 声 / 'aq2:<phont>' / カスタム声
  speed: number // 50..300
  pitch: number // 50..200 (%)
  audioKey: string | null // 生成済みWAVの保存キー（IndexedDB）
  showSubtitle: boolean
}

/** 立ち絵：画像 or PSD。表情プリセットと口パクを持つ */
export interface YmmCharaItem extends YmmItemBase {
  kind: 'chara'
  charId: string // 口パク連動するセリフのキャラ
  assetKey: string // 画像/PSD の保存キー（IndexedDB）
  isPsd: boolean
  x: number // 0..1（中心基準の相対座標）
  y: number
  scale: number // 画面高さに対する割合 0..2
  expression: string // 表情プリセット名
  lipSync: boolean // セリフ中に口パクするか
}

export interface YmmImageItem extends YmmItemBase {
  kind: 'image'
  assetKey: string
  x: number
  y: number
  scale: number
  opacity: number // 0..1
}

export interface YmmTextItem extends YmmItemBase {
  kind: 'text'
  text: string
  x: number
  y: number
  fontSize: number // 画面高さに対する割合
  color: string
  bold: boolean
}

/** 音声/BGM：ファイル読み込み */
export interface YmmAudioItem extends YmmItemBase {
  kind: 'audio'
  assetKey: string
  name: string
  volume: number // 0..1
  loop: boolean
}

export type YmmItem = YmmSerifItem | YmmCharaItem | YmmImageItem | YmmTextItem | YmmAudioItem

// ---------- キャラ定義 ----------
export interface YmmCharaDef {
  id: string
  name: string
  voiceId: string
  speed: number
  pitch: number
  color: string // タイムライン表示色
  /** PSDパーツ割り当て: パーツ種別 -> レイヤー名リスト（PSDTool方式） */
  psdParts?: Record<string, string[]>
  /** 表情プリセット: 名前 -> 表示するレイヤー名の集合 */
  expressions?: Record<string, string[]>
  /** 口パク用: 口（開）/（閉）に割り当てたレイヤー名 */
  mouthOpen?: string[]
  mouthClosed?: string[]
}

export interface YmmProject {
  id: string
  name: string
  settings: YmmProjectSettings
  items: YmmItem[]
  charas: YmmCharaDef[]
  updatedAt: number
}

let counter = 0
export function ymmUid(): string {
  counter += 1
  return `y${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

export function createProject(name = '無題のプロジェクト'): YmmProject {
  return {
    id: ymmUid(),
    name,
    settings: { aspect: '16:9', res: 720, fps: 30 },
    items: [],
    charas: [
      { id: ymmUid(), name: '霊夢', voiceId: 'f1', speed: 100, pitch: 100, color: '#e5484d' },
      { id: ymmUid(), name: '魔理沙', voiceId: 'f2', speed: 100, pitch: 100, color: '#f5a524' },
    ],
    updatedAt: Date.now(),
  }
}

/** プロジェクト全体の長さ（秒）。最低 5 秒。 */
export function projectDuration(p: YmmProject): number {
  let end = 5
  for (const it of p.items) end = Math.max(end, it.start + it.length)
  return end
}

/** 指定時刻に有効なアイテムをレイヤー順（奥→手前）で返す */
export function activeItems(p: YmmProject, t: number): YmmItem[] {
  return p.items
    .filter((it) => t >= it.start && t < it.start + it.length)
    .sort((a, b) => a.layer - b.layer)
}

/** 口パク：セリフアイテム内では 0.25 秒ごとに開/閉を切り替える */
export const LIP_SYNC_INTERVAL = 0.25
export function mouthOpenAt(itemStart: number, t: number): boolean {
  return Math.floor((t - itemStart) / LIP_SYNC_INTERVAL) % 2 === 0
}
