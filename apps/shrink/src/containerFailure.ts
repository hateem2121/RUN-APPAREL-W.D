/**
 * Reads the reason a shrink container returned a non-OK response.
 *
 * Separate from index.ts on purpose: that file imports @cloudflare/containers,
 * which imports `cloudflare:workers`, so it cannot be loaded in plain vitest —
 * measured, a probe importing it fails with "Cannot find package
 * 'cloudflare:workers'". Same reason the container's pure half lives in
 * container/report.ts.
 */

/**
 * Decode the container's base64 `x-shrink-report` back into text.
 *
 * ⚠️ `atob` ALONE CORRUPTS EVERY NON-ASCII CHARACTER, AND IT DID — measured on the
 * live report of 2026-09-04, the first real garment through the container since the
 * pipeline fix plan deployed.
 *
 * The container is correct: `Buffer.from(JSON.stringify(report))` defaults to utf8, so
 * the header carries proper UTF-8 bytes. But `atob` returns a BINARY STRING — one
 * JavaScript character per byte, i.e. Latin-1 — so a three-byte `→` arrives as three
 * separate characters. Serialising that to the CMS re-encodes each of them as UTF-8,
 * which is why D1 holds `c3 a2 c2 86 c2 92` where `e2 86 92` belongs and the owner
 * reads `Shrunk 16.1 MB â 1.8 MB` and `â ï¸ Ink vs cloth`.
 *
 * That report is the pipeline's whole human-readable output — the thing the owner reads
 * to decide whether to publish a garment — and its warning markers were the worst
 * affected, because `⚠️` is four bytes.
 *
 * Both readers of this header had the same bug (`readContainerFailure` below and
 * `decodeReport` in index.ts), so the decode lives here once. This module is the
 * testable half of the pair: index.ts imports `cloudflare:workers` and cannot be
 * loaded in plain vitest, which is why it exists at all.
 */
export function decodeReportHeader(header: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(header), (c) => c.charCodeAt(0)))
}

/** The subset of `x-shrink-report` this module needs. */
interface FailureReport {
  ok?: boolean
  error?: string
}

/**
 * The container's 500 body is deliberately generic — it used to echo
 * `error.message`, which CodeQL flagged as js/stack-trace-exposure and which can
 * carry mkdtemp paths. The detail lives in the header, so read that FIRST and keep
 * the body only as the fallback for a container old enough to still send it.
 *
 * THIS IS THE WHOLE POINT. Before this existed, index.ts read the BODY on a non-OK
 * response and never looked at the header, which is decoded only on the OK branch.
 * Genericising the body without this would have reduced every container failure to
 * "Container returned 500: " — silently, with every gate still green.
 */
/**
 * The container could not read the raw export from the ingest bucket because it is no
 * longer there (fix plan Rank 12, audit CI-01). The ingest bucket expires objects after
 * 14 days, so a retry after that — or a job that sat in the queue past it — hits S3's
 * 404. Until 2026-09-03 that was an ordinary error: retried twice against the same
 * absence, dead-lettered, and reported as "Could not read raw object … (404)", which
 * told the owner nothing about what to do.
 *
 * Returns the sentence for the owner when the detail is that failure, else null. The
 * caller throws it as a PermanentJobError: the object will not reappear on a retry.
 */
export function missingRawExport(detail: string): string | null {
  if (!/Could not read raw object .* from ingest \(404\)/.test(detail)) return null
  return (
    'The uploaded file has expired from the upload store, so there is nothing to shrink — ' +
    'uploads are kept for 14 days and this one is older. Upload the CLO export again as a new ' +
    'raw upload.'
  )
}

export async function readContainerFailure(res: Response): Promise<string> {
  const header = res.headers.get('x-shrink-report')
  if (header) {
    try {
      const report = JSON.parse(decodeReportHeader(header)) as FailureReport
      if (report?.error) return report.error
    } catch {
      // Unparsable header falls through to the body, below.
    }
  }
  const body = await res.text().catch(() => '')
  return body.slice(0, 500)
}
