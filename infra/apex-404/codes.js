/**
 * Link codes: normalising what arrived, and comparing it without leaking timing.
 *
 * WHY CONSTANT TIME. A comparison that stops at the first wrong character answers a
 * little faster the more of a guess is wrong, and that difference can be measured
 * across many requests. Cloudflare's own guidance is `crypto.subtle.timingSafeEqual`,
 * and — because it throws on unequal lengths — to compare the INPUT WITH ITSELF and
 * negate when the lengths differ, so a wrong length costs the same as a wrong letter
 * (developers.cloudflare.com/workers/examples/protect-against-timing-attacks/,
 * 2026-04-23).
 *
 * The comparator is a parameter only because Node has no `crypto.subtle.timingSafeEqual`:
 * the unit tests pass Node's. Production passes nothing and gets the Workers one.
 */

/** Lowercase letters and digits in hyphen-joined words, at most 64 characters. */
const CODE_SHAPE = /^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Lower-case one path segment and accept it only if it is shaped like a code.
 *
 * A messaging app may capitalise the first letter of a pasted link, so case is
 * forgiven. Nothing else is: a `%`-encoded byte, a space or a stray character is a miss,
 * decided WITHOUT touching the secret.
 *
 * @param {string} segment one path segment, exactly as it arrived
 * @returns {string | null}
 */
export function normaliseCode(segment) {
  const lowered = segment.toLowerCase()
  return CODE_SHAPE.test(lowered) ? lowered : null
}

/**
 * @typedef {(a: Uint8Array, b: Uint8Array) => boolean} TimingSafeEqual
 */

/**
 * Does a normalised code equal this document's secret?
 *
 * ⚠️ FAILS CLOSED. An unset or blank secret matches nothing, so a deploy that forgot
 * the secret shows "not active" rather than anything else. CI also refuses to deploy
 * without both secret names (`.github/workflows/ci.yml`).
 *
 * @param {string} candidate output of `normaliseCode`
 * @param {string | undefined} secret the Worker secret for this host's document
 * @param {TimingSafeEqual} [timingSafeEqual]
 * @returns {boolean}
 */
export function codesMatch(candidate, secret, timingSafeEqual) {
  if (typeof secret !== 'string' || secret.trim() === '') return false
  const equal = timingSafeEqual ?? ((a, b) => crypto.subtle.timingSafeEqual(a, b))
  const encoder = new TextEncoder()
  const given = encoder.encode(candidate)
  const expected = encoder.encode(secret.trim().toLowerCase())
  return given.byteLength === expected.byteLength ? equal(given, expected) : !equal(given, given)
}
