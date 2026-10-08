import Link from 'next/link'
import { POLICY_ACTION, POLICY_CLOSING, type Policy } from '../../lib/policies'
import { breadcrumbTrailJsonLd } from '../../lib/structuredData'
import { Breadcrumb } from './Breadcrumb'
import { Byline } from './Byline'
import { Block } from './GuidePage'
import { JsonLd } from './JsonLd'
import { OnThisPage } from './OnThisPage'

/**
 * One policy page (PLAN.md D2), on the legal pages' layout: hero, "On this page" beside the
 * text from 900px, four sections in the owner's order. Every word comes from
 * `lib/policies.ts`, which the owner approved on 2026-10-07; this file only lays it out.
 * Blocks render through the guides' own renderer, so a policy page can say nothing a guide
 * block could not.
 *
 * ⚠️ THE CLOSING ACTION IS A SECONDARY LINK, never a new primary button (PLAN.md Part D):
 * the site's one primary label stays "Start a conversation". The closing sentence is the
 * owner's own, word for word (F20-12a).
 */

export function PolicyPage({ policy }: { policy: Policy }) {
  const trail = [
    { name: 'Policies', path: '/policies' },
    { name: policy.title, path: policy.path },
  ]
  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />

      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          {/* `hero-legal`: this headline never swaps fonts mid-visit (site.css, 2026-10-01).
              `display--long` where the headline runs long on a phone (base.css, VA-45). */}
          <Breadcrumb trail={trail} />
          <p className="label">[ Policy ]</p>
          <h1
            className={`display display--hero hero-legal${policy.headingAccent.length + policy.heading.length >= 36 ? ' display--long' : ''}`}
          >
            {policy.heading} <span className="serif-accent">{policy.headingAccent}</span>
          </h1>
          <p className="site-lede">{policy.lede}</p>
          {/* "Written by HR, RUN APPAREL" beside the date the owner approved the words (2026-10-08;
              the date was a line of its own before). `bylines.test.ts` holds it to lastReviewed. */}
          <Byline path={policy.path} dateLabel="Last reviewed" />
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container legal">
          <OnThisPage
            sections={policy.sections.map(({ id, heading }) => ({ id, title: heading }))}
          />
          <div className="prose legal__body">
            {policy.sections.map((s) => (
              <div key={s.id}>
                <h2 className="product-card__name prose__heading" id={s.id}>
                  {s.heading}
                </h2>
                {s.blocks.map((block) => (
                  <Block
                    key={
                      block.kind === 'list'
                        ? block.items[0]
                        : 'title' in block
                          ? block.title
                          : block.kind === 'orderSteps'
                            ? 'order-steps'
                            : block.kind === 'table'
                              ? block.caption
                              : block.text
                    }
                    block={block}
                  />
                ))}
              </div>
            ))}
            <p className="policy-closing">{POLICY_CLOSING}</p>
            <div className="site-actions">
              <Link className="btn btn--ghost" href="/contact#inquiry">
                {POLICY_ACTION}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
