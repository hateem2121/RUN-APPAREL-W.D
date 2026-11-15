import { describe, expect, it } from 'vitest'
import { ABOUT } from './lib/aboutCopy'
import { ABOUT_RU } from './lib/aboutCopy.ru'
import { ABOUT_PAGE, FACTORY_PAGE } from './lib/aboutPages'
import { ABOUT_PAGE_RU, FACTORY_PAGE_RU } from './lib/aboutPages.ru'
import { CASE_STUDIES_HUB, CASE_STUDY_FACTS, CASE_STUDY_STORY } from './lib/caseStudies'
import {
  CASE_STUDIES_HUB_RU,
  CASE_STUDY_FACT_LABELS_RU,
  CASE_STUDY_STORY_LABELS_RU,
} from './lib/caseStudies.ru'
import { FACTS } from './lib/companyFacts'
import { FACTS_RU } from './lib/companyFacts.ru'
import {
  CAREER_PATH,
  CAREERS_PAGE,
  COMMUNITY_PAGE,
  PRESS_PAGE,
  ROLE_GROUPS,
  WORK_HERE,
} from './lib/companyPages'
import {
  CAREER_PATH_RU,
  CAREERS_PAGE_RU,
  COMMUNITY_PAGE_RU,
  PRESS_PAGE_RU,
  ROLE_GROUPS_RU,
  WORK_HERE_RU,
} from './lib/companyPages.ru'
import { CONTACT_STEPS } from './lib/contactSteps'
import { CONTACT_STEPS_RU } from './lib/contactSteps.ru'
import { FACTORY_PHOTOS, WHOLE_PHOTOS } from './lib/factoryPhotos'
import { FACTORY_PHOTO_TEXT_RU } from './lib/factoryPhotos.ru'
import { FAMILIES } from './lib/families'
import { FAMILY_NAMES_RU, FAMILY_TEXT_RU } from './lib/families.ru'
import { FAMILY_PAGES } from './lib/familyPages'
import { FAMILY_PAGES_RU } from './lib/familyPages.ru'
import { FAQ_INDEX, FAQ_TOPICS } from './lib/faqs'
import { FAQ_INDEX_RU, FAQ_TOPICS_RU } from './lib/faqs.ru'
import { GARMENT_TYPE_RU } from './lib/garmentTypes.ru'
import { GLOSSARY_CATEGORIES, GLOSSARY_INDEX, GLOSSARY_TERMS } from './lib/glossary'
import { GLOSSARY_CATEGORIES_RU, GLOSSARY_INDEX_RU, GLOSSARY_TERMS_RU } from './lib/glossary.ru'
import { LIBRARY_GUIDES } from './lib/guideLibrary'
import { LIBRARY_GUIDES_RU } from './lib/guideLibrary.ru'
import { GUIDES } from './lib/guides'
import { GUIDES_RU } from './lib/guides.ru'
import { JOURNAL_CLUSTERS, JOURNAL_HUB } from './lib/journal'
import { JOURNAL_CLUSTER_NAMES_RU, JOURNAL_HUB_RU } from './lib/journal.ru'
import { ORDER_PHASES } from './lib/orderProcess'
import { ORDER_PHASES_RU } from './lib/orderProcess.ru'
import { POLICIES, POLICIES_INDEX } from './lib/policies'
import { POLICIES_INDEX_RU, POLICIES_RU } from './lib/policies.ru'
import { PRESS_FACTS } from './lib/press'
import { PRESS_FACTS_RU } from './lib/press.ru'

/**
 * EVERY RUSSIAN TWIN HAS ITS ENGLISH PAGE'S SHAPE (Russian section, 2026-11-15; the plan's
 * `ruParity.test.ts`). A Russian page is the English page's component drawing Russian data, so a
 * twin that loses a block, a question or a link, or carries a changed figure or address, ships a
 * Russian page that says less or something else. Until this file the checks ran only inside the
 * translators' and reviewers' own scripts; now an English edit that leaves its twin behind (as the
 * SECP line merged in #396 did) fails here.
 *
 * `sameShape(en, ru)`, walked together:
 * - the same keys on every object, the same length for every list;
 * - the same value, exactly, under every key that is an address or an identity, not a word;
 * - every digit run of an English string inside its Russian twin (thousands may be spaced, as
 *   Russian prints them, but no figure may change, go missing or be added);
 * - every link `phrase` a copy of words in its own block, as the English is (GuidePage draws the
 *   link only where it finds the phrase).
 */
const IDENTITY = new Set([
  'path',
  'href',
  'slug',
  'familySlug',
  'id',
  'kind',
  'url',
  'photo',
  'photos',
  'stage',
  'field',
  'lastReviewed',
  'checked',
  'mostAsked',
  'seeAlso',
  'category',
  'policyLinks',
  'shape',
  'tone',
  'yearTone',
  'number',
])

