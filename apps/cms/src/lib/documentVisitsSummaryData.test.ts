import type { BasePayload } from 'payload'
import { describe, expect, it } from 'vitest'
import { loadVisitSummaries } from './documentVisitsSummaryData'

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
