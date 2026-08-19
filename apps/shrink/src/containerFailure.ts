/**
 * Reads the reason a shrink container returned a non-OK response.
 *
 * Separate from index.ts on purpose: that file imports @cloudflare/containers,
 * which imports `cloudflare:workers`, so it cannot be loaded in plain vitest —
 * measured, a probe importing it fails with "Cannot find package
 * 'cloudflare:workers'". Same reason the container's pure half lives in
 * container/report.ts.
 */

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
export async function readContainerFailure(res: Response): Promise<string> {
  const header = res.headers.get('x-shrink-report')
  if (header) {
    try {
      const report = JSON.parse(atob(header)) as FailureReport
      if (report?.error) return report.error
    } catch {
      // Unparsable header falls through to the body, below.
    }
  }
  const body = await res.text().catch(() => '')
  return body.slice(0, 500)
}
