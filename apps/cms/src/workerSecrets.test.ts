import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CMS_WORKER_SECRETS,
  missingSecrets,
  NOT_ON_SITE_ONLY,
  SITE_ONLY_SECRETS,
} from '../workerSecrets.mjs'

/**
 * A second Worker gets none of the first one's secrets (workerSecrets.mjs has the incident of
 * 22 to 23 Nov 2026: website pages with no analytics tag, because the site-only Worker did not
 * hold CF_ANALYTICS_TOKEN and `Analytics.tsx` draws nothing, silently, without it).
 *
 * WHAT WOULD HAVE TO BREAK IN PRODUCTION FOR THIS TO FAIL: a secret the CMS Worker holds is read
 * by code this file has not placed. On 22 Nov that was `process.env.CF_ANALYTICS_TOKEN` in a
 * component every page draws, with the token on one Worker only. This suite reads the real source
 * tree, so it sees the real readers; the deploy's pre-live analytics check sees the real Worker.
 */
const CMS = join(import.meta.dirname, '..')
const SRC = join(CMS, 'src')

/** Every source file under src/ that is not a test, with the path as workerSecrets.mjs writes it. */
function sourceFiles(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!/\.(ts|tsx|mjs)$/.test(entry.name) || /\.test\./.test(entry.name)) return []
    return [relative(CMS, full).split(sep).join('/')]
  })
}

/** Which files read which secret, from the code itself: `process.env.NAME` and `env?.NAME`. */
function readersOf(secret: string, files: Record<string, string>): string[] {
  const read = new RegExp(`\\benv\\??\\.${secret}\\b`)
  return Object.keys(files)
    .filter((file) => read.test(files[file] ?? ''))
    .sort()
}

const FILES = Object.fromEntries(
  sourceFiles().map((file) => [file, readFileSync(join(CMS, file), 'utf8')]),
)

describe('the two Workers’ secrets', () => {
  it('every secret of the CMS Worker is placed: held by the site-only Worker too, or not needed there', () => {
    const placed = [...Object.keys(SITE_ONLY_SECRETS), ...Object.keys(NOT_ON_SITE_ONLY)].sort()
    expect(placed).toEqual([...CMS_WORKER_SECRETS].sort())
    // Never both: a secret is either needed there or it is not.
    expect(new Set(placed).size).toBe(placed.length)
  })

  it('the analytics token is one the site-only Worker must hold (the fault of 22 Nov 2026)', () => {
    expect(Object.keys(SITE_ONLY_SECRETS)).toContain('CF_ANALYTICS_TOKEN')
    // And the reason it must: a component every page draws reads it.
    expect(readersOf('CF_ANALYTICS_TOKEN', FILES)).toEqual(['src/components/site/Analytics.tsx'])
  })

  it.each(Object.entries(NOT_ON_SITE_ONLY))(
    '%s is read only by the files named for it, none of which answers a GET',
    (secret, { readers }) => {
      expect(readersOf(secret, FILES)).toEqual([...readers].sort())
      for (const file of readers) {
        if (!file.endsWith('/route.ts')) continue
        // The door sends the site-only Worker GET and HEAD alone (door.mjs forSiteOnly).
        expect(FILES[file], file).not.toMatch(/export\s+(async\s+)?function\s+(GET|HEAD)\b/)
        expect(FILES[file], file).not.toMatch(/export\s+const\s+(GET|HEAD)\b/)
      }
    },
  )

  it('negative control: a new reader of a secret the site-only Worker lacks is seen', () => {
    const planted = {
      ...FILES,
      'src/components/site/Footer.tsx': 'const key = process.env.RESEND_API_KEY',
    }
    expect(readersOf('RESEND_API_KEY', planted)).not.toEqual(
      [...NOT_ON_SITE_ONLY.RESEND_API_KEY.readers].sort(),
    )
    expect(readersOf('RESEND_API_KEY', planted)).toContain('src/components/site/Footer.tsx')
  })

  it('negative control: the site-only Worker as it was on 22 Nov is missing exactly the token', () => {
    const heldThatDay = ['PAYLOAD_SECRET', 'SENTRY_DSN']
    expect(missingSecrets(heldThatDay, Object.keys(SITE_ONLY_SECRETS))).toEqual([
      'CF_ANALYTICS_TOKEN',
    ])
    expect(missingSecrets(CMS_WORKER_SECRETS, Object.keys(SITE_ONLY_SECRETS))).toEqual([])
  })

  it('the site-only config says the same as this list', () => {
    const config = readFileSync(join(CMS, 'wrangler.site.jsonc'), 'utf8')
    for (const name of Object.keys(SITE_ONLY_SECRETS)) expect(config, name).toContain(name)
    expect(config).toContain('workerSecrets.mjs')
  })
})
