import { useMemo, useState } from 'react'

/* ---------- 日記 ---------- */
interface DiaryEntry { id: number; date: string; title: string; mood: string; text: string }
const KEY = 'webx-diary'
const MOODS = ['😄', '🙂', '😐', '😔', '😢']
const MOOD_LABELS: Record<string, string> = { '😄': 'とても良い', '🙂': '良い', '😐': '普通', '😔': '悪い', '😢': 'とても悪い' }
function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function loadEntries(): DiaryEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v)
      ? v.filter((e) => e && typeof e.date === 'string' && typeof e.text === 'string').map((e) => ({
          id: Number(e.id) || Date.now() + Math.random(),
          date: e.date,
          title: typeof e.title === 'string' ? e.title : '',
          mood: typeof e.mood === 'string' && MOODS.includes(e.mood) ? e.mood : '😐',
          text: e.text,
        }))
      : []
  } catch { return [] }
}
function fmtDate(date: string): string {
  const [y, m, d] = date.split('-')
  if (!y || !m || !d) return date
  const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(Number(y), Number(m) - 1, Number(d)).getDay()]
  return `${Number(y)}年${Number(m)}月${Number(d)}日（${wd}）`
}
export function Diary() {
  const [entries, setEntries] = useState<DiaryEntry[]>(loadEntries)
  const [date, setDate] = useState(todayStr())
  const [title, setTitle] = useState('')
  const [mood, setMood] = useState('🙂')
  const [text, setText] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const save = (next: DiaryEntry[]) => { setEntries(next); localStorage.setItem(KEY, JSON.stringify(next)) }
  const saveEntry = () => {
    const body = text.trim()
    if (!body && !title.trim()) return
    if (editingId != null) {
      save(entries.map((e) => (e.id === editingId ? { ...e, date, title: title.trim(), mood, text: body } : e)))
    } else {
      const sameDay = entries.find((e) => e.date === date)
      if (sameDay) {
        save(entries.map((e) => (e.id === sameDay.id ? { ...e, title: title.trim(), mood, text: body } : e)))
      } else {
        save([{ id: Date.now(), date, title: title.trim(), mood, text: body }, ...entries])
      }
    }
    setEditingId(null)
    setTitle('')
    setText('')
    setDate(todayStr())
  }
  const loadForEdit = (e: DiaryEntry) => {
    setEditingId(e.id)
    setDate(e.date)
    setTitle(e.title)
    setMood(e.mood)
    setText(e.text)
  }
  const cancelEdit = () => {
    setEditingId(null)
    setTitle('')
    setText('')
    setDate(todayStr())
  }
  const remove = (id: number) => {
    save(entries.filter((e) => e.id !== id))
    if (editingId === id) cancelEdit()
  }
  const shown = useMemo(() => {
    const q = query.trim()
    const list = [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
    if (!q) return list
    return list.filter((e) => e.title.includes(q) || e.text.includes(q) || e.date.includes(q))
  }, [entries, query])
  const firstLine = (t: string) => t.split('\n').find((l) => l.trim() !== '') ?? ''
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <span className="sa-note">{editingId != null ? '編集中' : '今日の日記'}</span>
      </div>
      <div className="sa-row">
        {MOODS.map((m) => (
          <button key={m} className={mood === m ? 'chip on' : 'chip'} onClick={() => setMood(m)} title={MOOD_LABELS[m]}>
            {m}
          </button>
        ))}
        <span className="sa-note">気分：{MOOD_LABELS[mood]}</span>
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="タイトル（任意）"
        style={{ width: '100%' }}
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="今日あったことを書こう…"
        rows={5}
        style={{ width: '100%', resize: 'vertical' }}
      />
      <div className="sa-row">
        <button className="btn accent" onClick={saveEntry}>{editingId != null ? '保存する' : '日記を保存'}</button>
        {editingId != null && <button className="btn" onClick={cancelEdit}>キャンセル</button>}
        <span className="sa-note">同じ日付は上書き保存されます。端末内に保存されます。</span>
      </div>
      <div className="sa-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="検索（タイトル・本文・日付）"
          style={{ flex: 1, minWidth: 0 }}
        />
        <span className="sa-note">全 {entries.length} 件</span>
      </div>
      <div className="sa-log">
        {shown.map((e) => (
          <div key={e.id} className="sa-cardrow" onClick={() => loadForEdit(e)} style={{ cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <span>{e.mood}</span>
                <strong>{fmtDate(e.date)}</strong>
                {e.title && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>}
              </div>
              <div className="sa-note" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{firstLine(e.text)}</div>
            </div>
            <button
              className="btn small"
              onClick={(ev) => { ev.stopPropagation(); remove(e.id) }}
            >削除</button>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="sa-note">{entries.length === 0 ? 'まだ日記がありません。上の欄から今日の日記を書いてみましょう。' : '検索にあてはまる日記がありません。'}</p>
        )}
      </div>
    </div>
  )
}
