import type { ViewerProduct } from '@run-apparel/shared'

/**
 * THE GARMENT'S NAME AND CODE OVER ITS 3D WINDOW, ON A PHONE (owner-approved 2026-10-26, site
 * check; the picture he approved is `RUN APPAREL / X-MILO PRO SKIN-SUIT · R-XPS / [3D model]`).
 *
 * A QR scan lands on a phone's first screen holding the 3D model, its views, the colour and the
 * Email / WhatsApp bar, and not the name: the heading follows the garment (polish M5, F11, X1,
 * 2026-10-04 took an earlier "CODE · NAME" line away to give the garment its 20px). The owner
 * wants the name back there, so this is the one line, "NAME · CODE" this time, the order he
 * approved. An upright tablet needs none (its garment is shortened so the heading is on the
 * first screen, F11) and a computer has the name beside the garment (D8): `page.css` shows this
 * only on a phone, and `App.tsx` renders it only where the heading is not beside the garment.
 *
 * `aria-hidden`: the `<h1>` further down is the accessible name, and a screen reader should not
 * announce the garment twice. `translate="no"` like the heading and the code (polish X27).
 *
 * The name and the code are two boxes so a long name can shorten with an ellipsis while the code
 * keeps its room: the code is what a buyer quotes. The space in the markup is the only thing
 * between them in the text; `page.css` draws the gap, because a flex container drops whitespace.
 */
export function ProductNameLine({ product }: { product: ViewerProduct }) {
  return (
    <p className="stage-block__title" aria-hidden="true" translate="no">
      <span className="stage-block__title-name">{product.productName}</span>{' '}
      <span className="stage-block__title-code">· {product.productCode}</span>
    </p>
  )
}
