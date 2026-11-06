import { authorName, bylineFor } from '../../lib/bylines'
import { formatPostDate } from '../../lib/journal'

/**
 * Who wrote the page and when its words last changed (findability audit, 2026-10-08), under the
 * lede of a guide, a policy and the careers page. The Journal's labels and its date style
 * ("October 5, 2026", G9), in one row. `bylines.ts` holds the facts and why they stay true.
 *
 * `dateLabel` is "Last reviewed" on a policy: there the date is the day the owner approved the
 * words, as the page already said before this line existed.
 *
 * `reviewed` (an ISO date) adds a "Last reviewed" row on a guide whose subject moves every quarter
 * (the technology guide, owner's instruction 2026-11-06: its words say it "carries two dates").
 */
export function Byline({
  path,
  dateLabel = 'Last checked',
  reviewed,
}: {
  path: string
  dateLabel?: string
  reviewed?: string
}) {
  const byline = bylineFor(path)
  // `bylines.test.ts` gives every guide, policy and careers one; drawing nothing is the safe miss.
  if (!byline) return null
  // The day as written, not converted to another zone: the page and its data name the same day.
  const day = byline.changed.on.slice(0, 10)
  return (
    <dl className="page-byline">
      <div>
        <dt>Written by</dt>
        <dd>{authorName(byline.author)}</dd>
      </div>
      <div>
        <dt>{dateLabel}</dt>
        <dd>
          <time dateTime={day}>{formatPostDate(day)}</time>
        </dd>
      </div>
      {reviewed ? (
        <div>
          <dt>Last reviewed</dt>
          <dd>
            <time dateTime={reviewed}>{formatPostDate(reviewed)}</time>
          </dd>
        </div>
      ) : null}
    </dl>
  )
}
