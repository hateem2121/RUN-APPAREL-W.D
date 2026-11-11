/**
 * A visitor's page or tap that the shared store does not hold is never left waiting on a cold
 * SitePages (store-miss hedge: spec docs/superpowers/specs/2026-10-27-store-misses-design.md option
 * A, owner's yes 27 Oct; plan docs/superpowers/plans/2026-10-28-store-miss-hedge.md; built 11 Nov
 * 2026, owner's yes to ~13% more CPU, about $0.20 a month).
 *
 * WHY. On a store miss Workers Cache runs SitePages in the data centre that draws for that region,
 * and a SitePages that has not run there for a while starts cold: 11 Nov logs, the wait before it
 * started was p50 1,177 ms (50 of 55 over 700 ms) when it had not run there for 10 minutes, and
 * p50 21–252 ms when it had run within the minute. Page misses took up to 4,001 ms at p95 (24 h).
 * The default entrypoint, near the visitor, serves every request and is warm. So it waits a head
 * start for the store, then also reads the shared copy (pageCopy.mjs) and draws the page itself,
 * and the visitor gets whichever answer starts first.
 *
 * ⚠️ THE STORE'S LOSING ANSWER IS READ TO THE END in waitUntil, so the store still keeps the page
 * for the next visitor (step 0.2, 27 Oct: 9 of 9 kept after the caller stopped waiting).
 * ⚠️ NOTHING HERE MAKES A PAGE FAIL: every failure falls back to the other answers, and when all
 * fail the caller draws the page as before the store.
 */

/** The larger of the page and tap hit p95 (39 ms and 13 ms, 24 h to 11 Nov 2026), rounded up. */
export const HEDGE_HEAD_START_MS = 40

/** Our warm-up robot and Globalping's probes: nobody waits on them (plan ruling 1, 28 Oct). */
const NEVER_HEDGED_AGENTS = /run-apparel-store-warmup|globalping/i

/** The shape of a page of the site: lower-case words, digits, hyphens, up to three segments. */
const PAGE_SHAPED = /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+){0,2})?\/?$/

/**
 * Whether a person is waiting on this request: a GET for a page-shaped path, not a fetch-ahead,
 * not our warm-up robot or Globalping. Scanner paths (`.php`, `.env`) are never drawn twice.
 *
 * @param {Request} request
 */
export function hedgeable(request) {
  if (request.method !== 'GET') return false
  if (request.headers.get('next-router-prefetch')) return false
  if (NEVER_HEDGED_AGENTS.test(request.headers.get('user-agent') ?? '')) return false
  return PAGE_SHAPED.test(new URL(request.url).pathname)
}

/**
 * On unless the wrangler var STORE_HEDGE says `off` (apps/cms/wrangler.jsonc). Turning it off takes a
 * PR and a deploy, as PAGE_COPY does.
 *
 * ⚠️ NEVER READ THIS FROM KV AGAIN (11 Nov 2026). It was KV `store-hedge`, read once per 30 s per
 * Worker copy, and the read sat between the page keys and the store: in a quiet data centre every
 * visit paid one more KV trip. UptimeRobot's home-page checks went from a median 105 ms (10 Nov) to
 * 188–203 ms (11 Nov); a probe every 10 s saw 170–205 ms on exactly every third request, on two
 * pages at once. A var costs nothing to read.
 *
 * @param {{ STORE_HEDGE?: string } | undefined} env
 * @returns {boolean}
 */
export function hedgeOn(env) {
  return env?.STORE_HEDGE !== 'off'
}

/** Read a losing answer's body to the end, so Workers Cache stores what it drew. */
function drain(answer) {
  return answer
    .then((response) => response?.body?.pipeTo(new WritableStream()))
    .catch((error) => console.error('[store-hedge] the store answer could not be kept', error))
}

/** Throw a losing answer away without reading it. */
function discard(answer) {
  return answer.then((response) => response?.body?.cancel()).catch(() => {})
}

/**
 * The first answer to start: the store's, the shared copy's, or a direct drawing's.
 *
 * - Within the head start only the store is asked: a hit costs nothing extra.
 * - After it, `askCopy` (when given) and `drawDirect` start too.
 * - The store wins whatever it answers; a copy only when it found one (not null); a drawing only
 *   when it is not a 5xx while the store is still drawing (plan ruling 3: the store's answer is
 *   the one the site would have given anyway). A held 5xx is served only if the store fails.
 * - Null when the store fails inside the head start (the caller draws once, not twice) or when
 *   every answer fails.
 *
 * @param {{
 *   askStore: () => Promise<Response>,
 *   drawDirect: () => Promise<Response>,
 *   askCopy?: () => Promise<Response | null>,
 *   headStartMs: number,
 *   waitUntil: (promise: Promise<unknown>) => void,
 * }} options `waitUntil` must be bound: `(p) => ctx.waitUntil(p)` (Cloudflare: destructuring
 *   `ctx` throws "Illegal invocation").
 * @returns {Promise<{ response: Response, winner: 'store' | 'copy' | 'direct' } | null>}
 */
export async function hedgedAnswer({ askStore, drawDirect, askCopy, headStartMs, waitUntil }) {
  const store = askStore()
  const tag = (who, promise) =>
    promise.then(
      (response) => ({ who, response }),
      (error) => ({ who, error }),
    )

  let timer
  const headStart = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ who: 'late' }), headStartMs)
  })
  const early = await Promise.race([tag('store', store), headStart])
  clearTimeout(timer)
  if (early.who === 'store') {
    return early.error ? null : { response: early.response, winner: 'store' }
  }

  const answers = { store, direct: drawDirect() }
  if (askCopy) answers.copy = askCopy()
  const pending = new Map(Object.entries(answers).map(([who, p]) => [who, tag(who, p)]))
  /** @type {Response | null} */
  let heldFailure = null
  let won = null

  while (pending.size > 0 && !won) {
    const settled = await Promise.race(pending.values())
    pending.delete(settled.who)
    if (settled.error || !settled.response) continue
    if (settled.who === 'direct' && settled.response.status >= 500 && pending.has('store')) {
      heldFailure = settled.response
      continue
    }
    won = { response: settled.response, winner: settled.who }
  }

  if (!won && heldFailure) won = { response: heldFailure, winner: 'direct' }
  else if (heldFailure) waitUntil(discard(Promise.resolve(heldFailure)))
  for (const who of pending.keys()) {
    waitUntil(who === 'store' ? drain(answers.store) : discard(answers[who]))
  }
  return won
}
