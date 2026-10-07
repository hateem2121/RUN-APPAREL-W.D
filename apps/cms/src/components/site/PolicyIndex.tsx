import Link from 'next/link'
import { POLICIES, POLICIES_INDEX, POLICY_ACTION, type PolicyGroup } from '../../lib/policies'
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

export function PolicyIndex() {
  const trail = [{ name: 'Policies', path: POLICIES_INDEX.path }]
  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />

      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <Breadcrumb trail={trail} />
          <p className="label">[ Policies ]</p>
          <h1 className="display display--hero hero-legal">
            {POLICIES_INDEX.heading}{' '}
            <span className="serif-accent">{POLICIES_INDEX.headingAccent}</span>
          </h1>
          <p className="site-lede">{POLICIES_INDEX.lede}</p>
        </div>
      </section>

      {GROUPS.map((group) => (
        <section className="site-section" data-site-reveal key={group}>
          <div className="site-container prose prose--guide spread">
            <h2 className="display display--section">{GROUP_NAMES[group]}</h2>
            <div className="spread__body">
              <ul className="see-also__list">
                {POLICIES.filter((policy) => policy.group === group).map((policy) => (
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
          <h2 className="display display--section">This website</h2>
          <div className="spread__body">
            <ul className="see-also__list">
              {POLICIES_INDEX.websiteLinks.map((link) => (
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
          <h2 className="display display--section">Checked by others</h2>
          <div className="spread__body">
            {POLICIES_INDEX.standards.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p>{POLICIES_INDEX.standardsPromise}</p>
          </div>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <div className="site-actions">
            <Link className="btn btn--ghost" href="/contact#inquiry">
              {POLICY_ACTION}
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
