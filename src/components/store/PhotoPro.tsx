import { useEffect, useRef, useState } from 'react'
import { notifyOs } from '../../lib/notify'

/**
 * フォト編集Pro（Pro Edition 限定）：画像の簡易編集。
 * 明るさ・コントラスト・彩度・グレースケール・セピア・ぼかしの調整、回転・反転、リサイズ、PNG/JPEG保存。
 * 処理はすべて端末内（Canvas）。
 */

interface Adj { bright: number; contrast: number; saturate: number; gray: number; sepia: number; blur: number }
const DEFAULT_ADJ: Adj = { bright: 100, contrast: 100, saturate: 100, gray: 0, sepia: 0, blur: 0 }

export default function PhotoPro() {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [name, setName] = useState('photo')
  const [adj, setAdj] = useState<Adj>(DEFAULT_ADJ)
  const [rotate, setRotate] = useState(0)
  const [flip, setFlip] = useState(false)
  const [scale, setScale] = useState(1)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !img) return
    const quarter = rotate % 180 !== 0
    const w = Math.round((quarter ? img.naturalHeight : img.naturalWidth) * scale)
    const h = Math.round((quarter ? img.naturalWidth : img.naturalHeight) * scale)
    canvas.width = Math.max(1, w)
    canvas.height = Math.max(1, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.filter = `brightness(${adj.bright}%) contrast(${adj.contrast}%) saturate(${adj.saturate}%) grayscale(${adj.gray}%) sepia(${adj.sepia}%) blur(${adj.blur}px)`
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate((rotate * Math.PI) / 180)
    ctx.scale(flip ? -1 : 1, 1)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
    ctx.restore()
  }, [img, adj, rotate, flip, scale])

  const openFile = (file: File) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      setImg(image)
      setName(file.name.replace(/\.[^.]+$/, '') || 'photo')
      setAdj(DEFAULT_ADJ)
      setRotate(0)
      setFlip(false)
      setScale(1)
    }
    image.src = url
  }
  const save = (format: 'png' | 'jpeg') => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name}-edited.${format === 'png' ? 'png' : 'jpg'}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      notifyOs('画像を保存しました')
    }, format === 'png' ? 'image/png' : 'image/jpeg', 0.92)
  }
  const slider = (label: string, key: keyof Adj, min: number, max: number) => (
    <label className="photopro-slider">
      <span>{label} {adj[key]}</span>
      <input type="range" min={min} max={max} value={adj[key]} onChange={(e) => setAdj((a) => ({ ...a, [key]: Number(e.target.value) }))} />
    </label>
  )

  return (
    <div className="photopro">
      <div className="photopro-toolbar">
        <button className="btn accent" onClick={() => fileRef.current?.click()}>📷 画像を開く</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = '' }} />
        <button className="btn" disabled={!img} onClick={() => setRotate((r) => (r + 90) % 360)}>↻ 回転</button>
        <button className="btn" disabled={!img} onClick={() => setFlip((f) => !f)}>⇋ 反転</button>
        <select value={scale} disabled={!img} onChange={(e) => setScale(Number(e.target.value))}>
          <option value={1}>元のサイズ</option>
          <option value={0.5}>50%</option>
          <option value={0.25}>25%</option>
        </select>
        <button className="btn" disabled={!img} onClick={() => { setAdj(DEFAULT_ADJ); setRotate(0); setFlip(false); setScale(1) }}>リセット</button>
        <button className="btn accent" disabled={!img} onClick={() => save('png')}>PNG保存</button>
        <button className="btn" disabled={!img} onClick={() => save('jpeg')}>JPEG保存</button>
      </div>
      <div className="photopro-body">
        <div className="photopro-canvaswrap">
          {img ? <canvas ref={canvasRef} className="photopro-canvas" /> : <p className="store-note">「画像を開く」から写真を選んでください。編集は端末内で行われます。</p>}
        </div>
        {img && (
          <div className="photopro-panel">
            {slider('明るさ', 'bright', 30, 200)}
            {slider('コントラスト', 'contrast', 30, 200)}
            {slider('彩度', 'saturate', 0, 250)}
            {slider('グレースケール', 'gray', 0, 100)}
            {slider('セピア', 'sepia', 0, 100)}
            {slider('ぼかし', 'blur', 0, 10)}
          </div>
        )}
      </div>
    </div>
  )
}
