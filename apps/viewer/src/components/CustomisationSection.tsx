import type { ViewerApiSuccess } from '@run-apparel/shared'
import { useId, useState } from 'react'

export function CustomisationSection({ data }: { data: ViewerApiSuccess }) {
  const { product } = data
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <section className="customise" aria-labelledby="customise-heading" data-reveal>
      <p className="section-number">N&#8470;002 — CUSTOMISATION — N&#8470;002</p>
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
