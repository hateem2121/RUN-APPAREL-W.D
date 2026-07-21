import type { ViewerApiSuccess, ViewerColourway } from '@run-apparel/shared'
import { headingWithAccent } from './SerifAccent'

interface ProductPanelProps {
  data: ViewerApiSuccess
  selected: ViewerColourway
  selectedIndex: number
}

export function ProductPanel({ data, selected, selectedIndex }: ProductPanelProps) {
  const { product } = data
  return (
    <section className="product-info" aria-labelledby="product-heading">
      <div className="product-info__labels">
        <span className="label">
          [ {product.category.toUpperCase()} / {product.productCode} ]
        </span>
        <span className="label">
          [ COLOURWAY {String(selectedIndex + 1).padStart(2, '0')} / {selected.displayName.toUpperCase()} ]
        </span>
      </div>
      <h1 id="product-heading" className="display display--hero">
        {headingWithAccent(product.productName)}
      </h1>
      <p className="product-info__statement">
        This is a development reference, not a fixed off-the-shelf product. We can customise the
        fabric, colour, fit, trims, branding and performance details around your brand&rsquo;s
        requirements.
      </p>
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
    </section>
  )
}
