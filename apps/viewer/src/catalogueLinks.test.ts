import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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
 * ⚠️ THE IDENTIFIER SCAN ALONE HAS A HOLE, AND IT IS THE OBVIOUS ONE.
 * Widened 2026-09-05. `href="https://wear-run.help/catalogue"` contains no
 * `catalogueUrl`, so the original scan could not see it at all — and that is the
 * form a link takes when someone adds it in a hurry, or in a file that has no
 * access to the settings object. There are therefore TWO scans: the property name,
 * and the literal URL. They fail for different reasons and neither subsumes the
 * other.
 *
 * ⚠️ AND IT ONLY WALKED `.ts`/`.tsx` UNDER `src/`. A catalogue link does not have
 * to be TypeScript: `index.html` can carry a static anchor, a stylesheet can carry
 * one in `content:`, the Worker rewrites the served HTML, and a build script can
 * inject markup through `transformIndexHtml` — the font-preload plugin in
 * `vite.config.ts` does exactly that. All four are now walked.
 *
 * ⚠️ `packages/shared/src` IS DELIBERATELY NOT WALKED, and that is not an omission.
 * `defaults.ts` holds the literal URL as the CMS-overridable default and `types.ts`
 * declares the field; both are the reason the docblock above says the property
 * stays. Neither renders anything — that package contains no JSX and no markup. A
 * viewer file that imported the default and rendered it would still be caught,
 * because the property name appears at the point of use.
 *
 * If a catalogue link is ever wanted again, delete this file in the same commit
 * that adds it, so the decision is reversed on purpose and not by accident.
 */

const VIEWER = join(import.meta.dirname, '..')

/** Every surface that can put bytes in front of a visitor. */
const ROOTS = ['src', 'worker', 'scripts', 'public'].map((dir) => join(VIEWER, dir))
const EXTRA_FILES = [join(VIEWER, 'index.html')]

/** `.txt`/`.xml` are in for `public/` — llms.txt and sitemap.xml are served verbatim. */
const SCANNED = /\.(tsx?|mjs|css|html|txt|xml)$/

/** The apex path the 54.3 MB PDF is served from. Host-agnostic on purpose. */
const CATALOGUE_URL = /wear-run\.help\/catalogue/

function sourceFiles(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      sourceFiles(path, found)
      continue
    }
    // Tests are exempt: this file names the property, and States.test.tsx asserts
    // the NEGATIVE case, which it cannot do without writing the string.
    if (/\.test\.tsx?$/.test(entry)) continue
    if (SCANNED.test(entry)) found.push(path)
  }
  return found
}

function scanned(): { path: string; code: string }[] {
  const paths = [...ROOTS.flatMap((root) => sourceFiles(root)), ...EXTRA_FILES.filter(existsSync)]
  return paths.map((path) => ({
    path: path.replace(`${VIEWER}/`, ''),
    code: withoutComments(readFileSync(path, 'utf8')),
  }))
}

/**
 * Strip block, line and HTML comments, so the prose above does not fail its own rule.
 *
 * ⚠️ The `(?<!:)` is load-bearing, and the first version of this file did not have
 * it. Without it, `//` inside `https://…` is read as the start of a comment and the
 * rest of the line vanishes — which would silently blind the scan on any line
 * containing a URL, and this codebase is full of them. That matters far more now
 * that one of the two scans IS for a URL: the bug would have made the new check
 * permanently green. Anchoring to the start of a line instead (the other first
 * attempt) let a TRAILING comment survive, which is a false positive. Both
 * directions are covered by the negative control below.
 *
 * (Writing that anchored pattern out longhand here would embed the block-comment
 * terminator inside this very docblock and stop the file parsing — which is
 * exactly what happened on the first attempt.)
 */
function withoutComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(?<!:)\/\/.*$/gm, '')
}

describe('the catalogue is not linked from the viewer', () => {
  it('no source file reads catalogueUrl outside a comment', () => {
    const offenders = scanned()
      .filter(({ code }) => /catalogueUrl/.test(code))
      .map(({ path }) => path)

    expect(
      offenders,
      `These files read catalogueUrl in live code. The catalogue must not be linked ` +
        `from a product page — see the docblock in this file for why, and ` +
        `docs/AUDIT-PRODUCT-PAGES-2026-09-04.md for the audit that prompted it.`,
    ).toEqual([])
  })

  it('no source file hardcodes the catalogue URL either', () => {
    // The hole the identifier scan cannot see: a literal href contains no
    // `catalogueUrl`, and is exactly what gets added by someone who does not have
    // the settings object to hand.
    const offenders = scanned()
      .filter(({ code }) => CATALOGUE_URL.test(code))
      .map(({ path }) => path)

    expect(
      offenders,
      `These files hardcode the catalogue URL in live code. It is the same owner ` +
        `decision as the check above — the property name is not the only way to ` +
        `link a 54.3 MB PDF from an indexed page.`,
    ).toEqual([])
  })

  it('the scan can actually fail — negative control', () => {
    // Without this, the assertions above pass vacuously if `sourceFiles` ever
    // returns nothing (a moved directory, a changed extension, a bad join). That
    // is the failure mode this repo keeps paying for: a green test measuring an
    // empty set. Prove the matcher sees a real occurrence.
    const files = scanned().map(({ path }) => path)
    expect(files.length).toBeGreaterThan(20)
    expect(files).toContain('src/App.tsx')

    // ⚠️ The widening is asserted FILE BY FILE, because "we now also walk CSS" is
    // exactly the kind of claim that is true in a comment and false in the code.
    expect(files, 'worker/ is walked').toContain('worker/preview.ts')
    expect(files, 'index.html is walked').toContain('index.html')
    expect(files, 'stylesheets are walked').toContain('src/styles/page.css')
    expect(files, 'public/ text is walked').toContain('public/llms.txt')
    expect(
      files.some((f) => f.endsWith('.mjs')),
      '.mjs is walked',
    ).toBe(true)

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

  it('the URL scan can actually fail — negative control for the new branch', () => {
    // The same discipline as above, for the matcher added 2026-09-05. Each line
    // asserts one direction; without the last two the URL check would be a
    // permanently-green string that nobody could tell from a working one.
    expect(CATALOGUE_URL.test('<a href="https://wear-run.help/catalogue">Catalogue</a>')).toBe(true)
    expect(CATALOGUE_URL.test('href="https://www.wear-run.help/catalogue"')).toBe(true)
    // Prose that merely says the word must NOT match. This sentence was llms.txt's
    // own wording until 2026-09-07, when it was corrected (audit FA-W-05: the site
    // now has an index) — it is kept here as the control it always was, because the
    // regex must distinguish a URL from a mention, not because any file says it.
    expect(CATALOGUE_URL.test('There is no catalogue, no index and no search')).toBe(false)
    // A commented-out link is stripped before the matcher ever sees it …
    expect(CATALOGUE_URL.test(withoutComments('/* https://wear-run.help/catalogue */'))).toBe(false)
    // … including an HTML comment, which only this scan's new file types can carry.
    expect(
      CATALOGUE_URL.test(withoutComments('<!-- <a href="https://wear-run.help/catalogue"> -->')),
    ).toBe(false)
    // … but a live one in the same file types is seen.
    expect(CATALOGUE_URL.test(withoutComments('<a href="https://wear-run.help/catalogue">'))).toBe(
      true,
    )
  })
})
