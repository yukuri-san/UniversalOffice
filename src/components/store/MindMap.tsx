import { useEffect, useRef, useState } from 'react'

/* ---------- マインドマップ ---------- */
interface MmNode { id: number; text: string; x: number; y: number; color: string; parentId: number | null }
const KEY = 'webx-mindmap'
const NODE_W = 132
const NODE_H = 46
const COLORS = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']
const COLOR_NAMES = ['オレンジ', '赤', '緑', '青', '紫', 'ピンク']

function defaultNodes(): MmNode[] {
  return [
    { id: 1, text: '中心のテーマ', x: 360, y: 300, color: '#f59e0b', parentId: null },
    { id: 2, text: 'アイデア 1', x: 620, y: 180, color: '#3b82f6', parentId: 1 },
    { id: 3, text: 'アイデア 2', x: 620, y: 300, color: '#22c55e', parentId: 1 },
    { id: 4, text: 'アイデア 3', x: 620, y: 420, color: '#ec4899', parentId: 1 },
  ]
}
function loadNodes(): MmNode[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (Array.isArray(v) && v.length > 0 && v.every((n) => n && typeof n.text === 'string' && typeof n.x === 'number')) {
      return v.map((n) => ({ id: Number(n.id) || Date.now() + Math.random(), text: String(n.text).slice(0, 60), x: n.x, y: n.y, color: typeof n.color === 'string' ? n.color : '#3b82f6', parentId: n.parentId == null ? null : Number(n.parentId) }))
    }
  } catch { /* fallthrough */ }
  return defaultNodes()
}
function descendants(nodes: MmNode[], id: number): number[] {
  const out: number[] = [id]
  let grew = true
  while (grew) {
    grew = false
    for (const n of nodes) {
      if (n.parentId != null && out.includes(n.parentId) && !out.includes(n.id)) { out.push(n.id); grew = true }
    }
  }
  return out
}

