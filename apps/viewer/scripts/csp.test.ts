import { describe, expect, it } from 'vitest'
import { SHARED_SECURITY_HEADERS } from '../worker/securityHeaders'
import { buildCsp, buildHeadersFile } from './csp.mjs'

/**
 * First tests of any kind for the CSP builder, added 2026-08-05.
 *
 * It had none, despite having caused two production incidents on its own:
 * the missing self-hosted decoder location (2026-07-29), and the missing `blob:`
 * in connect-src that tripped every meshopt-compressed garment on load. Both were
 * invisible to the suite for the same reason everything else here has been —
 * nothing exercised the policy that actually ships.
 */

const API = 'https://cms.wear-run.help'

/** Pull one directive out of the `a; b; c` policy string. */
function directive(csp: string, name: string): string {
  const found = csp.split('; ').find((d) => d === name || d.startsWith(`${name} `))
  expect(found, `directive ${name} missing from policy`).toBeDefined()
  return found as string
}

const countHashes = (csp: string) => (csp.match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? []).length

const THEME_BOOTSTRAP = `<script>document.documentElement.dataset.theme='dark'</script>`
const BEACON =
  `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" ` +
  `data-cf-beacon='{"token":"abc123"}'></script>`

describe('buildCsp — inline script hashing', () => {
  it('hashes the inline theme bootstrap', () => {
    const csp = buildCsp({ html: THEME_BOOTSTRAP, apiBaseUrl: API })
    expect(countHashes(csp)).toBe(1)
  })

  // The whole reason the Cloudflare beacon can be embedded at all. Automatic Setup
  // injected an INLINE bootstrap at the edge, after the build had already computed
  // its hashes, so the policy blocked it on every page load and the beacon never
  // ran. A `src` script needs no hash — but only if the builder agrees.
  it('adding the beacon <script src> does not add a hash', () => {
    const withBeacon = buildCsp({ html: THEME_BOOTSTRAP + BEACON, apiBaseUrl: API })
    const without = buildCsp({ html: THEME_BOOTSTRAP, apiBaseUrl: API })
    expect(countHashes(withBeacon)).toBe(countHashes(without))
    expect(countHashes(withBeacon)).toBe(1)
  })

  // This is what actually exercises the negative lookahead. A src script normally
  // has an empty body, which the `if (!body) continue` guard would skip anyway —
  // so without a body here, a broken lookahead would still pass.
  it('does not hash a src script that also has a body', () => {
    const html = `<script src="/fallback.js">console.log('never executed')</script>`
    expect(buildCsp({ html, apiBaseUrl: API })).not.toMatch(/sha256-/)
  })
})

describe('buildCsp — origins the live viewer cannot work without', () => {
  it('allows the Cloudflare beacon to load and to report', () => {
    const csp = buildCsp({ html: THEME_BOOTSTRAP, apiBaseUrl: API })
    // Manual embeds load from static.cloudflareinsights.com and POST to
    // cloudflareinsights.com/cdn-cgi/rum — automatic setup posts to the site's own
    // origin instead, so dropping either of these silently kills analytics.
    expect(directive(csp, 'script-src')).toContain('https://static.cloudflareinsights.com')
    expect(directive(csp, 'connect-src')).toContain('https://cloudflareinsights.com')
  })

  // 2026-07-29: the Meshopt decoder builds its worker from a Blob and Chromium
  // checks that fetch against connect-src as well as worker-src. EVERY production
  // GLB is EXT_meshopt_compression, so without these the real garment trips a CSP
  // violation on load — while the uncompressed seeded placeholder passed.
  it('keeps blob: in both connect-src and worker-src for the Meshopt decoder', () => {
    const csp = buildCsp({ html: THEME_BOOTSTRAP, apiBaseUrl: API })
    expect(directive(csp, 'connect-src')).toContain('blob:')
    expect(directive(csp, 'worker-src')).toContain('blob:')
  })

  it('lets the app reach whichever API origin it was built against', () => {
    const csp = buildCsp({
      html: THEME_BOOTSTRAP,
      apiBaseUrl: 'https://staging-cms.example.com/api',
    })
    expect(directive(csp, 'connect-src')).toContain('https://staging-cms.example.com')
    expect(directive(csp, 'img-src')).toContain('https://staging-cms.example.com')
  })

  it('falls back to the production API origin when the build-time URL is unusable', () => {
    const csp = buildCsp({ html: THEME_BOOTSTRAP, apiBaseUrl: 'not a url' })
    expect(directive(csp, 'connect-src')).toContain('https://cms.wear-run.help')
  })

  it('adds a Sentry ingest origin only when a DSN is configured', () => {
    const withDsn = buildCsp({
      html: THEME_BOOTSTRAP,
      apiBaseUrl: API,
      sentryDsn: 'https://key@o123.ingest.sentry.io/456',
    })
    expect(directive(withDsn, 'connect-src')).toContain('https://o123.ingest.sentry.io')

    const without = buildCsp({ html: THEME_BOOTSTRAP, apiBaseUrl: API })
    expect(directive(without, 'connect-src')).not.toContain('sentry')
    // A missing DSN must not leave a double space or a dangling separator behind.
    expect(directive(without, 'connect-src')).not.toMatch(/\s{2,}|\s$/)
  })
})

