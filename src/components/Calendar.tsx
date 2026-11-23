import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Backstage, { type AppId } from './Backstage'
import { LOCALES, useLang } from '../lib/i18n'
import { eventsToIcs, parseIcs } from '../lib/ics'
import { deleteEvent, listEvents, saveEvent, EVENT_COLORS, type CalEvent, type EventColor, type RepeatKind } from '../lib/store'

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
    // 繰り返し終了日がある場合は展開範囲をその日までに絞る
    const until = e.repeatUntil && e.repeatUntil < to ? e.repeatUntil : to
    if (repeat === 'none' || e.date > until) {
      if (e.date >= from && e.date <= until) out.push({ date: e.date, event: e })
      continue
    }
    const start = new Date(`${from}T00:00:00`)
    const end = new Date(`${until}T00:00:00`)
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
      const endM = new Date(`${until.slice(0, 7)}-01T00:00:00`)
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

// 予定の色（未指定は青）の表示色
function eventColorHex(color?: EventColor): string {
  return EVENT_COLORS.find((c) => c.id === (color ?? 'blue'))?.hex ?? '#3b82f6'
}

// 予定の時刻表示（開始〜終了の時間帯。終了時刻が無い・開始以前の場合は開始時刻のみ）
export function timeLabel(e: CalEvent): string {
  if (!e.time) return ''
  if (e.endTime && e.endTime > e.time) return `${e.time}〜${e.endTime}`
  return e.time
}

// 繰り返しバッジの表示（終了日がある場合は「〜日付まで」を付ける）
export function repeatBadgeLabel(e: CalEvent, t: (key: string) => string, locale: string): string {
  const label = t(e.repeat === 'daily' ? 'repeatDaily' : e.repeat === 'weekly' ? 'repeatWeekly' : 'repeatMonthly')
  if (!e.repeatUntil) return label
  const d = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(`${e.repeatUntil}T00:00:00`))
  return `${label} ${t('repeatUntilBadge').replace('{date}', d)}`
}

