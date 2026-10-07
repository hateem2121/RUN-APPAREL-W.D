import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * VA-45 (visual audit, 2026-10-02): a headline that runs past three lines gets more air between its
 * lines, ON A PHONE ONLY. `.display` sets 0.92 of its size (31px lines under 34px type); at five
 * lines the lines nearly touch. `.display--long` sets 0.98 below 720px and nothing anywhere else.
 *
 * This file reads the stylesheet and the markup, because that is where the three ways to get it
 * wrong are: the rule loosening DESKTOP (it must sit inside the phone query), the rule reaching a
 * SHORT headline (the class may be on exactly the headlines known to be long), and a long headline
 * losing it. The lines themselves are only countable in a browser: apps/cms/e2e/headlineLeading.spec.ts.
 */

const REPO = join(import.meta.dirname, '..', '..', '..', '..')
const read = (path: string) => readFileSync(join(REPO, path), 'utf8')

/** Blank comment BODIES, keeping offsets (the same helper tokens.test.ts uses). */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))

const BASE = stripComments(read('packages/ui/src/base.css'))

/**
 * The preludes of every block open at `index`, outermost first: for a rule inside a media query,
 * `['@media (width < 720px)']`. A prelude is the text since the last `{`, `}` or `;`.
 */
function openPreludes(css: string, index: number): string[] {
  const stack: string[] = []
  let from = 0
  for (let at = 0; at < index; at += 1) {
    const char = css[at]
    if (char === '{') {
      stack.push(css.slice(from, at).trim())
      from = at + 1
    } else if (char === '}') {
      stack.pop()
      from = at + 1
    } else if (char === ';') {
      from = at + 1
    }
  }
  return stack
}

describe('the rule (packages/ui/src/base.css)', () => {
  const occurrences = [...BASE.matchAll(/\.display--long\b/g)]

  it('is declared once, inside the phone query and nowhere else', () => {
    expect(occurrences, 'the rule is gone, or written more than once').toHaveLength(1)
    const index = occurrences[0]?.index ?? -1
    expect(
      openPreludes(BASE, index),
      '`.display--long` is not inside `@media (width < 720px)`, so it would loosen the desktop too',
    ).toEqual(['@media (width < 720px)'])
  })

  it('sets a leading inside the owner’s 0.96–1.0, and under 1', () => {
    const body = BASE.match(/\.display--long\s*\{([^}]*)\}/)?.[1] ?? ''
    const leading = Number(body.match(/line-height:\s*([\d.]+)\s*;/)?.[1])
    expect(leading, 'no line-height in the rule').not.toBeNaN()
    expect(leading).toBeGreaterThanOrEqual(0.96)
    // audit-guards.spec.ts holds every `.display` to "leads tighter than its own size".
    expect(leading).toBeLessThan(1)
  })

  it('comes after `.display`, which has the same specificity, so source order lets it win', () => {
    const display = BASE.search(/\.display\s*\{/)
    expect(display).toBeGreaterThan(-1)
    expect(BASE.indexOf('.display--long')).toBeGreaterThan(display)
  })

  it('leaves `.display` itself at the 0.92 every desktop and short headline keeps', () => {
    const body = BASE.match(/\.display\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(body).toMatch(/line-height:\s*0\.92\s*;/)
  })

  it('is written in no other stylesheet', () => {
    for (const file of [
      'apps/viewer/src/styles/page.css',
      'apps/viewer/src/styles/hd-image.css',
      'apps/cms/src/app/(frontend)/site.css',
      'packages/ui/src/footer.css',
      'packages/ui/src/footer-prompt.css',
      'packages/ui/src/notch.css',
      'packages/ui/src/tokens.css',
    ]) {
      expect(stripComments(read(file)), `${file} restyles .display--long`).not.toContain(
        '.display--long',
      )
    }
  })
})

/** Every `.tsx` under `dir` that is not a test. */
function sources(dir: string): string[] {
  return readdirSync(join(REPO, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(path)
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [path] : []
  })
}

describe('who carries the class', () => {
  /** A `className` that names it — the word also appears in the comments that explain it. */
  const CARRIES = /className=(?:"[^"]*\bdisplay--long\b[^"]*"|\{`[^`]*\bdisplay--long\b[^`]*`\})/g

  const carriers = Object.fromEntries(
    [...sources('apps/cms/src'), ...sources('apps/viewer/src')]
      .map((file) => [file, [...read(file).matchAll(CARRIES)].length] as const)
      .filter(([, count]) => count > 0),
  )

  it('is exactly the buyer pages and the guides — never a short headline', () => {
    // A new carrier is a decision: add it here with the reason, in the same change. Every other
    // headline on both apps sets on about three lines or fewer at 320-430px (an estimate).
    expect(carriers).toEqual({
      'apps/cms/src/components/site/FamilyLanding.tsx': 1,
      'apps/cms/src/components/site/GuidePage.tsx': 1,
      // The company pages (2026-10-07) add it only to a headline of 36 characters or more, the
      // guides' shortest: two of ten reach 37 ("How we treat each other, on the floor.",
      // "Steady work, honest craft, since 1889."); the test below holds that condition.
      'apps/cms/src/components/site/CompanyParts.tsx': 1,
      'apps/cms/src/components/site/PolicyPage.tsx': 1,
      // A Journal post's and a case study's title (2026-10-07) are CMS text of up to 70
      // characters, so they carry it on the company pages' terms: from 36 characters only.
      'apps/cms/src/components/site/JournalPost.tsx': 1,
      'apps/cms/src/components/site/CaseStudyPage.tsx': 1,
    })
  })

  it('the company pages carry it only from 36 characters, so a short headline never does', () => {
    for (const file of [
      'CompanyParts.tsx',
      'PolicyPage.tsx',
      'JournalPost.tsx',
      'CaseStudyPage.tsx',
    ]) {
      expect(read(`apps/cms/src/components/site/${file}`), file).toMatch(
        /\.length >= 36 \? ' display--long' : ''/,
      )
    }
  })

  /** Each headline's two parts, as `{ heading, headingAccent }` pairs in a data file. */
  const headlines = (path: string) =>
    [...read(path).matchAll(/heading: '([^']+)',\s*\n\s*headingAccent: '([^']+)'/g)].map(
      (match) => `${match[1]} ${match[2]}`,
    )

  it('the headlines that carry it really are long: the shortest is 36 characters', () => {
    // The four buyer pages' run 45-53; the guides' 36-46.
    const families = headlines('apps/cms/src/lib/familyPages.ts')
    expect(families, 'the matcher found no buyer-page headlines').toHaveLength(4)
    // The guides' file lists the index page's headline first; the index is not a carrier.
    const [, ...guides] = headlines('apps/cms/src/lib/guides.ts')
    expect(guides, 'the matcher found no guide headlines').toHaveLength(7)
    for (const headline of [...families, ...guides]) {
      expect(
        headline.length,
        `"${headline}" is short: drop display--long from its template`,
      ).toBeGreaterThanOrEqual(36)
    }
  })

  it('finds the files it is meant to guard (a scan that finds none passes vacuously)', () => {
    expect(sources('apps/cms/src').length).toBeGreaterThan(20)
    expect(sources('apps/viewer/src').length).toBeGreaterThan(10)
  })
})
