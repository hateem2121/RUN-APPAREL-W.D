import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TITLE_MAX } from '../../../../scripts/seo-page-rules.mjs'
import { COMMUNITY_PAGE, CAREERS_PAGE, PRESS_PAGE } from './companyPages'
import { FAQ_INDEX, FAQ_TOPICS } from './faqs'
import { GLOSSARY_INDEX } from './glossary'
import { GUIDES, GUIDES_INDEX } from './guides'
import { POLICIES, POLICIES_INDEX } from './policies'
import { metaTitleOf } from './seo'

/**
 * The search titles the owner approved on 2026-10-26 (the site check's section 2), word for
 * word. Each page's short `title` stays as it was, because it is also the page's breadcrumb,
 * footer link and `llms.txt` line; only the `<title>` takes the longer words (`metaTitleOf`).
 */
const BRAND_SUFFIX = ' | RUN APPAREL'
const FRONTEND = join(__dirname, '..', 'app', '(frontend)')
const policy = (path: string) => {
  const found = POLICIES.find((entry) => entry.path === path)
  if (!found) throw new Error(`no policy at ${path}`)
  return found
}

/** A page whose title is typed in its own `page.tsx`: the one `title:` in its metadata. */
const typedTitle = (folder: string) => {
  const source = readFileSync(join(FRONTEND, folder, 'page.tsx'), 'utf8')
  const match = source.match(/buildMetadata\(\{\s*title: '([^']+)'/)
  if (!match?.[1]) throw new Error(`${folder}/page.tsx: no typed title`)
  return match[1]
}

const APPROVED: readonly [path: string, shipped: string, approved: string, short?: string][] = [
  ['/faq', metaTitleOf(FAQ_INDEX), 'Private Label Apparel FAQ for Buyers', FAQ_INDEX.title],
  [
    '/press',
    metaTitleOf(PRESS_PAGE),
    'Press Kit: Facts, Photos and Media Contact',
    PRESS_PAGE.title,
  ],
  ['/terms', typedTitle('terms'), 'Website and 3D Reference Terms'],
  [
    '/careers',
    metaTitleOf(CAREERS_PAGE),
    'Careers at a Sialkot Sportswear Factory',
    CAREERS_PAGE.title,
  ],
  ['/contact', typedTitle('contact'), 'Contact a Sialkot Private Label Manufacturer'],
  ['/privacy', typedTitle('privacy'), 'Privacy Notice: What We Collect and Why'],
  [
    '/glossary',
    metaTitleOf(GLOSSARY_INDEX),
    'Garment and Export Terms in Plain Words',
    GLOSSARY_INDEX.title,
  ],
  [
    '/policies',
    metaTitleOf(POLICIES_INDEX),
    'Factory Policies: Labor, Safety, Quality',
    POLICIES_INDEX.title,
  ],
  [
    '/policies/quality',
    metaTitleOf(policy('/policies/quality')),
    'Quality Policy: Checks on Every Order',
    'Quality',
  ],
  [
    '/community',
    metaTitleOf(COMMUNITY_PAGE),
    'Work and Community in Sialkot Since 1889',
    COMMUNITY_PAGE.title,
  ],
  [
    '/policies/environmental',
    metaTitleOf(policy('/policies/environmental')),
    'Environmental Policy: Solar Power and Scraps',
    'Environmental',
  ],
  [
    '/policies/equal-opportunity',
    metaTitleOf(policy('/policies/equal-opportunity')),
    'Equal Opportunity Policy',
    'Equal Opportunity',
  ],
  [
    '/policies/health-and-safety',
    metaTitleOf(policy('/policies/health-and-safety')),
    'Health and Safety Policy',
    'Health and Safety',
  ],
  [
    '/policies/workplace-conduct',
    metaTitleOf(policy('/policies/workplace-conduct')),
    'Workplace Conduct Policy',
    'Workplace Conduct',
  ],
  [
    '/policies/health-and-vaccination',
    metaTitleOf(policy('/policies/health-and-vaccination')),
    'Health and Vaccination Policy',
    'Health and Vaccination',
  ],
]

describe('the search titles the owner approved on 2026-10-26', () => {
  for (const [path, shipped, approved, short] of APPROVED) {
    it(`${path}: "${approved}"`, () => {
      expect(shipped).toBe(approved)
      expect(`${shipped}${BRAND_SUFFIX}`.length).toBeLessThanOrEqual(TITLE_MAX)
    })
    if (short !== undefined) {
      it(`${path}: the breadcrumb and link keep the short "${short}"`, () => {
        expect(short).not.toBe(shipped)
        expect(short.length).toBeLessThan(shipped.length)
      })
    }
  }

  it('no two pages share a search title', () => {
    const titles = [
      // The policies come from POLICIES below, so they are not counted twice.
      ...APPROVED.filter(([path]) => !path.startsWith('/policies/')).map(([, shipped]) => shipped),
      ...POLICIES.map(metaTitleOf),
      ...FAQ_TOPICS.map(metaTitleOf),
      ...GUIDES.map(metaTitleOf),
      metaTitleOf(GUIDES_INDEX),
    ]
    expect(new Set(titles).size).toBe(titles.length)
  })
})
