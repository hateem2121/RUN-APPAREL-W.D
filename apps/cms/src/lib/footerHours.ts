import type { FooterHours } from './projectPublic'

/** The works are in Sialkot. One constant, so the clock, the light and the label agree. */
export const WORKS_TIME_ZONE = 'Asia/Karachi'

const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Mon–Sat 09:00–18:00 PKT" — the footer's own wording, derived, never retyped. */
export function formatHours(hours: FooterHours): string {
  const days =
    hours.firstDay === hours.lastDay
      ? DAY_LABEL[hours.firstDay]
      : `${DAY_LABEL[hours.firstDay]}–${DAY_LABEL[hours.lastDay]}`
  return `${days} ${hours.open}–${hours.close} PKT`
}

const minutes = (clock: string): number => {
  const [h, m] = clock.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Weekday (0–6, Sunday 0) and minutes since midnight, both in Sialkot time. */
function inSialkot(instant: Date): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WORKS_TIME_ZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    day: DAY_LABEL.indexOf(get('weekday')),
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

/**
 * Open at `instant`? A wrapped week (Sat→Mon) and a window past midnight
 * (22:00–02:00) are both real for a factory and both handled; close is exclusive.
 */
export function isOpenAt(hours: FooterHours, instant: Date): boolean {
  const now = inSialkot(instant)
  const open = minutes(hours.open)
  const close = minutes(hours.close)
  const dayInWeek = (day: number) =>
    hours.firstDay <= hours.lastDay
      ? day >= hours.firstDay && day <= hours.lastDay
      : day >= hours.firstDay || day <= hours.lastDay
  if (open < close) {
    return dayInWeek(now.day) && now.minute >= open && now.minute < close
  }
  // Crosses midnight: the late half belongs to the working day it started on.
  if (now.minute >= open) return dayInWeek(now.day)
  if (now.minute < close) return dayInWeek((now.day + 6) % 7)
  return false
}

/** "HH:MM" in Sialkot time. `h23` so midnight is 00:00, never 24:00. */
export function worksClock(instant: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: WORKS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant)
}
