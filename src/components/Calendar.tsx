import { useCallback, useEffect, useMemo, useState } from 'react'
import Backstage, { type AppId } from './Backstage'
import { LOCALES, useLang } from '../lib/i18n'
import { deleteEvent, listEvents, saveEvent, type CalEvent } from '../lib/store'

function weekdayNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  return [0, 1, 2, 3, 4, 5, 6].map((i) => fmt.format(new Date(2023, 0, 1 + i)))
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayStr(): string {
  const now = new Date()
  return ymd(now.getFullYear(), now.getMonth(), now.getDate())
}

export default function Calendar({ onSwitch }: { onSwitch: (app: AppId) => void }) {
  const { lang, t } = useLang()
  const now = new Date()
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [selected, setSelected] = useState(todayStr())
  const [mode, setMode] = useState<'month' | 'week'>('month')
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

  // キーボード：←/→ で前月・次月（週表示では前週・次週）、T で今日（入力中は除く）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable="true"]')) return
      if (e.key === 'ArrowLeft') {
        if (mode === 'week') moveSelectedByDays(-7)
        else setView((v) => {
          const d = new Date(v.y, v.m - 1, 1)
          return { y: d.getFullYear(), m: d.getMonth() }
        })
      } else if (e.key === 'ArrowRight') {
        if (mode === 'week') moveSelectedByDays(7)
        else setView((v) => {
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
  }, [mode])

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

  // 週表示：選択日の週（日曜始まり）7日分
  const weekDays = useMemo(() => {
    const base = new Date(`${selected}T00:00:00`)
    const start = new Date(base)
    start.setDate(base.getDate() - base.getDay())
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return ymd(d.getFullYear(), d.getMonth(), d.getDate())
    })
  }, [selected])

  const moveSelectedByDays = (diff: number) => {
    const d = new Date(`${selected}T00:00:00`)
    d.setDate(d.getDate() + diff)
    setSelected(ymd(d.getFullYear(), d.getMonth(), d.getDate()))
    setView({ y: d.getFullYear(), m: d.getMonth() })
  }

  const movePrev = () => {
    if (mode === 'week') moveSelectedByDays(-7)
    else moveMonth(-1)
  }

  const moveNext = () => {
    if (mode === 'week') moveSelectedByDays(7)
    else moveMonth(1)
  }

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
          { label: t('today'), onClick: goToday },
          { label: '今月の予定', hint: `${events.filter((e) => e.date.startsWith(ymd(view.y, view.m, 1).slice(0, 7))).length} 件`, onClick: () => {} },
        ]}
      />
      <div className="titlebar cal-title">
        <button className="home-btn" onClick={() => setHomeOpen(true)}>{t('home')}</button>
        <span className="title-input cal-heading">{mode === 'week'
          ? `${new Intl.DateTimeFormat(LOCALES[lang], { month: 'long', day: 'numeric' }).format(new Date(`${weekDays[0]}T00:00:00`))} 〜 ${new Intl.DateTimeFormat(LOCALES[lang], { month: 'long', day: 'numeric' }).format(new Date(`${weekDays[6]}T00:00:00`))}`
          : new Intl.DateTimeFormat(LOCALES[lang], { year: 'numeric', month: 'long' }).format(new Date(view.y, view.m, 1))}</span>
        <span className="titlebar-app">{t('calendar')}</span>
      </div>
      <div className="cal-toolbar">
        <button onClick={movePrev}>←</button>
        <button onClick={goToday}>{t('today')}</button>
        <button onClick={moveNext}>→</button>
        <span className="cal-view-switch">
          <button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>{t('monthView')}</button>
          <button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>{t('weekView')}</button>
        </span>
        <span className="cal-count">今月の予定 {events.filter((e) => e.date.startsWith(ymd(view.y, view.m, 1).slice(0, 7))).length} 件</span>
      </div>
      <div className="cal-body">
        <div className="cal-grid-wrap">
          <div className="cal-week">
            {weekdayNames(LOCALES[lang]).map((w, i) => <span key={i} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{w}</span>)}
          </div>
          <div className="cal-grid">
            {mode === 'week' ? weekDays.map((date) => {
              const dayEvents = eventsByDate.get(date) ?? []
              const isToday = date === todayStr()
              const isSelected = date === selected
              return (
                <button key={date} className={`cal-cell cal-week-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`} onClick={() => setSelected(date)}>
                  <span className="cal-day">{Number(date.slice(8))}</span>
                  {dayEvents.length === 0
                    ? <span className="cal-more">—</span>
                    : dayEvents.map((e) => <span key={e.id} className="cal-event">{e.title}</span>)}
                </button>
              )
            }) : cells.map((date, i) => {
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
          <h3>{new Intl.DateTimeFormat(LOCALES[lang], { month: 'long', day: 'numeric', weekday: 'short' }).format(selectedDate)}{t('eventsOn')}</h3>
          {selectedEvents.length === 0 ? (
            <p className="cal-noevent">{t('noEvents')}</p>
          ) : (
            <ul className="cal-event-list">
              {selectedEvents.map((e) => (
                <li key={e.id}>
                  <div>
                    <strong>{e.title}</strong>
                    {e.memo && <small>{e.memo}</small>}
                  </div>
                  <button onClick={() => void removeEvent(e)}>{t('deleteBtn')}</button>
                </li>
              ))}
            </ul>
          )}
          <div className="cal-form">
            <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder={t('eventTitle')} aria-label={t('eventTitle')} />
            <input value={formMemo} onChange={(e) => setFormMemo(e.target.value)} placeholder={t('eventMemo')} aria-label={t('eventMemo')} />
            <button onClick={() => void addEvent()}>{t('addEvent')}</button>
          </div>
        </aside>
      </div>
    </section>
  )
}
