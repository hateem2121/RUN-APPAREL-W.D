/**
 * One more try for a post-deploy smoke run that died because the CONNECTION dropped, never for one
 * whose checks failed.
 *
 * WHY. 11 Nov 2026, run 43065365716: rxps/wine's link-preview smoke crashed on
 * `Error: read ECONNRESET` after its checks had passed. The deploy job went red AFTER the release
 * was live, and every step behind it was skipped: the apex and security probes, IndexNow and the
 * region warm-up, so the buyers' region kept empty caches until someone ran it by hand. The same
 * smoke passed for all 20 garments minutes later. A dropped connection says nothing about the site.
 *
 * ⚠️ ONLY THE NETWORK IS RETRIED. A failed check (a 404 card, a wrong canonical) fails at once, as
 * before: retrying those would hide the very thing the gate exists to catch. And only ONCE: a
 * connection that drops twice is reported, both attempts in the log.
 */

/** Node's and undici's names for a connection that went away (not a site that answered badly). */
const NETWORK_DROP =
  /\b(ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|EPIPE|UND_ERR_[A-Z_]+)\b|fetch failed/

/**
 * @param {string} output a smoke run's whole output
 * @returns {boolean}
 */
export function droppedConnection(output) {
  return NETWORK_DROP.test(output)
}

/**
 * Run once; when that run failed on a dropped connection, run once more and answer with the second.
 *
 * @param {() => Promise<{ code: number | null, output: string }>} run
 * @returns {Promise<{ code: number | null, output: string }>}
 */
export async function withOneRetry(run) {
  const first = await run()
  if (first.code === 0 || !droppedConnection(first.output)) return first
  const second = await run()
  return {
    code: second.code,
    output: `${first.output.trimEnd()}\n   (dropped connection, tried once more)\n${second.output}`,
  }
}
