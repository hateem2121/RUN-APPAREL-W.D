import { IntentLink as Link } from './IntentLink'
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
import { FAQ_INDEX_RU, FAQ_TOPIC_LEDE_RU, FAQ_TOPICS_RU } from '../../lib/faqs.ru'
import { GUIDES, GUIDES_INDEX } from '../../lib/guides'
import { guideAtRu } from '../../lib/i18n/ruNames'
import { t } from '../../lib/i18n/ui'
import type { Locale } from '../../lib/locale'
import { breadcrumbTrailJsonLd, faqJsonLd } from '../../lib/structuredData'
import { SiteClosing } from './ArticleParts'
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
  return topic.title.replace(/^(FAQ|Вопросы): /, '')
}

/**
 * The FAQ's words in the page's language (Russian section, 2026-11-15): the Russian tables have the
 * same topics, entries and ids in the same order (faqs.ru.ts, held to the English by ruParity).
 */
function faqData(locale: Locale) {
  return locale === 'ru'
    ? { index: FAQ_INDEX_RU, topics: FAQ_TOPICS_RU, lede: FAQ_TOPIC_LEDE_RU }
    : { index: FAQ_INDEX, topics: FAQ_TOPICS, lede: FAQ_TOPIC_LEDE }
}

/** The guides a topic sends a reader on to (`FAQ_GUIDES`), as links. */
export function relatedGuidesFor(path: string, locale: Locale = 'en') {
  return (FAQ_GUIDES[path] ?? []).map((href) => {
    const guide = GUIDES.find((entry) => entry.path === href)
    if (!guide) throw new Error(`FaqPages.tsx names a guide that does not exist: ${href}`)
    return { href, name: locale === 'ru' ? guideAtRu(href).title : guide.title }
  })
}

function FaqHero({
  trail,
  heading,
  accent,
  lede,
  locale,
}: {
  trail: { name: string; path: string }[]
  heading: string
  accent: string
  lede: string
  locale: Locale
}) {
  return (
    <section className="site-hero">
      <div className="blueprint site-hero__grid" aria-hidden="true" />
      <div className="site-container">
        <Breadcrumb trail={trail} locale={locale} />
        <p className="label">{t(locale, '[ FAQ ]')}</p>
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
  locale,
}: {
  groups: { id: string; title: string; links: { href: string; name: string }[] }[]
  locale: Locale
}) {
  return (
    <section className="site-section" data-site-reveal>
      <div className="site-container">
        <SiteClosing locale={locale}>
          <nav className="see-also company-closing__more" aria-labelledby="more-to-read">
            <p className="subhead" id="more-to-read">
              {t(locale, 'More to read')}
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
        </SiteClosing>
      </div>
    </section>
  )
}

function Entry({ entry, locale }: { entry: FaqEntry; locale: Locale }) {
  return (
    <li className="faq-entry" id={entry.id} data-facts={entry.facts}>
      <h2 className="faq-entry__question">{entry.question}</h2>
      <p className="faq-entry__answer">{entry.answer}</p>
      {entry.detail ? (
        <details className="faq-entry__more">
          <summary>{t(locale, 'More detail')}</summary>
          <p>{entry.detail}</p>
        </details>
      ) : null}
    </li>
  )
}

/** «1 вопрос», «3 вопроса», «9 вопросов»: the Russian plural forms, chosen by `Intl.PluralRules`. */
const QUESTIONS_RU: Record<string, string> = {
  one: 'вопрос',
  few: 'вопроса',
  many: 'вопросов',
  other: 'вопроса',
}
const RU_PLURAL = new Intl.PluralRules('ru')
function questionsRu(count: number): string {
  return QUESTIONS_RU[RU_PLURAL.select(count)] ?? 'вопросов'
}

export function FaqTopicPage({ topic, locale = 'en' }: { topic: FaqTopic; locale?: Locale }) {
  const { index, topics, lede } = faqData(locale)
  const trail = [
    { name: index.title, path: index.path },
    { name: topicName(topic), path: topic.path },
  ]
  const others = topics.filter((entry) => entry.path !== topic.path)
  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail, locale)} />
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
        lede={lede}
        locale={locale}
      />

      <section className="site-section">
        <div className="site-container faq-layout">
          {/* The questions, in view beside the answers on a wide screen; first on a phone. */}
          <nav className="faq-layout__index" aria-labelledby="on-this-page">
            <p className="mono faq-layout__label" id="on-this-page">
              {t(locale, 'On this page')}
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
              <Entry entry={entry} key={entry.id} locale={locale} />
            ))}
          </ol>
        </div>
      </section>

      <FaqClosing
        locale={locale}
        groups={[
          {
            id: 'related-guides',
            title: t(locale, 'Buyer guides'),
            links: relatedGuidesFor(topic.path, locale),
          },
          {
            id: 'more-questions',
            title: index.title,
            links: [
              ...others.map((entry) => ({ href: entry.path, name: topicName(entry) })),
              { href: index.path, name: t(locale, 'All questions') },
            ],
          },
        ]}
      />
    </>
  )
}

export function FaqHubPage({ locale = 'en' }: { locale?: Locale } = {}) {
  const { index, topics } = faqData(locale)
  const trail = [{ name: index.title, path: index.path }]
  // The same ids in both languages; the Russian entry is the one at the English entry's place.
  const mostAsked = FAQ_INDEX.mostAsked.map((id) => {
    const found = faqEntryById(id)
    if (locale !== 'ru') return found
    const at = FAQ_TOPICS.indexOf(found.topic)
    const topic = topics[at]
    const entry = topic?.entries.find((candidate) => candidate.id === id)
    if (!topic || !entry) throw new Error(`faqs.ru.ts has no entry ${id}`)
    return { topic, entry }
  })
  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail, locale)} />
      <FaqHero
        trail={trail}
        heading={index.heading}
        accent={index.headingAccent}
        lede={index.lede}
        locale={locale}
      />

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <h2 className="display display--section" id="most-asked">
            {t(locale, 'The five we hear most')}
          </h2>
          <ol className="faq-most">
            {mostAsked.map(({ topic, entry }) => (
              <li className="faq-most__row" key={entry.id}>
                <h3 className="faq-most__question">{entry.question}</h3>
                <div className="faq-most__answer">
                  <p>{entry.answer}</p>
                  <Link className="faq-most__more" href={`${topic.path}#${entry.id}`}>
                    {t(locale, 'More')} <span aria-hidden="true">→</span>
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
              {t(locale, 'Every topic')}
            </h2>
            <ul className="faq-topics__list">
              {topics.map((topic) => (
                <li key={topic.path}>
                  <Link className="faq-topics__link" href={topic.path}>
                    <span className="faq-topics__name display display--section">
                      {topicName(topic)}
                    </span>
                    <span className="faq-topics__count">
                      {locale === 'ru'
                        ? `${topic.entries.length} ${questionsRu(topic.entries.length)}`
                        : `${topic.entries.length} questions`}
                    </span>
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
        locale={locale}
        groups={[
          {
            id: 'faq-guides',
            title: t(locale, 'Buyer guides'),
            links: [{ href: GUIDES_INDEX.path, name: t(locale, 'All guides') }],
          },
          {
            id: 'faq-garments',
            title: t(locale, 'What we make'),
            links: [{ href: '/products', name: t(locale, 'See products in 3D') }],
          },
        ]}
      />
    </>
  )
}
