import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps, Payload, PayloadRequest } from 'payload'
import { collectPublishProblems, toGateColourways } from '../collections/publishGating'
import { LABELS as RAW_UPLOAD_STATUS_LABELS } from '../collections/RawUploadStatusCell'
import type { Product, RawUpload } from '../payload-types'

/**
 * "What needs doing?" — replaces Payload's own dashboard, which lists
 * collections. That answers "what is there?" and never "what is waiting for
 * me?"; fine at one garment, the whole job at 100+. Wired up in
 * payload.config.ts via admin.components.views.dashboard.
 *
 * VERIFIED AGAINST THE INSTALLED PAYLOAD 3.86.0 TYPINGS AND RUNTIME, NOT
 * ASSUMED — see task-4-12-report.md for the full trail:
 *
 *   - `admin.components.views.dashboard.Component` really does replace the
 *     "/admin" landing page rather than merely add to it. The route table in
 *     @payloadcms/next (views/Root/getRouteData.js) hardcodes its OWN
 *     `DashboardView` for the zero-segment route, but that component's whole
 *     job is to read `config.admin.components.views.dashboard.Component` and
 *     render it via `RenderServerComponent`, falling back to Payload's real
 *     default dashboard when unset (views/Dashboard/index.js). One hop more
 *     indirect than it looks from the config shape alone.
 *   - The props are `AdminViewServerProps`. `payload` is a direct prop
 *     (`ServerProps.payload`); the request is NOT — no admin-view prop type in
 *     3.86.0 puts a bare `req` on the top-level props, only nested at
 *     `initPageResult.req: PayloadRequest`.
 *   - Access: RootPage (views/Root/index.js) redirects to login before this
 *     ever renders unless `permissions.canAccessAdmin` is true — the same gate
 *     every other admin page uses. That check has an escape hatch
 *     (`isCustomAdminView`) for a registered view with an explicit `path`, but
 *     the `dashboard` key is not given one here, so the escape hatch does not
 *     match and the ordinary gate applies. `overrideAccess: false` below is
 *     defence in depth on top of that, not a substitute for it.
 *
 * Reuses `collectPublishProblems`/`toGateColourways` (./publishGating.ts)
 * rather than restating the publish rules — see ../fields/ReadinessPanel.tsx,
 * the client-side sibling that runs the same function against an open form.
 * THE SAME GAP APPLIES HERE: the artwork verdict lives on the Media document,
 * not on the product, so a product blocked only by damaged artwork reads as
 * "ready" below even though the real gate still refuses it on save. Left out
 * for the same reason ReadinessPanel leaves it out — a second copy of that
 * check is worse than none, because it would drift from the real one.
 */

// Bounds the "being processed" query. Generous on purpose — a job takes 1-2
// minutes, so this list is realistically tiny — but per CLAUDE.md's documented
// incident about a silently truncated list reading as "nothing else is wrong",
// any cap on a query must say how many it left out. See `notShown` below.
const PROCESSING_DISPLAY_LIMIT = 50

// Bounds RENDERING only. The ready/not-ready split further down is computed
// over every draft (`pagination: false`), never a page of them — a `limit` on
// THAT query would make "N ready to publish" a guess at 100+ garments, exactly
// the shape of incident this file's CLAUDE.md entry warns about.
const MISSING_DISPLAY_LIMIT = 100

type ProcessingResult = { error: true } | { error: false; docs: RawUpload[]; notShown: number }

type EvaluatedDraft = { product: Product; problems: string[] }

type DraftsResult =
  | { error: true }
  | { error: false; ready: EvaluatedDraft[]; notReady: EvaluatedDraft[] }

async function loadProcessing(payload: Payload, req: PayloadRequest): Promise<ProcessingResult> {
  try {
    const result = await payload.find({
      collection: 'raw-uploads',
      where: { status: { in: ['queued', 'processing'] } },
      sort: '-createdAt',
      limit: PROCESSING_DISPLAY_LIMIT,
      depth: 0,
      overrideAccess: false,
      req,
    })
    return {
      error: false,
      docs: result.docs,
      notShown: Math.max(0, result.totalDocs - result.docs.length),
    }
  } catch (err) {
    payload.logger.error(
      `Dashboard: failed to load processing raw uploads: ${err instanceof Error ? err.message : String(err)}`,
    )
    return { error: true }
  }
}

