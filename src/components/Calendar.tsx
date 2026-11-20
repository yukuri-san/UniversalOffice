import { useCallback, useEffect, useMemo, useState } from 'react'
import Backstage, { type AppId } from './Backstage'
import { deleteEvent, listEvents, saveEvent, type CalEvent } from '../lib/store'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayStr(): string {
  const now = new Date()
  return ymd(now.getFullYear(), now.getMonth(), now.getDate())
}

export default function Calendar({ onSwitch }: { onSwitch: (app: AppId) => void }) {
  const now = new Date()
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [selected, setSelected] = useState(todayStr())
  const [events, setEvents] = useState<CalEvent[]>([])
  const [homeOpen, setHomeOpen] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formMemo, setFormMemo] = useState('')

  const refresh = useCallback(async () => {
    setEvents(await listEvents())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // キーボード：←/→ で前月・次月、T で今日（入力中は除く）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable="true"]')) return
      if (e.key === 'ArrowLeft') {
        setView((v) => {
          const d = new Date(v.y, v.m - 1, 1)
          return { y: d.getFullYear(), m: d.getMonth() }
        })
      } else if (e.key === 'ArrowRight') {
        setView((v) => {
          const d = new Date(v.y, v.m + 1, 1)
          return { y: d.getFullYear(), m: d.getMonth() }
        })
      } else if (e.key.toLowerCase() === 't') {
        const t = new Date()
        setView({ y: t.getFullYear(), m: t.getMonth() })
        setSelected(todayStr())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const e of events) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return map
  }, [events])

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1)
    const startDay = first.getDay()
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
    const list: (string | null)[] = []
    for (let i = 0; i < startDay; i++) list.push(null)
    for (let d = 1; d <= daysInMonth; d++) list.push(ymd(view.y, view.m, d))
    while (list.length % 7 !== 0) list.push(null)
    return list
  }, [view])

  const moveMonth = (diff: number) => {
    setView((v) => {
      const d = new Date(v.y, v.m + diff, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  const goToday = () => {
    const t = new Date()
    setView({ y: t.getFullYear(), m: t.getMonth() })
    setSelected(todayStr())
  }

  const addEvent = async () => {
    if (!formTitle.trim()) return
    await saveEvent({ date: selected, title: formTitle.trim(), memo: formMemo.trim() })
    setFormTitle('')
    setFormMemo('')
    await refresh()
  }

  const removeEvent = async (e: CalEvent) => {
    if (!window.confirm(`「${e.title}」を削除しますか？`)) return
    await deleteEvent(e.id)
    await refresh()
  }

  const selectedEvents = eventsByDate.get(selected) ?? []
  const selectedDate = new Date(`${selected}T00:00:00`)

  return (
    <section className="cal-app">
      <Backstage
        open={homeOpen}
        onClose={() => setHomeOpen(false)}
        current="calendar"
        onSwitch={onSwitch}
        actions={[
          { label: '今日へ移動', onClick: goToday },
          { label: '今月の予定', hint: `${events.filter((e) => e.date.startsWith(ymd(view.y, view.m, 1).slice(0, 7))).length} 件`, onClick: () => {} },
        ]}
      />
      <div className="titlebar cal-title">
        <button className="home-btn" onClick={() => setHomeOpen(true)}>ホーム</button>
        <span className="title-input cal-heading">{view.y}年 {view.m + 1}月</span>
        <span className="titlebar-app">カレンダー</span>
      </div>
      <div className="cal-toolbar">
        <button onClick={() => moveMonth(-1)}>← 前月</button>
        <button onClick={goToday}>今日</button>
        <button onClick={() => moveMonth(1)}>次月 →</button>
        <span className="cal-count">今月の予定 {events.filter((e) => e.date.startsWith(ymd(view.y, view.m, 1).slice(0, 7))).length} 件</span>
      </div>
      <div className="cal-body">
        <div className="cal-grid-wrap">
          <div className="cal-week">
            {WEEKDAYS.map((w, i) => <span key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{w}</span>)}
          </div>
          <div className="cal-grid">
            {cells.map((date, i) => {
              if (!date) return <div key={i} className="cal-cell empty" />
              const dayEvents = eventsByDate.get(date) ?? []
              const isToday = date === todayStr()
              const isSelected = date === selected
              return (
                <button key={i} className={`cal-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`} onClick={() => setSelected(date)}>
                  <span className="cal-day">{Number(date.slice(8))}</span>
                  {dayEvents.slice(0, 2).map((e) => <span key={e.id} className="cal-event">{e.title}</span>)}
                  {dayEvents.length > 2 && <span className="cal-more">+{dayEvents.length - 2} 件</span>}
                </button>
              )
            })}
          </div>
        </div>
        <aside className="cal-side">
          <h3>{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日（{WEEKDAYS[selectedDate.getDay()]}）の予定</h3>
          {selectedEvents.length === 0 ? (
            <p className="cal-noevent">予定はありません</p>
          ) : (
            <ul className="cal-event-list">
              {selectedEvents.map((e) => (
                <li key={e.id}>
                  <div>
                    <strong>{e.title}</strong>
                    {e.memo && <small>{e.memo}</small>}
                  </div>
                  <button onClick={() => void removeEvent(e)}>削除</button>
                </li>
              ))}
            </ul>
          )}
          <div className="cal-form">
            <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="予定のタイトル" aria-label="予定のタイトル" />
            <input value={formMemo} onChange={(e) => setFormMemo(e.target.value)} placeholder="メモ（任意）" aria-label="予定のメモ" />
            <button onClick={() => void addEvent()}>この日に追加</button>
          </div>
        </aside>
      </div>
    </section>
  )
}
