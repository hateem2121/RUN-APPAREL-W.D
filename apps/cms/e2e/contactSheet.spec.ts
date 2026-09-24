import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { combinations } from '../scripts/contact-sheet.mjs'

const execFileAsync = promisify(execFile)

/**
 * DS-12's thin liveness check: `scripts/contact-sheet.mjs` runs and produces the expected
 * number of screenshots — a liveness check, not a design review. Whether the pictures
 * look right stays a human judgement, the same way the original 2026-09-09/10 audit
 * worked.
 *
 * ⚠️ CHROMIUM ONLY, DESPITE RUNNING IN BOTH CMS PROJECTS (`playwright.config.ts`, no
 * `testMatch`) — the script drives its OWN Chromium via `@playwright/test`'s `chromium`
 * export, so a Firefox project run here would launch a second, unrelated browser rather
 * than testing anything about Firefox (M4). And the child process must be awaited, not
 * blocked on with `execFileSync`: a sync call blocks this worker's whole event loop for
 * however long 18 full-page screenshots take, so neither this test's own 180s timeout nor
 * the child's own can fire independently of the other.
 */
test.skip(({ browserName }) => browserName !== 'chromium', 'drives its own Chromium')
test.setTimeout(180_000)

test('contact-sheet produces one screenshot per page x width x theme combination', async ({
  baseURL,
}) => {
  const scriptPath = join(import.meta.dirname, '..', 'scripts', 'contact-sheet.mjs')
  const outDir = mkdtempSync(join(tmpdir(), 'contact-sheet-liveness-'))
  try {
    await execFileAsync('node', [scriptPath, '--base-url', baseURL as string, '--out', outDir], {
      timeout: 150_000,
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
