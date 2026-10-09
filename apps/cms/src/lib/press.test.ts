import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FACTS, LINEAGE } from './companyFacts'
import { FACTORY_PHOTOS } from './factoryPhotos'
import { FAMILY_SINCE, MEDIA_EMAIL, PRESS_FACTS, PRESS_PHOTOS, pressPhotoDownload } from './press'

/**
 * The press page's facts and downloads (PLAN.md D8). What would have to go wrong for a journalist
 * to read a blank fact or follow a dead download.
 */
const PUBLIC = join(import.meta.dirname, '..', '..', 'public')

describe('the press page’s facts', () => {
  it('every row has a value: a renamed FACTS label would leave one blank', () => {
    for (const row of PRESS_FACTS) {
      expect(row.value.trim(), row.label).not.toBe('')
      // `About ` with nothing after it is a blank too.
      expect(row.value, row.label).not.toMatch(
        /^About\s*$|^\s*pieces|^\s*sq f[et]|^\s*sq m|^\s*working/,
      )
    }
  })

  it('states the floor area in sq m, from FACTS (owner, 2026-10-09)', () => {
    const roof = PRESS_FACTS.find((row) => row.label === 'Under roof')
    const floor = FACTS.find((fact) => fact.value === '193,000')?.value
    expect(roof?.value).toBe(`${floor} sq m`)
    expect(roof?.value).not.toMatch(/sq\.?\s*ft/i)
  })

  it('the family year is read from LINEAGE, never typed twice', () => {
    expect(FAMILY_SINCE).toMatch(/^\d{4}$/)
    expect(LINEAGE).toContain(FAMILY_SINCE)
  })

  it('names no founding year (D8: the company names changed over time)', () => {
    expect(PRESS_FACTS.map((row) => row.label.toLowerCase())).not.toContain('founded')
  })

  it('the media address is the alias the owner named', () => {
    expect(MEDIA_EMAIL).toBe('media@wear-run.com')
  })
})

describe('the press page’s photo downloads', () => {
  it('offers every factory photo (owner, 2026-10-07: all of them, with consent)', () => {
    expect(PRESS_PHOTOS.map((photo) => photo.slug)).toEqual(FACTORY_PHOTOS.map((p) => p.slug))
  })

  for (const photo of PRESS_PHOTOS) {
    it(`${photo.slug}: "Download" is the largest file, and it exists`, () => {
      const file = pressPhotoDownload(photo)
      expect(existsSync(join(PUBLIC, file.href)), file.href).toBe(true)
      expect(file.width).toBeGreaterThanOrEqual(1200)
    })
  }
})
