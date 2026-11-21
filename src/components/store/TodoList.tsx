import { useState } from 'react'

/* ---------- TODOリスト ---------- */
interface Todo { id: number; text: string; done: boolean }
const KEY = 'webx-todo'
function loadTodos(): Todo[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v)
      ? v.filter((t) => t && typeof t.text === 'string').map((t) => ({ id: Number(t.id) || Date.now() + Math.random(), text: t.text, done: !!t.done }))
      : []
  } catch { return [] }
}
type Filter = 'all' | 'active' | 'done'
export function TodoList() {
  const [todos, setTodos] = useState<Todo[]>(loadTodos)
  const [input, setInput] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const save = (next: Todo[]) => { setTodos(next); localStorage.setItem(KEY, JSON.stringify(next)) }
  const add = () => {
    const text = input.trim()
    if (!text) return
    save([{ id: Date.now(), text, done: false }, ...todos])
    setInput('')
  }
  const toggle = (id: number) => save(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  const remove = (id: number) => save(todos.filter((t) => t.id !== id))
  const clearDone = () => save(todos.filter((t) => !t.done))
  const shown = todos.filter((t) => filter === 'all' || (filter === 'active' ? !t.done : t.done))
  const remaining = todos.filter((t) => !t.done).length
  const doneCount = todos.length - remaining
  return (
    <div className="sa-app">
      <div className="sa-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder="やることを入力（Enter で追加）"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button className="btn accent" onClick={add}>追加</button>
      </div>
      <div className="sa-row">
        {([['all', `すべて（${todos.length}）`], ['active', `未完了（${remaining}）`], ['done', `完了（${doneCount}）`]] as [Filter, string][]).map(([f, label]) => (
          <button key={f} className={filter === f ? 'chip on' : 'chip'} onClick={() => setFilter(f)}>{label}</button>
        ))}
        {doneCount > 0 && <button className="btn small" onClick={clearDone}>完了をすべて削除</button>}
      </div>
      <div className="sa-log">
        {shown.map((t) => (
          <div key={t.id} className="sa-cardrow">
            <label className="sa-todo-label">
              <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />
              <span className={t.done ? 'sa-todo-done' : undefined}>{t.text}</span>
            </label>
            <button className="btn small" onClick={() => remove(t.id)}>削除</button>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="sa-note">{todos.length === 0 ? 'まだタスクがありません。上の欄から追加できます。' : 'この絞り込みにあてはまるタスクがありません。'}</p>
        )}
      </div>
      {todos.length > 0 && <p className="sa-note">残り {remaining} 件 ／ 全 {todos.length} 件。タスクはこの端末内に保存されます。</p>}
    </div>
  )
}
