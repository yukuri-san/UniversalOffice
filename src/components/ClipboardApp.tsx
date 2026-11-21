import { useEffect, useState } from 'react'
import { notifyOs } from '../lib/notify'

const KEY = 'webx-clipboard'

function loadList(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch { return [] }
}

export default function ClipboardApp() {
  const [items, setItems] = useState<string[]>(loadList)
  useEffect(() => {
    const iv = window.setInterval(() => setItems(loadList()), 1500)
    return () => window.clearInterval(iv)
  }, [])
  const persist = (next: string[]) => { setItems(next); localStorage.setItem(KEY, JSON.stringify(next)) }
  const copyBack = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => notifyOs('クリップボードにコピーしました', 'clipboard')).catch(() => { /* ignore */ })
  }
  return (
    <div className="sa-app">
      <p className="sa-note">WebX 内でコピーしたテキストがここに履歴として残ります（最大30件）。クリックするともう一度コピーできます。</p>
      <div className="sa-log">
        {items.map((text, i) => (
          <div key={`${i}-${text.slice(0, 16)}`} className="sa-cardrow">
            <button className="clip-item" onClick={() => copyBack(text)} title="クリックでコピー">
              {text.length > 120 ? `${text.slice(0, 120)}…` : text}
            </button>
            <button className="btn small" onClick={() => persist(items.filter((_, j) => j !== i))}>削除</button>
          </div>
        ))}
        {items.length === 0 && <p className="sa-note">まだ履歴がありません。どこかでテキストをコピーしてみてください。</p>}
      </div>
      {items.length > 0 && (
        <div className="sa-row">
          <button className="btn" onClick={() => persist([])}>履歴をすべて消す</button>
          <span className="sa-note">{items.length} 件</span>
        </div>
      )}
    </div>
  )
}
