import type { ViewerApiSuccess, ViewerColourway } from '@run-apparel/shared'
import { ProductIdentityFields } from './ProductIdentity'

interface ProductPanelProps {
  data: ViewerApiSuccess
  selected: ViewerColourway
  selectedIndex: number
  /**
   * False in the two-column layout, where <ProductIdentity> renders the same
   * fields in the stage aside instead. Never render both — see the warning on
   * <ProductIdentity>.
   */
  showIdentity: boolean
}

/**
 * A key for each feature that stays distinct when the same words are typed twice.
 *
 * The CMS holds the features as a list of free text, so two rows can read alike, and React
 * needs a different key for each sibling: `['a', 'a', 'b']` gives `a#1`, `a#2`, `b#1`. The order
 * is the CMS's and never changes between renders, so the key never moves between rows.
 */
function withKeys(features: string[]): { feature: string; key: string }[] {
  const seen = new Map<string, number>()
  return features.map((feature) => {
    const occurrence = (seen.get(feature) ?? 0) + 1
    seen.set(feature, occurrence)
    return { feature, key: `${feature}#${occurrence}` }
  })
}

/**
 * What lives in `.content` under the stage band.
 *
 * ⚠️ THIS COMPONENT RETURNS TWO DIFFERENT SHAPES, and the difference is not
 * cosmetic tidiness.
 *
 * In one column it is the section it has always been: identity fields and the
 * spec list sharing one `.product-info` and its 16px gap.
 *
 * In two columns the identity has moved to the aside, and what is left is the
 * spec list ALONE. It is returned bare rather than inside an empty
 * `.product-info` section, because that section is `aria-labelledby` the <h1> —
 * and above 1000px `.spec-list` is `display: none` as well (the callouts render
 * the same four facts over the canvas), so the wrapper would be a named landmark
 * region containing nothing at all. A screen-reader user would find "X-MILO PRO
 * SKIN-SUIT, region" and be handed an empty box.
 */
export function ProductPanel({ data, selected, selectedIndex, showIdentity }: ProductPanelProps) {
  const { product } = data

  /*
   * ⚠️ HIDDEN ABOVE 1000px BY `.spec-list`'s OWN RULE, NOT BY THIS COMPONENT, and
   * the breakpoint is `.stage__callouts`'s to the pixel.
   *
   * Between 900 and 1000px the two-column layout is on but the callouts are not —
   * the canvas column is only ~559px there, and two 240px callouts would sit on
   * the garment. So in that band this list is the ONLY rendering of the four
   * facts and must stay. Deciding it in CSS keeps one breakpoint governing both
   * elements; deciding it here would need the same query a third time.
   */
  const specs = (
    <dl className="spec-list">
      {product.fabricComposition && (
        <div>
          <dt>[ Fabric ]</dt>
          <dd>{product.fabricComposition}</dd>
        </div>
      )}
      {product.gsm && (
        <div>
          <dt>[ Weight ]</dt>
          <dd>{product.gsm}</dd>
        </div>
      )}
      {product.garmentFit && (
        <div>
          <dt>[ Fit ]</dt>
          <dd>{product.garmentFit}</dd>
        </div>
      )}
      {product.performanceFeatures.length > 0 && (
        <div>
          <dt>[ Performance ]</dt>
          {/*
            ONE FEATURE TO A LINE, AS A LIST (visual audit VA-59, 2026-10-02). They were
            `.join(' / ')`-ed into one string, and in a phone's half-width column that read
            as a run-on: "Eco poly stretch / Engineered seam placement / Digital sublimation
            print / Flex jersey panels" over five lines. Same words, same order, no CMS change;
            the list also tells a screen reader how many there are before it reads them.

            ⚠️ `role="list"` LOOKS REDUNDANT AND IS NOT. `.spec-list__features` sets `list-style:
            none` (page.css), and Safari then drops a list's semantics unless the role is written
            out; the Chrome team's accessibility guidance (modern-web-guidance) says the same.
            The website's own bullet-less lists (its footer links, its card grids) do not write
            the role out; if that is ever decided site-wide, it is a separate change.
          */}
          <dd>
            {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics under list-style: none unless the role is written out */}
            <ul className="spec-list__features" role="list">
              {withKeys(product.performanceFeatures).map(({ feature, key }) => (
                <li key={key}>{feature}</li>
              ))}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  )

  if (!showIdentity) return specs

  return (
    <section className="product-info" aria-labelledby="product-heading">
      <ProductIdentityFields product={product} selected={selected} selectedIndex={selectedIndex} />
      {specs}
    </section>
  )
}
