import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * DS-11's thin liveness check: `scripts/content-density-report.mjs` runs and emits a
 * non-empty report line for every page — a reporting robot, not a pass/fail gate, since
 * no threshold has been set by the owner. This does NOT judge whether the density is
 * good; it only proves the report still runs and still measures something.
 */
test('content-density-report runs and reports on every page', async ({ baseURL }) => {
  const scriptPath = join(import.meta.dirname, '..', 'scripts', 'content-density-report.mjs')
  const output = execFileSync('node', [scriptPath, '--base-url', baseURL as string], {
    encoding: 'utf8',
    timeout: 60_000,
  })

  for (const path of ['/', '/products', '/contact']) {
    const line = output
      .split('\n')
      .find((row) => row.startsWith(`[content-density-report] ${path}:`))
    expect(line, `no report line for ${path}: full output was\n${output}`).toBeTruthy()
    expect(line, `${path}'s report line has no word count`).toMatch(/\d+ words/)
    expect(line, `${path}'s report line has no phone-screen ratio`).toMatch(/over [\d.]+ phone screens/)
  }
})
