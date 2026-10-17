import type { FooterHours } from './siteFooter.ts'

/** The works are in Sialkot. One constant, so the clock, the light and the label agree. */
export const WORKS_TIME_ZONE = 'Asia/Karachi'

/** Three-letter English weekday names, Sunday first, matching `Date#getDay()`. */
export const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

/** Is `day` (0–6, Sunday 0) one of the working days? Handles a week that wraps past Sunday. */
const dayInWeek = (hours: FooterHours, day: number): boolean =>
  hours.firstDay <= hours.lastDay
    ? day >= hours.firstDay && day <= hours.lastDay
    : day >= hours.firstDay || day <= hours.lastDay

/**
 * Open at `instant`? A wrapped week (Sat→Mon) and a window past midnight
 * (22:00–02:00) are both real for a factory and both handled; close is exclusive.
 */
export function isOpenAt(hours: FooterHours, instant: Date): boolean {
  const now = inSialkot(instant)
  const open = minutes(hours.open)
  const close = minutes(hours.close)
  if (open < close) {
    return dayInWeek(hours, now.day) && now.minute >= open && now.minute < close
  }
  // Crosses midnight: the late half belongs to the working day it started on.
  if (now.minute >= open) return dayInWeek(hours, now.day)
  if (now.minute < close) return dayInWeek(hours, (now.day + 6) % 7)
  return false
}

/**
 * When the works next open, as the weekday name and how many days ahead (0 = later today), in
 * Sialkot time. Meant for a moment the works are SHUT; an open moment answers with today.
 *
 * Why it exists (audit 2026-10-17): the closed light said "Opens 08:00" at 18:00 on a Saturday and
 * at noon on a Sunday, though the works open on Monday. The visitor's own day is never used: the
 * weekday is read in Sialkot time, like `isOpenAt`. The week is the CMS's `firstDay`–`lastDay`,
 * not a hard-coded Mon–Sat. Friday prayer and holidays are NOT modelled (the owner has not answered).
 */
export function nextOpening(hours: FooterHours, instant: Date): { day: string; daysAhead: number } {
  const now = inSialkot(instant)
  const open = minutes(hours.open)
  // A window starts at `open` on a working day; "later today" only if that start is still ahead.
  // Day 7 is the same weekday next week, for a works that opens on one day only.
  for (let ahead = 0; ahead <= 7; ahead++) {
    const day = (now.day + ahead) % 7
    if (!dayInWeek(hours, day)) continue
    if (ahead === 0 && now.minute >= open) continue
    return { day: DAY_LABEL[day] ?? '', daysAhead: ahead }
  }
  return { day: DAY_LABEL[now.day] ?? '', daysAhead: 0 }
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
