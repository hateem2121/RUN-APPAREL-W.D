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
          <dd>{product.performanceFeatures.join(' / ')}</dd>
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
