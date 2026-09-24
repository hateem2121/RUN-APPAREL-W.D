import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'

const execFileAsync = promisify(execFile)

/**
 * DS-11's thin liveness check: `scripts/content-density-report.mjs` runs and emits a
 * non-empty report line for every page — a reporting robot, not a pass/fail gate, since
 * no threshold has been set by the owner. This does NOT judge whether the density is
 * good; it only proves the report still runs and still measures something.
 *
 * ⚠️ CHROMIUM ONLY, DESPITE RUNNING IN BOTH CMS PROJECTS (`playwright.config.ts`, no
 * `testMatch`) — the script drives its OWN Chromium via `@playwright/test`'s `chromium`
 * export, so a Firefox project run here would launch a second, unrelated browser rather
 * than testing anything about Firefox (M4). And the child process must be awaited, not
 * blocked on with `execFileSync`: a sync call blocks this worker's whole event loop, so
 * neither this test's own timeout nor the child's can fire independently of the other.
 */
test.skip(({ browserName }) => browserName !== 'chromium', 'drives its own Chromium')
test.setTimeout(180_000)

test('content-density-report runs and reports on every page', async ({ baseURL }) => {
  const scriptPath = join(import.meta.dirname, '..', 'scripts', 'content-density-report.mjs')
  const { stdout: output } = await execFileAsync(
    'node',
    [scriptPath, '--base-url', baseURL as string],
    { timeout: 150_000 },
  )

  for (const path of ['/', '/products', '/contact']) {
    const line = output
      .split('\n')
      .find((row) => row.startsWith(`[content-density-report] ${path}:`))
    expect(line, `no report line for ${path}: full output was\n${output}`).toBeTruthy()
    expect(line, `${path}'s report line has no word count`).toMatch(/\d+ words/)
    expect(line, `${path}'s report line has no phone-screen ratio`).toMatch(
      /over [\d.]+ phone screens/,
    )
  }
})