// 'HH:MM' を分に換算する
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export default function Calendar({ onSwitch }: { onSwitch: (app: AppId) => void }) {
  const { lang, t } = useLang()
  const now = new Date()
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [selected, setSelected] = useState(todayStr())
  const [mode, setMode] = useState<'month' | 'week' | 'day'>('month')
  const [events, setEvents] = useState<CalEvent[]>([])
  const [homeOpen, setHomeOpen] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formMemo, setFormMemo] = useState('')
  const [formTime, setFormTime] = useState('')
  const [formEndTime, setFormEndTime] = useState('')
  const [formRepeat, setFormRepeat] = useState<RepeatKind>('none')
  const [formRepeatUntil, setFormRepeatUntil] = useState('')
  const [formReminder, setFormReminder] = useState(-1)
  const [formColor, setFormColor] = useState<EventColor>('blue')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [icsMsg, setIcsMsg] = useState('')
  const icsFileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setEvents(await listEvents())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 他の場所で予定が変わったら（追加・編集・削除）追随して再読み込みする
  useEffect(() => {
    const onChanged = () => { void refresh() }
    window.addEventListener('webx-events-changed', onChanged)
    return () => window.removeEventListener('webx-events-changed', onChanged)
  }, [refresh])

  // キーボード：←/→ で前月・次月（週表示では前週・次週）、T で今日（入力中は除く）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable="true"]')) return
      if (e.key === 'ArrowLeft') {
        if (mode === 'week') moveSelectedByDays(-7)
        else if (mode === 'day') moveSelectedByDays(-1)
        else setView((v) => {
          const d = new Date(v.y, v.m - 1, 1)
          return { y: d.getFullYear(), m: d.getMonth() }
        })
      } else if (e.key === 'ArrowRight') {
        if (mode === 'week') moveSelectedByDays(7)
        else if (mode === 'day') moveSelectedByDays(1)
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

  // 繰り返し予定の展開範囲：表示範囲の前後1か月（週表示は前後1週間、日表示は前後1日）
  const expandRange = useMemo((): [string, string] => {
    if (mode === 'day') {
      const f = new Date(`${selected}T00:00:00`)
      f.setDate(f.getDate() - 1)
      const t = new Date(`${selected}T00:00:00`)
      t.setDate(t.getDate() + 1)
      return [ymd(f.getFullYear(), f.getMonth(), f.getDate()), ymd(t.getFullYear(), t.getMonth(), t.getDate())]
    }
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
  }, [mode, view, weekDays, selected])

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
    else if (mode === 'day') moveSelectedByDays(-1)
    else moveMonth(-1)
  }

  const moveNext = () => {
    if (mode === 'week') moveSelectedByDays(7)
    else if (mode === 'day') moveSelectedByDays(1)
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
    // 終了時刻は開始時刻より後の場合のみ保存する
    const endTime = formTime && formEndTime && formEndTime > formTime ? formEndTime : undefined
    // 繰り返し終了日は開始日以降の場合のみ保存する
    const repeatUntil = formRepeat !== 'none' && formRepeatUntil && formRepeatUntil >= selected ? formRepeatUntil : undefined
    await saveEvent({
      id: editingId ?? undefined,
      date: selected,
      ...(formTime ? { time: formTime } : {}),
      ...(endTime ? { endTime } : {}),
      title: formTitle.trim(),
      memo: formMemo.trim(),
      color: formColor,
      ...(formRepeat !== 'none' ? { repeat: formRepeat } : {}),
      ...(repeatUntil ? { repeatUntil } : {}),
      ...(formReminder >= 0 ? { reminder: formReminder } : {}),
    })
    setFormTitle('')
    setFormMemo('')
    setFormTime('')
    setFormEndTime('')
    setFormRepeat('none')
    setFormRepeatUntil('')
    setFormReminder(-1)
    setFormColor('blue')
    setEditingId(null)
    await refresh()
  }

  const startEdit = (e: CalEvent) => {
    setEditingId(e.id)
    setFormTitle(e.title)
    setFormMemo(e.memo)
    setFormTime(e.time ?? '')
    setFormEndTime(e.endTime ?? '')
    setFormRepeat(e.repeat ?? 'none')
    setFormRepeatUntil(e.repeatUntil ?? '')
    setFormReminder(e.reminder ?? -1)
    setFormColor(e.color ?? 'blue')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setFormTitle('')
    setFormMemo('')
    setFormTime('')
    setFormEndTime('')
    setFormRepeat('none')
    setFormRepeatUntil('')
    setFormColor('blue')
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

  // ICS の書き出し・読み込み結果の表示は6秒で消える
  useEffect(() => {
    if (!icsMsg) return
    const id = window.setTimeout(() => setIcsMsg(''), 6000)
    return () => window.clearTimeout(id)
  }, [icsMsg])

  // すべての予定を ICS ファイルとして書き出す（繰り返しは RRULE で1件にまとまる）
  const exportIcs = () => {
    if (events.length === 0) {
      setIcsMsg(t('icsExportNone'))
      return
    }
    const blob = new Blob([eventsToIcs(events)], { type: 'text/calendar;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'webx-calendar.ics'
    a.click()
    URL.revokeObjectURL(a.href)
    setIcsMsg(t('icsExportDone').replace('{n}', String(events.length)))
  }

  // ICS ファイルを読み込み、同じ日付・時刻・タイトルの予定を除いて追加する
  const onIcsFile = async (f: File) => {
    try {
      const parsed = parseIcs(await f.text())
      const existing = new Set(events.map((e) => `${e.date}|${e.time ?? ''}|${e.title}`))
      const fresh = parsed.filter((ev) => !existing.has(`${ev.date}|${ev.time ?? ''}|${ev.title}`))
      for (const ev of fresh) await saveEvent(ev)
      if (fresh.length > 0) await refresh()
      setIcsMsg(fresh.length > 0 ? t('icsImported').replace('{n}', String(fresh.length)) : t('icsImportNone'))
    } catch {
      setIcsMsg(t('icsImportFailed'))
    }
  }

  // 予定を別の日にドラッグ＆ドロップで移動する
  // 繰り返し予定はドラッグした出現日と同じ日数だけ開始日をずらし、シリーズごと移動する
  const moveEventToDate = async (id: string, occurrenceDate: string, targetDate: string) => {
    if (occurrenceDate === targetDate) return
    const ev = events.find((e) => e.id === id)
    if (!ev) return
    const diffDays = Math.round(
      (new Date(`${targetDate}T00:00:00`).getTime() - new Date(`${occurrenceDate}T00:00:00`).getTime()) / 86400000,
    )
    const base = new Date(`${ev.date}T00:00:00`)
    base.setDate(base.getDate() + diffDays)
    // 繰り返し終了日も同じ日数だけずらす（シリーズごと移動）
    let repeatUntil: string | undefined
    if (ev.repeatUntil) {
      const u = new Date(`${ev.repeatUntil}T00:00:00`)
      u.setDate(u.getDate() + diffDays)
      repeatUntil = ymd(u.getFullYear(), u.getMonth(), u.getDate())
    }
    await saveEvent({
      id: ev.id,
      date: ymd(base.getFullYear(), base.getMonth(), base.getDate()),
      title: ev.title,
      memo: ev.memo,
      ...(ev.time ? { time: ev.time } : {}),
      ...(ev.endTime ? { endTime: ev.endTime } : {}),
      ...(ev.color ? { color: ev.color } : {}),
      ...(ev.repeat && ev.repeat !== 'none' ? { repeat: ev.repeat } : {}),
      ...(repeatUntil ? { repeatUntil } : {}),
      ...(ev.reminder !== undefined && ev.reminder >= 0 ? { reminder: ev.reminder } : {}),
    })
    await refresh()
  }

  const onEventDragStart = (e: React.DragEvent, ev: CalEvent, occurrenceDate: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: ev.id, date: occurrenceDate }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const onCellDragOver = (e: React.DragEvent, date: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverDate !== date) setDragOverDate(date)
  }

  const onCellDrop = (e: React.DragEvent, date: string) => {
    e.preventDefault()
    setDragOverDate(null)
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain')) as { id: string; date: string }
      if (data?.id && data?.date) void moveEventToDate(data.id, data.date, date)
    } catch {
      /* ドラッグ元が予定でない場合は無視 */
    }
  }

  const selectedEvents = eventsByDate.get(selected) ?? []
  // 時刻順に並べる（終日は先頭、時刻ありは時刻順）
  const sortedSelectedEvents = useMemo(
    () => [...selectedEvents].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    [selectedEvents],
  )
  const selectedDate = new Date(`${selected}T00:00:00`)

  // 日表示：選択日の予定を時間軸に配置する（重なる予定は横に並べる）
  const DAY_HOUR_PX = 56
  const dayTimedEvents = useMemo(() => {
    const timed = selectedEvents.filter((e) => e.time).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
    const colEnd: number[] = []
    const placed = timed.map((e) => {
      const start = toMinutes(e.time!)
      const end = e.endTime && toMinutes(e.endTime) > start ? toMinutes(e.endTime) : start + 60
      let col = colEnd.findIndex((ce) => ce <= start)
      if (col === -1) { colEnd.push(end); col = colEnd.length - 1 } else colEnd[col] = end
      return { event: e, start, end, col }
    })
    return { placed, cols: Math.max(1, colEnd.length) }
  }, [selectedEvents])
  const dayAllDayEvents = useMemo(() => selectedEvents.filter((e) => !e.time), [selectedEvents])

  // 日表示：空き時間帯をクリックすると、その時刻を予定フォームに入れる
  const pickHour = (h: number) => {
    const hh = String(h).padStart(2, '0')
    setFormTime(`${hh}:00`)
    setFormEndTime(h < 23 ? `${String(h + 1).padStart(2, '0')}:00` : '23:59')
  }

  // 予定検索：タイトル・メモの部分一致（大文字小文字を区別しない）
  // 繰り返し予定は今日以降の次回発生日を表示する
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    const today = todayStr()
    const end = new Date()
    end.setDate(end.getDate() + 366)
    const endStr = ymd(end.getFullYear(), end.getMonth(), end.getDate())
    const out: { date: string; event: CalEvent }[] = []
    for (const e of events) {
      if (!e.title.toLowerCase().includes(q) && !(e.memo ?? '').toLowerCase().includes(q)) continue
      if ((e.repeat ?? 'none') === 'none') {
        out.push({ date: e.date, event: e })
      } else {
        const occ = expandEvents([e], today, endStr)
        if (occ.length > 0) out.push(occ[0])
      }
    }
    // 今後の予定を日付順に先に、過去の予定は新しいものから後に並べる
    out.sort((a, b) => {
      const aUp = a.date >= today ? 0 : 1
      const bUp = b.date >= today ? 0 : 1
      if (aUp !== bUp) return aUp - bUp
      const d = aUp === 0 ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
      return d || (a.event.time ?? '').localeCompare(b.event.time ?? '')
    })
    return out.slice(0, 50)
  }, [events, searchQuery])

  const jumpToResult = (date: string) => {
    const d = new Date(`${date}T00:00:00`)
    setView({ y: d.getFullYear(), m: d.getMonth() })
    setSelected(date)
    setSearchQuery('')
  }

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
        <span className="title-input cal-heading">{mode === 'day'
          ? new Intl.DateTimeFormat(LOCALES[lang], { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(selectedDate)
          : mode === 'week'
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
          <button className={mode === 'day' ? 'active' : ''} onClick={() => setMode('day')}>{t('dayView')}</button>
        </span>
        <span className="cal-ics">
          <button onClick={exportIcs}>{t('exportIcs')}</button>
          <button onClick={() => icsFileRef.current?.click()}>{t('importIcs')}</button>
          <input ref={icsFileRef} type="file" accept=".ics,text/calendar" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onIcsFile(f); e.target.value = '' }} />
        </span>
        <span className="cal-search">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setSearchQuery('') }}
            placeholder={t('searchEventsPh')}
            aria-label={t('searchEvents')}
          />
          {searchQuery && <button onClick={() => setSearchQuery('')} aria-label={t('clearSearch')}>×</button>}
        </span>
        <span className="cal-count">{t('eventsThisMonth').replace('{n}', String(monthEventCount))}</span>
      </div>
      <p className="cal-drag-hint">{t('dragEventHint')}</p>
      {icsMsg && <p className="cal-ics-msg">{icsMsg}</p>}
      {searchQuery.trim() !== '' && (
        <div className="cal-search-results">
          {searchResults.length === 0 ? (
            <p className="cal-noevent">{t('findNotFound')}</p>
          ) : (
            <>
              <p className="cal-search-count">{t('findMatches').replace('{n}', String(searchResults.length))}</p>
              <ul className="cal-search-list">
                {searchResults.map(({ date, event: e }) => (
                  <li key={`${e.id}@${date}`}>
                    <button onClick={() => jumpToResult(date)}>
                      <span className="cal-search-date">{new Intl.DateTimeFormat(LOCALES[lang], { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T00:00:00`))}</span>
                      <span className="cal-color-dot" style={{ backgroundColor: eventColorHex(e.color) }} />
                      {timeLabel(e) && <span className="cal-event-time">{timeLabel(e)}</span>}
                      {(e.repeat ?? 'none') !== 'none' && <span className="cal-repeat-badge">↻ {repeatBadgeLabel(e, t, LOCALES[lang])}</span>}
                      <strong>{e.title}</strong>
                      {e.memo && <small>{e.memo}</small>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <div className="cal-body">
        <div className="cal-grid-wrap">
          {mode === 'day' ? (
            <div className="cal-day-view">
              {dayAllDayEvents.length > 0 && (
                <div className="cal-day-allday">
                  <span className="cal-day-allday-label">{t('allDay')}</span>
                  <div className="cal-day-allday-list">
                    {dayAllDayEvents.map((e) => (
                      <button key={e.id} className={`cal-day-event cal-event-c-${e.color ?? 'blue'}`} onClick={() => startEdit(e)}>
                        {(e.repeat ?? 'none') !== 'none' && '↻ '}{e.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="cal-day-timeline">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="cal-day-hour" onClick={() => pickHour(h)}>
                    <span className="cal-day-hour-label">{String(h).padStart(2, '0')}:00</span>
                  </div>
                ))}
                {selected === todayStr() && (
                  <div className="cal-day-now" style={{ top: `${((new Date().getHours() * 60 + new Date().getMinutes()) / 60) * DAY_HOUR_PX}px` }} />
                )}
                {dayTimedEvents.placed.map(({ event: e, start, end, col }) => (
                  <button
                    key={e.id}
                    className={`cal-day-event cal-event-c-${e.color ?? 'blue'}`}
                    style={{
                      top: `${(start / 60) * DAY_HOUR_PX + 2}px`,
                      height: `${Math.max(26, ((end - start) / 60) * DAY_HOUR_PX - 4)}px`,
                      left: `calc(52px + (100% - 52px) * ${col / dayTimedEvents.cols})`,
                      width: `calc((100% - 52px) / ${dayTimedEvents.cols} - 4px)`,
                    }}
                    onClick={(ev) => { ev.stopPropagation(); startEdit(e) }}
                  >
                    <span className="cal-day-event-time">{timeLabel(e)}</span>
                    {(e.repeat ?? 'none') !== 'none' && '↻ '}{e.title}
                    {e.memo && <small>{e.memo}</small>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
          <div className="cal-week">
            {weekdayNames(LOCALES[lang]).map((w, i) => <span key={i} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{w}</span>)}
          </div>
          <div className="cal-grid">
            {mode === 'week' ? weekDays.map((date) => {
              const dayEvents = eventsByDate.get(date) ?? []
              const isToday = date === todayStr()
              const isSelected = date === selected
              return (
                <button key={date} className={`cal-cell cal-week-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${dragOverDate === date ? ' drag-over' : ''}`} onClick={() => setSelected(date)} onDragOver={(e) => onCellDragOver(e, date)} onDragLeave={() => setDragOverDate((d) => (d === date ? null : d))} onDrop={(e) => onCellDrop(e, date)}>
                  <span className="cal-day">{Number(date.slice(8))}</span>
                  {dayEvents.length === 0
                    ? <span className="cal-more">—</span>
                    : dayEvents.map((e) => <span key={`${e.id}@${date}`} draggable onDragStart={(ev) => onEventDragStart(ev, e, date)} className={`cal-event cal-event-c-${e.color ?? 'blue'}`}>{timeLabel(e) && <span className="cal-event-time">{timeLabel(e)}</span>}{(e.repeat ?? 'none') !== 'none' && '↻ '}{e.title}</span>)}
                </button>
              )
            }) : cells.map((date, i) => {
              if (!date) return <div key={i} className="cal-cell empty" />
              const dayEvents = eventsByDate.get(date) ?? []
              const isToday = date === todayStr()
              const isSelected = date === selected
              return (
                <button key={i} className={`cal-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${dragOverDate === date ? ' drag-over' : ''}`} onClick={() => setSelected(date)} onDragOver={(e) => onCellDragOver(e, date)} onDragLeave={() => setDragOverDate((d) => (d === date ? null : d))} onDrop={(e) => onCellDrop(e, date)}>
                  <span className="cal-day">{Number(date.slice(8))}</span>
                  {dayEvents.slice(0, 2).map((e) => <span key={`${e.id}@${date}`} draggable onDragStart={(ev) => onEventDragStart(ev, e, date)} className={`cal-event cal-event-c-${e.color ?? 'blue'}`}>{timeLabel(e) && <span className="cal-event-time">{timeLabel(e)}</span>}{(e.repeat ?? 'none') !== 'none' && '↻ '}{e.title}</span>)}
                  {dayEvents.length > 2 && <span className="cal-more">{t('moreEvents').replace('{n}', String(dayEvents.length - 2))}</span>}
                </button>
              )
            })}
          </div>
            </>
          )}
        </div>
        <aside className="cal-side">
          <h3>{new Intl.DateTimeFormat(LOCALES[lang], { month: 'long', day: 'numeric', weekday: 'short' }).format(selectedDate)}{t('eventsOn')}</h3>
          {selectedEvents.length === 0 ? (
            <p className="cal-noevent">{t('noEvents')}</p>
          ) : (
            <ul className="cal-event-list">
              {sortedSelectedEvents.map((e) => (
                <li key={e.id} className={editingId === e.id ? 'editing' : ''}>
                  <div draggable onDragStart={(ev) => onEventDragStart(ev, e, selected)}>
                    <strong><span className="cal-color-dot" style={{ backgroundColor: eventColorHex(e.color) }} />{e.time ? <span className="cal-event-time">{timeLabel(e)} </span> : <span className="cal-event-time">{t('allDay')} </span>}{e.title}</strong>
                    {(e.repeat ?? 'none') !== 'none' && <span className="cal-repeat-badge">↻ {repeatBadgeLabel(e, t, LOCALES[lang])}</span>}
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
              <span>{t('eventEndTime')}</span>
              <input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} aria-label={t('eventEndTime')} />
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
            {formRepeat !== 'none' && (
              <label className="cal-repeat-row">
                <span>{t('repeatUntilLabel')}</span>
                <input type="date" value={formRepeatUntil} min={selected} onChange={(e) => setFormRepeatUntil(e.target.value)} aria-label={t('repeatUntilLabel')} />
              </label>
            )}
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
            <label className="cal-repeat-row">
              <span>{t('eventColor')}</span>
              <span className="cal-color-row">
                {EVENT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`cal-color-swatch${formColor === c.id ? ' selected' : ''}`}
                    style={{ backgroundColor: c.hex }}
                    onClick={() => setFormColor(c.id)}
                    aria-label={t(`color${c.id[0].toUpperCase()}${c.id.slice(1)}`)}
                    title={t(`color${c.id[0].toUpperCase()}${c.id.slice(1)}`)}
                  />
                ))}
              </span>
            </label>
            <button onClick={() => void addEvent()}>{editingId ? t('saveEvent') : t('addEvent')}</button>
            {editingId && <button className="cal-cancel" onClick={cancelEdit}>{t('cancelBtn')}</button>}
          </div>
        </aside>
      </div>
    </section>
  )
}
