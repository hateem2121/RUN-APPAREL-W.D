import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard the two things `next.config.mjs` asserts about what leaves this Worker.
 *
 * WHY A TEXT READ RATHER THAN AN IMPORT. Importing the config executes
 * `initOpenNextCloudflareForDev()` at module scope, which reaches for wrangler
 * bindings — a side effect that has no business running inside a unit test, and one
 * whose failure would look like a config regression rather than a harness problem.
 * The repo's usual objection to string-matching ("asserting that a string exists
 * only proves the string exists", mediaReferences.test.ts) is aimed at behaviour;
 * this is a declarative flag whose presence IS the behaviour.
 */
const CONFIG = join(import.meta.dirname, '..', 'next.config.mjs')

describe('next.config.mjs', () => {
  it('does not advertise the stack in x-powered-by', async () => {
    // L3, 2026-08-18. Measured live: `x-powered-by: Next.js, Payload` on
    // cms.wear-run.help, absent on viewer.wear-run.help. Next sets it by default
    // and Payload appends itself. Nothing consumes it, and it narrows an
    // attacker's search space for version-specific advisories against the system
    // that owns every product record and both R2 buckets.
    const source = await readFile(CONFIG, 'utf8')
    expect(source).toMatch(/poweredByHeader:\s*false/)
  })

  it('still declares every security header the CMS shipped without', async () => {
    // The CMS launched with NO security headers at all, including on /admin —
    // the login for the system that owns everything. These six are the set that
    // is unambiguously correct and testable; a full CSP on /admin is deliberately
    // absent, and next.config.mjs says why. This assertion exists so that a
    // future edit removing one is loud.
    const source = await readFile(CONFIG, 'utf8')
    for (const header of [
      'Strict-Transport-Security',
      'X-Frame-Options',
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(source, `${header} disappeared from SECURITY_HEADERS`).toContain(header)
    }
  })
})
