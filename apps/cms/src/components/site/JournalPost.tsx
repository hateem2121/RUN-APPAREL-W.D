import { differentDay, formatPostDate, JOURNAL_HUB, JOURNAL_PATH } from '../../lib/journal'
import type { JournalPostView } from '../../lib/journalPublic'
import { blogPostingJsonLd, breadcrumbTrailJsonLd } from '../../lib/structuredData'
import { ArticleImage, LinkList, SiteClosing } from './ArticleParts'
import { Breadcrumb } from './Breadcrumb'
import { JournalBody } from './JournalBody'
import { JsonLd } from './JsonLd'

/**
 * One Journal post, `/journal/<slug>` (PLAN.md D7): the title, who wrote it and when, the hero
 * picture, the body, the AI-help line when set (T14), "Read more" (at least one guide and one
 * buyer page, chosen in the CMS) and the site's closing block.
 *
 * The facts about the post sit beside the body on a wide screen, as a ruled sheet in the mono
 * register the garment pages use for a specification, so the reading column keeps its measure
 * and the half beside it is not left empty. On a phone they come first.
 *
 * Its data is a BlogPosting built from the same values the page prints (G15), and a post with
 * no named author is the company's.
 */
export function JournalPost({ post, companyName }: { post: JournalPostView; companyName: string }) {
  const trail = [
    { name: JOURNAL_HUB.title, path: JOURNAL_PATH },
    { name: post.title, path: post.path },
  ]
  const writer = post.author?.name ?? companyName
  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />
      <JsonLd
        data={blogPostingJsonLd({
          path: post.path,
          headline: post.title,
          description: post.description,
          image: post.share ?? post.hero,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt,
          author: post.author ? { name: post.author.name, url: post.author.url } : null,
          companyName,
        })}
      />

      <article>
        <header className="site-hero journal-hero">
          <div className="blueprint site-hero__grid" aria-hidden="true" />
          <div className="site-container">
            <Breadcrumb trail={trail} />
            {post.cluster ? <p className="label">[ {post.cluster.label} ]</p> : null}
            <h1
              className={`display display--hero hero-legal${post.title.length >= 36 ? ' display--long' : ''}`}
            >
              {post.title}
            </h1>
            {post.description ? <p className="site-lede">{post.description}</p> : null}
          </div>
        </header>

        {post.hero ? (
          <div className="site-container">
            <figure className="journal-hero__figure">
              <ArticleImage
                image={post.hero}
                className="journal-hero__img"
                sizes="(max-width: 1439px) calc(100vw - 40px), 1400px"
                eager
              />
            </figure>
          </div>
        ) : null}

        <section className="site-section">
          <div className="site-container journal-article">
            <dl className="journal-facts">
              <div>
                <dt>Written by</dt>
                <dd>
                  {writer}
                  {post.author?.role ? `, ${post.author.role}` : ''}
                </dd>
              </div>
              <div>
                <dt>Published</dt>
                <dd>
                  <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
                </dd>
              </div>
              {differentDay(post.publishedAt, post.updatedAt) ? (
                <div>
                  <dt>Updated</dt>
                  <dd>
                    <time dateTime={post.updatedAt}>{formatPostDate(post.updatedAt)}</time>
                  </dd>
                </div>
              ) : null}
              {post.cluster ? (
                <div>
                  <dt>Topic</dt>
                  <dd>{post.cluster.label}</dd>
                </div>
              ) : null}
            </dl>

            <div className="journal-article__main">
              <JournalBody body={post.body} />
              {post.checkedBy ? (
                <p className="journal-checked">
                  Drafted with AI help and checked by {post.checkedBy}.
                </p>
              ) : null}
              {post.author ? (
                <aside className="journal-author" aria-label={post.author.name}>
                  {post.author.photo ? (
                    <ArticleImage
                      image={post.author.photo}
                      className="journal-author__photo"
                      sizes="96px"
                    />
                  ) : null}
                  <div>
                    <p className="product-card__name">{post.author.name}</p>
                    {post.author.role ? (
                      <p className="journal-author__role">{post.author.role}</p>
                    ) : null}
                    {post.author.bio ? <p>{post.author.bio}</p> : null}
                    {post.author.url ? (
                      <a className="prose__link" href={post.author.url} rel="noopener noreferrer">
                        LinkedIn
                      </a>
                    ) : null}
                  </div>
                </aside>
              ) : null}
            </div>
          </div>
        </section>
      </article>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <LinkList id="read-more" title="Read more" links={post.related} />
          <SiteClosing />
        </div>
      </section>
    </>
  )
}
