import type { ViewerApiSuccess, ViewerColourway } from '@run-apparel/shared'
import { ProductIdentityFields } from './ProductIdentity'
import { SpecGroups } from './SpecGroups'

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
  /**
   * False while the facts are in the corners of the 3D window (`specsInCorners`, App.tsx;
   * polish D10). The two are one switch and must stay opposite: both true prints the facts twice
   * (as the old callouts and list did above 1000px until 2026-08-21), both false loses them.
   */
  showSpecs: boolean
}

/**
 * What lives in `.content` under the stage band.
 *
 * ⚠️ THIS COMPONENT RETURNS DIFFERENT SHAPES, and the difference is not cosmetic tidiness.
 *
 * In one column it is the section it has always been: identity fields and the fact groups
 * sharing one `.product-info` and its 16px gap.
 *
 * In two columns the identity has moved to the aside. If the facts are in the 3D window's
 * corners as well, nothing is left and nothing is returned. If they are not (a computer whose 3D
 * cannot run, or a window too short for the identity beside the garment), the fact groups are
 * returned BARE rather than inside an empty `.product-info` section, because that section is
 * `aria-labelledby` the <h1>: a screen-reader user would find "X-MILO PRO SKIN-SUIT, region"
 * holding only the facts, or nothing at all.
 */
export function ProductPanel({
  data,
  selected,
  selectedIndex,
  showIdentity,
  showSpecs,
}: ProductPanelProps) {
  const { product } = data
  const specs = showSpecs ? <SpecGroups product={product} placement="list" /> : null

  if (!showIdentity) return specs

  return (
    <section className="product-info" aria-labelledby="product-heading">
      <ProductIdentityFields product={product} selected={selected} selectedIndex={selectedIndex} />
      {specs}
    </section>
  )
}
