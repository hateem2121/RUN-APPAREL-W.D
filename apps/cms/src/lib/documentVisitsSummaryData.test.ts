import type { BasePayload } from 'payload'
import { describe, expect, it } from 'vitest'
import { lastEmailLine, loadVisitSummaries } from './documentVisitsSummaryData'

/**
 * `loadVisitSummaries` runs exactly two `payload.find` calls and slices the 30-day
 * result into "last 7" without a second query. `summariseVisits` (Task 3) is trusted
 * here — its own file proves the arithmetic; this proves the right ROWS and the right
 * `find` ARGUMENTS reach it.
 */

type FakeFind = Pick<BasePayload, 'find'>['find']

function fakeFind(
  visitsDocs: Record<string, unknown>[],
  emailDocs: Record<string, unknown>[],
): { find: FakeFind; calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = []
  const find = (async (args: Record<string, unknown>) => {
    calls.push(args)
    return { docs: args.collection === 'document-visit-emails' ? emailDocs : visitsDocs }
  }) as unknown as FakeFind
  return { find, calls }
}

const NOW = new Date('2026-09-15T10:00:00.000Z') // 2026-09-15 in Asia/Karachi too

describe('loadVisitSummaries', () => {
  it('queries document-visits with the exact where/pagination/depth, and document-visit-emails with sort/limit/depth', async () => {
    const { find, calls } = fakeFind([], [])
    await loadVisitSummaries({ find }, NOW)
    expect(calls[0]).toMatchObject({
      collection: 'document-visits',
      where: { day: { greater_than_equal: '2026-08-17' } },
      pagination: false,
      depth: 0,
    })
    expect(calls[1]).toMatchObject({
      collection: 'document-visit-emails',
      sort: '-week',
      limit: 1,
      depth: 0,
    })
  })

  it('last7 excludes a row from 8 days ago that last30 includes', async () => {
    const eightDaysAgo = { day: '2026-09-07', document: 'catalogue', kind: 'person', opens: 1 }
    const today = { day: '2026-09-15', document: 'catalogue', kind: 'person', opens: 1 }
    const { find } = fakeFind([eightDaysAgo, today], [])
    const result = await loadVisitSummaries({ find }, NOW)
    expect(result.last30.catalogue.people).toBe(2)
    expect(result.last7.catalogue.people).toBe(1)
  })

  it('pins the 7-day boundary: 2026-09-09 is included, 2026-09-08 is not', async () => {
    const boundaryDay = { day: '2026-09-09', document: 'catalogue', kind: 'person', opens: 1 }
    const dayBeforeBoundary = { day: '2026-09-08', document: 'catalogue', kind: 'person', opens: 1 }
    const { find } = fakeFind([boundaryDay, dayBeforeBoundary], [])
    const result = await loadVisitSummaries({ find }, NOW)
    expect(result.last7.catalogue.people).toBe(1)
    expect(result.last30.catalogue.people).toBe(2)
  })

  it('maps the newest document-visit-emails row to lastEmail', async () => {
    const { find } = fakeFind(
      [],
      [{ week: '2026-09-08', status: 'sent', sentAt: '2026-09-14T04:00:00.000Z', error: '' }],
    )
    const result = await loadVisitSummaries({ find }, NOW)
    expect(result.lastEmail).toEqual({
      week: '2026-09-08',
      status: 'sent',
      sentAt: '2026-09-14T04:00:00.000Z',
      error: '',
    })
  })

  it('gives zeros and null on an empty result', async () => {
    const { find } = fakeFind([], [])
    const result = await loadVisitSummaries({ find }, NOW)
    expect(result.today).toBe('2026-09-15')
    expect(result.last7.catalogue.people).toBe(0)
    expect(result.last7.profile.people).toBe(0)
    expect(result.lastEmail).toBeNull()
  })

  it('a doc with null city or country becomes an empty string, not null', async () => {
    const row = {
      day: '2026-09-15',
      document: 'catalogue',
      kind: 'person',
      opens: 1,
      country: null,
      city: null,
    }
    const { find } = fakeFind([row], [])
    const result = await loadVisitSummaries({ find }, NOW)
    // A null country cannot appear in topCountries (summariseVisits only counts a
    // non-empty country) — the round trip through '' is what this proves.
    expect(result.last7.catalogue.topCountries).toEqual([])
  })
})

describe('lastEmailLine', () => {
  /*
   * The row's `week` is the MONDAY OF THE WEEK THE EMAIL DESCRIBES, not the day it was sent.
   * Until 2026-09-30 the page printed that Monday as "sent 2026-09-14" for an email that left
   * on 27 September — which read as two missed weeks and hid a wrong send day (apexWeekly.test.ts).
   */
  it('says when it was sent, in Pakistan, and which week it covered', () => {
    expect(
      lastEmailLine({
        week: '2026-09-28',
        status: 'sent',
        sentAt: '2026-10-05T04:00:00.000Z',
        error: '',
      }),
    ).toBe('Last weekly email: sent 5 October 2026, covering 28 September to 4 October 2026')
  })

  it('uses the Pakistan day, not the UTC one, for a send just before midnight UTC', () => {
    expect(
      lastEmailLine({
        week: '2026-09-14',
        status: 'sent',
        sentAt: '2026-09-20T20:30:00.000Z',
        error: '',
      }),
    ).toBe('Last weekly email: sent 21 September 2026, covering 14 to 20 September 2026')
  })

  it('names a week that crosses a year end in full', () => {
    expect(
      lastEmailLine({
        week: '2026-12-28',
        status: 'sent',
        sentAt: '2027-01-04T04:00:00.000Z',
        error: '',
      }),
    ).toBe('Last weekly email: sent 4 January 2027, covering 28 December 2026 to 3 January 2027')
  })

  it('says a failed week was not sent, with the reason', () => {
    expect(
      lastEmailLine({
        week: '2026-09-21',
        status: 'failed',
        sentAt: null,
        error: 'not configured',
      }),
    ).toBe('Last weekly email: not sent (not configured), for 21 to 27 September 2026')
  })

  it('says so when there has never been one', () => {
    expect(lastEmailLine(null)).toBe('No weekly email yet')
  })
})