/** The figures of an English string: "6,894.757" is 6894.757, "100,000" is 100000. */
const englishFigures = (text: string) =>
  text.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []

/**
 * The figures of a Russian string, read both ways a comma can mean: «6894,757» is a decimal
 * (Russian print), «100,000» a figure kept as the English writes it, «100 000» thousands spaced.
 */
const russianFigures = (text: string) => {
  const spaced = text.replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1')
  // …and unjoined too: «PA 6.6 156 dtex» is 6.6 and 156, not 6.6156.
  const read = (t: string) => [
    ...(t.replace(/(\d),(\d)/g, '$1.$2').match(/\d+(?:\.\d+)?/g) ?? []),
    ...(t.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []),
  ]
  return new Set([
    ...read(text),
    ...(spaced.replace(/(\d),(\d)/g, '$1.$2').match(/\d+(?:\.\d+)?/g) ?? []),
    ...(spaced.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []),
  ])
}

function sameShape(en: unknown, ru: unknown, at = '$', problems: string[] = []): string[] {
  if (typeof en === 'string') {
    if (typeof ru !== 'string')
      return [...problems, `${at}: a string in English, ${typeof ru} in Russian`]
    const inRussian = russianFigures(ru)
    const missing = englishFigures(en).filter((figure) => !inRussian.has(figure))
    if (missing.length)
      problems.push(`${at}: figures ${missing.join(', ')} missing from «${ru.slice(0, 80)}»`)
    return problems
  }
  if (Array.isArray(en)) {
    if (!Array.isArray(ru)) return [...problems, `${at}: a list in English, not in Russian`]
    if (en.length !== ru.length)
      problems.push(`${at}: ${en.length} items in English, ${ru.length} in Russian`)
    en.forEach((item, i) => {
      sameShape(item, ru[i], `${at}[${i}]`, problems)
    })
    return problems
  }
  if (en && typeof en === 'object') {
    if (!ru || typeof ru !== 'object')
      return [...problems, `${at}: an object in English, not in Russian`]
    const enKeys = Object.keys(en).sort()
    const ruKeys = Object.keys(ru).sort()
    if (enKeys.join() !== ruKeys.join())
      problems.push(`${at}: keys ${enKeys.join(',')} in English, ${ruKeys.join(',')} in Russian`)
    for (const key of enKeys) {
      const a = (en as Record<string, unknown>)[key]
      const b = (ru as Record<string, unknown>)[key]
      // `group` is an identity where it is a slug (a policy's 'workplace'), a word where it is a name
      // (a buyer page's 'Soccer').
      if (IDENTITY.has(key) || (key === 'group' && typeof a === 'string' && /^[a-z-]+$/.test(a))) {
        if (JSON.stringify(a) !== JSON.stringify(b))
          problems.push(
            `${at}.${key}: ${JSON.stringify(a)} in English, ${JSON.stringify(b)} in Russian`,
          )
      } else sameShape(a, b, `${at}.${key}`, problems)
    }
    return problems
  }
  if (en !== ru && typeof en !== 'function') problems.push(`${at}: ${String(en)} ≠ ${String(ru)}`)
  return problems
}

/** Every `{ phrase, href }` whose phrase is not in the text of the object that holds it. */
function strandedPhrases(value: unknown, at = '$', out: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      strandedPhrases(item, `${at}[${i}]`, out)
    })
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const links = record.links
    if (Array.isArray(links)) {
      const words = JSON.stringify(
        Object.fromEntries(Object.entries(record).filter(([k]) => k !== 'links')),
      )
      for (const link of links as { phrase?: string }[])
        if (link.phrase && !words.includes(link.phrase))
          out.push(`${at}: «${link.phrase}» is not in its text`)
    }
    for (const [key, item] of Object.entries(record)) strandedPhrases(item, `${at}.${key}`, out)
  }
  return out
}

const byPath = <T extends { path: string }>(list: readonly T[]) =>
  [...list].sort((a, b) => a.path.localeCompare(b.path))

