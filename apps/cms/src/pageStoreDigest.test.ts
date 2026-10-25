import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CMS_SERVICE,
  queryBody,
  readCalculations,
  summarizePageStore,
  TARGETS,
  UNREADABLE,
} from '../../../scripts/page-store-digest.mjs'

/*
 * The weekly digest's page-store line (W5-1, 2026-10-25). What would have to break: a target
 * misread (a week over target reported as within it), a dead read passed off as a quiet week,
 * anything from the API answer other than its numbers reaching a public log and issue, or the
 * query asking about the wrong Worker or the wrong address.
 */
const answer = (requests: number, p75: number, p90: number, cpuP50: number) => ({
  success: true,
  result: {
    calculations: [
      { alias: 'requests', aggregates: [{ value: requests }] },
      { alias: 'p75', aggregates: [{ value: p75 }] },
      { alias: 'p90', aggregates: [{ value: p90 }] },
      { alias: 'cpuP50', aggregates: [{ value: cpuP50 }] },
    ],
  },
})

describe('the query asks about the CMS Worker and the right addresses', () => {
  it('filters on the CMS Worker and each route, over the window given', () => {
    const body = queryBody('home', 1, 2)
    expect(body.timeframe).toEqual({ from: 1, to: 2 })
    expect(body.view).toBe('calculations')
    expect(body.parameters.filters).toEqual([
      { key: '$metadata.service', operation: 'eq', type: 'string', value: CMS_SERVICE },
      {
        key: '$workers.event.request.url',
        operation: 'eq',
        type: 'string',
        value: 'https://wear-run.com/',
      },
    ])
  })

  it('reads every garment-data address, not one garment', () => {
    const filter = queryBody('data', 1, 2).parameters.filters[1]
    expect(filter?.operation).toBe('starts_with')
    expect(filter?.value).toBe('https://cms.wear-run.help/api/public/viewer/')
  })
})

describe('the summary says plainly whether each target was met', () => {
  it('within target, with the numbers and the before figures', () => {
    const { requests, summary } = summarizePageStore({
      home: readCalculations(answer(500, 180, 550, 2)),
      sitemap: readCalculations(answer(40, 60, 90, 1)),
      data: readCalculations(answer(300, 90, 240, 1)),
    })
    expect(requests).toBe(840)
    expect(summary).toContain('Home page: p75 180 ms (within target')
    expect(summary).toContain('p90 550 ms (within target')
    expect(summary).toContain('Garment data: p90 240 ms (within target')
    expect(summary).toContain('median 1 ms (within target')
    expect(summary).not.toContain('OVER')
    expect(summary).toContain('Before the store: 799 / 2,338 ms.')
  })

  it('NEGATIVE CONTROL: a week over target says OVER, at the target itself too', () => {
    const { summary } = summarizePageStore({
      home: readCalculations(answer(29, TARGETS.homeP75, 1457, 2)),
      sitemap: readCalculations(answer(12, 66, 1910, 25)),
      data: readCalculations(answer(14, 97, 1771, 1)),
    })
    expect(summary).toContain(`p75 ${TARGETS.homeP75} ms (OVER target`)
    expect(summary).toContain('p90 1457 ms (OVER target')
    expect(summary).toContain('Garment data: p90 1771 ms (OVER target')
    expect(summary).toContain('median 25 ms (OVER target')
  })

  it('a week with no requests says so, rather than reading as a pass', () => {
    const none = readCalculations({ result: { calculations: [] } })
    const { requests, summary } = summarizePageStore({ home: none, sitemap: none, data: none })
    expect(requests).toBe(0)
    expect(summary).toMatch(/no requests/)
    expect(summary).not.toMatch(/within target/)
  })
})

describe('nothing but numbers leaves the API answer (public log, public issue)', () => {
  it('drops a non-numeric value and any extra field', () => {
    const hostile = {
      result: {
        calculations: [
          { alias: 'requests', aggregates: [{ value: 3 }] },
          { alias: 'p75', aggregates: [{ value: '<script>steal()</script>' }] },
          { alias: 'p90', aggregates: [{ value: 120 }], note: 'token=abc' },
        ],
      },
    }
    const read = readCalculations(hostile)
    expect(read).toEqual({ requests: 3, p75: null, p90: 120, cpuP50: null })
    const { summary } = summarizePageStore({ home: read, sitemap: read, data: read })
    expect(summary).not.toContain('script')
    expect(summary).not.toContain('token')
  })
})

describe('the digest workflow carries the line, and a failed read is never a quiet week', () => {
  const workflow = readFileSync(
    join(import.meta.dirname, '..', '..', '..', '.github', 'workflows', 'diagnostics-digest.yml'),
    'utf8',
  )

  it('runs the script in a step that may fail without stopping the digest', () => {
    expect(workflow).toContain('node scripts/page-store-digest.mjs')
    expect(workflow).toMatch(/id: pagestore\n\s+continue-on-error: true/)
  })

  it('puts the summary in the issue, or the fixed sentence when the read failed', () => {
    expect(workflow).toContain(`|| '${UNREADABLE}'`)
    expect(workflow).toContain('"$PAGE_STORE_SUMMARY"')
    expect(workflow).toContain("steps.pagestore.outcome == 'failure'")
  })
})
