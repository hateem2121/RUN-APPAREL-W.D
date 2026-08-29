/**
 * A failure that retrying cannot fix — the output was too big, the raw file is not
 * usable, the file is not valid glTF, the CMS refused the document. Retrying these
 * costs several minutes of `standard-4` container time each, three times over, for a
 * guaranteed identical result; on a $5/month budget that matters. Transient failures
 * (container 5xx, a dropped CMS call) still retry.
 *
 * Lives in its own module so `queueDecisions.ts` can import it without pulling in
 * `index.ts`, which imports `@cloudflare/containers` and therefore `cloudflare:workers`
 * — a Workers-runtime module that cannot resolve under plain Node. That single import
 * is why the queue handler could not be unit-tested at all.
 */
export class PermanentJobError extends Error {
  readonly permanent = true
}
