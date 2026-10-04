import {
  categoryGalleryPath,
  seeAllInCategoryLabel,
  type ViewerApiSuccess,
} from '@run-apparel/shared'
import { useEffect, useState } from 'react'
import { diagnostic } from '../lib/diagnostic'
import { SITE_ORIGIN } from '../lib/siteLinks'

/*
 * ⚠️ THE CARDS ARE A DYNAMIC IMPORT, WITH A STYLESHEET OF THEIR OWN (`RelatedCards.tsx`,
 * `related-cards.css`), as the HD picture's dialog is (hd-image.css says why). In page.css their
 * 242 bytes of compressed rules delayed EVERY garment page's first paint by about 150 ms on slow
 * 3G: measured 2026-10-04 with RO-08 (e2e/firstPaint.spec.ts), medians 2,344 ms without them and
 * 2,492-2,496 ms with them, past the 2,400 ms ceiling. The render-blocking stylesheet ends its
 * download sharing the line with the scripts and two fonts, so each byte at its tail costs ~0.6 ms;
 * the script for the cards cost nothing measurable. The cards sit at the end of the page, so
 * their rules can wait for the page to draw.
 *
 * ⚠️ NOT `React.lazy`. A lazy component whose download fails throws to the nearest error
 * boundary, and the page's only one wraps the whole page (main.tsx): a card file lost to a deploy
 * would replace the garment with the "unavailable" screen. Here a failure leaves the cards out,
 * the label, heading and "See all" stay, and it is reported like any other failure.
 *
 * ⚠️ THE SECTION ITSELF IS DRAWN AT ONCE, with the page. It carries `data-reveal`, and the reveal
 * finds its blocks ONCE, after the first render (polish/reveal.ts): a section drawn later would
 * never be found and would stay invisible (the viewer-layout rule's `data-reveal` trap).
 *
 * ⚠️ FETCHED AS SOON AS THE PAGE'S SCRIPT RUNS, NOT WHEN THE SECTION IS DRAWN. The script runs
 * only once the page's stylesheet has arrived, so this cannot delay the first paint, and it starts
 * before the garment's answer is even asked for: by the time the section is drawn the cards are
 * almost always here, and are drawn WITH it. Fetched when the section was drawn, they arrived a
 * moment later and pushed the contact section and the footer down under a visitor already at the
 * end of the page (measured 2026-10-04: e2e/action-bar-steps-aside.spec.ts, mobile Safari).
 */
const loadCards = () => import('./RelatedCards')
type Cards = Awaited<ReturnType<typeof loadCards>>['default']

let readyCards: Cards | null = null
const cards = loadCards().then((module) => {
  readyCards = module.default
  return module.default
})
// Reported by the section that needed them (below), not here: the failure log may not be
// listening yet when this module first runs, and a page without the section misses nothing.
cards.catch(() => {})

/**
 * "More from this category" at the end of a garment page (polish S6, 2026-10-04; the owner's
 * four, Q27): other garments of the same category, drawn as the website draws its cards, and a
 * link to the whole category.
 *
 * The CMS chooses them and sends them with the garment's own answer
 * (apps/cms/src/endpoints/relatedGarments.ts): the ones after this garment in the website's
 * order, wrapping round. An answer cached before then has none, and a category with only this
 * garment has none; the section is then not drawn at all, its label included.
 *
 * Before "Start the conversation", which is №04 since, so the page still ends on its one prompt.
 *
 * "See all … in 3D" opens the category's gallery on the website, in the words and to the address
 * the website's own buyer pages use (packages/shared/src/categoryPages.ts).
 */
export function RelatedGarments({ data }: { data: ViewerApiSuccess }) {
  const related = data.related ?? []
  const category = data.product.category.trim()
  const shown = related.length > 0 && category !== ''
  // Already here (the usual case): drawn in the same render as the section.
  const [Cards, setCards] = useState<Cards | null>(() => readyCards)

  useEffect(() => {
    if (!shown || Cards) return
    let live = true
    cards.then(
      (ready) => {
        if (live) setCards(() => ready)
      },
      (error: unknown) => {
        diagnostic('related-cards-failed', { reason: String(error).slice(0, 200) })
      },
    )
    return () => {
      live = false
    }
  }, [shown, Cards])

  if (!shown) return null
  return (
    <section className="related" aria-labelledby="related-heading" data-reveal>
      <p className="section-number">&#8470;03 — More from this category</p>
      <h2 id="related-heading" className="display display--section">
        More <span className="serif-accent">{category}</span> in 3D.
      </h2>
      {Cards ? <Cards related={related} /> : null}
      <a
        className="btn btn--ghost related__all"
        href={`${SITE_ORIGIN}${categoryGalleryPath(category)}`}
      >
        {seeAllInCategoryLabel(category)}
      </a>
    </section>
  )
}
