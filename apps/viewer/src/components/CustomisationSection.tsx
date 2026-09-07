import type { ViewerApiSuccess } from '@run-apparel/shared'
import { useId, useState } from 'react'

/**
 * Open on a roomy screen, closed on a phone.
 *
 * ⚠️ IT WAS CLOSED EVERYWHERE UNTIL 2026-08-20, and what it hid is the clearest
 * explanation of the business on the page: the four steps from "share your
 * starting point" to "sample, refine and produce". For a buyer who has never
 * heard of this company that IS the pitch, and it sat behind a tap most visitors
 * never take, below the fold, at the end of a page they reached by scanning a
 * tag on a garment.
 *
 * Still collapsed on a phone. The four steps are ~550px of copy there, which
 * pushes the contact section — the only conversion path — that much further from
 * a thumb, and a phone visitor who wants the detail can ask for it. The trade
 * only pays where the height is free.
 *
 * ⚠️ READ ONCE, NOT SUBSCRIBED. This is the initial value of a `useState`, so a
 * visitor who opens or closes it keeps their choice, and one who rotates a tablet
 * mid-visit is not overridden mid-read. That is deliberate: a control that
 * reopens itself because the viewport changed is a control fighting its user.
 * `matchMedia` rather than `innerWidth` so it agrees with the 900px seam in
 * page.css by asking the same question the stylesheet does.
 */
function opensByDefault(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(min-width: 900px)').matches
}

export function CustomisationSection({ data }: { data: ViewerApiSuccess }) {
  const { product } = data
  const [open, setOpen] = useState(opensByDefault)
  const panelId = useId()

  return (
    <section className="customise" aria-labelledby="customise-heading" data-reveal>
      <p className="section-number">&#8470;02 — CUSTOMIZATION — &#8470;02</p>
      <h2 id="customise-heading" className="display display--section">
        FROM IDEA TO <span className="serif-accent">production</span>.
      </h2>
      {product.customisationIntroHtml ? (
        // The only writer is an authenticated CMS editor, and the HTML is produced
        // server-side by convertLexicalToHTML from a lexical document — never a raw
        // string a user typed. The realistic alternative, a lexical renderer in the
        // viewer bundle, would ship a parser to every QR scan to re-derive markup the
        // CMS already computed. The CSP is hash-locked (scripts/csp.mjs), so an
        // injected <script> here would not execute either.
        <div
          className="customise__intro"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: CMS-authored, serialised server-side — see above
          dangerouslySetInnerHTML={{ __html: product.customisationIntroHtml }}
        />
      ) : (
        <p className="customise__intro">
          Send us a finished design, a tech pack, artwork, a reference image — or simply an idea.
          Our team develops it with you into a production-ready garment.
        </p>
      )}
      {product.customisationSteps.length > 0 && (
        <>
          <button
            type="button"
            className="btn btn--ghost steps-toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
          >
            How we build your product <span aria-hidden="true">{open ? '−' : '+'}</span>
          </button>
          <div
            id={panelId}
            className={`steps-collapse${open ? ' steps-collapse--open' : ''}`}
            inert={open ? undefined : true}
          >
            <div className="steps">
              {product.customisationSteps.map((step) => (
                <div className="step" key={step.number}>
                  <span className="step__num">{String(step.number).padStart(2, '0')}</span>
                  <div>
                    <h3 className="step__title">{step.title}</h3>
                    <p className="step__body">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
