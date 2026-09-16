import { addDays, pakistanDay, summariseVisits, VISIT_KINDS } from '@run-apparel/shared'
import type { DocumentId, DocumentSummary, VisitRow } from '@run-apparel/shared'
import type { BasePayload } from 'payload'

export interface LastWeeklyEmail {
  week: string
  status: 'sent' | 'failed'
  sentAt: string | null
  error: string
}

export interface VisitSummaries {
  today: string
  last7: Record<DocumentId, DocumentSummary>
  last30: Record<DocumentId, DocumentSummary>
  lastEmail: LastWeeklyEmail | null
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const num = (value: unknown): number => (typeof value === 'number' ? value : 0)

/** Payload returns whatever was stored; a field with no value comes back `null`. */
function toVisitRow(doc: Record<string, unknown>): VisitRow {
  return {
    day: text(doc.day),
    document: doc.document === 'profile' ? 'profile' : 'catalogue',
    // VISIT_KINDS itself, never a copy of it. A kind added to the shared module is then
    // recognised here the moment it exists; the hand-typed copy this replaced would have
    // let it fall through and be counted as a person, silently and with no type error —
    // the list and its type widen together (whole-branch review, 2026-09-16).
    kind: (VISIT_KINDS.includes(doc.kind as VisitRow['kind'])
      ? doc.kind
      : 'person') as VisitRow['kind'],
    visitor: text(doc.visitor),
    opens: num(doc.opens),
    furthestPage: num(doc.furthestPage),
    pagesTotal: num(doc.pagesTotal),
    downloads: num(doc.downloads),
    country: text(doc.country),
    city: text(doc.city),
    device: text(doc.device),
  }
}

/**
 * The last-7-days and last-30-days summaries for the admin's "Document visits" list
 * (Task 2), plus the most recent weekly-email outcome (Task 8's own table). One
 * `find` for the visit rows — sliced in memory into "last 7" rather than queried
 * twice, since the 30-day set is a superset — and one for the newest email row.
 */
export async function loadVisitSummaries(
  payload: Pick<BasePayload, 'find'>,
  now: Date,
): Promise<VisitSummaries> {
  const today = pakistanDay(now)
  const since30 = addDays(today, -29)
  const since7 = addDays(today, -6)

  const visits = await payload.find({
    collection: 'document-visits',
    where: { day: { greater_than_equal: since30 } },
    pagination: false,
    depth: 0,
  })

  const rows = visits.docs.map((doc) => toVisitRow(doc as unknown as Record<string, unknown>))
  const last7Rows = rows.filter((row) => row.day >= since7)

  const emails = await payload.find({
    collection: 'document-visit-emails',
    sort: '-week',
    limit: 1,
    depth: 0,
  })
  const emailDoc = emails.docs[0] as unknown as Record<string, unknown> | undefined
  const lastEmail: LastWeeklyEmail | null = emailDoc
    ? {
        week: text(emailDoc.week),
        status: emailDoc.status === 'sent' ? 'sent' : 'failed',
        sentAt: (emailDoc.sentAt as string | null | undefined) ?? null,
        error: text(emailDoc.error),
      }
    : null

  return {
    today,
    last7: summariseVisits(last7Rows, 5),
    last30: summariseVisits(rows, 5),
    lastEmail,
  }
}
