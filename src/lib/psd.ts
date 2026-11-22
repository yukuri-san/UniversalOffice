// PSD 読み込み（ag-psd）とレイヤー合成
// PSDTool 方式：レイヤーを「常時表示（ベース）」「表情プリセット」「口（開/閉）」に割り当てて合成する。
import { readPsd } from 'ag-psd'

export interface PsdLayer {
  /** グループを含むパス名（例: 口/開） */
  name: string
  canvas: HTMLCanvasElement | null
  left: number
  top: number
  opacity: number // 0..1
}

export interface PsdDoc {
  width: number
  height: number
  /** パネル表示順（上→下）。合成時は逆順（下→上）に描く */
  layers: PsdLayer[]
}

interface AgLayer {
  name?: string
  left?: number
  top?: number
  opacity?: number
  hidden?: boolean
  children?: AgLayer[]
  imageData?: { width: number; height: number; data: Uint8ClampedArray }
  canvas?: HTMLCanvasElement
}

function layerCanvas(l: AgLayer): HTMLCanvasElement | null {
  if (l.canvas) return l.canvas
  if (l.imageData && l.imageData.width > 0 && l.imageData.height > 0) {
    const cv = document.createElement('canvas')
    cv.width = l.imageData.width
    cv.height = l.imageData.height
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    const img = new ImageData(new Uint8ClampedArray(l.imageData.data), l.imageData.width, l.imageData.height)
    ctx.putImageData(img, 0, 0)
    return cv
  }
  return null
}

function flatten(layers: AgLayer[], prefix: string, out: PsdLayer[]) {
  for (const l of layers) {
    const name = prefix ? `${prefix}/${l.name ?? ''}` : (l.name ?? '')
    if (l.children && l.children.length > 0) {
      flatten(l.children, name, out)
    } else {
      out.push({
        name,
        canvas: layerCanvas(l),
        left: l.left ?? 0,
        top: l.top ?? 0,
        opacity: (l.opacity ?? 255) / 255,
      })
    }
  }
}

/** PSD バイト列を解析してレイヤー一覧を得る */
export function loadPsdDoc(buf: ArrayBuffer): PsdDoc {
  const psd = readPsd(buf, { useImageData: true, skipThumbnail: true }) as unknown as {
    width: number; height: number; children?: AgLayer[]
  }
  const layers: PsdLayer[] = []
  flatten(psd.children ?? [], '', layers)
  return { width: psd.width, height: psd.height, layers }
}

/** 指定したレイヤー名の集合だけを合成したキャンバスを返す */
export function renderPsdComposite(doc: PsdDoc, visible: ReadonlySet<string>): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = doc.width
  cv.height = doc.height
  const ctx = cv.getContext('2d')
  if (!ctx) return cv
  // パネル順は上→下なので、逆順に描く（下のレイヤーから）
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i]
    if (!l.canvas || !visible.has(l.name)) continue
    ctx.save()
    ctx.globalAlpha = l.opacity
    ctx.drawImage(l.canvas, l.left, l.top)
    ctx.restore()
  }
  return cv
}
