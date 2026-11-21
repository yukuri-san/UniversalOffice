import { useEffect, useRef, useState } from 'react'
import { createStore, get, set, del, keys } from 'idb-keyval'

/* ---------- ギャラリー（写真は端末内 IndexedDB に保存） ---------- */
const photosStore = createStore('webx-gallery-db', 'photos')
interface PhotoRec { name: string; ts: number; data: string }
interface PhotoMeta { id: string; name: string; ts: number }

function downscale(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const max = 1400
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('canvas')); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')) }
    img.src = url
  })
}

export function GalleryApp() {
  const [metas, setMetas] = useState<PhotoMeta[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [viewId, setViewId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const ks = (await keys(photosStore)) as string[]
    const list: PhotoMeta[] = []
    const th: Record<string, string> = {}
    for (const k of ks) {
      const rec = (await get(k, photosStore)) as PhotoRec | undefined
      if (rec) { list.push({ id: k, name: rec.name, ts: rec.ts }); th[k] = rec.data }
    }
    list.sort((a, b) => b.ts - a.ts)
    setMetas(list)
    setThumbs(th)
  }
  useEffect(() => { void load() }, [])

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('image/')) continue
        const data = await downscale(f)
        const id = crypto.randomUUID()
        const rec: PhotoRec = { name: f.name, ts: Date.now(), data }
        await set(id, rec, photosStore)
      }
      await load()
    } catch { /* ignore */ }
    setBusy(false)
  }

  const remove = async (id: string) => {
    await del(id, photosStore)
    if (viewId === id) setViewId(null)
    await load()
  }

  const setWallpaper = (id: string) => {
    const data = thumbs[id]
    if (!data) return
    localStorage.setItem('webx-wp-custom', data)
    localStorage.setItem('webx-wp-use', 'custom')
    window.dispatchEvent(new Event('webx-wallpaper-changed'))
  }

  const viewIdx = viewId ? metas.findIndex((m) => m.id === viewId) : -1
  return (
    <div className="wxapp">
      <div className="wxapp-toolbar">
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>＋ 写真を追加</button>
        <span className="wxapp-count">{metas.length} 枚（端末内に保存）</span>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }} />
      </div>
      {busy && <p>取り込み中…</p>}
      {metas.length === 0 && !busy && <p className="wxapp-empty">写真がありません。「写真を追加」から取り込んでください。大きな写真は自動で縮小されます。</p>}
      <div className="gx-grid">
        {metas.map((m) => (
          <button key={m.id} className="gx-thumb" onClick={() => setViewId(m.id)}>
            <img src={thumbs[m.id]} alt={m.name} loading="lazy" />
          </button>
        ))}
      </div>
      {viewId && viewIdx >= 0 && (
        <div className="gx-viewer">
          <img src={thumbs[viewId]} alt={metas[viewIdx].name} />
          <div className="gx-viewer-bar">
            <button className="btn" disabled={viewIdx <= 0} onClick={() => setViewId(metas[viewIdx - 1].id)}>← 前</button>
            <span className="gx-viewer-name">{metas[viewIdx].name}</span>
            <button className="btn" disabled={viewIdx >= metas.length - 1} onClick={() => setViewId(metas[viewIdx + 1].id)}>次 →</button>
          </div>
          <div className="gx-viewer-bar">
            <button className="btn" onClick={() => setWallpaper(viewId)}>壁紙に設定</button>
            <button className="btn danger" onClick={() => { void remove(viewId) }}>削除</button>
            <button className="btn" onClick={() => setViewId(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  )
}
