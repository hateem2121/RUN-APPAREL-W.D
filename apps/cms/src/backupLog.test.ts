import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INQUIRY_BUCKET, objectLabel, summaryLine } from '../../../scripts/backup-log.mjs'

/*
 * The weekly R2 mirror runs in GitHub Actions on a PUBLIC repository, so everything it prints is
 * public. A buyer's attached file is stored under the name the buyer gave it ("Acme-2027-range-
 * techpack.pdf"), and the first version printed that name on any failed or mismatched copy, and a
 * weekly count of attachments. Final review, 2026-09-29. The public buckets' keys stay printed:
 * they are the same product files the website already serves.
 */
const BUYER_FILE = 'Acme-2027-range-techpack.pdf'

describe('backup log lines never carry a buyer file name or count', () => {
  it('names a buyer file by its position only', () => {
    const label = objectLabel(INQUIRY_BUCKET, BUYER_FILE, 2)
    expect(label).toBe(`${INQUIRY_BUCKET}/inquiry file #3`)
    expect(label).not.toContain('Acme')
  })

  // NEGATIVE CONTROL: the public media keys are still named, or a failed product file could not
  // be found from the log.
  it('still names a public media object in full', () => {
    expect(objectLabel('run-apparel-viewer-media', 'rxps-wine-poster.webp', 0)).toBe(
      'run-apparel-viewer-media/rxps-wine-poster.webp',
    )
  })

  it('reports buyer files as saved or not, never how many there were', () => {
    const line = summaryLine({
      saved: 40,
      failed: 0,
      inquiryFailed: 0,
      unverified: 2,
      mismatched: 3,
    })
    expect(line).toBe(
      '[backup-r2] done: 40 saved, 0 failed, 2 saved but size-unverified, 3 saved with a STALE CMS size record; inquiry files: all saved.',
    )
    expect(
      summaryLine({ saved: 40, failed: 0, inquiryFailed: 2, unverified: 0, mismatched: 0 }),
    ).toBe('[backup-r2] done: 40 saved, 0 failed; inquiry files: 2 NOT saved.')
  })

  // The script itself must route every object it prints through `objectLabel`: a new warning that
  // interpolates `${bucket}/${key}` directly would bring the buyer's file name straight back.
  it('backup-r2.mjs prints no raw bucket/key and no inquiry count', () => {
    const source = readFileSync(join(import.meta.dirname, '../../../scripts/backup-r2.mjs'), 'utf8')
    const printed = source
      .split('\n')
      .filter((line) => /console\.(log|warn|error)|^\s*`/.test(line))
      .join('\n')
    expect(printed).not.toMatch(/\$\{bucket\}\/\$\{key\}/)
    expect(printed).not.toMatch(/inquiryFiles\.length/)
  })
})