async function loadDrafts(payload: Payload, req: PayloadRequest): Promise<DraftsResult> {
  try {
    const result = await payload.find({
      collection: 'products',
      where: { status: { equals: 'draft' } },
      sort: 'productCode',
      depth: 0,
      // Every draft, not a page of them — see MISSING_DISPLAY_LIMIT above.
      pagination: false,
      overrideAccess: false,
      req,
    })

    const evaluated: EvaluatedDraft[] = result.docs.map((product) => ({
      product,
      problems: collectPublishProblems(
        {
          id: product.id,
          // Evaluated as though it were being published, whatever its real
          // Status is — the same trick ReadinessPanel.tsx uses on the open
          // form. "What's left?" is most useful before the owner switches
          // Status over, not after.
          status: 'published',
          variantMode: product.variantMode,
          glbAsset: product.glbAsset,
          variantsVerified: product.variantsVerified,
        },
        toGateColourways(product.colourways),
      ),
    }))

    return {
      error: false,
      ready: evaluated.filter((entry) => entry.problems.length === 0),
      notReady: evaluated.filter((entry) => entry.problems.length > 0),
    }
  } catch (err) {
    payload.logger.error(
      `Dashboard: failed to load draft products: ${err instanceof Error ? err.message : String(err)}`,
    )
    return { error: true }
  }
}

export const Dashboard = async ({ payload, initPageResult }: AdminViewServerProps) => {
  const { req } = initPageResult
  const [processing, drafts] = await Promise.all([
    loadProcessing(payload, req),
    loadDrafts(payload, req),
  ])

  return (
    <Gutter className="dashboard">
      <h1>What needs doing</h1>

      <section style={{ marginBottom: 32 }}>
        <h2>Being processed</h2>
        {processing.error ? (
          <p className="field-description">Could not load right now — try refreshing.</p>
        ) : processing.docs.length === 0 ? (
          <p className="field-description">Nothing is being shrunk right now.</p>
        ) : (
          <>
            <ul>
              {processing.docs.map((upload) => (
                <li key={upload.id}>
                  <a href={`/admin/collections/raw-uploads/${upload.id}`}>
                    {upload.filename ?? `Upload ${upload.id}`}
                  </a>
                  {' — '}
                  {(upload.status && RAW_UPLOAD_STATUS_LABELS[upload.status]) ?? upload.status}
                </li>
              ))}
            </ul>
            {processing.notShown > 0 ? (
              <p className="field-description">{processing.notShown} more not shown.</p>
            ) : null}
          </>
        )}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2>Ready to publish</h2>
        {drafts.error ? (
          <p className="field-description">Could not load right now — try refreshing.</p>
        ) : (
          <p>
            {drafts.ready.length} draft{drafts.ready.length === 1 ? '' : 's'} ready to publish.
          </p>
        )}
      </section>

      <section>
        <h2>Still missing something{drafts.error ? '' : ` (${drafts.notReady.length})`}</h2>
        {drafts.error ? (
          <p className="field-description">Could not load right now — try refreshing.</p>
        ) : drafts.notReady.length === 0 ? (
          <p className="field-description">No draft is missing anything it needs to publish.</p>
        ) : (
          <>
            <ul>
              {drafts.notReady.slice(0, MISSING_DISPLAY_LIMIT).map(({ product, problems }) => (
                <li key={product.id} style={{ marginBottom: 12 }}>
                  <a href={`/admin/collections/products/${product.id}`}>
                    {product.productCode} — {product.productName}
                  </a>
                  <ul>
                    {problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            {drafts.notReady.length > MISSING_DISPLAY_LIMIT ? (
              <p className="field-description">
                {drafts.notReady.length - MISSING_DISPLAY_LIMIT} more not shown.
              </p>
            ) : null}
          </>
        )}
      </section>
    </Gutter>
  )
}
