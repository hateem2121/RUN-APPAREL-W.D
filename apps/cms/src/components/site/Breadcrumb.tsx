import type { Locale } from '../../lib/locale'
import { IntentLink as Link } from './IntentLink'

/**
 * The visible breadcrumb trail on the new company pages. It MUST match the page's
 * `breadcrumbTrailJsonLd` trail exactly (PLAN.md E4/G15): Home first, the page itself last.
 * The last step is text, not a link — it is where the reader stands.
 */
export function Breadcrumb({
  trail,
  locale = 'en',
}: {
  trail: readonly { name: string; path: string }[]
  /** Russian section (2026-11-15): «Главная» first; the links go to /ru by IntentLink. */
  locale?: Locale
}) {
  const ru = locale === 'ru'
  return (
    <nav className="crumbs" aria-label={ru ? 'Навигационная цепочка' : 'Breadcrumb'}>
      <Link href="/">{ru ? 'Главная' : 'Home'}</Link>
      {trail.map((step, index) => (
        <span key={step.path}>
          {' '}
          <span aria-hidden="true">/</span>{' '}
          {index === trail.length - 1 ? (
            <span aria-current="page">{step.name}</span>
          ) : (
            <Link href={step.path}>{step.name}</Link>
          )}
        </span>
      ))}
    </nav>
  )
}
