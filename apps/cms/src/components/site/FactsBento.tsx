import { CERTIFICATION, FACTS, SHIPS_TO } from '../../lib/companyFacts'
import { CountUp } from './CountUp'

/**
 * №05 "The works" — the owner's confirmed numbers as a bento grid (2026-09-29).
 *
 * ⚠️ FIVE FACTS SINCE 2026-09-29 (the 21–45 day window was removed), SO THE FIRST IS A FEATURE
 * TILE TWO COLUMNS WIDE. 2 + 1 + 1 + 1 + 1 = six cells, the same complete-rectangle rule
 * `.facts-grid` has always kept: three rows of two on a tablet, two rows of three on a desktop,
 * no empty cell at any width.
 *
 * ⚠️ THE FINAL NUMBER IS IN THE HTML. `<data value>` carries it for machines and the text for
 * people, so a visitor with scripting off, a crawler and `/llms.txt`'s parity test all read the
 * real figure; the count-up (`CountUp`) only animates what is already there.
 */
export function FactsBento() {
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
      <div className="facts-notes">
        <div>
          <p className="field-label">Where we ship</p>
          <p className="fact__note">{SHIPS_TO}</p>
        </div>
        <div>
          <p className="field-label">Certification</p>
          <p className="fact__note">{CERTIFICATION}</p>
        </div>
      </div>
    </>
  )
}
