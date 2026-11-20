import { useCallback, useEffect, useRef, useState } from 'react'
import Backstage, { type AppId } from './Backstage'
import { deleteDoc, listDocs, saveDoc, type LocalDoc } from '../lib/store'
import { downloadText } from '../lib/files'

export default function Notepad({ onSwitch }: { onSwitch: (app: AppId) => void }) {
  const [notes, setNotes] = useState<LocalDoc[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [title, setTitle] = useState('無題のメモ')
  const [text, setText] = useState('')
  const [homeOpen, setHomeOpen] = useState(false)
  const saveTimer = useRef<number | null>(null)
  const stateRef = useRef({ currentId, title, text })
  stateRef.current = { currentId, title, text }

  const refresh = useCallback(async () => {
    const all = await listDocs()
    setNotes(all.filter((d) => d.kind === 'note'))
    return all
  }, [])

  const persist = useCallback(async (id: string | null, name: string, content: string): Promise<string | null> => {
    if (!name.trim() && !content.trim()) return id
    const saved = await saveDoc({ id: id ?? undefined, kind: 'note', name: name.trim() || '無題のメモ', folder: '', content })
    return saved.id
  }, [])

  // 初期表示：保留中のメモ or 最新のメモ
  useEffect(() => {
    void (async () => {
      const all = await refresh()
      const noteDocs = all.filter((d) => d.kind === 'note')
      const pending = localStorage.getItem('uo-pending-open')
      const pendingDoc = pending ? noteDocs.find((d) => d.id === pending) : undefined
      if (pendingDoc) {
        localStorage.removeItem('uo-pending-open')
        setCurrentId(pendingDoc.id)
        setTitle(pendingDoc.name)
        setText(pendingDoc.content)
      } else if (noteDocs.length > 0) {
        setCurrentId(noteDocs[0].id)
        setTitle(noteDocs[0].name)
        setText(noteDocs[0].content)
      }
    })()
  }, [refresh])

  // 自動保存（入力が止まってから少し待って保存）
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void (async () => {
        const { currentId: id, title: t, text: body } = stateRef.current
        const newId = await persist(id, t, body)
        if (newId && newId !== id) setCurrentId(newId)
        await refresh()
      })()
    }, 900)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [title, text, persist, refresh])

  const openNote = async (doc: LocalDoc) => {
    const { currentId: id, title: t, text: body } = stateRef.current
    await persist(id, t, body)
    setCurrentId(doc.id)
    setTitle(doc.name)
    setText(doc.content)
    await refresh()
  }

  const newNote = async () => {
    const { currentId: id, title: t, text: body } = stateRef.current
    await persist(id, t, body)
    setCurrentId(null)
    setTitle('無題のメモ')
    setText('')
    await refresh()
  }

  const removeNote = async () => {
    if (!currentId) {
      setText('')
      setTitle('無題のメモ')
      return
    }
    if (!window.confirm(`「${title}」を削除しますか？`)) return
    await deleteDoc(currentId)
    setCurrentId(null)
    setTitle('無題のメモ')
    setText('')
    await refresh()
  }

  return (
    <section className="note-app">
      <Backstage
        open={homeOpen}
        onClose={() => setHomeOpen(false)}
        current="note"
        onSwitch={onSwitch}
        actions={[
          { label: '新規メモ', onClick: () => void newNote() },
          { label: '.txt として保存', hint: 'ファイルとして書き出す', onClick: () => downloadText(`${title || 'memo'}.txt`, text) },
          { label: 'このメモを削除', onClick: () => void removeNote() },
        ]}
      />
      <div className="titlebar note-title">
        <button className="home-btn" onClick={() => setHomeOpen(true)}>ホーム</button>
        <input className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="メモのタイトル" />
        <span className="titlebar-app">メモ帳</span>
      </div>
      <div className="note-body">
        <aside className="note-list">
          <button className="note-new" onClick={() => void newNote()}>＋ 新規メモ</button>
          {notes.length === 0 ? (
            <p className="note-empty">メモはまだありません</p>
          ) : (
            notes.map((n) => (
              <button key={n.id} className={n.id === currentId ? 'note-item active' : 'note-item'} onClick={() => void openNote(n)}>
                <strong>{n.name}</strong>
                <small>{new Date(n.updatedAt).toLocaleString('ja-JP')} / {n.content.replace(/\s/g, '').length} 文字</small>
              </button>
            ))
          )}
        </aside>
        <div className="note-editor">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="メモを書いてください（自動で端末内に保存されます）"
            aria-label="メモ本文"
          />
          <div className="note-status">
            <span>{text.replace(/\s/g, '').length} 文字 / {text === '' ? 0 : text.split('\n').length} 行</span>
            <span>自動保存：オン（端末内）</span>
            <button onClick={() => void removeNote()}>このメモを削除</button>
            <button onClick={() => downloadText(`${title || 'memo'}.txt`, text)}>.txt で書き出し</button>
          </div>
        </div>
      </div>
    </section>
  )
}
