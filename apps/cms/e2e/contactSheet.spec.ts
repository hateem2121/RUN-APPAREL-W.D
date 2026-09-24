import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { combinations } from '../scripts/contact-sheet.mjs'

/**
 * DS-12's thin liveness check: `scripts/contact-sheet.mjs` runs and produces the expected
 * number of screenshots — a liveness check, not a design review. Whether the pictures
 * look right stays a human judgement, the same way the original 2026-09-09/10 audit
 * worked.
 */
test('contact-sheet produces one screenshot per page x width x theme combination', async ({
  baseURL,
}) => {
  const scriptPath = join(import.meta.dirname, '..', 'scripts', 'contact-sheet.mjs')
  const outDir = mkdtempSync(join(tmpdir(), 'contact-sheet-liveness-'))
  try {
    execFileSync('node', [scriptPath, '--base-url', baseURL as string, '--out', outDir], {
      encoding: 'utf8',
      timeout: 120_000,
    })

    const expectedCount = combinations().length
    expect(
      expectedCount,
      'combinations() itself returned nothing to check against',
    ).toBeGreaterThan(0)

    const files = readdirSync(outDir).filter((name) => name.endsWith('.png'))
    expect(files.length, `expected ${expectedCount} screenshots, found ${files.length}`).toBe(
      expectedCount,
    )
    for (const file of files) {
      expect(existsSync(join(outDir, file)), `${file} was listed but does not exist`).toBe(true)
    }
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
})
