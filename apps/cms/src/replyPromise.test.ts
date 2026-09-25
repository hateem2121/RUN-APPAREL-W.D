import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The reply promise is "within 24 hours" everywhere the site makes it — the owner's words,
 * chosen 2026-09-15 and confirmed 2026-09-25. It had stayed "2 business days" in six places
 * for ten days after the decision, because nothing checked it. The footer's own line is the
 * CMS field Site Settings -> CTA promise; the code default and the fallback are checked here.
 * `src/migrations/` is left out on purpose: a migration is history, never rewritten.
 */
const REPO = join(import.meta.dirname, '..', '..', '..')
const CMS_SRC = join(REPO, 'apps', 'cms', 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'migrations' ? [] : walk(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

const PROMISES = [
  'apps/cms/src/app/(frontend)/page.tsx',
  'apps/cms/src/app/(frontend)/contact/page.tsx',
  'apps/cms/src/app/(frontend)/privacy/page.tsx',
  'apps/cms/src/globals/SiteSettings.ts',
  'apps/cms/src/lib/projectPublic.ts',
  'scripts/contact-error-messages.mjs',
]

describe('the reply promise is 24 hours everywhere', () => {
  it('no site source promises a reply in business days', () => {
    const files = [...walk(CMS_SRC), join(REPO, 'scripts', 'contact-error-messages.mjs')]
    const offenders = files
      // `\s+`, not a space: JSX wraps prose, and the contact page's own lede kept
      // "2 business\n            days" live for a day after this test went green (2026-09-25).
      .filter((file) => /business\s+days?/i.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(REPO.length + 1))
    expect(offenders).toEqual([])
  })

  it('every place that makes the promise says 24 hours', () => {
    for (const file of PROMISES) {
      expect(readFileSync(join(REPO, file), 'utf8'), file).toMatch(/within 24 hours/i)
    }
  })
})
