import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * No page may hand a visitor the catalogue. Owner decision, 2026-09-04.
 *
 * These product pages are indexed by Google and listed in `public/sitemap.xml`
 * (55 URLs since the same day). The catalogue behind `catalogueUrl` is a 54.3 MB
 * B2B PDF served from the apex — it is a sales asset for qualified partners, not
 * something arbitrary search traffic should be handed in one click. The intended
 * next step from a product page is an enquiry, not a download.
 *
 * ⚠️ WHY A SOURCE SCAN RATHER THAN A COMPONENT TEST.
 * `catalogueUrl` is still in the API payload, still on `ViewerProduct`, and still
 * on `ViewerSiteSettings` — deliberately, because the CMS owns it and other
 * surfaces may want it later. So the TYPES actively invite this back: rendering
 * `href={settings.catalogueUrl}` anywhere compiles, lints and passes every other
 * test in this suite. Three separate places used to do exactly that (the header
 * wordmark, the header button, the footer), and a fourth was on the unavailable
 * screen. A per-component test only guards the components someone remembered to
 * write a test for; this guards the ones they did not.
 *
 * If a catalogue link is ever wanted again, delete this file in the same commit
 * that adds it, so the decision is reversed on purpose and not by accident.
 */

const SRC = join(import.meta.dirname, '.')

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      sourceFiles(path, found)
      continue
    }
    // Tests are exempt: this file names the property, and States.test.tsx asserts
    // the NEGATIVE case, which it cannot do without writing the string.
    if (/\.test\.tsx?$/.test(entry)) continue
    if (/\.tsx?$/.test(entry)) found.push(path)
  }
  return found
}

/**
 * Strip block and line comments, so the prose above does not fail its own rule.
 *
 * ⚠️ The `(?<!:)` is load-bearing, and the first version of this file did not have
 * it. Without it, `//` inside `https://…` is read as the start of a comment and the
 * rest of the line vanishes — which would silently blind the scan on any line
 * containing a URL, and this codebase is full of them. Anchoring to the start of a
 * line instead (the other first attempt) let a TRAILING comment survive, which is
 * a false positive. Both directions are covered by the negative control below.
 *
 * (Writing that anchored pattern out longhand here would embed the block-comment
 * terminator inside this very docblock and stop the file parsing — which is
 * exactly what happened on the first attempt.)
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/.*$/gm, '')
}

describe('the catalogue is not linked from the viewer', () => {
  it('no source file reads catalogueUrl outside a comment', () => {
    const offenders = sourceFiles(SRC)
      .map((path) => ({ path, code: withoutComments(readFileSync(path, 'utf8')) }))
      .filter(({ code }) => /catalogueUrl/.test(code))
      .map(({ path }) => path.replace(`${SRC}/`, ''))

    expect(
      offenders,
      `These files read catalogueUrl in live code. The catalogue must not be linked ` +
        `from a product page — see the docblock in this file for why, and ` +
        `docs/AUDIT-PRODUCT-PAGES-2026-09-04.md for the audit that prompted it.`,
    ).toEqual([])
  })

  it('the scan can actually fail — negative control', () => {
    // Without this, the assertion above passes vacuously if `sourceFiles` ever
    // returns nothing (a moved directory, a changed extension, a bad join). That
    // is the failure mode this repo keeps paying for: a green test measuring an
    // empty set. Prove the matcher sees a real occurrence.
    const files = sourceFiles(SRC)
    expect(files.length).toBeGreaterThan(20)
    expect(files.some((f) => f.endsWith('App.tsx'))).toBe(true)
    // a trailing comment is stripped …
    expect(withoutComments('const a = 1 // catalogueUrl\n')).not.toMatch(/catalogueUrl/)
    // … a full-line comment is stripped …
    expect(withoutComments('  // catalogueUrl lives here\n')).not.toMatch(/catalogueUrl/)
    // … a block comment is stripped …
    expect(withoutComments('/* uses catalogueUrl */\n')).not.toMatch(/catalogueUrl/)
    // … real code is NOT stripped …
    expect(withoutComments('const a = settings.catalogueUrl\n')).toMatch(/catalogueUrl/)
    // … and a URL is not mistaken for a comment, which would blind the whole scan.
    expect(withoutComments("const u = 'https://x/y'\nconst a = s.catalogueUrl\n")).toMatch(
      /catalogueUrl/,
    )
  })
})
