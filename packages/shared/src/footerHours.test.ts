import { describe, expect, it } from 'vitest'
import { formatHours, isOpenAt, WORKS_TIME_ZONE, worksClock } from './footerHours'

const MON_SAT = { firstDay: 1, lastDay: 6, open: '09:00', close: '18:00' }
// Sialkot is UTC+5 all year. 2026-09-07 is a Monday.
const at = (iso: string) => new Date(iso)

describe('footerHours', () => {
  it('names the works time zone once', () => {
    expect(WORKS_TIME_ZONE).toBe('Asia/Karachi')
  })

  it('formats a contiguous week as the footer prints it', () => {
    expect(formatHours(MON_SAT)).toBe('Mon–Sat 09:00–18:00 PKT')
    expect(formatHours({ ...MON_SAT, firstDay: 1, lastDay: 1 })).toBe('Mon 09:00–18:00 PKT')
  })

  it('is open inside the window on a working day, in Sialkot time', () => {
    expect(isOpenAt(MON_SAT, at('2026-09-07T04:00:00Z'))).toBe(true) // 09:00 PKT Monday
    expect(isOpenAt(MON_SAT, at('2026-09-07T12:59:00Z'))).toBe(true) // 17:59 PKT
    expect(isOpenAt(MON_SAT, at('2026-09-07T13:00:00Z'))).toBe(false) // 18:00 PKT — close is exclusive
    expect(isOpenAt(MON_SAT, at('2026-09-07T03:59:00Z'))).toBe(false) // 08:59 PKT
  })

  it('is closed on Sunday for a Mon–Sat week', () => {
    expect(isOpenAt(MON_SAT, at('2026-09-06T06:00:00Z'))).toBe(false) // Sunday 11:00 PKT
  })

  it('handles a week that wraps past Sunday', () => {
    const SAT_MON = { ...MON_SAT, firstDay: 6, lastDay: 1 } // Sat, Sun, Mon
    expect(isOpenAt(SAT_MON, at('2026-09-06T06:00:00Z'))).toBe(true) // Sunday
    expect(isOpenAt(SAT_MON, at('2026-09-08T06:00:00Z'))).toBe(false) // Tuesday
  })

  it('handles hours that cross midnight', () => {
    const NIGHT = { ...MON_SAT, open: '22:00', close: '02:00' }
    expect(isOpenAt(NIGHT, at('2026-09-07T18:30:00Z'))).toBe(true) // 23:30 PKT Monday
    expect(isOpenAt(NIGHT, at('2026-09-07T20:30:00Z'))).toBe(true) // 01:30 PKT Tuesday
    expect(isOpenAt(NIGHT, at('2026-09-07T10:00:00Z'))).toBe(false) // 15:00 PKT
  })

  it('renders the works clock as HH:MM in Sialkot time', () => {
    expect(worksClock(at('2026-09-07T04:05:00Z'))).toBe('09:05')
    expect(worksClock(at('2026-09-07T19:00:00Z'))).toBe('00:00') // never "24:00"
  })
})
