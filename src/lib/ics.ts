// カレンダー予定の ICS（iCalendar / RFC 5545）書き出し・読み込み。
// WebX の予定（CalEvent）と相互変換する。
// 対応する項目：タイトル・メモ・日付・時刻・終了時刻・繰り返し（毎日／毎週／毎月）・繰り返し終了日・色・リマインダー。
// 色とリマインダーは X-WEBX-COLOR / X-WEBX-REMINDER として保存し、WebX 同士の往復で維持する。
// 時刻はタイムゾーンなしの現地時刻（floating）で扱い、他社カレンダーとも読み書きできる。
import type { CalEvent, EventColor, RepeatKind } from './store'

const EVENT_COLORS: EventColor[] = ['blue', 'green', 'red', 'amber', 'purple', 'pink']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function ymdOf(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

// DTSTAMP 用の UTC 時刻（YYYYMMDDTHHMMSSZ）
function utcStamp(d: Date): string {
  return `${ymdOf(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())))}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

// テキストのエスケープ（RFC 5545 3.3.11）
function escText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function unescText(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

// 1行を75オクテット以内で折り返す（RFC 5545 3.1）。マルチバイト文字は文字境界で切る。
function foldLine(line: string): string {
  const enc = new TextEncoder()
  let out = ''
  let cur = ''
  let len = 0
  for (const ch of line) {
    const bl = enc.encode(ch).length
    if (len + bl > 75 && cur.length > 0) {
      out += `${cur}\r\n `
      cur = ch
      len = 1 + bl
    } else {
      cur += ch
      len += bl
    }
  }
  return out + cur
}

function dateToIcs(date: string): string {
  return date.replaceAll('-', '')
}

export function eventsToIcs(events: CalEvent[]): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WebX//Calendar//JA', 'CALSCALE:GREGORIAN']
  const stamp = utcStamp(new Date())
  for (const e of events) {
    const repeat: RepeatKind = e.repeat ?? 'none'
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.id}@webx`)
    lines.push(`DTSTAMP:${stamp}`)
    if (e.time) {
      lines.push(`DTSTART:${dateToIcs(e.date)}T${e.time.replace(':', '')}00`)
      if (e.endTime && e.endTime > e.time) {
        lines.push(`DTEND:${dateToIcs(e.date)}T${e.endTime.replace(':', '')}00`)
      }
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateToIcs(e.date)}`)
      const next = new Date(`${e.date}T00:00:00`)
      next.setDate(next.getDate() + 1)
      lines.push(`DTEND;VALUE=DATE:${ymdOf(next)}`)
    }
    lines.push(`SUMMARY:${escText(e.title)}`)
    if (e.memo) lines.push(`DESCRIPTION:${escText(e.memo)}`)
    if (repeat === 'daily') lines.push(`RRULE:FREQ=DAILY${e.repeatUntil && e.repeatUntil >= e.date ? `;UNTIL=${dateToIcs(e.repeatUntil)}` : ''}`)
    else if (repeat === 'weekly') lines.push(`RRULE:FREQ=WEEKLY${e.repeatUntil && e.repeatUntil >= e.date ? `;UNTIL=${dateToIcs(e.repeatUntil)}` : ''}`)
    else if (repeat === 'monthly') lines.push(`RRULE:FREQ=MONTHLY${e.repeatUntil && e.repeatUntil >= e.date ? `;UNTIL=${dateToIcs(e.repeatUntil)}` : ''}`)
    if (e.color && e.color !== 'blue') lines.push(`X-WEBX-COLOR:${e.color.toUpperCase()}`)
    if (e.reminder !== undefined && e.reminder >= 0) lines.push(`X-WEBX-REMINDER:${e.reminder}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const d = new Date(`${date}T00:00:00`)
  return !Number.isNaN(d.getTime()) && d.getFullYear() === Number(date.slice(0, 4)) && d.getMonth() + 1 === Number(date.slice(5, 7)) && d.getDate() === Number(date.slice(8))
}

