import Link from 'next/link'
import {
  FAQ_GUIDES,
  FAQ_INDEX,
  FAQ_TOPIC_LEDE,
  FAQ_TOPICS,
  type FaqEntry,
  type FaqTopic,
  faqEntryById,
  faqVisibleAnswer,
} from '../../lib/faqs'
import { FAMILY_PAGE_ACTION } from '../../lib/familyPages'
import { GUIDES, GUIDES_INDEX } from '../../lib/guides'
import { breadcrumbTrailJsonLd, faqJsonLd } from '../../lib/structuredData'
import { Breadcrumb } from './Breadcrumb'
import { JsonLd } from './JsonLd'

/**
 * The FAQ hub and its topic pages (PLAN.md D5; words approved by the owner 2026-10-07, in
 * `lib/faqs.ts`).
 *
 * ⚠️ BUILT AFTER THE OWNER TURNED DOWN A TEMPLATED PAGE (careers, 2026-10-07: "too much empty
 * space on left … looks AI generated"). So no page here is heading-left, list-right: a topic page
 * keeps its questions in a column that stays in view beside the answers, and the hub sets its
 * most-asked questions as a ruled table across the page and its topics as a typographic index.
 *
 * ⚠️ THE QUESTION DATA IS THE VISIBLE PAGE, WORD FOR WORD (`faqVisibleAnswer`): the direct answer,
 * then the detail inside a native <details>, which Find-in-page and crawlers read closed (G13).
 * The hub emits none: its answers are repeats of the topic pages', and one answer has one home.
 */

/** A topic's short name: its title without the "FAQ: " every topic title starts with. */
function topicName(topic: FaqTopic): string {
  return topic.title.replace(/^FAQ: /, '')
}

/** The guides a topic sends a reader on to (`FAQ_GUIDES`), as links. */
export function relatedGuidesFor(path: string) {
  return (FAQ_GUIDES[path] ?? []).map((href) => {
    const guide = GUIDES.find((entry) => entry.path === href)
    if (!guide) throw new Error(`FaqPages.tsx names a guide that does not exist: ${href}`)
    return { href, name: guide.title }
  })
}

function FaqHero({
  trail,
  heading,
  accent,
  lede,
}: {
  trail: { name: string; path: string }[]
  heading: string
  accent: string
  lede: string
}) {
  return (
    <section className="site-hero">
      <div className="blueprint site-hero__grid" aria-hidden="true" />
      <div className="site-container">
        <Breadcrumb trail={trail} />
        <p className="label">[ FAQ ]</p>
        {/* `hero-legal`: this headline never swaps fonts mid-visit (site.css, 2026-10-01). */}
        <h1 className="display display--hero hero-legal">
          {heading} <span className="serif-accent">{accent}</span>
        </h1>
        <p className="site-lede">{lede}</p>
      </div>
    </section>
  )
}

