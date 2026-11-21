import { useEffect, useRef, useState } from 'react'
import { useLang } from '../lib/i18n'
import { notifyOs } from '../lib/notify'

const W = 1200
const H = 800
const PALETTE = ['#111827', '#e11d48', '#f59e0b', '#facc15', '#10b981', '#2563eb', '#7c3aed', '#ec4899', '#ffffff']

type Tool = 'brush' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'fill' | 'picker' | 'text'

interface Layer {
  id: number
  name: string
  visible: boolean
  opacity: number
  canvas: HTMLCanvasElement
}

let layerSeq = 1

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  return c
}

function hexToRgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]
}

function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, fill: [number, number, number, number], tolerance = 48) {
  const img = ctx.getImageData(0, 0, W, H)
  const data = img.data
  const sx = Math.max(0, Math.min(W - 1, Math.floor(x)))
  const sy = Math.max(0, Math.min(H - 1, Math.floor(y)))
  const si = (sy * W + sx) * 4
  const target: [number, number, number, number] = [data[si], data[si + 1], data[si + 2], data[si + 3]]
  if (target[0] === fill[0] && target[1] === fill[1] && target[2] === fill[2] && target[3] === fill[3]) return
  const matches = (i: number) =>
    Math.abs(data[i] - target[0]) <= tolerance &&
    Math.abs(data[i + 1] - target[1]) <= tolerance &&
    Math.abs(data[i + 2] - target[2]) <= tolerance &&
    Math.abs(data[i + 3] - target[3]) <= tolerance
  const stack: [number, number][] = [[sx, sy]]
  const seen = new Uint8Array(W * H)
  while (stack.length) {
    const [cx, cy] = stack.pop()!
    const idx = cy * W + cx
    if (seen[idx]) continue
    seen[idx] = 1
    const i = idx * 4
    if (!matches(i)) continue
    data[i] = fill[0]
    data[i + 1] = fill[1]
    data[i + 2] = fill[2]
    data[i + 3] = fill[3]
    if (cx > 0) stack.push([cx - 1, cy])
    if (cx < W - 1) stack.push([cx + 1, cy])
    if (cy > 0) stack.push([cx, cy - 1])
    if (cy < H - 1) stack.push([cx, cy + 1])
  }
  ctx.putImageData(img, 0, 0)
}

