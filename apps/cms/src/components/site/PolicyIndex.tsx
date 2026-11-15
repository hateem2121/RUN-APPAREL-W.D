import { IntentLink as Link } from './IntentLink'
import { POLICIES, POLICIES_INDEX, POLICY_ACTION, type PolicyGroup } from '../../lib/policies'
import type { Locale } from '../../lib/locale'
import { POLICIES_INDEX_RU, POLICIES_RU, POLICY_ACTION_RU } from '../../lib/policies.ru'
import { breadcrumbTrailJsonLd } from '../../lib/structuredData'
import { Breadcrumb } from './Breadcrumb'
import { JsonLd } from './JsonLd'

/**
 * The policies hub (PLAN.md D1). Only APPROVED policies are listed — the list comes from
 * `POLICIES`, so an unapproved policy is simply absent, never a "coming soon". The
 * standards block is the owner's lines and promise, word for word, with no logos (G6/R-28).
 */
const GROUP_NAMES: Record<PolicyGroup, string> = {
  workplace: 'Workplace',
  production: 'Production',
}

const GROUPS: readonly PolicyGroup[] = ['workplace', 'production']

/** The Russian page's words beside the English (2026-11-15). */
const GROUP_NAMES_RU: Record<PolicyGroup, string> = {
  workplace: 'Условия труда',
  production: 'Производство',
}

export function PolicyIndex({ locale = 'en' }: { locale?: Locale } = {}) {
  const ru = locale === 'ru'
  const index = ru ? POLICIES_INDEX_RU : POLICIES_INDEX
  const policies = ru ? POLICIES_RU : POLICIES
  const trail = [{ name: ru ? 'Политики' : 'Policies', path: index.path }]
  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail, locale)} />

      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <Breadcrumb trail={trail} locale={locale} />
          <p className="label">{ru ? '[ Политики ]' : '[ Policies ]'}</p>
          <h1 className="display display--hero hero-legal">
            {index.heading} <span className="serif-accent">{index.headingAccent}</span>
          </h1>
          <p className="site-lede">{index.lede}</p>
        </div>
      </section>

      {GROUPS.map((group) => (
        <section className="site-section" data-site-reveal key={group}>
          <div className="site-container prose prose--guide spread">
            <h2 className="display display--section">
              {(ru ? GROUP_NAMES_RU : GROUP_NAMES)[group]}
            </h2>
            <div className="spread__body">
              <ul className="see-also__list">
                {policies
                  .filter((policy) => policy.group === group)
                  .map((policy) => (
                    <li key={policy.path}>
                      <Link href={policy.path}>{policy.title}</Link>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </section>
      ))}

      <section className="site-section" data-site-reveal>
        <div className="site-container prose prose--guide spread">
          <h2 className="display display--section">{ru ? 'Этот сайт' : 'This website'}</h2>
          <div className="spread__body">
            <ul className="see-also__list">
              {index.websiteLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.name}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container prose prose--guide spread">
          <h2 className="display display--section">
            {ru ? 'Проверено другими' : 'Checked by others'}
          </h2>
          <div className="spread__body">
            {/* `data-facts`: certificate and registry names, which the reading-ease check skips as it
                skips the home page's facts panel (owner, 2026-10-07; apps/cms/e2e/legibility.spec.ts). */}
            {index.standards.map((line) => (
              <p key={line} data-facts>
                {line}
              </p>
            ))}
            <p>{index.standardsPromise}</p>
          </div>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <div className="site-actions">
            <Link className="btn btn--ghost" href="/contact#inquiry">
              {ru ? POLICY_ACTION_RU : POLICY_ACTION}
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