/** The site's closing block, then the links on: the same words every guide ends with. */
function FaqClosing({
  groups,
}: {
  groups: { id: string; title: string; links: { href: string; name: string }[] }[]
}) {
  return (
    <section className="site-section" data-site-reveal>
      <div className="site-container">
        <div className="section-head">
          <h2 className="display display--section">Tell us what you&rsquo;re&nbsp;making.</h2>
          <div className="section-head__words">
            <p className="site-lede">
              Send the styles, quantities and specs you have — a sketch is enough to start. We reply
              within 24 hours.
            </p>
            <div className="site-actions">
              <Link className="btn btn--primary" href="/contact#inquiry">
                {FAMILY_PAGE_ACTION}
              </Link>
            </div>
            <nav className="see-also company-closing__more" aria-labelledby="more-to-read">
              <p className="subhead" id="more-to-read">
                More to read
              </p>
              <div className="see-also__groups">
                {groups.map((group) => (
                  <div className="see-also__group" key={group.id}>
                    <h3 className="product-card__name" id={group.id}>
                      {group.title}
                    </h3>
                    <ul className="see-also__list">
                      {group.links.map((link) => (
                        <li key={link.href}>
                          <Link href={link.href}>{link.name}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </nav>
          </div>
        </div>
      </div>
    </section>
  )
}

function Entry({ entry }: { entry: FaqEntry }) {
  return (
    <li className="faq-entry" id={entry.id} data-facts={entry.facts}>
      <h2 className="faq-entry__question">{entry.question}</h2>
      <p className="faq-entry__answer">{entry.answer}</p>
      {entry.detail ? (
        <details className="faq-entry__more">
          <summary>More detail</summary>
          <p>{entry.detail}</p>
        </details>
      ) : null}
    </li>
  )
}

export function FaqTopicPage({ topic }: { topic: FaqTopic }) {
  const trail = [
    { name: FAQ_INDEX.title, path: FAQ_INDEX.path },
    { name: topicName(topic), path: topic.path },
  ]
  const others = FAQ_TOPICS.filter((entry) => entry.path !== topic.path)
  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />
      <JsonLd
        data={faqJsonLd(
          topic.entries.map((entry) => ({
            question: entry.question,
            answer: faqVisibleAnswer(entry),
          })),
        )}
      />
      <FaqHero
        trail={trail}
        heading={topic.heading}
        accent={topic.headingAccent}
        lede={FAQ_TOPIC_LEDE}
      />

      <section className="site-section">
        <div className="site-container faq-layout">
          {/* The questions, in view beside the answers on a wide screen; first on a phone. */}
          <nav className="faq-layout__index" aria-labelledby="on-this-page">
            <p className="mono faq-layout__label" id="on-this-page">
              On this page
            </p>
            <ol>
              {topic.entries.map((entry) => (
                <li key={entry.id}>
                  <a href={`#${entry.id}`}>{entry.question}</a>
                </li>
              ))}
            </ol>
          </nav>
          <ol className="faq-layout__answers">
            {topic.entries.map((entry) => (
              <Entry entry={entry} key={entry.id} />
            ))}
          </ol>
        </div>
      </section>

      <FaqClosing
        groups={[
          { id: 'related-guides', title: 'Buyer guides', links: relatedGuidesFor(topic.path) },
          {
            id: 'more-questions',
            title: FAQ_INDEX.title,
            links: [
              ...others.map((entry) => ({ href: entry.path, name: topicName(entry) })),
              { href: FAQ_INDEX.path, name: 'All questions' },
            ],
          },
        ]}
      />
    </>
  )
}

export function FaqHubPage() {
  const trail = [{ name: FAQ_INDEX.title, path: FAQ_INDEX.path }]
  const mostAsked = FAQ_INDEX.mostAsked.map((id) => faqEntryById(id))
  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />
      <FaqHero
        trail={trail}
        heading={FAQ_INDEX.heading}
        accent={FAQ_INDEX.headingAccent}
        lede={FAQ_INDEX.lede}
      />

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <h2 className="display display--section" id="most-asked">
            The five we hear most
          </h2>
          <ol className="faq-most">
            {mostAsked.map(({ topic, entry }) => (
              <li className="faq-most__row" key={entry.id}>
                <h3 className="faq-most__question">{entry.question}</h3>
                <div className="faq-most__answer">
                  <p>{entry.answer}</p>
                  <Link className="faq-most__more" href={`${topic.path}#${entry.id}`}>
                    More <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <nav className="faq-topics" aria-labelledby="faq-topics">
            <h2 className="display display--section" id="faq-topics">
              Every topic
            </h2>
            <ul className="faq-topics__list">
              {FAQ_TOPICS.map((topic) => (
                <li key={topic.path}>
                  <Link className="faq-topics__link" href={topic.path}>
                    <span className="faq-topics__name display display--section">
                      {topicName(topic)}
                    </span>
                    <span className="faq-topics__count">{topic.entries.length} questions</span>
                    <span className="faq-topics__questions">
                      {topic.entries
                        .slice(0, 3)
                        .map((entry) => entry.question)
                        .join(' · ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      <FaqClosing
        groups={[
          {
            id: 'faq-guides',
            title: 'Buyer guides',
            links: [{ href: GUIDES_INDEX.path, name: 'All guides' }],
          },
          {
            id: 'faq-garments',
            title: 'What we make',
            links: [{ href: '/products', name: 'Browse in 3D' }],
          },
        ]}
      />
    </>
  )
}
