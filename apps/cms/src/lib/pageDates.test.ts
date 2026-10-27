import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as aboutCopy from './aboutCopy'
import { BYLINES } from './bylines'
import { CASE_STUDIES_HUB, CASE_STUDY_FACTS, CASE_STUDY_STORY } from './caseStudies'
import { COMMUNITY_PAGE, PRESS_PAGE } from './companyPages'
import * as companyFacts from './companyFacts'
import { FAQ_GUIDES, FAQ_INDEX, FAQ_TOPIC_LEDE, FAQ_TOPICS } from './faqs'
import { FAMILIES } from './families'
import { FAMILY_PAGES, FAMILY_SOON } from './familyPages'
import { GLOSSARY_CATEGORIES, GLOSSARY_INDEX, GLOSSARY_TERMS } from './glossary'
import { GUIDES, GUIDES_INDEX } from './guides'
import * as inquiryForm from './inquiryForm'
import { JOURNAL_CLUSTERS, JOURNAL_HUB, JOURNAL_RELATED_PAGES } from './journal'
import { ORDER_PHASES } from './orderProcess'
import { PAGE_DATES } from './pageDates'
import * as pageDescriptions from './pageDescriptions'
import { POLICIES, POLICIES_INDEX } from './policies'
import * as press from './press'
import { sitemapFor } from './searchVisibility'

/**
 * The page dates stay true (`pageDates.ts`): every page the sitemap lists has a date, and no
 * page's words can change while its date stands still. `bylines.test.ts` does the same for the
 * pages with a byline.
 *
 * Each fingerprint covers what the page shows: the copy it reads, as data, and the source of the
 * page and of the components that hold its sentences, with comments and spaces taken out.
 */
const sha = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12)

const APP = join(__dirname, '..', 'app', '(frontend)')
const SITE = join(__dirname, '..', 'components', 'site')

/**
 * Source without its import statements (one line or several): where a page takes a component from
 * is not its words (review of 27 Oct: 17 dates moved when the faster-taps work changed only the
 * `Link` import). Read line by line, so no pattern can backtrack.
 */
