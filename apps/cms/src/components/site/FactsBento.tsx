import { logosFor, markBox, POSTAL_ADDRESS } from '@run-apparel/shared'
import type { CSSProperties } from 'react'
import { CERTIFICATION_LINES, CERTIFICATION_PROMISE, FACTS, SHIPS_TO } from '../../lib/companyFacts'
import { parseCoordinates } from '../../lib/globe'
import { mapPoint, WORLD_MAP } from '../../lib/worldMap'
import { CountUp } from './CountUp'

/** The area each mark is drawn at here: a 44px square's, a step up from the footer's 36. */
const MARK_AREA_HERE = 44 * 44

/**
 * №05 "The works" — the owner's confirmed numbers as a bento grid (2026-09-29).
 *
 * ⚠️ FIVE FACTS SINCE 2026-09-29 (the 21–45 day window was removed), SO THE FIRST IS A FEATURE
 * TILE TWO COLUMNS WIDE. 2 + 1 + 1 + 1 + 1 = six cells, the same complete-rectangle rule
 * `.facts-grid` has always kept: three rows of two on a tablet, two rows of three on a desktop,
 * no empty cell at any width.
 *
 * ⚠️ THE FINAL NUMBER IS IN THE HTML, AS TEXT. `CountUp` renders the figure itself on the server,
 * so a visitor with scripting off, a crawler and `/llms.txt`'s parity test all read the real
 * number; the count-up only animates what is already there. (An earlier note here promised a
 * `<data value>` element; none is rendered — corrected 2026-09-29.)
 *
 * ⚠️ UNDER THE NUMBERS, ONE SLAB IN TWO HALVES (polish X7, 2026-10-05). "Where we ship" was one
 * line beside a seven-line certification paragraph (audit of 3 October). Now the shipping half
 * draws the world, dotted, with the works pinned (`public/world-map.svg`), and the certification
 * half is the footer's marks, each group beside its one line (`CERTIFICATION_LINES`).
 * The slab is dark in both themes, as the footer is, because the marks are the bodies' reversed
 * artwork, drawn for a dark ground: on paper they are off-white on off-white, and redrawing a
 * body's mark in other colours is the misuse the footer's comment warns of.
 *
 * ⚠️ THE PIN STANDS WHERE THE CMS SAYS THE WORKS ARE, OR NOWHERE: `worksCoordinates` is never
 * defaulted (`lib/globe.ts`, the contact globe's rule), so a blank or unreadable value draws the
 * map with no pin, never a Sialkot that could drift from what the owner typed.
 */
export function FactsBento({ worksCoordinates }: { worksCoordinates?: string | null }) {
  const works = worksCoordinates ? parseCoordinates(worksCoordinates) : null
  const pin = works ? mapPoint(works) : null
  return (
    <>
      <dl className="facts-grid facts-grid--bento">
        {FACTS.map((fact, index) => (
          <div className={index === 0 ? 'fact fact--feature' : 'fact'} key={fact.label}>
            <dt className="fact__value display display--section">
              <CountUp value={fact.value} />
            </dt>
            <dd className="fact__label">{fact.label}</dd>
          </div>
        ))}
      </dl>
      <div className="works-slab">
        <div className="works-slab__half">
          <p className="field-label">Where we ship</p>
          <div className="ship-map">
            {/* biome-ignore lint/performance/noImgElement: a 13 KB SVG of dots, which next/image would pass through unchanged (ProductPoster.tsx measures why); decoration, so `alt=""`. */}
            <img
              className="ship-map__land"
              src="/world-map.svg"
              width={WORLD_MAP.width}
              height={WORLD_MAP.height}
              alt=""
              loading="lazy"
              decoding="async"
            />
            {pin ? (
              <span
                className="ship-map__pin"
                style={
                  {
                    '--pin-x': `${(pin.x * 100).toFixed(2)}%`,
                    '--pin-y': `${(pin.y * 100).toFixed(2)}%`,
                  } as CSSProperties
                }
                aria-hidden="true"
              >
                <span className="ship-map__name">{POSTAL_ADDRESS.locality}</span>
              </span>
            ) : null}
          </div>
          <p className="works-slab__line">{SHIPS_TO}</p>
        </div>
        <div className="works-slab__half">
          <p className="field-label">Certification</p>
          <ul className="cert-list">
            {CERTIFICATION_LINES.map((line) => {
              const marks = logosFor(line)
              return (
                <li className="cert" key={line}>
                  {marks.length > 0 ? (
                    <span className="cert__marks">
                      {marks.map((logo) => {
                        const box = markBox(logo, MARK_AREA_HERE)
                        return (
                          // biome-ignore lint/performance/noImgElement: the footer's marks, already-optimised SVGs of a few KB (SiteFooter.tsx says why not next/image).
                          <img
                            key={logo.slug}
                            className="cert__mark"
                            src={logo.src}
                            width={box.width}
                            height={box.height}
                            alt={logo.alt}
                            loading="lazy"
                            decoding="async"
                          />
                        )
                      })}
                    </span>
                  ) : null}
                  <span className="works-slab__line">{line}</span>
                </li>
              )
            })}
          </ul>
          <p className="works-slab__note">{CERTIFICATION_PROMISE}</p>
        </div>
      </div>
    </>
  )
}
