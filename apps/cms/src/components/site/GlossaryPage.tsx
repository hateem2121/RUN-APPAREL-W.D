import Link from 'next/link'
import { FAQ_TOPICS } from '../../lib/faqs'
import { FAMILY_PAGE_ACTION } from '../../lib/familyPages'
import {
  GLOSSARY_CATEGORIES,
  GLOSSARY_INDEX,
  GLOSSARY_TERMS,
  type GlossaryTerm,
  termsIn,
} from '../../lib/glossary'
import { GUIDES } from '../../lib/guides'
import { breadcrumbTrailJsonLd, definedTermSetJsonLd } from '../../lib/structuredData'
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
function linkName(path: string): string {
  const [page, anchor] = path.split('#')
  const guide = GUIDES.find((entry) => entry.path === page)
  if (guide) return guide.title
  const topic = FAQ_TOPICS.find((entry) => entry.path === page)
  if (topic) {
    const entry = anchor ? topic.entries.find((candidate) => candidate.id === anchor) : undefined
    return entry ? entry.question : topic.title
  }
  // The one name every link to the 3D garments has (polish X20, `e2e/copy.spec.ts`).
  if (page === '/products') return 'Browse in 3D'
  throw new Error(`GlossaryPage.tsx: no name for ${path}`)
}

/** A term's letter in the A–Z row: its first letter, or "#" for a term that starts with a digit. */
function letterOf(term: GlossaryTerm): string {
  const first = term.name.charAt(0).toUpperCase()
  return /[A-Z]/.test(first) ? first : '#'
}

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']

export function GlossaryPage() {
  const trail = [{ name: GLOSSARY_INDEX.title, path: GLOSSARY_INDEX.path }]
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
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />
      <JsonLd
        data={definedTermSetJsonLd(
          { name: GLOSSARY_INDEX.title, path: GLOSSARY_INDEX.path },
          GLOSSARY_TERMS,
        )}
      />

      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container glossary-hero">
          <div>
            <Breadcrumb trail={trail} />
            <p className="label">[ Glossary ]</p>
            {/* `hero-legal`: this headline never swaps fonts mid-visit (site.css, 2026-10-01). */}
            <h1 className="display display--hero hero-legal">
              {GLOSSARY_INDEX.heading}{' '}
              <span className="serif-accent">{GLOSSARY_INDEX.headingAccent}</span>
            </h1>
          </div>
          <GlossaryFilter total={GLOSSARY_TERMS.length} />
        </div>
      </section>

      <nav className="glossary-letters" aria-label="Terms by letter">
        <div className="site-container">
          <ol className="glossary-letters__row">
            {LETTERS.map((letter) => {
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
            <h2 className="display display--section">{category}</h2>
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
                            <Link href={path}>{linkName(path)}</Link>
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
          <div className="section-head">
            <h2 className="display display--section">Tell us what you&rsquo;re&nbsp;making.</h2>
            <div className="section-head__words">
              <p className="site-lede">
                Send the styles, quantities and specs you have — a sketch is enough to start. We
                reply within 24 hours.
              </p>
              <div className="site-actions">
                <Link className="btn btn--primary" href="/contact#inquiry">
                  {FAMILY_PAGE_ACTION}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
