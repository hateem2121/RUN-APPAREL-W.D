import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COUNT_DATE, COUNT_DATE_ISO, CSV_PATH, WINDOW_START_ISO } from './buyerQuestions'
import { guideAt } from './guides'
import { SITE_ORIGIN } from './seo'
import { buyerQuestionsDatasetJsonLd } from './structuredData'

/**
 * The buyer-questions guide's Dataset markup (C7 editorial call 4). Google's Dataset page, read
 * 2026-11-07: description 50 to 5,000 characters; license a versioned URL; temporalCoverage an ISO 8601
 * interval; the file as a DataDownload with encodingFormat and contentUrl.
 */
const PATH = '/guides/what-sportswear-buyers-ask'
const APP = fileURLToPath(new URL('../app/(frontend)', import.meta.url))
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

describe('the buyer-questions Dataset', () => {
  const guide = guideAt(PATH)

  it('names and describes the dataset with the guide’s own words, within Google’s length', () => {
    const data = buyerQuestionsDatasetJsonLd(
      guide,
      { start: WINDOW_START_ISO, end: null },
      CSV_PATH,
    )
    expect(data['@type']).toBe('Dataset')
    expect(data.name).toBe(guide.title)
    expect(data.description).toBe(guide.description)
    expect(data.description.length).toBeGreaterThanOrEqual(50)
    expect(data.description.length).toBeLessThanOrEqual(5000)
    expect(data.license).toBe('https://creativecommons.org/licenses/by/4.0/')
  })

  it('points its download at the route that really serves the CSV', () => {
    const data = buyerQuestionsDatasetJsonLd(
      guide,
      { start: WINDOW_START_ISO, end: null },
      CSV_PATH,
    )
    expect(data.distribution).toEqual([
      {
        '@type': 'DataDownload',
        encodingFormat: 'text/csv',
        contentUrl: `${SITE_ORIGIN}${CSV_PATH}`,
      },
    ])
    // The folder is the address: a renamed or deleted route would leave the markup pointing at a 404.
    expect(existsSync(join(APP, CSV_PATH, 'route.ts'))).toBe(true)
  })

  it('claims no time window until the count day is known, and an ISO interval once it is', () => {
    const owed = buyerQuestionsDatasetJsonLd(
      guide,
      { start: WINDOW_START_ISO, end: null },
      CSV_PATH,
    )
    expect('temporalCoverage' in owed).toBe(false)
    const counted = buyerQuestionsDatasetJsonLd(
      guide,
      { start: WINDOW_START_ISO, end: '2026-10-10' },
      CSV_PATH,
    )
    expect(counted.temporalCoverage).toBe('2026-01-01/2026-10-10')
  })

  it('keeps the two forms of the count day together: both owed, or both filled', () => {
    // COUNT_DATE is the page's words ("10 October 2026"); COUNT_DATE_ISO the markup's ("2026-10-10").
    // Filling one and not the other would publish a page whose words and markup disagree.
    expect(COUNT_DATE === null).toBe(COUNT_DATE_ISO === null)
    expect(WINDOW_START_ISO).toMatch(ISO_DAY)
    if (COUNT_DATE_ISO !== null) {
      expect(COUNT_DATE_ISO).toMatch(ISO_DAY)
      expect(COUNT_DATE_ISO > WINDOW_START_ISO).toBe(true)
    }
  })
})