const PAIRS: ReadonlyArray<readonly [string, unknown, unknown]> = [
  ['buyer pages', FAMILY_PAGES, FAMILY_PAGES_RU],
  // `GUIDES` is every guide, the library's included; the Russian keeps the library in its own file.
  ['guides', byPath(GUIDES), byPath([...GUIDES_RU, ...LIBRARY_GUIDES_RU])],
  ['the guide library', byPath(LIBRARY_GUIDES), byPath(LIBRARY_GUIDES_RU)],
  ['FAQ topics', FAQ_TOPICS, FAQ_TOPICS_RU],
  ['the FAQ hub', FAQ_INDEX, FAQ_INDEX_RU],
  ['glossary terms', GLOSSARY_TERMS, GLOSSARY_TERMS_RU],
  ['the glossary page', GLOSSARY_INDEX, GLOSSARY_INDEX_RU],
  ['policies', POLICIES, POLICIES_RU],
  ['the policies hub', POLICIES_INDEX, POLICIES_INDEX_RU],
  ['the about page', ABOUT_PAGE, ABOUT_PAGE_RU],
  ['the factory page', FACTORY_PAGE, FACTORY_PAGE_RU],
  ['the careers page', CAREERS_PAGE, CAREERS_PAGE_RU],
  ['the community page', COMMUNITY_PAGE, COMMUNITY_PAGE_RU],
  ['the press page', PRESS_PAGE, PRESS_PAGE_RU],
  ['the benefits', WORK_HERE, WORK_HERE_RU],
  ['the career path', CAREER_PATH, CAREER_PATH_RU],
  ['the role groups', ROLE_GROUPS, ROLE_GROUPS_RU],
  ['the press facts', PRESS_FACTS, PRESS_FACTS_RU],
  ['the home page about block', ABOUT, ABOUT_RU],
  ['the company facts', FACTS, FACTS_RU],
  ['the order steps', ORDER_PHASES, ORDER_PHASES_RU],
  ['the contact steps', CONTACT_STEPS, CONTACT_STEPS_RU],
  ['the case-study hub', CASE_STUDIES_HUB, CASE_STUDIES_HUB_RU],
  ['the journal hub', JOURNAL_HUB, JOURNAL_HUB_RU],
]

describe('every Russian twin has its English page’s shape (2026-11-15)', () => {
  it.each(PAIRS)('%s', (_name, en, ru) => {
    expect(sameShape(en, ru)).toEqual([])
    expect(strandedPhrases(ru)).toEqual([])
  })

  it('names every family, every photo, every journal topic and every case-study part', () => {
    expect(FAMILIES.filter((family) => !FAMILY_NAMES_RU[family.name]).map((f) => f.name)).toEqual(
      [],
    )
    expect(FAMILIES.filter((family) => !FAMILY_TEXT_RU[family.slug]).map((f) => f.slug)).toEqual([])
    const photos = [...FACTORY_PHOTOS, ...WHOLE_PHOTOS].map((photo) => photo.slug)
    expect(photos.filter((slug) => !FACTORY_PHOTO_TEXT_RU[slug])).toEqual([])
    expect(
      JOURNAL_CLUSTERS.filter((c) => !JOURNAL_CLUSTER_NAMES_RU[c.value]).map((c) => c.value),
    ).toEqual([])
    expect(CASE_STUDY_FACTS.filter((f) => !CASE_STUDY_FACT_LABELS_RU[f.field])).toEqual([])
    expect(CASE_STUDY_STORY.filter((f) => !CASE_STUDY_STORY_LABELS_RU[f.field])).toEqual([])
    expect(GLOSSARY_CATEGORIES_RU).toHaveLength(GLOSSARY_CATEGORIES.length)
  })

  it('writes every Russian garment type in Russian', () => {
    for (const [english, russian] of Object.entries(GARMENT_TYPE_RU))
      expect(russian, english).toMatch(/[Ѐ-ӿ]/)
  })

  it('NEGATIVE CONTROL: a lost block, a changed figure, a moved link and a stranded phrase are each caught', () => {
    const en = {
      path: '/x',
      blocks: [
        { kind: 'text', text: 'Up to 50 pieces.' },
        { kind: 'text', text: 'B' },
      ],
    }
    expect(
      sameShape(en, { path: '/x', blocks: [{ kind: 'text', text: 'До 50 шт.' }] }),
    ).toHaveLength(1)
    expect(
      sameShape(en, {
        path: '/x',
        blocks: [
          { kind: 'text', text: 'До 60 шт.' },
          { kind: 'text', text: 'Б' },
        ],
      }),
    ).toHaveLength(1)
    expect(
      sameShape(en, {
        path: '/ru/x',
        blocks: [
          { kind: 'text', text: 'До 50 шт.' },
          { kind: 'text', text: 'Б' },
        ],
      }),
    ).toHaveLength(1)
    expect(sameShape({ n: '100,000' }, { n: '100 000' })).toEqual([])
    expect(
      strandedPhrases({
        text: 'Смотрите руководство.',
        links: [{ phrase: 'наше руководство', href: '/g' }],
      }),
    ).toHaveLength(1)
  })
})
