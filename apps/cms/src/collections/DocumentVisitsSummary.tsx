import type { DocumentId, DocumentSummary } from '@run-apparel/shared'
import type { BeforeListTableServerProps } from 'payload'
import { loadVisitSummaries } from '../lib/documentVisitsSummaryData'

const DOCUMENT_TITLES: Record<DocumentId, string> = {
  catalogue: 'Catalogue',
  profile: 'Company profile',
}

function SummaryBlock({ title, summary }: { title: string; summary: DocumentSummary }) {
  return (
    <div>
      <h4>{title}</h4>
      <dl>
        <dt>People</dt>
        <dd>{summary.people}</dd>
        <dt>Opens</dt>
        <dd>{summary.opens}</dd>
        <dt>Private visits</dt>
        <dd>{summary.privateVisits}</dd>
        <dt>Downloads</dt>
        <dd>{summary.downloads}</dd>
        <dt>Read past halfway</dt>
        <dd>{summary.readPastHalf}</dd>
        <dt>Reached the last page</dt>
        <dd>{summary.reachedEnd}</dd>
        <dt>Link previews</dt>
        <dd>{summary.linkPreviews}</dd>
        <dt>Old-link tries</dt>
        <dd>{summary.oldLinkTries}</dd>
        <dt>Robots</dt>
        <dd>{summary.robots}</dd>
      </dl>
      <p>
        Phones {summary.devices.phone}, tablets {summary.devices.tablet}, computers{' '}
        {summary.devices.computer}, other {summary.devices.unknown}
      </p>
      {summary.topCountries.length > 0 && (
        <ul>
          {summary.topCountries.map((place) => (
            <li key={place.country}>
              {place.country}: {place.people}
              {place.topCity ? ` (${place.topCity} ${place.topCityPeople})` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The block above the "Document visits" list table (Task 2's `admin.components.
 * beforeListTable`). Server-rendered, no client JavaScript — `payload` is a direct
 * prop on `BeforeListTableServerProps` (the same `ServerProps.payload` Dashboard.tsx
 * already relies on for its own, differently-shaped props; confirmed against this
 * installed Payload version's own bundled types, not assumed from Dashboard.tsx's
 * case alone).
 */
export async function DocumentVisitsSummary({ payload }: BeforeListTableServerProps) {
  const summaries = await loadVisitSummaries(payload, new Date())

  return (
    <section aria-label="Visit summary">
      {(Object.keys(DOCUMENT_TITLES) as DocumentId[]).map((id) => (
        <div key={id}>
          <h3>{DOCUMENT_TITLES[id]}</h3>
          <SummaryBlock title="Last 7 days" summary={summaries.last7[id]} />
          <SummaryBlock title="Last 30 days" summary={summaries.last30[id]} />
        </div>
      ))}
      <p>
        {summaries.lastEmail === null
          ? 'No weekly email yet'
          : summaries.lastEmail.status === 'sent'
            ? `Last weekly email: sent ${summaries.lastEmail.week}`
            : `Last weekly email: not sent — ${summaries.lastEmail.error}`}
      </p>
    </section>
  )
}
