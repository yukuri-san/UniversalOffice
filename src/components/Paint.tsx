import { useEffect, useRef, useState } from 'react'
import { useLang } from '../lib/i18n'
import { notifyOs } from '../lib/notify'

const COLORS = ['#111827', '#e11d48', '#f59e0b', '#10b981', '#2563eb', '#7c3aed', '#ffffff']

export default function Paint() {
  const { t } = useLang()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const undoStack = useRef<string[]>([])
  const [color, setColor] = useState('#2563eb')
  const [size, setSize] = useState(6)
  const [eraser, setEraser] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [])

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const pushUndo = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    undoStack.current.push(canvas.toDataURL())
    if (undoStack.current.length > 20) undoStack.current.shift()
  }

  const start = (e: React.PointerEvent) => {
    pushUndo()
    drawingRef.current = true
    lastRef.current = pos(e)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const move = (e: React.PointerEvent) => {
    if (!drawingRef.current || !lastRef.current) return
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const p = pos(e)
    ctx.strokeStyle = eraser ? '#ffffff' : color
    ctx.lineWidth = eraser ? size * 3 : size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastRef.current.x, lastRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastRef.current = p
  }

  const end = () => {
    drawingRef.current = false
    lastRef.current = null
  }

  const undo = () => {
    const canvas = canvasRef.current
    const prev = undoStack.current.pop()
    if (!canvas || !prev) return
    const img = new Image()
    img.onload = () => canvas.getContext('2d')?.drawImage(img, 0, 0)
    img.src = prev
  }

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    pushUndo()
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const download = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = 'webx-paint.png'
    a.click()
  }

  const setWallpaper = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    localStorage.setItem('webx-wp-custom', dataUrl)
    localStorage.setItem('webx-wp-use', 'custom')
    window.dispatchEvent(new CustomEvent('webx-wallpaper', { detail: dataUrl }))
    notifyOs(t('setWallpaperBtn'))
  }

  return (
    <div className="paint-app">
      <div className="paint-tools">
        <div className="paint-colors">
          {COLORS.map((c) => (
            <button
              key={c}
              className={!eraser && color === c ? 'swatch on' : 'swatch'}
              style={{ background: c }}
              onClick={() => { setColor(c); setEraser(false) }}
              aria-label={c}
            />
          ))}
        </div>
        <label className="paint-size">
          {t('brush')}
          <input type="range" min={1} max={40} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </label>
        <button className={eraser ? 'on' : ''} onClick={() => setEraser((v) => !v)}>{t('eraser')}</button>
        <button onClick={undo}>{t('undo')}</button>
        <button onClick={clear}>{t('clearFormat') === 'Clear formatting' ? 'Clear' : 'クリア'}</button>
        <button onClick={download}>{t('downloadBtn')}</button>
        <button onClick={setWallpaper}>{t('setWallpaperBtn')}</button>
      </div>
      <canvas
        ref={canvasRef}
        className="paint-canvas"
        width={1200}
        height={800}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
    </div>
  )
}
