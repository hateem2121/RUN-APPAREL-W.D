import type { ReactNode } from 'react'
import type { CompanyPage, CompanySection } from '../../lib/companyPages'
import { FACTORY_PHOTOS, type FactoryPhoto, factoryPhotoImage } from '../../lib/factoryPhotos'
import { Breadcrumb } from './Breadcrumb'

/**
 * The pieces the careers and community layouts share (`CareersPage.tsx`, `CommunityPage.tsx`,
 * 2026-10-07). Each page keeps its own shape; these only read the approved words and draw the
 * hero they have in common.
 */

/** A section of a page's approved words, by id. Throws on a missing one: caught at build. */
export function sectionIn(page: CompanyPage, id: string): CompanySection {
  const section = page.sections.find((entry) => entry.id === id)
  if (!section) throw new Error(`companyPages.ts has no section "${id}" on ${page.path}`)
  return section
}

/** The section's sentences, in order. */
export function sentences(section: CompanySection): string[] {
  return section.blocks.flatMap((block) => (block.kind === 'text' ? [block.text] : []))
}

/** The section's first list. */
export function listOf(section: CompanySection): readonly string[] {
  const list = section.blocks.find((block) => block.kind === 'list')
  return list?.kind === 'list' ? list.items : []
}

export function factoryPhoto(slug: string): FactoryPhoto {
  const photo = FACTORY_PHOTOS.find((entry) => entry.slug === slug)
  if (!photo) throw new Error(`factoryPhotos.ts has no photo "${slug}"`)
  return photo
}

/** A section heading carrying its anchor, as the policy pages carry theirs. */
export function Heading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 className="display display--section" id={id}>
      {children}
    </h2>
  )
}

/** How wide the hero's photo draws: the column to 899 px, then 40% of the page (at most 560 px). */
const HERO_PHOTO_SIZES = '(max-width: 899px) calc(100vw - 40px), min(40vw, 560px)'

/**
 * The words beside a framed factory photo, with the blueprint's corner marks around it.
 *
 * ⚠️ THE PAGE'S LARGEST PAINT: eager, high priority, and inside <picture>, because React 19 adds a
 * preload for a bare eager <img> and `e2e/perfBudgets.spec.ts` allows one hint per page
 * (contact/page.tsx has the same note).
 */
export function SplitHero({
  page,
  trail,
  photoSlug,
  action,
}: {
  page: CompanyPage
  trail: { name: string; path: string }[]
  photoSlug: string
  action?: ReactNode
}) {
  const photo = factoryPhoto(photoSlug)
  const image = factoryPhotoImage(photo)
  const wide = photo.shape === 'wide'
  return (
    <section className="site-hero">
      <div className="blueprint site-hero__grid" aria-hidden="true" />
      <div className={`site-container split-hero${wide ? ' split-hero--wide' : ''}`}>
        <div className="split-hero__words">
          <Breadcrumb trail={trail} />
          <p className="label">{page.eyebrow}</p>
          {/* `hero-legal`: this headline never swaps fonts mid-visit (site.css, 2026-10-01). */}
          {/* `display--long` where the headline runs long on a phone (base.css, VA-45): community's
              38 characters do; careers' 25 do not. */}
          <h1
            className={`display display--hero hero-legal${page.heading.length + page.headingAccent.length >= 36 ? ' display--long' : ''}`}
          >
            {page.heading} <span className="serif-accent">{page.headingAccent}</span>
          </h1>
          <p className="site-lede">{page.lede}</p>
          {action ? <div className="site-actions">{action}</div> : null}
        </div>
        <figure className="split-hero__photo">
          <picture>
            <img
              className="split-hero__img"
              src={image.src}
              srcSet={image.srcSet}
              sizes={HERO_PHOTO_SIZES}
              width={image.width}
              height={image.height}
              alt={photo.alt}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </picture>
          {/* The blueprint's corner marks, as the footer's clock wears them. Decoration. */}
          <span className="split-hero__corners" aria-hidden="true" />
        </figure>
      </div>
    </section>
  )
}
