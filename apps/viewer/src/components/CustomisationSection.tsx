import type { ViewerApiSuccess } from '@run-apparel/shared'
import { useId, useState } from 'react'

export function CustomisationSection({ data }: { data: ViewerApiSuccess }) {
  const { product } = data
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <section className="customise" aria-labelledby="customise-heading" data-reveal>
      <p className="section-number">N°002 — CUSTOMISATION — N°002</p>
      <h2 id="customise-heading" className="display display--section">
        FROM IDEA TO <span className="serif-accent">production</span>.
      </h2>
      {product.customisationIntroHtml ? (
        <div
          className="customise__intro"
          // CMS-authored rich text, serialised server-side by our own endpoint.
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
            How we build your product {open ? '−' : '+'}
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
