import { IntentLink as Link } from './IntentLink'
import { FAQ_TOPICS } from '../../lib/faqs'
import {
  GLOSSARY_CATEGORIES,
  GLOSSARY_INDEX,
  GLOSSARY_TERMS,
  type GlossaryTerm,
  termsIn,
} from '../../lib/glossary'
import { GLOSSARY_CATEGORIES_RU, GLOSSARY_INDEX_RU, GLOSSARY_TERMS_RU } from '../../lib/glossary.ru'
import { GUIDES } from '../../lib/guides'
import { faqTopicAtRu, guideAtRu } from '../../lib/i18n/ruNames'
import { t } from '../../lib/i18n/ui'
import type { Locale } from '../../lib/locale'
import { breadcrumbTrailJsonLd, definedTermSetJsonLd } from '../../lib/structuredData'
import { SiteClosing } from './ArticleParts'
import { Breadcrumb } from './Breadcrumb'
import { GlossaryFilter } from './GlossaryFilter'
import { JsonLd } from './JsonLd'

/**
 * The glossary (PLAN.md D6; words in `lib/glossary.ts`, approved 2026-10-07). Every term is in
 * the HTML with scripting off; the filter and the A–Z row only help a reader get to one.
 *
 * Each category is a ruled grid across the page, as the careers page sets its benefits (the
 * owner turned down heading-left, list-right on 2026-10-07). The A–Z row stays in view while the
 * page scrolls, so any letter is one press away.
 */

/** A "Read more" link's words: the page's own title. */
function linkName(path: string, locale: Locale): string {
  const ru = locale === 'ru'
  const [page, anchor] = path.split('#')
  const guide = GUIDES.find((entry) => entry.path === page)
  if (guide) return ru ? guideAtRu(guide.path).title : guide.title
  const found = FAQ_TOPICS.find((entry) => entry.path === page)
  const topic = found && ru ? faqTopicAtRu(found.path) : found
  if (topic) {
    const entry = anchor ? topic.entries.find((candidate) => candidate.id === anchor) : undefined
    return entry ? entry.question : topic.title
  }
  // The one name every link to the 3D garments has (polish X20, `e2e/copy.spec.ts`).
  if (page === '/products') return t(locale, 'See products in 3D')
  throw new Error(`GlossaryPage.tsx: no name for ${path}`)
}

/** A term's letter in the A–Z row: its first letter, or "#" for a term that starts with a digit. */
function letterOf(term: GlossaryTerm): string {
  const first = term.name.charAt(0).toUpperCase()
  return /[A-Z]/.test(first) ? first : '#'
}

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']

/**
 * The Russian page (2026-11-15): the Cyrillic alphabet a term can start with (Ё files under Е, and
 * Й, Ъ, Ы, Ь start no word), and «#» for the Latin abbreviations (AQL, GSM) and figures.
 */
const LETTERS_RU = ['#', ...'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ']

function letterOfRu(term: GlossaryTerm): string {
  const first = term.name.charAt(0).toUpperCase().replace('Ё', 'Е')
  return LETTERS_RU.includes(first) ? first : '#'
}

/** The page's words: the Russian has the same ids, categories and links in the same order. */
function glossaryData(locale: Locale) {
  if (locale !== 'ru')
    return {
      index: GLOSSARY_INDEX,
      terms: GLOSSARY_TERMS,
      letters: LETTERS,
      letterOf,
      categoryName: (category: string) => category,
      termsIn,
    }
  return {
    index: GLOSSARY_INDEX_RU,
    terms: GLOSSARY_TERMS_RU,
    letters: LETTERS_RU,
    letterOf: letterOfRu,
    categoryName: (category: string) =>
      GLOSSARY_CATEGORIES_RU[GLOSSARY_CATEGORIES.indexOf(category as never)] ?? category,
    // In Russian alphabetical order, as a Russian reader looks a term up.
    termsIn: (category: string) =>
      [...GLOSSARY_TERMS_RU.filter((term) => term.category === category)].sort((a, b) =>
        a.name.localeCompare(b.name, 'ru'),
      ),
  }
}

export function GlossaryPage({ locale = 'en' }: { locale?: Locale } = {}) {
  const { index, terms, letters, letterOf, categoryName, termsIn } = glossaryData(locale)
  const trail = [{ name: index.title, path: index.path }]
  // The first term of each letter, in page order, is where that letter jumps to.
  const firstOf = new Map<string, string>()
  for (const category of GLOSSARY_CATEGORIES) {
    for (const term of termsIn(category)) {
      const letter = letterOf(term)
      if (!firstOf.has(letter)) firstOf.set(letter, term.id)
    }
  }

  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail, locale)} />
      <JsonLd data={definedTermSetJsonLd({ name: index.title, path: index.path }, terms, locale)} />

      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container glossary-hero">
          <div>
            <Breadcrumb trail={trail} locale={locale} />
            <p className="label">{t(locale, '[ Glossary ]')}</p>
            {/* `hero-legal`: this headline never swaps fonts mid-visit (site.css, 2026-10-01). */}
            <h1 className="display display--hero hero-legal">
              {index.heading} <span className="serif-accent">{index.headingAccent}</span>
            </h1>
          </div>
          <GlossaryFilter total={terms.length} />
        </div>
      </section>

      <nav className="glossary-letters" aria-label={t(locale, 'Terms by letter')}>
        <div className="site-container">
          <ol className="glossary-letters__row">
            {letters.map((letter) => {
              const target = firstOf.get(letter)
              return (
                <li key={letter}>
                  {target ? (
                    <a href={`#${target}`}>{letter}</a>
                  ) : (
                    <span aria-hidden="true">{letter}</span>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </nav>

      {GLOSSARY_CATEGORIES.map((category) => (
        <section className="site-section glossary-group" data-glossary-group key={category}>
          <div className="site-container">
            <h2 className="display display--section">{categoryName(category)}</h2>
            <dl className="glossary-terms">
              {termsIn(category).map((term) => (
                <div className="glossary-term" data-glossary-term id={term.id} key={term.id}>
                  <dt className="glossary-term__name">{term.name}</dt>
                  <dd className="glossary-term__definition">
                    <p>{term.definition}</p>
                    {term.seeAlso.length > 0 ? (
                      <ul className="glossary-term__more">
                        {term.seeAlso.map((path) => (
                          <li key={path}>
                            <Link href={path}>{linkName(path, locale)}</Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ))}

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <SiteClosing locale={locale} />
        </div>
      </section>
    </>
  )
}
