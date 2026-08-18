import { withPayload } from '@payloadcms/next/withPayload'
import { describe, expect, it } from 'vitest'
import {
  effectiveHeader,
  PUBLIC_VIEWER_VARY,
  withPublicViewerVary,
} from '../publicViewerHeaders.mjs'

/**
 * L1, second attempt. THIS TEST EXISTS BECAUSE THE FIRST ONE COULD NOT FAIL.
 *
 * `publicViewer.test.ts` asserts that the handler's returned `Response` carries
 * `Vary: Origin, …`. It does, it always did, and it passed on every run — while
 * production served `vary: Sec-CH-Prefers-Color-Scheme` with no `Origin` for the
 * entire time L1 was believed fixed. The assertion was true one layer above where
 * the behaviour is decided.
 *
 * So this test never inspects a header we set. It asks the question a client asks:
 * given every rule Next will apply, in order, WHICH ONE WINS. And it runs the real
 * `withPayload`, so the day Payload changes its own header rule, this fails here
 * rather than in production.
 *
 * Do not replace this with a string match on next.config.mjs. The bug was never a
 * missing string — it was a losing position in an array.
 */

const VIEWER_PATH = '/api/public/viewer/rxps/wine'

/**
 * Resolve a config's header rules, refusing to guess if `headers()` is missing.
 * A silent `?? []` here would turn "Payload stopped emitting header rules" into an
 * empty array and a passing negative control, which is the failure mode this whole
 * file exists to avoid.
 */
const rulesOf = async (config: { headers?: () => unknown }) => {
  const headers = config.headers
  if (typeof headers !== 'function') {
    throw new Error('config has no headers() — withPayload changed shape')
  }
  return await headers()
}

/** Stands in for the app's own SECURITY_HEADERS rule, which Payload wraps. */
const appConfig = () => ({
  headers: async () => [
    { source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] },
  ],
})

describe('public viewer Vary header', () => {
  it('NEGATIVE CONTROL: without the wrapper, Payload overrides Vary and Origin is lost', async () => {
    // This is the shipped-and-inert state, reproduced. If this assertion ever
    // starts failing, Payload stopped appending its blanket rule and the wrapper
    // below may no longer be needed — check before deleting anything.
    const rules = await rulesOf(withPayload(appConfig()))

    expect(effectiveHeader(rules, VIEWER_PATH, 'Vary')).toBe('Sec-CH-Prefers-Color-Scheme')
    expect(effectiveHeader(rules, VIEWER_PATH, 'Vary')).not.toContain('Origin')
  })

  it('sends Origin on the public viewer API, because the rule is appended last', async () => {
    const rules = await rulesOf(withPublicViewerVary(withPayload(appConfig())))

    expect(effectiveHeader(rules, VIEWER_PATH, 'Vary')).toBe(PUBLIC_VIEWER_VARY)
    expect(effectiveHeader(rules, VIEWER_PATH, 'Vary')).toContain('Origin')
  })

  it('still varies on the colour-scheme hint, which the override would otherwise drop', async () => {
    // The rule replaces Payload's on this path rather than merging with it, so
    // omitting this token here would silently narrow the header.
    const rules = await rulesOf(withPublicViewerVary(withPayload(appConfig())))

    expect(effectiveHeader(rules, VIEWER_PATH, 'Vary')).toContain('Sec-CH-Prefers-Color-Scheme')
  })

  it("leaves /admin on Payload's own Vary, so theme detection is untouched", async () => {
    // Payload uses Sec-CH-Prefers-Color-Scheme to pick the admin theme. Widening
    // Vary across every path would change caching for the whole admin for a
    // reason that only applies to one public endpoint.
    const rules = await rulesOf(withPublicViewerVary(withPayload(appConfig())))

    expect(effectiveHeader(rules, '/admin', 'Vary')).toBe('Sec-CH-Prefers-Color-Scheme')
  })

  it('does not disturb the security headers the app already sets', async () => {
    const rules = await rulesOf(withPublicViewerVary(withPayload(appConfig())))

    expect(effectiveHeader(rules, VIEWER_PATH, 'X-Content-Type-Options')).toBe('nosniff')
  })
})