export default function Paint() {
  const { t } = useLang()
  const layersRef = useRef<Layer[]>([])
  const undoRef = useRef<Map<number, string[]>>(new Map())
  const [, setRenderTick] = useState(0)
  const rerender = () => setRenderTick((v) => v + 1)
  const [activeId, setActiveId] = useState(0)
  const [tool, setTool] = useState<Tool>('brush')
  const [color, setColor] = useState('#2563eb')
  const [size, setSize] = useState(6)
  const [brushOpacity, setBrushOpacity] = useState(1)
  const [textEdit, setTextEdit] = useState<{ x: number; y: number; fontPx: number; displayPx: number } | null>(null)
  const [textValue, setTextValue] = useState('')
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const drawState = useRef<{ drawing: boolean; start: { x: number; y: number } | null; last: { x: number; y: number } | null }>({ drawing: false, start: null, last: null })
  const importRef = useRef<HTMLInputElement>(null)

  if (layersRef.current.length === 0) {
    const base = makeCanvas()
    const ctx = base.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    layersRef.current = [{ id: 0, name: 'レイヤー 1', visible: true, opacity: 1, canvas: base }]
  }
  const layers = layersRef.current
  const active = layers.find((l) => l.id === activeId) ?? layers[layers.length - 1]

  useEffect(() => {
    if (active && activeId !== active.id) setActiveId(active.id)
  }, [active, activeId])

  const pushUndo = (layer: Layer) => {
    const stack = undoRef.current.get(layer.id) ?? []
    stack.push(layer.canvas.toDataURL())
    if (stack.length > 25) stack.shift()
    undoRef.current.set(layer.id, stack)
  }

  const undo = () => {
    if (!active) return
    const stack = undoRef.current.get(active.id) ?? []
    const prev = stack.pop()
    if (!prev) return
    const img = new Image()
    img.onload = () => {
      const ctx = active.canvas.getContext('2d')!
      ctx.clearRect(0, 0, W, H)
      ctx.drawImage(img, 0, 0)
      rerender()
    }
    img.src = prev
  }

  // 選択中のレイヤーをクリア（元に戻すで復旧できる）
  const clearLayer = () => {
    if (!active) return
    pushUndo(active)
    active.canvas.getContext('2d')!.clearRect(0, 0, W, H)
    rerender()
  }

  // Ctrl+Z / Cmd+Z で元に戻す（テキスト入力中は入力欄の操作を優先）
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return
    const ae = document.activeElement as HTMLElement | null
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
    e.preventDefault()
    undo()
  }

  const composite = (): HTMLCanvasElement => {
    const out = makeCanvas()
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    for (const layer of layers) {
      if (!layer.visible) continue
      ctx.save()
      ctx.globalAlpha = layer.opacity
      ctx.drawImage(layer.canvas, 0, 0)
      ctx.restore()
    }
    return out
  }

  const pos = (e: React.PointerEvent) => {
    const rect = overlayRef.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    }
  }

  const drawShape = (ctx: CanvasRenderingContext2D, shapeTool: Tool, from: { x: number; y: number }, to: { x: number; y: number }) => {
    ctx.strokeStyle = color
    ctx.lineWidth = size
    ctx.lineCap = 'round'
    ctx.globalAlpha = brushOpacity
    ctx.beginPath()
    if (shapeTool === 'line') {
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    } else if (shapeTool === 'rect') {
      ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y)
    } else if (shapeTool === 'ellipse') {
      ctx.ellipse((from.x + to.x) / 2, (from.y + to.y) / 2, Math.abs(to.x - from.x) / 2, Math.abs(to.y - from.y) / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  const commitText = () => {
    if (!textEdit || !active) return
    const value = textValue
    setTextEdit(null)
    setTextValue('')
    if (!value.trim()) return
    pushUndo(active)
    const ctx = active.canvas.getContext('2d')!
    ctx.save()
    ctx.font = `${textEdit.fontPx}px sans-serif`
    ctx.textBaseline = 'top'
    ctx.fillStyle = color
    ctx.globalAlpha = brushOpacity
    ctx.fillText(value, textEdit.x, textEdit.y)
    ctx.restore()
    rerender()
  }

  const onDown = (e: React.PointerEvent) => {
    if (!active) return
    rootRef.current?.focus({ preventScroll: true })
    const p = pos(e)

    if (tool === 'text') {
      commitText()
      const rect = overlayRef.current!.getBoundingClientRect()
      setTextEdit({ x: p.x, y: p.y, fontPx: size, displayPx: Math.max(10, (size * rect.width) / W) })
      setTextValue('')
      return
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    if (tool === 'picker') {
      const comp = composite()
      const pixel = comp.getContext('2d')!.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data
      const hex = `#${[pixel[0], pixel[1], pixel[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
      setColor(hex)
      setTool('brush')
      return
    }
    if (tool === 'fill') {
      pushUndo(active)
      floodFill(active.canvas.getContext('2d')!, p.x, p.y, hexToRgba(color))
      rerender()
      return
    }

    pushUndo(active)
    drawState.current = { drawing: true, start: p, last: p }
    if (tool === 'brush' || tool === 'eraser') {
      const ctx = active.canvas.getContext('2d')!
      ctx.strokeStyle = color
      ctx.lineWidth = size
      ctx.lineCap = 'round'
      ctx.globalAlpha = brushOpacity
      if (tool === 'eraser') ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x + 0.1, p.y + 0.1)
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      rerender()
    }
  }

  const onMove = (e: React.PointerEvent) => {
    const st = drawState.current
    if (!st.drawing || !active) return
    const p = pos(e)
    if (tool === 'brush' || tool === 'eraser') {
      const ctx = active.canvas.getContext('2d')!
      ctx.strokeStyle = color
      ctx.lineWidth = tool === 'eraser' ? size * 3 : size
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = brushOpacity
      if (tool === 'eraser') ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.moveTo(st.last!.x, st.last!.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      st.last = p
      rerender()
    } else if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      const overlay = overlayRef.current
      if (!overlay || !st.start) return
      const ctx = overlay.getContext('2d')!
      ctx.clearRect(0, 0, W, H)
      drawShape(ctx, tool, st.start, p)
    }
  }

  const onUp = (e: React.PointerEvent) => {
    const st = drawState.current
    if (!st.drawing || !active) return
    if ((tool === 'line' || tool === 'rect' || tool === 'ellipse') && st.start) {
      const overlay = overlayRef.current
      overlay?.getContext('2d')?.clearRect(0, 0, W, H)
      drawShape(active.canvas.getContext('2d')!, tool, st.start, pos(e))
      rerender()
    }
    drawState.current = { drawing: false, start: null, last: null }
  }

  const addLayer = () => {
    const layer: Layer = { id: layerSeq++, name: `レイヤー ${layerSeq}`, visible: true, opacity: 1, canvas: makeCanvas() }
    layersRef.current = [...layersRef.current, layer]
    setActiveId(layer.id)
    rerender()
  }

  const deleteLayer = () => {
    if (layers.length <= 1 || !active) return
    layersRef.current = layers.filter((l) => l.id !== active.id)
    setActiveId(layersRef.current[layersRef.current.length - 1].id)
    rerender()
  }

  const duplicateLayer = () => {
    if (!active) return
    const copy = makeCanvas()
    copy.getContext('2d')!.drawImage(active.canvas, 0, 0)
    const layer: Layer = { id: layerSeq++, name: `${active.name} のコピー`, visible: true, opacity: active.opacity, canvas: copy }
    const idx = layers.findIndex((l) => l.id === active.id)
    const next = [...layers]
    next.splice(idx + 1, 0, layer)
    layersRef.current = next
    setActiveId(layer.id)
    rerender()
  }

  const mergeDown = () => {
    if (!active) return
    const idx = layers.findIndex((l) => l.id === active.id)
    if (idx <= 0) return
    const below = layers[idx - 1]
    pushUndo(below)
    const ctx = below.canvas.getContext('2d')!
    ctx.save()
    ctx.globalAlpha = active.opacity
    ctx.drawImage(active.canvas, 0, 0)
    ctx.restore()
    layersRef.current = layers.filter((l) => l.id !== active.id)
    setActiveId(below.id)
    rerender()
  }

  const moveLayer = (dir: 1 | -1) => {
    if (!active) return
    const idx = layers.findIndex((l) => l.id === active.id)
    const target = idx + dir
    if (target < 0 || target >= layers.length) return
    const next = [...layers]
    const [item] = next.splice(idx, 1)
    next.splice(target, 0, item)
    layersRef.current = next
    rerender()
  }

  const importImage = (file: File) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const layer: Layer = { id: layerSeq++, name: file.name.slice(0, 18) || '画像', visible: true, opacity: 1, canvas: makeCanvas() }
      const ctx = layer.canvas.getContext('2d')!
      const scale = Math.min(W / img.width, H / img.height, 1)
      const w = img.width * scale
      const h = img.height * scale
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
      URL.revokeObjectURL(url)
      layersRef.current = [...layersRef.current, layer]
      setActiveId(layer.id)
      rerender()
    }
    img.src = url
  }

  const download = () => {
    const a = document.createElement('a')
    a.href = composite().toDataURL('image/png')
    a.download = 'webx-paint.png'
    a.click()
  }

  const setWallpaper = () => {
    const dataUrl = composite().toDataURL('image/jpeg', 0.85)
    localStorage.setItem('webx-wp-custom', dataUrl)
    localStorage.setItem('webx-wp-use', 'custom')
    window.dispatchEvent(new CustomEvent('webx-wallpaper', { detail: dataUrl }))
    notifyOs(t('setWallpaperBtn'))
  }

  const tools: { id: Tool; label: string }[] = [
    { id: 'brush', label: t('brush') },
    { id: 'eraser', label: t('eraser') },
    { id: 'line', label: t('toolLine') },
    { id: 'rect', label: t('toolRect') },
    { id: 'ellipse', label: t('toolEllipse') },
    { id: 'fill', label: t('toolFill') },
    { id: 'picker', label: t('toolPicker') },
    { id: 'text', label: t('toolText') },
  ]

  return (
    <div className="paint-app pro" ref={rootRef} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="paint-tools wrap">
        <div className="paint-toolgroup">
          {tools.map((toolItem) => (
            <button key={toolItem.id} className={tool === toolItem.id ? 'on' : ''} onClick={() => setTool(toolItem.id)}>{toolItem.label}</button>
          ))}
        </div>
        <div className="paint-colors">
          {PALETTE.map((c) => (
            <button key={c} className={color === c ? 'swatch on' : 'swatch'} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
          ))}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="paint-color-input" />
        </div>
        <label className="paint-size">{t('brush')}<input type="range" min={1} max={60} value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
        <label className="paint-size">{t('brushOpacity')}<input type="range" min={10} max={100} value={Math.round(brushOpacity * 100)} onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)} /></label>
        <button onClick={undo}>{t('undo')}</button>
        <button onClick={clearLayer}>{t('clearLayer')}</button>
        <button onClick={() => importRef.current?.click()}>{t('importImage')}</button>
        <input ref={importRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importImage(f); e.target.value = '' }} />
        <button onClick={download}>{t('downloadBtn')}</button>
        <button onClick={setWallpaper}>{t('setWallpaperBtn')}</button>
      </div>
      <div className="paint-main">
        <div className="paint-stage">
          <div className="paint-stack">
            {layers.map((layer) => (
              <LayerCanvas key={layer.id} layer={layer} tick={0} />
            ))}
            <canvas
              ref={overlayRef}
              className="paint-overlay"
              width={W}
              height={H}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
            />
            {textEdit && (
              <input
                autoFocus
                className="paint-text-input"
                style={{
                  left: `${(textEdit.x / W) * 100}%`,
                  top: `${(textEdit.y / H) * 100}%`,
                  fontSize: textEdit.displayPx,
                  color,
                }}
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitText()
                  if (e.key === 'Escape') { setTextEdit(null); setTextValue('') }
                }}
                onBlur={commitText}
                placeholder={t('toolTextPh')}
                aria-label={t('toolText')}
              />
            )}
          </div>
        </div>
        <aside className="paint-layers">
          <h4>{t('layers')}</h4>
          <ul>
            {[...layers].reverse().map((layer) => (
              <li key={layer.id} className={layer.id === active?.id ? 'on' : ''}>
                <button className="layer-eye" onClick={() => { layer.visible = !layer.visible; rerender() }}>{layer.visible ? '👁' : '—'}</button>
                <button className="layer-name" onClick={() => setActiveId(layer.id)}>{layer.name}</button>
                <input
                  type="range" min={10} max={100}
                  value={Math.round(layer.opacity * 100)}
                  onChange={(e) => { layer.opacity = Number(e.target.value) / 100; rerender() }}
                />
              </li>
            ))}
          </ul>
          <div className="layer-actions">
            <button onClick={addLayer}>{t('addLayer')}</button>
            <button onClick={duplicateLayer}>{t('duplicateLayer')}</button>
            <button onClick={mergeDown}>{t('mergeDown')}</button>
            <button onClick={() => moveLayer(1)}>↑</button>
            <button onClick={() => moveLayer(-1)}>↓</button>
            <button onClick={deleteLayer}>{t('deleteBtn')}</button>
          </div>
        </aside>
      </div>
    </div>
  )
}

function LayerCanvas({ layer }: { layer: Layer; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const target = ref.current
    if (!target) return
    const ctx = target.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(layer.canvas, 0, 0)
  })
  return (
    <canvas
      ref={ref}
      className="paint-layer"
      width={W}
      height={H}
      style={{ opacity: layer.opacity, visibility: layer.visible ? 'visible' : 'hidden' }}
    />
  )
}
