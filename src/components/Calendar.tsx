import { useCallback, useEffect, useMemo, useState } from 'react'
import Backstage, { type AppId } from './Backstage'
import { LOCALES, useLang } from '../lib/i18n'
import { deleteEvent, listEvents, saveEvent, type CalEvent, type RepeatKind } from '../lib/store'

function weekdayNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  return [0, 1, 2, 3, 4, 5, 6].map((i) => fmt.format(new Date(2023, 0, 1 + i)))
}

// 繰り返し予定を指定範囲 [from, to]（YYYY-MM-DD）に展開する
// 月表示で31日の予定は、その日が無い月はスキップする
export function expandEvents(events: CalEvent[], from: string, to: string): { date: string; event: CalEvent }[] {
  const out: { date: string; event: CalEvent }[] = []
  for (const e of events) {
    const repeat: RepeatKind = e.repeat ?? 'none'
    if (repeat === 'none' || e.date > to) {
      if (e.date >= from && e.date <= to) out.push({ date: e.date, event: e })
      continue
    }
    const start = new Date(`${from}T00:00:00`)
    const end = new Date(`${to}T00:00:00`)
    if (repeat === 'daily') {
      const d = new Date(`${e.date}T00:00:00`)
      if (d < start) d.setTime(start.getTime())
      while (d <= end) {
        out.push({ date: ymd(d.getFullYear(), d.getMonth(), d.getDate()), event: e })
        d.setDate(d.getDate() + 1)
      }
    } else if (repeat === 'weekly') {
      const d = new Date(`${e.date}T00:00:00`)
      if (d < start) {
        const diff = Math.ceil((start.getTime() - d.getTime()) / (7 * 86400000))
        d.setDate(d.getDate() + diff * 7)
      }
      while (d <= end) {
        out.push({ date: ymd(d.getFullYear(), d.getMonth(), d.getDate()), event: e })
        d.setDate(d.getDate() + 7)
      }
    } else {
      const day = Number(e.date.slice(8))
      const cur = new Date(`${e.date.slice(0, 7)}-01T00:00:00`)
      const endM = new Date(`${to.slice(0, 7)}-01T00:00:00`)
      while (cur <= endM) {
        const dim = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()
        if (day <= dim) {
          const ds = ymd(cur.getFullYear(), cur.getMonth(), day)
          if (ds >= from && ds <= to) out.push({ date: ds, event: e })
        }
        cur.setMonth(cur.getMonth() + 1)
      }
    }
  }
  return out
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
  const [formTime, setFormTime] = useState('')
  const [formRepeat, setFormRepeat] = useState<RepeatKind>('none')
  const [formReminder, setFormReminder] = useState(-1)
  const [editingId, setEditingId] = useState<string | null>(null)

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
  }, [mode, selected])

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

  // 繰り返し予定の展開範囲：表示範囲の前後1か月（週表示は前後1週間）
  const expandRange = useMemo((): [string, string] => {
    if (mode === 'week') {
      const f = new Date(`${weekDays[0]}T00:00:00`)
      f.setDate(f.getDate() - 7)
      const t = new Date(`${weekDays[6]}T00:00:00`)
      t.setDate(t.getDate() + 7)
      return [ymd(f.getFullYear(), f.getMonth(), f.getDate()), ymd(t.getFullYear(), t.getMonth(), t.getDate())]
    }
    const f = new Date(view.y, view.m - 1, 1)
    const t = new Date(view.y, view.m + 2, 0)
    return [ymd(f.getFullYear(), f.getMonth(), f.getDate()), ymd(t.getFullYear(), t.getMonth(), t.getDate())]
  }, [mode, view, weekDays])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const { date, event } of expandEvents(events, expandRange[0], expandRange[1])) {
      const arr = map.get(date) ?? []
      arr.push(event)
      map.set(date, arr)
    }
    return map
  }, [events, expandRange])

  // 表示月の予定件数（繰り返しの出現回数で数える）
  const monthEventCount = useMemo(() => {
    const prefix = ymd(view.y, view.m, 1).slice(0, 7)
    let n = 0
    for (const [date, list] of eventsByDate) if (date.startsWith(prefix)) n += list.length
    return n
  }, [eventsByDate, view])

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
    await saveEvent({
      id: editingId ?? undefined,
      date: selected,
      ...(formTime ? { time: formTime } : {}),
      title: formTitle.trim(),
      memo: formMemo.trim(),
      ...(formRepeat !== 'none' ? { repeat: formRepeat } : {}),
      ...(formReminder >= 0 ? { reminder: formReminder } : {}),
    })
    setFormTitle('')
    setFormMemo('')
    setFormTime('')
    setFormRepeat('none')
    setFormReminder(-1)
    setEditingId(null)
    await refresh()
  }

  const startEdit = (e: CalEvent) => {
    setEditingId(e.id)
    setFormTitle(e.title)
    setFormMemo(e.memo)
    setFormTime(e.time ?? '')
    setFormRepeat(e.repeat ?? 'none')
    setFormReminder(e.reminder ?? -1)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setFormTitle('')
    setFormMemo('')
    setFormTime('')
    setFormRepeat('none')
  }

  // 予定フォーム：Enter で追加・保存、Esc で編集中をキャンセル
  const onFormKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void addEvent()
    } else if (e.key === 'Escape' && editingId) {
      cancelEdit()
    }
  }

  const removeEvent = async (e: CalEvent) => {
    const key = (e.repeat ?? 'none') !== 'none' ? 'confirmDeleteRepeatEvent' : 'confirmDeleteEvent'
    if (!window.confirm(t(key).replace('{title}', e.title))) return
    await deleteEvent(e.id)
    if (editingId === e.id) cancelEdit()
    await refresh()
  }

  const selectedEvents = eventsByDate.get(selected) ?? []
  // 時刻順に並べる（終日は先頭、時刻ありは時刻順）
  const sortedSelectedEvents = useMemo(
    () => [...selectedEvents].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    [selectedEvents],
  )
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
          { label: t('eventsThisMonth').replace('{n}', String(monthEventCount)), hint: '', onClick: () => {} },
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
        <span className="cal-count">{t('eventsThisMonth').replace('{n}', String(monthEventCount))}</span>
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
                    : dayEvents.map((e) => <span key={`${e.id}@${date}`} className="cal-event">{e.time && <span className="cal-event-time">{e.time}</span>}{(e.repeat ?? 'none') !== 'none' && '↻ '}{e.title}</span>)}
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
                  {dayEvents.slice(0, 2).map((e) => <span key={`${e.id}@${date}`} className="cal-event">{e.time && <span className="cal-event-time">{e.time}</span>}{(e.repeat ?? 'none') !== 'none' && '↻ '}{e.title}</span>)}
                  {dayEvents.length > 2 && <span className="cal-more">{t('moreEvents').replace('{n}', String(dayEvents.length - 2))}</span>}
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
              {sortedSelectedEvents.map((e) => (
                <li key={e.id} className={editingId === e.id ? 'editing' : ''}>
                  <div>
                    <strong>{e.time ? <span className="cal-event-time">{e.time} </span> : <span className="cal-event-time">{t('allDay')} </span>}{e.title}</strong>
                    {(e.repeat ?? 'none') !== 'none' && <span className="cal-repeat-badge">↻ {t(e.repeat === 'daily' ? 'repeatDaily' : e.repeat === 'weekly' ? 'repeatWeekly' : 'repeatMonthly')}</span>}
                    {e.memo && <small>{e.memo}</small>}
                  </div>
                  <button onClick={() => startEdit(e)}>{t('editEvent')}</button>
                  <button onClick={() => void removeEvent(e)}>{t('deleteBtn')}</button>
                </li>
              ))}
            </ul>
          )}
          <div className="cal-form">
            <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} onKeyDown={onFormKeyDown} placeholder={t('eventTitle')} aria-label={t('eventTitle')} />
            <input value={formMemo} onChange={(e) => setFormMemo(e.target.value)} onKeyDown={onFormKeyDown} placeholder={t('eventMemo')} aria-label={t('eventMemo')} />
            <label className="cal-repeat-row">
              <span>{t('eventTime')}</span>
              <input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} aria-label={t('eventTime')} />
            </label>
            <label className="cal-repeat-row">
              <span>{t('repeatLabel')}</span>
              <select value={formRepeat} onChange={(e) => setFormRepeat(e.target.value as RepeatKind)} aria-label={t('repeatLabel')}>
                <option value="none">{t('repeatNone')}</option>
                <option value="daily">{t('repeatDaily')}</option>
                <option value="weekly">{t('repeatWeekly')}</option>
                <option value="monthly">{t('repeatMonthly')}</option>
              </select>
            </label>
            <label className="cal-repeat-row">
              <span>{t('reminderLabel')}</span>
              <select value={formReminder} onChange={(e) => setFormReminder(Number(e.target.value))} aria-label={t('reminderLabel')}>
                <option value={-1}>{t('reminderNone')}</option>
                <option value={0}>{t('reminderToday')}</option>
                <option value={1}>{t('reminder1d')}</option>
                <option value={3}>{t('reminder3d')}</option>
                <option value={7}>{t('reminder7d')}</option>
              </select>
            </label>
            <button onClick={() => void addEvent()}>{editingId ? t('saveEvent') : t('addEvent')}</button>
            {editingId && <button className="cal-cancel" onClick={cancelEdit}>{t('cancelBtn')}</button>}
          </div>
        </aside>
      </div>
    </section>
  )
}