const withoutImports = (source: string) => {
  const kept: string[] = []
  let inImport = false
  for (const line of source.split('\n')) {
    if (!inImport && /^import[\s{'"]/.test(line)) inImport = true
    if (!inImport) kept.push(line)
    else if (/(?:from\s*|^import\s*)['"][^'"]*['"];?\s*$/.test(line)) inImport = false
  }
  return kept.join('\n')
}

/** Source with imports, comments and spaces taken out, so none of them moves a date. */
const stripped = (source: string) =>
  withoutImports(source)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[\s;{}(),])\/\/[^\n]*/g, '$1')
    .replace(/\s+/g, '')
const code = (file: string) => stripped(readFileSync(file, 'utf8'))
const pageCode = (folder: string) => code(join(APP, folder, 'page.tsx'))
const components = (...names: string[]) => names.map((name) => code(join(SITE, `${name}.tsx`)))

const familyName = (slug: string) => FAMILIES.find((family) => family.slug === slug)?.name

const WORDS: Readonly<Record<string, string>> = {
  '/': sha({
    page: pageCode(''),
    parts: components(
      'HomeHero',
      'AboutSection',
      'FactsBento',
      'FamilyCard',
      'OrderTimeline',
      'ViewerCue',
    ),
    copy: [aboutCopy, companyFacts, pageDescriptions, ORDER_PHASES, FAMILIES],
  }),
  '/products': sha({
    page: pageCode('products'),
    parts: components('FamilyGroup', 'FamilyChips', 'ProductsFilm', 'ProductCardItem'),
    copy: [pageDescriptions.PRODUCTS_DESCRIPTION, FAMILIES, FAMILY_SOON],
  }),
  ...Object.fromEntries(
    FAMILY_PAGES.map(({ path, ...words }) => [
      path,
      sha({ words, family: familyName(words.familySlug), parts: components('FamilyLanding') }),
    ]),
  ),
  '/guides': sha({
    index: GUIDES_INDEX,
    cards: GUIDES.map(({ path, title, description }) => ({ path, title, description })),
    page: pageCode('guides'),
    parts: components('GuideCard'),
  }),
  '/policies': sha({
    index: POLICIES_INDEX,
    list: POLICIES.map(({ path, title, description, group }) => ({
      path,
      title,
      description,
      group,
    })),
    page: pageCode('policies'),
    parts: components('PolicyIndex'),
  }),
  '/community': sha({ words: COMMUNITY_PAGE, parts: components('CommunityPage') }),
  '/press': sha({ words: PRESS_PAGE, press, parts: components('PressPage') }),
  '/faq': sha({
    index: FAQ_INDEX,
    topics: FAQ_TOPICS.map(({ path, title, description }) => ({ path, title, description })),
    parts: components('FaqPages'),
  }),
  ...Object.fromEntries(
    FAQ_TOPICS.map((topic) => [
      topic.path,
      sha({
        topic,
        lede: FAQ_TOPIC_LEDE,
        guides: FAQ_GUIDES[topic.path],
        parts: components('FaqPages'),
      }),
    ]),
  ),
  '/glossary': sha({
    index: GLOSSARY_INDEX,
    categories: GLOSSARY_CATEGORIES,
    terms: GLOSSARY_TERMS,
    parts: components('GlossaryPage'),
  }),
  '/journal': sha({
    hub: JOURNAL_HUB,
    clusters: JOURNAL_CLUSTERS,
    related: JOURNAL_RELATED_PAGES,
    page: pageCode('journal'),
    parts: components('JournalIndex'),
  }),
  '/case-studies': sha({
    hub: CASE_STUDIES_HUB,
    facts: CASE_STUDY_FACTS,
    story: CASE_STUDY_STORY,
    page: pageCode('case-studies'),
    parts: components('CaseStudyPage'),
  }),
  '/contact': sha({ page: pageCode('contact'), form: inquiryForm, copy: pageDescriptions }),
  '/privacy': sha({ page: pageCode('privacy') }),
  '/terms': sha({ page: pageCode('terms') }),
}

/** The paths the sitemap lists for the site's own pages (no garments, no posts). */
const LISTED = sitemapFor('visible', 'https://example.test').map(
  (entry) => entry.url.replace('https://example.test', '') || '/',
)

describe('page dates', () => {
  if (process.env.PRINT_PAGE_WORDS) console.log(JSON.stringify(WORDS))

  it('every page the sitemap lists has a byline or a page date, never both', () => {
    for (const path of LISTED) {
      const dated = [BYLINES[path], PAGE_DATES[path]].filter(Boolean).length
      expect(dated, `${path}: ${dated === 0 ? 'no date' : 'two dates'}`).toBe(1)
    }
    expect(Object.keys(PAGE_DATES).sort()).toEqual(Object.keys(WORDS).sort())
  })

  it.each(Object.entries(WORDS))('%s: its words have not changed since its date', (path, words) => {
    expect(
      PAGE_DATES[path]?.words,
      `${path}'s words changed. In pageDates.ts set it to page(<now, ISO with zone>, '${words}')`,
    ).toBe(words)
  })

  // Review of 27 Oct: the faster-taps work changed one line in 13 page files, the `Link` import,
  // and 17 sitemap dates moved though no word changed. Where a page takes its link from is not
  // its words, so an import line (one line or several) moves no date.
  it('a change to an import line alone moves no date', () => {
    const before =
      "import Link from 'next/link'\nimport type { A } from './a'\nexport const P = () => <Link href=\"/x\">x</Link>\n"
    const after =
      "import {\n  IntentLink as Link,\n} from './IntentLink'\nimport type { A } from './a'\nexport const P = () => <Link href=\"/x\">x</Link>\n"
    expect(stripped(after)).toBe(stripped(before))
    expect(stripped(after.replace('>x<', '>y<')), 'a word change must still show').not.toBe(
      stripped(before),
    )
  })

  it('dates every page in ISO 8601 with its zone, never in the future', () => {
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/
    for (const [path, date] of Object.entries(PAGE_DATES)) {
      expect(date.on, path).toMatch(iso)
      expect(Date.parse(date.on), path).not.toBeGreaterThan(Date.now())
    }
  })
})