describe('buildCsp — the standing rules', () => {
  // CLAUDE.md: never widen to 'unsafe-inline' to make an inline script work. That
  // is the shortcut this policy exists to refuse, and the one a future session
  // reaching for a quick fix will be tempted by.
  it("never allows 'unsafe-inline' in script-src", () => {
    const csp = buildCsp({ html: THEME_BOOTSTRAP + BEACON, apiBaseUrl: API })
    expect(directive(csp, 'script-src')).not.toContain(`'unsafe-inline'`)
  })

  it('keeps the lockdown directives that have no reason to change', () => {
    const csp = buildCsp({ html: THEME_BOOTSTRAP, apiBaseUrl: API })
    expect(csp).toContain(`object-src 'none'`)
    // NOT `'none'` since 2026-08-11. The CMS shows the live customer page beside
    // the edit form, which is an iframe, so exactly two origins may embed the
    // viewer and everything else is still refused. Pinned here because widening
    // this list is the one change to this directive that would matter, and it
    // must never happen by accident.
    expect(csp).toContain(`frame-ancestors 'self' https://cms.wear-run.help`)
    expect(csp).toContain(`base-uri 'self'`)
    expect(csp).toContain(`default-src 'self'`)
  })
})

/**
 * The directive lines belonging to a path rule in a `_headers` file.
 *
 * Module scope rather than inside the describe below: the Worker-drift block at
 * the bottom of this file reads the same `/*` rule, and two copies of the parser
 * would be one more thing able to disagree.
 */
function ruleFor(out: string, path: string): string[] {
  const lines = out.split('\n')
  const start = lines.findIndex((l) => l.trim() === path)
  expect(start, `no rule for ${path}`).toBeGreaterThan(-1)
  const body: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] as string
    if (!line.startsWith('  ')) break
    body.push(line.trim())
  }
  return body
}

