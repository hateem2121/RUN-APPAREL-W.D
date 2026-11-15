import { IntentLink as Link } from './IntentLink'
import {
  formatPostDate,
  JOURNAL_CLUSTERS,
  JOURNAL_HUB,
  JOURNAL_PATH,
  JOURNAL_RSS_PATH,
} from '../../lib/journal'
import { IN_ENGLISH_RU, JOURNAL_CLUSTER_NAMES_RU, JOURNAL_HUB_RU } from '../../lib/journal.ru'
import type { JournalPostView } from '../../lib/journalPublic'
import type { Locale } from '../../lib/locale'
import { blogJsonLd, breadcrumbTrailJsonLd } from '../../lib/structuredData'
import { ArticleImage, SiteClosing } from './ArticleParts'
import { Breadcrumb } from './Breadcrumb'
import { JsonLd } from './JsonLd'

/**
 * The Journal hub, `/journal` (PLAN.md D7): "[ Journal ]", "Notes" + "from the works.", the
 * newest post drawn large, the rest in a grid, a topic filter, the feed link.
 *
 * ⚠️ WITH NO PUBLISHED POST IT STILL ANSWERS 200: the hub words and the five topics the Journal
 * will cover. It is indexable, listed and linked from day one (owner, 2026-10-07: "Show them
 * right away"). Nothing reads "coming soon".
 *
 * ⚠️ THE FILTER IS RADIOS AND CSS, NO SCRIPT (T17, the Teamwear sport filter's pattern,
 * `GarmentGrid.tsx`): every post is in the HTML whichever topic is chosen, it filters with
 * scripting off, and the choice is kept in no address, so no thin filter pages exist. Drawn only
 * when the posts span two topics or more.
 */
export function JournalIndex({
  posts,
  locale = 'en',
}: {
  posts: readonly JournalPostView[]
  /** Russian section (2026-11-15): a Russian hub listing the English posts, each labelled so. */
  locale?: Locale
}) {
  const ru = locale === 'ru'
  const hub = ru ? JOURNAL_HUB_RU : JOURNAL_HUB
  const trail = [{ name: hub.title, path: JOURNAL_PATH }]
  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail, locale)} />
      {posts.length > 0 ? (
        <JsonLd
          data={blogJsonLd(
            posts.map((post) => ({ path: post.path, headline: post.title })),
            ru ? { name: hub.title } : undefined,
          )}
        />
      ) : null}

      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <Breadcrumb trail={trail} locale={locale} />
          <p className="label">{hub.eyebrow}</p>
          {/* `hero-legal`: this headline never swaps fonts mid-visit (site.css, 2026-10-01). */}
          <h1 className="display display--hero hero-legal">
            {hub.heading} <span className="serif-accent">{hub.headingAccent}</span>
          </h1>
          {posts.length > 0 ? (
            <p className="journal-feed">
              <a className="prose__link" href={JOURNAL_RSS_PATH}>
                {ru ? 'RSS-лента (на английском)' : 'RSS feed'}
              </a>
            </p>
          ) : null}
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          {posts.length > 0 ? (
            <JournalList posts={posts} locale={locale} />
          ) : (
            <JournalTopics locale={locale} />
          )}
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <SiteClosing locale={locale} />
        </div>
      </section>
    </>
  )
}

/** The five topics, ruled across the page: what the Journal is for, before its first post. */
function JournalTopics({ locale }: { locale: Locale }) {
  return (
    <ol className="journal-topics">
      {JOURNAL_CLUSTERS.map((cluster) => (
        <li className="journal-topics__item" key={cluster.value}>
          {locale === 'ru' ? JOURNAL_CLUSTER_NAMES_RU[cluster.value] : cluster.label}
        </li>
      ))}
    </ol>
  )
}

function JournalList({ posts, locale }: { posts: readonly JournalPostView[]; locale: Locale }) {
  const ru = locale === 'ru'
  const present = JOURNAL_CLUSTERS.flatMap((cluster) => {
    const count = posts.filter((post) => post.cluster?.value === cluster.value).length
    return count > 0 ? [{ ...cluster, count }] : []
  })
  const grid = (
    <ul className="journal-grid">
      {posts.map((post, index) => (
        <JournalCard key={post.slug} post={post} lead={index === 0} locale={locale} />
      ))}
    </ul>
  )
  if (present.length < 2) return grid
  const chip = (value: string, label: string, count: number) => (
    <label key={value} className="filter-chip journal-filter__chip">
      <input
        className="journal-filter__input visually-hidden"
        type="radio"
        name="journal-topic"
        value={value}
        defaultChecked={value === 'all'}
      />
      {label} <span className="filter-chip__count">{count}</span>
    </label>
  )
  return (
    <div className="journal-scope">
      <fieldset className="journal-filter">
        <legend className="visually-hidden">{ru ? 'Тема' : 'Topic'}</legend>
        <div className="filter-bar filter-bar--scroll">
          {chip('all', ru ? 'Все' : 'All', posts.length)}
          {present.map((cluster) =>
            chip(
              cluster.value,
              ru ? JOURNAL_CLUSTER_NAMES_RU[cluster.value] : cluster.label,
              cluster.count,
            ),
          )}
        </div>
      </fieldset>
      {grid}
    </div>
  )
}

/**
 * One post: ONE link, on its title, with the card as its target (the guide cards' pattern,
 * `GuideCard.tsx`): the picture and the words are plain beside it. The first post is drawn
 * large, its picture the page's largest paint.
 */
function JournalCard({
  post,
  lead,
  locale,
}: {
  post: JournalPostView
  lead: boolean
  locale: Locale
}) {
  const ru = locale === 'ru'
  const cluster = post.cluster
    ? ru
      ? (JOURNAL_CLUSTER_NAMES_RU[post.cluster.value as keyof typeof JOURNAL_CLUSTER_NAMES_RU] ??
        post.cluster.label)
      : post.cluster.label
    : null
  return (
    <li
      className={`panel journal-card${lead ? ' journal-card--lead' : ''}`}
      data-cluster={post.cluster?.value}
    >
      {post.hero ? (
        <ArticleImage
          image={post.hero}
          className="journal-card__img"
          sizes={
            lead
              ? '(max-width: 899px) calc(100vw - 40px), 760px'
              : '(max-width: 559px) calc(100vw - 40px), (max-width: 999px) 50vw, 420px'
          }
          eager={lead}
        />
      ) : null}
      <div className="journal-card__words">
        <p className="journal-card__meta">
          {cluster ? <span>{cluster}</span> : null}
          <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt, locale)}</time>
          {ru ? <span>{IN_ENGLISH_RU}</span> : null}
        </p>
        <h2
          className={
            lead
              ? 'display display--section journal-card__title'
              : 'product-card__name journal-card__title'
          }
        >
          {/* The post is English: its title and summary say so on a Russian hub (WCAG 3.1.2). */}
          <Link
            className="journal-card__link"
            href={post.path}
            hrefLang={ru ? 'en' : undefined}
            lang={ru ? 'en' : undefined}
          >
            {post.title}
          </Link>
        </h2>
        {post.description ? (
          <p className="product-card__desc" lang={ru ? 'en' : undefined}>
            {post.description}
          </p>
        ) : null}
      </div>
    </li>
  )
}
