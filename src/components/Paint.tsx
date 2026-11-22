import { useEffect, useRef, useState } from 'react'
import { createStore, del, get, set } from 'idb-keyval'
import { useLang } from '../lib/i18n'
import { notifyOs } from '../lib/notify'

/* 描画内容は端末内の IndexedDB に自動保存し、次回開いたときに復元する */
const paintStore = createStore('webx-paint-db', 'canvas')
interface SavedLayer { id: number; name: string; visible: boolean; opacity: number; data: string }
interface SavedPaint { layers: SavedLayer[]; activeId: number; savedAt: number }

const W = 1200
const H = 800
const PALETTE = ['#111827', '#e11d48', '#f59e0b', '#facc15', '#10b981', '#2563eb', '#7c3aed', '#ec4899', '#ffffff']

type Tool = 'brush' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'fill' | 'picker' | 'text' | 'select'

interface Layer {
  id: number
  name: string
  visible: boolean
  opacity: number
  canvas: HTMLCanvasElement
}

interface Selection {
  x: number
  y: number
  w: number
  h: number
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

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export default function Paint() {
  const { t } = useLang()
  const layersRef = useRef<Layer[]>([])
  const undoRef = useRef<Map<number, string[]>>(new Map())
  const redoRef = useRef<Map<number, string[]>>(new Map())
  const [, setRenderTick] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 変更から 800ms 後に保存（描画中の連打は1回にまとめる）
  const scheduleSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => { void doSave() }, 800)
  }
  const doSave = async () => {
    if (!layersRef.current.length) return
    // 選択中のフローティング画像がある間は保存を保留する（確定後に保存される。閉じた場合は切り取り前の絵が残る）
    if (selectionRef.current) return
    setSaveState('saving')
    try {
      const rec: SavedPaint = {
        layers: layersRef.current.map((l) => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, data: l.canvas.toDataURL() })),
        activeId,
        savedAt: Date.now(),
      }
      await set('current', rec, paintStore)
      setSavedAt(rec.savedAt)
      setSaveState('saved')
    } catch {
      setSaveState('idle')
    }
  }
  const rerender = () => { setRenderTick((v) => v + 1); scheduleSave() }

  // 起動時に保存済みの絵を復元する（無ければ白紙のレイヤー1から始める）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rec = (await get('current', paintStore)) as SavedPaint | undefined
        if (rec && rec.layers?.length && !cancelled) {
          const rebuilt: Layer[] = []
          for (const sl of rec.layers) {
            const c = makeCanvas()
            const img = new Image()
            await new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); img.src = sl.data })
            c.getContext('2d')!.drawImage(img, 0, 0)
            rebuilt.push({ id: sl.id, name: sl.name, visible: sl.visible, opacity: sl.opacity, canvas: c })
          }
          layersRef.current = rebuilt
          layerSeq = Math.max(...rebuilt.map((l) => l.id)) + 1
          setActiveId(rebuilt.some((l) => l.id === rec.activeId) ? rec.activeId : rebuilt[rebuilt.length - 1].id)
          setSavedAt(rec.savedAt ?? null)
          setSaveState('saved')
        }
      } catch { /* 保存が読めなければ白紙から始める */ }
      if (!cancelled) setLoaded(true)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [activeId, setActiveId] = useState(0)
  const [tool, setTool] = useState<Tool>('brush')
  const [shapeFill, setShapeFill] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [color, setColor] = useState('#2563eb')
  const [size, setSize] = useState(6)
  const [brushOpacity, setBrushOpacity] = useState(1)
  const [textEdit, setTextEdit] = useState<{ x: number; y: number; fontPx: number; displayPx: number } | null>(null)
  const textInputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (textEdit) {
      const id = window.setTimeout(() => { textInputRef.current?.focus(); textInputRef.current?.select() }, 30)
      return () => window.clearTimeout(id)
    }
  }, [textEdit])
  const [textValue, setTextValue] = useState('')
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const drawState = useRef<{ drawing: boolean; start: { x: number; y: number } | null; last: { x: number; y: number } | null }>({ drawing: false, start: null, last: null })
  // 矩形選択ツール：切り出した範囲はフローティング画像として保持し、確定時にレイヤーへ貼り付ける
  const selectionRef = useRef<{ rect: Selection; floating: HTMLCanvasElement; needsUndo: boolean } | null>(null)
  const [sel, setSel] = useState<Selection | null>(null)
  const clipboardRef = useRef<HTMLCanvasElement | null>(null)
  const [hasClip, setHasClip] = useState(false)
  const selectDragRef = useRef<{ mode: 'new' | 'move'; start: { x: number; y: number }; grab: { x: number; y: number } } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  if (loaded && layersRef.current.length === 0) {
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
    // 新しい操作をしたらやり直し履歴は無効になる
    redoRef.current.set(layer.id, [])
  }

  const undo = () => {
    commitSelection()
    if (!active) return
    const stack = undoRef.current.get(active.id) ?? []
    const prev = stack.pop()
    if (!prev) return
    const redoStack = redoRef.current.get(active.id) ?? []
    redoStack.push(active.canvas.toDataURL())
    if (redoStack.length > 25) redoStack.shift()
    redoRef.current.set(active.id, redoStack)
    const img = new Image()
    img.onload = () => {
      const ctx = active.canvas.getContext('2d')!
      ctx.clearRect(0, 0, W, H)
      ctx.drawImage(img, 0, 0)
      rerender()
    }
    img.src = prev
  }

  const redo = () => {
    commitSelection()
    if (!active) return
    const stack = redoRef.current.get(active.id) ?? []
    const next = stack.pop()
    if (!next) return
    const undoStack = undoRef.current.get(active.id) ?? []
    undoStack.push(active.canvas.toDataURL())
    if (undoStack.length > 25) undoStack.shift()
    undoRef.current.set(active.id, undoStack)
    const img = new Image()
    img.onload = () => {
      const ctx = active.canvas.getContext('2d')!
      ctx.clearRect(0, 0, W, H)
      ctx.drawImage(img, 0, 0)
      rerender()
    }
    img.src = next
  }

  // 選択中のレイヤーをクリア（元に戻すで復旧できる）
  const clearLayer = () => {
    if (!active) return
    commitSelection()
    pushUndo(active)
    active.canvas.getContext('2d')!.clearRect(0, 0, W, H)
    rerender()
  }

  // ---- 矩形選択ツール ----
  const normalizeRect = (a: { x: number; y: number }, b: { x: number; y: number }): Selection => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  })

  // 選択範囲の破線枠とフローティング画像をオーバーレイに描く
  const drawSelectionOverlay = (preview?: Selection | null) => {
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    const cur = selectionRef.current
    if (cur) {
      ctx.drawImage(cur.floating, cur.rect.x, cur.rect.y)
    }
    const rect = preview ?? (cur ? cur.rect : null)
    if (rect) {
      ctx.save()
      ctx.setLineDash([8, 6])
      ctx.lineWidth = 2
      ctx.strokeStyle = '#ffffff'
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 1
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
      ctx.restore()
    }
  }

  // フローティング中の選択範囲をレイヤーへ貼り付けて選択を終える
  const commitSelection = (withRerender = true) => {
    const cur = selectionRef.current
    if (!cur || !active) return
    if (cur.needsUndo) pushUndo(active)
    active.canvas.getContext('2d')!.drawImage(cur.floating, cur.rect.x, cur.rect.y)
    selectionRef.current = null
    setSel(null)
    drawSelectionOverlay()
    if (withRerender) rerender()
  }

  // フローティング画像を破棄する（範囲は既にレイヤーから切り取られている）
  const discardSelection = () => {
    if (!selectionRef.current) return
    selectionRef.current = null
    setSel(null)
    drawSelectionOverlay()
    rerender()
  }

  const cloneCanvas = (src: HTMLCanvasElement): HTMLCanvasElement => {
    const c = document.createElement('canvas')
    c.width = src.width
    c.height = src.height
    c.getContext('2d')!.drawImage(src, 0, 0)
    return c
  }

  const copySelection = () => {
    const cur = selectionRef.current
    if (!cur) return
    clipboardRef.current = cloneCanvas(cur.floating)
    setHasClip(true)
  }

  const cutSelection = () => {
    if (!selectionRef.current) return
    copySelection()
    discardSelection()
  }

  const pasteSelection = () => {
    const clip = clipboardRef.current
    if (!clip || !active) return
    commitSelection()
    const rect: Selection = { x: Math.round((W - clip.width) / 2), y: Math.round((H - clip.height) / 2), w: clip.width, h: clip.height }
    selectionRef.current = { rect, floating: cloneCanvas(clip), needsUndo: true }
    setSel({ ...rect })
    setTool('select')
    drawSelectionOverlay()
  }

  const deleteSelection = () => {
    discardSelection()
  }

  const selectAll = () => {
    if (!active) return
    commitSelection()
    pushUndo(active)
    const floating = cloneCanvas(active.canvas)
    active.canvas.getContext('2d')!.clearRect(0, 0, W, H)
    const rect: Selection = { x: 0, y: 0, w: W, h: H }
    selectionRef.current = { rect, floating, needsUndo: false }
    setSel({ ...rect })
    setTool('select')
    drawSelectionOverlay()
    rerender()
  }

  const switchTool = (id: Tool) => {
    if (id !== 'select') commitSelection()
    setTool(id)
  }

  // 白紙から描き直す（保存済みの絵も破棄する）
  const newCanvas = async () => {
    commitSelection()
    if (!window.confirm(t('paintConfirmNew'))) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    try { await del('current', paintStore) } catch { /* ignore */ }
    const base = makeCanvas()
    const ctx = base.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    layerSeq = 1
    layersRef.current = [{ id: 0, name: 'レイヤー 1', visible: true, opacity: 1, canvas: base }]
    undoRef.current.clear()
    redoRef.current.clear()
    setActiveId(0)
    setSavedAt(null)
    setSaveState('idle')
    setRenderTick((v) => v + 1)
  }

  // Ctrl+Z / Cmd+Z で元に戻す、Ctrl+Y / Cmd+Y・Ctrl+Shift+Z でやり直す（テキスト入力中は入力欄の操作を優先）
  // 選択ツールでは Ctrl+C／X／V／A（コピー／切り取り／貼り付け／すべて選択）、Delete／Esc（削除／確定して解除）も使える
  const onKeyDown = (e: React.KeyboardEvent) => {
    const ae = document.activeElement as HTMLElement | null
    const inField = !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)
    if (e.ctrlKey || e.metaKey) {
      if (inField) return
      const key = e.key.toLowerCase()
      if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      } else if (key === 'z') {
        e.preventDefault()
        undo()
      } else if (tool === 'select' && key === 'c') {
        e.preventDefault()
        copySelection()
      } else if (tool === 'select' && key === 'x') {
        e.preventDefault()
        cutSelection()
      } else if (tool === 'select' && key === 'v') {
        e.preventDefault()
        pasteSelection()
      } else if (tool === 'select' && key === 'a') {
        e.preventDefault()
        selectAll()
      }
      return
    }
    if (tool !== 'select' || inField) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      deleteSelection()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      commitSelection()
    }
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
      if (shapeFill) { ctx.fillStyle = color; ctx.fillRect(from.x, from.y, to.x - from.x, to.y - from.y) }
      ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y)
    } else if (shapeTool === 'ellipse') {
      ctx.ellipse((from.x + to.x) / 2, (from.y + to.y) / 2, Math.abs(to.x - from.x) / 2, Math.abs(to.y - from.y) / 2, 0, 0, Math.PI * 2)
      if (shapeFill) { ctx.fillStyle = color; ctx.fill() }
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
    if (tool === 'select') {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      const cur = selectionRef.current
      if (cur && p.x >= cur.rect.x && p.x <= cur.rect.x + cur.rect.w && p.y >= cur.rect.y && p.y <= cur.rect.y + cur.rect.h) {
        // 選択範囲の内側をつかんだら移動モード
        selectDragRef.current = { mode: 'move', start: p, grab: { x: p.x - cur.rect.x, y: p.y - cur.rect.y } }
      } else {
        // 外側なら今の選択を確定してから新しい範囲の選択を始める
        commitSelection()
        selectDragRef.current = { mode: 'new', start: p, grab: { x: 0, y: 0 } }
      }
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
    if (tool === 'select' && selectDragRef.current) {
      const p = pos(e)
      const d = selectDragRef.current
      if (d.mode === 'new') {
        drawSelectionOverlay(normalizeRect(d.start, p))
      } else {
        const cur = selectionRef.current
        if (!cur) return
        cur.rect.x = p.x - d.grab.x
        cur.rect.y = p.y - d.grab.y
        setSel({ ...cur.rect })
        drawSelectionOverlay()
      }
      return
    }
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
    if (tool === 'select' && selectDragRef.current) {
      const d = selectDragRef.current
      selectDragRef.current = null
      if (d.mode === 'new') {
        if (!active) return
        const rect = normalizeRect(d.start, pos(e))
        if (rect.w < 4 || rect.h < 4) {
          drawSelectionOverlay()
          return
        }
        pushUndo(active)
        const floating = document.createElement('canvas')
        floating.width = Math.max(1, Math.round(rect.w))
        floating.height = Math.max(1, Math.round(rect.h))
        floating.getContext('2d')!.drawImage(active.canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, floating.width, floating.height)
        active.canvas.getContext('2d')!.clearRect(rect.x, rect.y, rect.w, rect.h)
        selectionRef.current = { rect, floating, needsUndo: false }
        setSel({ ...rect })
        drawSelectionOverlay()
        rerender()
      } else {
        drawSelectionOverlay()
      }
      return
    }
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
    commitSelection()
    const layer: Layer = { id: layerSeq++, name: `レイヤー ${layerSeq}`, visible: true, opacity: 1, canvas: makeCanvas() }
    layersRef.current = [...layersRef.current, layer]
    setActiveId(layer.id)
    rerender()
  }

  const deleteLayer = () => {
    if (layers.length <= 1 || !active) return
    commitSelection()
    layersRef.current = layers.filter((l) => l.id !== active.id)
    setActiveId(layersRef.current[layersRef.current.length - 1].id)
    rerender()
  }

  const duplicateLayer = () => {
    if (!active) return
    commitSelection()
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
    commitSelection()
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

  // 選択中のレイヤーを左右・上下に反転する（元に戻すで復旧できる）
  const flipLayer = (horizontal: boolean) => {
    if (!active) return
    commitSelection()
    pushUndo(active)
    const temp = makeCanvas()
    temp.getContext('2d')!.drawImage(active.canvas, 0, 0)
    const ctx = active.canvas.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    ctx.save()
    if (horizontal) { ctx.translate(W, 0); ctx.scale(-1, 1) } else { ctx.translate(0, H); ctx.scale(1, -1) }
    ctx.drawImage(temp, 0, 0)
    ctx.restore()
    rerender()
  }

  // 選択中のレイヤーを90°回転する（キャンバス内に収まるよう縮小して中央配置）
  const rotateLayer = (dir: 1 | -1) => {
    if (!active) return
    commitSelection()
    pushUndo(active)
    const temp = makeCanvas()
    temp.getContext('2d')!.drawImage(active.canvas, 0, 0)
    const ctx = active.canvas.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    ctx.save()
    ctx.translate(W / 2, H / 2)
    ctx.rotate((dir * Math.PI) / 2)
    const s = Math.min(W / H, H / W)
    ctx.scale(s, s)
    ctx.drawImage(temp, -W / 2, -H / 2)
    ctx.restore()
    rerender()
  }

  const moveLayer = (dir: 1 | -1) => {
    if (!active) return
    commitSelection()
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
    commitSelection()
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
    { id: 'select', label: t('toolSelect') },
  ]

  if (!loaded) {
    return <div className="paint-app pro"><div className="paint-loading">{t('paintLoading')}</div></div>
  }

  return (
    <div className="paint-app pro" ref={rootRef} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="paint-tools wrap">
        <div className="paint-toolgroup">
          {tools.map((toolItem) => (
            <button key={toolItem.id} className={tool === toolItem.id ? 'on' : ''} onClick={() => switchTool(toolItem.id)}>{toolItem.label}</button>
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
        {(tool === 'rect' || tool === 'ellipse') && (
          <button className={shapeFill ? 'on' : ''} onClick={() => setShapeFill((v) => !v)}>{t('shapeFill')}</button>
        )}
        {tool === 'select' && (
          <div className="paint-toolgroup">
            <button onClick={copySelection} disabled={!sel}>{t('selectCopy')}</button>
            <button onClick={cutSelection} disabled={!sel}>{t('selectCut')}</button>
            <button onClick={pasteSelection} disabled={!hasClip}>{t('selectPaste')}</button>
            <button onClick={deleteSelection} disabled={!sel}>{t('selectDelete')}</button>
            <button onClick={selectAll}>{t('selectAll')}</button>
            <button onClick={() => commitSelection()} disabled={!sel}>{t('selectCancel')}</button>
          </div>
        )}
        <div className="paint-zoom">
          <button onClick={() => setZoom((z) => ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(z) - 1)])} aria-label={t('zoomOut')}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(z) + 1)])} aria-label={t('zoomIn')}>＋</button>
          <button onClick={() => setZoom(1)}>{t('zoomFit')}</button>
        </div>
        <button onClick={undo} disabled={(undoRef.current.get(active?.id ?? -1) ?? []).length === 0}>{t('undo')}</button>
        <button onClick={redo} disabled={(redoRef.current.get(active?.id ?? -1) ?? []).length === 0}>{t('redo')}</button>
        <button onClick={clearLayer}>{t('clearLayer')}</button>
        <button onClick={() => void newCanvas()}>{t('paintNew')}</button>
        <span className="paint-save-state">{saveState === 'saving' ? t('paintSaving') : saveState === 'saved' && savedAt ? `${t('paintSaved')} ${new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
        <button onClick={() => importRef.current?.click()}>{t('importImage')}</button>
        <input ref={importRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importImage(f); e.target.value = '' }} />
        <button onClick={download}>{t('downloadBtn')}</button>
        <button onClick={setWallpaper}>{t('setWallpaperBtn')}</button>
      </div>
      <div className="paint-main">
        <div className="paint-stage">
          <div className="paint-stack" style={{ width: `min(${100 * zoom}%, ${1200 * zoom}px)` }}>
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
                ref={textInputRef}
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
                <button className="layer-name" onClick={() => { commitSelection(); setActiveId(layer.id) }}>{layer.name}</button>
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
            <button onClick={() => flipLayer(true)}>{t('flipH')}</button>
            <button onClick={() => flipLayer(false)}>{t('flipV')}</button>
            <button onClick={() => rotateLayer(1)}>{t('rotateRight')}</button>
            <button onClick={() => rotateLayer(-1)}>{t('rotateLeft')}</button>
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