describe('buildHeadersFile — the _headers file', () => {
  // NOT a caching tweak, despite sitting on a Cache-Control line. Cloudflare
  // injects Bot Fight Mode's JavaScript Detections into HTML responses; that
  // inline script trips the CSP on every page load, and no hash can ever cover it
  // because it embeds a per-request ray id (three different sha256 values measured
  // inside a minute, 2026-08-06). JSD cannot be disabled separately — Cloudflare
  // bundles it with Bot Fight Mode — so refusing the transform is the only fix
  // that neither widens the policy to 'unsafe-inline' nor turns off bot protection
  // for the whole zone, CMS login included.
  //
  // ⚠️ It only reaches the LITERAL /index.html, not the SPA routes visitors open —
  // measured after deploying on 2026-08-06. So the violation is NOT yet fixed; see
  // the comment in csp.mjs. This test pins the directive that is there, it does not
  // certify that the injection has stopped. Only a live page load can say that.
  it('keeps no-transform on the SPA shell — this is what suppresses the CSP violation', () => {
    const cc = ruleFor(
      buildHeadersFile({ html: THEME_BOOTSTRAP, apiBaseUrl: API }),
      '/index.html',
    ).find((l) => l.toLowerCase().startsWith('cache-control:'))
    expect(cc).toBeDefined()
    expect(cc).toContain('no-transform')
  })

  // no-transform must NOT be moved to /* to widen its reach. Cloudflare joins
  // duplicate headers from multiple matching rules with a comma instead of picking
  // a winner, so a Cache-Control on /* would append to this one and ship
  //   public, max-age=31536000, immutable, public, max-age=0, must-revalidate
  // on every hashed bundle. This test is the tripwire for that edit.
  it('leaves hashed assets on immutable caching, untouched by the shell rule', () => {
    const cc = ruleFor(
      buildHeadersFile({ html: THEME_BOOTSTRAP, apiBaseUrl: API }),
      '/assets/*',
    ).find((l) => l.toLowerCase().startsWith('cache-control:'))
    expect(cc).toContain('immutable')
    expect(cc).toContain('max-age=31536000')
    expect(cc).not.toContain('max-age=0')
  })

  it('emits the CSP and the other security headers on every path', () => {
    const rule = ruleFor(buildHeadersFile({ html: THEME_BOOTSTRAP, apiBaseUrl: API }), '/*')
    const joined = rule.join('\n')
    expect(joined).toContain('Content-Security-Policy:')
    expect(joined).toContain('X-Content-Type-Options: nosniff')
    expect(joined).toContain('Strict-Transport-Security:')
    // No Cache-Control here: /* would match hashed assets too.
    expect(joined.toLowerCase()).not.toContain('cache-control:')
  })
})

/**
 * `_headers` is applied by the STATIC ASSET HANDLER, so a response the Worker
 * builds itself (`new Response(...)`) carries none of it. Measured on the live
 * edge 2026-08-12: `/render`'s asset-served 200 carried all five security
 * headers and its Worker-built 400 carried none — see worker/securityHeaders.ts.
 *
 * That fix necessarily restates four header values in Worker code. This is the
 * test that stops the two copies drifting: it reads the `/*` rule out of the
 * builder that actually WRITES `_headers` and compares it to what the Worker
 * sends. Editing one HSTS max-age and not the other now fails here rather than
 * in production, where only a header dump would ever have shown it.
 *
 * The CSP is deliberately NOT compared — the Worker's is tighter on purpose
 * (`default-src 'none'`, no framing) because those responses are plain text.
 * That difference is pinned in worker/securityHeaders.test.ts.
 */
describe('Worker-built responses do not drift from _headers', () => {
  it('sends byte-identical values for every header the /* rule also sets', () => {
    const rule = ruleFor(buildHeadersFile({ html: THEME_BOOTSTRAP, apiBaseUrl: API }), '/*')

    for (const [name, value] of Object.entries(SHARED_SECURITY_HEADERS)) {
      const shipped = rule.find((line) => line.toLowerCase().startsWith(`${name.toLowerCase()}:`))
      expect(shipped, `${name} is not in the /* rule of _headers`).toBeDefined()
      expect(shipped?.slice(name.length + 1).trim()).toBe(value)
    }
  })

  it('covers every non-CSP header the /* rule sets, so a new one cannot be missed', () => {
    // The failure this guards is additive: someone adds a sixth security header
    // to _headers, every existing assertion still passes, and Worker-built
    // responses quietly lack it. Compare the SETS, not just the values.
    const shipped = ruleFor(buildHeadersFile({ html: THEME_BOOTSTRAP, apiBaseUrl: API }), '/*')
      .map((line) => line.split(':')[0]?.trim())
      .filter((name): name is string => Boolean(name) && name !== 'Content-Security-Policy')

    expect(shipped.slice().sort()).toEqual(Object.keys(SHARED_SECURITY_HEADERS).slice().sort())
  })
})