function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
}

// DTSTART / DTEND の値を { date, time? } に変換する。TZID は無視して現地時刻として扱い、
// Z 付き（UTC）の場合は端末の現地時刻に変換する。解析できない場合は null。
function parseDateTime(value: string, params: string): { date: string; time?: string } | null {
  if (/VALUE=DATE/i.test(params)) {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})$/)
    if (!m) return null
    const date = `${m[1]}-${m[2]}-${m[3]}`
    return isValidDate(date) ? { date } : null
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/)
  if (!m) return null
  if (m[7] === 'Z') {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])))
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
    return isValidDate(date) && isValidTime(time) ? { date, time } : null
  }
  const date = `${m[1]}-${m[2]}-${m[3]}`
  const time = `${m[4]}:${m[5]}`
  return isValidDate(date) && isValidTime(time) ? { date, time } : null
}

function veventToEvent(props: Map<string, { value: string; params: string }>): Omit<CalEvent, 'id' | 'createdAt'> | null {
  const summary = props.get('SUMMARY')
  const dtstart = props.get('DTSTART')
  if (!summary || !dtstart) return null
  const title = unescText(summary.value).trim()
  if (!title) return null
  const start = parseDateTime(dtstart.value, dtstart.params)
  if (!start) return null
  const ev: Omit<CalEvent, 'id' | 'createdAt'> = { date: start.date, title, memo: '' }
  if (start.time) ev.time = start.time
  const dtend = props.get('DTEND')
  if (dtend && start.time) {
    const end = parseDateTime(dtend.value, dtend.params)
    if (end && end.date === start.date && end.time && end.time > start.time) ev.endTime = end.time
  }
  const desc = props.get('DESCRIPTION')
  if (desc) ev.memo = unescText(desc.value)
  const rrule = props.get('RRULE')
  if (rrule) {
    const freq = /FREQ=(DAILY|WEEKLY|MONTHLY)/i.exec(rrule.value)?.[1]?.toUpperCase()
    if (freq === 'DAILY') ev.repeat = 'daily'
    else if (freq === 'WEEKLY') ev.repeat = 'weekly'
    else if (freq === 'MONTHLY') ev.repeat = 'monthly'
    if (ev.repeat) {
      // UNTIL=YYYYMMDD（時刻付きの場合は日付部分だけ使う）
      const until = /UNTIL=(\d{4})(\d{2})(\d{2})/i.exec(rrule.value)
      if (until) {
        const date = `${until[1]}-${until[2]}-${until[3]}`
        if (isValidDate(date) && date >= ev.date) ev.repeatUntil = date
      }
    }
  }
  const color = props.get('X-WEBX-COLOR')
  if (color) {
    const c = color.value.trim().toLowerCase() as EventColor
    if (EVENT_COLORS.includes(c)) ev.color = c
  }
  const reminder = props.get('X-WEBX-REMINDER')
  if (reminder) {
    const n = Number(reminder.value.trim())
    if (Number.isInteger(n) && n >= 0) ev.reminder = n
  }
  return ev
}

// ICS テキストを解析し、取り込める予定の一覧を返す。壊れた VEVENT は読み飛ばす。
export function parseIcs(text: string): Omit<CalEvent, 'id' | 'createdAt'>[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const out: Omit<CalEvent, 'id' | 'createdAt'>[] = []
  let cur: Map<string, { value: string; params: string }> | null = null
  for (const raw of unfolded.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === 'BEGIN:VEVENT') {
      cur = new Map()
      continue
    }
    if (line === 'END:VEVENT') {
      if (cur) {
        const ev = veventToEvent(cur)
        if (ev) out.push(ev)
      }
      cur = null
      continue
    }
    if (!cur) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const head = line.slice(0, idx)
    const name = head.split(';')[0].toUpperCase()
    if (!name) continue
    cur.set(name, { value: line.slice(idx + 1), params: head })
  }
  return out
}