export function MindMap() {
  const [nodes, setNodes] = useState<MmNode[]>(loadNodes)
  const [selected, setSelected] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const dragRef = useRef<{ kind: 'node' | 'pan'; id?: number; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(nodes)) }, [nodes])

  const save = (next: MmNode[]) => setNodes(next)
  const selNode = nodes.find((n) => n.id === selected) ?? null

  const addChild = () => {
    const parent = selNode ?? nodes.find((n) => n.parentId === null) ?? nodes[0]
    if (!parent) return
    const siblings = nodes.filter((n) => n.parentId === parent.id)
    const idx = siblings.length
    const id = Date.now() + Math.random()
    const child: MmNode = {
      id,
      text: '新しいアイデア',
      x: parent.x + NODE_W + 90,
      y: parent.y + (idx - (siblings.length) / 2) * 72 + 12,
      color: COLORS[idx % COLORS.length],
      parentId: parent.id,
    }
    save([...nodes, child])
    setSelected(id)
    setEditing(id)
    setEditText(child.text)
  }

  const removeSelected = () => {
    if (selected == null) return
    const target = nodes.find((n) => n.id === selected)
    if (!target || target.parentId === null) return
    save(nodes.filter((n) => !descendants(nodes, selected).includes(n.id)))
    setSelected(null)
    setEditing(null)
  }

  const setColor = (color: string) => {
    if (selected == null) return
    save(nodes.map((n) => (n.id === selected ? { ...n, color } : n)))
  }

  const resetMap = () => {
    if (!window.confirm('現在のマップを破棄して、新しいマップを作りますか？')) return
    save(defaultNodes())
    setSelected(null)
    setEditing(null)
    setView({ x: 0, y: 0, k: 1 })
  }

  // 深さごとに縦に並べる自動整列
  const autoLayout = () => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const depth = (n: MmNode): number => {
      let d = 0
      let cur = n
      while (cur.parentId != null && byId.get(cur.parentId)) { d += 1; cur = byId.get(cur.parentId)! }
      return d
    }
    const levels = new Map<number, MmNode[]>()
    for (const n of nodes) {
      const d = depth(n)
      if (!levels.has(d)) levels.set(d, [])
      levels.get(d)!.push(n)
    }
    const next = nodes.map((n) => {
      const d = depth(n)
      const group = levels.get(d)!
      const i = group.findIndex((g) => g.id === n.id)
      return { ...n, x: 320 + d * (NODE_W + 90), y: 120 + i * 84 + (group.length === 1 ? 180 : 0) }
    })
    save(next)
  }

  const commitEdit = () => {
    if (editing == null) return
    const text = editText.trim().slice(0, 60) || '無題'
    save(nodesRef.current.map((n) => (n.id === editing ? { ...n, text } : n)))
    setEditing(null)
  }

  // Delete キーで選択ノードを削除（編集中は除く）
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (editing != null) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected != null) {
        const t = nodesRef.current.find((n) => n.id === selected)
        if (t && t.parentId !== null) removeSelected()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, selected])

  const onNodePointerDown = (e: React.PointerEvent, n: MmNode) => {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { kind: 'node', id: n.id, startX: e.clientX, startY: e.clientY, origX: n.x, origY: n.y, moved: false }
  }
  const onNodePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || d.kind !== 'node' || d.id == null) return
    const dx = (e.clientX - d.startX) / view.k
    const dy = (e.clientY - d.startY) / view.k
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 4) d.moved = true
    if (!d.moved) return
    setNodes((prev) => prev.map((n) => (n.id === d.id ? { ...n, x: Math.round(d.origX + dx), y: Math.round(d.origY + dy) } : n)))
  }
  const onNodePointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    if (d && d.kind === 'node' && d.id != null) {
      if (!d.moved) setSelected(d.id)
      else setSelected(d.id)
    }
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y, moved: false }
    setSelected(null)
  }
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || d.kind !== 'pan') return
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 4) d.moved = true
    if (!d.moved) return
    setView((v) => ({ ...v, x: d.origX + (e.clientX - d.startX), y: d.origY + (e.clientY - d.startY) }))
  }
  const onCanvasPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  }
  const zoom = (f: number) => setView((v) => ({ ...v, k: Math.min(2, Math.max(0.4, Math.round(v.k * f * 100) / 100)) }))

  const connector = (child: MmNode) => {
    const p = nodes.find((n) => n.id === child.parentId)
    if (!p) return null
    const x1 = p.x + NODE_W
    const y1 = p.y + NODE_H / 2
    const x2 = child.x
    const y2 = child.y + NODE_H / 2
    const mx = (x1 + x2) / 2
    return <path key={`c-${child.id}`} d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none" stroke={p.color} strokeWidth={2.5} opacity={0.75} />
  }

  return (
    <div className="mindmap">
      <div className="sa-row" style={{ flexWrap: 'wrap' }}>
        <button className="btn accent" onClick={addChild}>＋ 子を追加</button>
        <button className="btn" onClick={removeSelected} disabled={!selNode || selNode.parentId === null}>🗑 削除</button>
        <button className="btn" onClick={autoLayout}>⇅ 自動整列</button>
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          {COLORS.map((c, i) => (
            <button
              key={c}
              title={COLOR_NAMES[i]}
              onClick={() => setColor(c)}
              disabled={selected == null}
              style={{ width: 22, height: 22, borderRadius: '50%', border: selNode?.color === c ? '2px solid #111827' : '1px solid #cbd5e1', background: c, cursor: selected == null ? 'not-allowed' : 'pointer', opacity: selected == null ? 0.4 : 1 }}
            />
          ))}
        </span>
        <span style={{ flex: 1 }} />
        <button className="btn small" onClick={() => zoom(1.25)}>＋ 拡大</button>
        <button className="btn small" onClick={() => zoom(0.8)}>－ 縮小</button>
        <button className="btn small" onClick={() => setView({ x: 0, y: 0, k: 1 })}>表示をリセット</button>
        <button className="btn small" onClick={resetMap}>🆕 新規マップ</button>
      </div>
      <div className="mindmap-hint">
        ノードをドラッグで移動・背景をドラッグでスクロール・ダブルクリックで文字編集・Deleteキーで削除。{nodes.length} ノード・自動保存中
      </div>
      <div
        className="mindmap-canvas"
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onWheel={(e) => { if (e.deltaY < 0) zoom(1.1); else zoom(0.9) }}
      >
        <div className="mindmap-inner" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg className="mindmap-lines" width={2000} height={1400}>
            {nodes.filter((n) => n.parentId !== null).map(connector)}
          </svg>
          {nodes.map((n) => (
            <div
              key={n.id}
              className={`mindmap-node${selected === n.id ? ' sel' : ''}${n.parentId === null ? ' root' : ''}`}
              style={{ left: n.x, top: n.y, borderColor: n.color, background: `${n.color}1f` }}
              onPointerDown={(e) => onNodePointerDown(e, n)}
              onPointerMove={onNodePointerMove}
              onPointerUp={onNodePointerUp}
              onDoubleClick={() => { setSelected(n.id); setEditing(n.id); setEditText(n.text) }}
            >
              {editing === n.id ? (
                <input
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="mindmap-edit"
                />
              ) : (
                <span>{n.text}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
