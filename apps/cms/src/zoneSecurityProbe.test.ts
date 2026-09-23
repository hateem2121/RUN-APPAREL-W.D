import { describe, expect, it } from 'vitest'
import {
  MEDIA_CORP,
  TARGETS,
  classifyHandshake,
  evaluate,
  parseHsts,
  samplesFromPayload,
} from '../../../scripts/zone-security-probe.mjs'

/**
 * Tests for the zone security probe.
 *
 * WHAT THIS PROBE GUARDS. Six settings applied live on 2026-08-30 — min TLS, SSL mode,
 * HSTS, CAA, an R2 custom-domain TLS floor and queue retention — live in Cloudflare's
 * control plane, not in this repository. The audit that produced them opened with a
 * Worker hand-edited in the dashboard that nothing here could see. Recording the
 * changes in prose does not stop them being undone; this does.
 *
 * ⚠️ THE MOST IMPORTANT TEST IN THIS FILE IS `blocked-by-client`, AND IT IS THE LEAST
 * OBVIOUS. On 2026-08-30 two separate instruments reported that TLS 1.0 was closed on
 * hosts where it was wide open:
 *
 *   - The shell check grepped for `Protocol : TLSv1`, which openssl prints as an echo
 *     of the version REQUESTED — even after the server sent a protocol-version alert.
 *     It matched against github.com, which refuses TLS 1.0.
 *   - The Node check, written the obvious way, returns
 *     `ERR_SSL_NO_PROTOCOLS_AVAILABLE` — because OpenSSL 3 will not put a TLS 1.0
 *     cipher suite on the wire without `ciphers: 'DEFAULT@SECLEVEL=0'`. Measured
 *     against cloudflare.com, which genuinely accepts TLS 1.0: with the override,
 *     ACCEPTED; without it, "refused".
 *
 * Both failures have the same shape — the CLIENT declined, and the result was read as
 * the SERVER refusing. A probe that makes that mistake reports a perfect score against
 * a zone with no TLS floor at all. So `classifyHandshake` separates the two, and
 * `evaluate` reports a client-side block as inconclusive, never as a pass.
 *
 * THE SECOND NON-OBVIOUS TEST is that TLS 1.2 must succeed before any refusal counts.
 * Without it, "the network is unreachable" and "every weak protocol is closed" produce
 * identical output — and an unreachable host would be scored as secure.
 */

/** A host in the state we want: modern TLS works, legacy refused, HSTS in force. */
const healthy = (host = 'viewer.wear-run.help') => ({
  host,
  tls10: 'refused-by-server',
  tls11: 'refused-by-server',
  tls12: 'accepted',
  hstsHeader: 'max-age=63072000; includeSubDomains',
  hstsStatus: 200,
  expectHsts: true,
})

describe('classifyHandshake', () => {
  it('reads a completed handshake as accepted', () => {
    expect(classifyHandshake({ connected: true })).toBe('accepted')
  })

  it.each([
    'ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION',
    'ERR_SSL_UNSUPPORTED_PROTOCOL',
    'ERR_SSL_WRONG_VERSION_NUMBER',
  ])('reads %s as the SERVER refusing', (code) => {
    expect(classifyHandshake({ connected: false, code })).toBe('refused-by-server')
  })

  it.each(['ERR_SSL_NO_PROTOCOLS_AVAILABLE', 'ERR_TLS_INVALID_PROTOCOL_VERSION'])(
    'reads %s as THIS PROCESS refusing, not the server',
    (code) => {
      // The whole probe turns on this distinction. Collapsing these into
      // "refused-by-server" makes every host on earth look locked down.
      expect(classifyHandshake({ connected: false, code })).toBe('blocked-by-client')
    },
  )

  it.each(['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', undefined])(
    'reads %s as unknown — it says nothing about TLS policy',
    (code) => {
      expect(classifyHandshake({ connected: false, code })).toBe('unknown')
    },
  )
})

describe('parseHsts', () => {
  it('reads max-age, includeSubDomains and preload', () => {
    const parsed = parseHsts('max-age=63072000; includeSubDomains')
    expect(parsed).toMatchObject({ present: true, maxAge: 63072000, includeSubDomains: true })
    expect(parsed.preload).toBe(false)
  })

  it('is case-insensitive — the header name and directives are not normalised for us', () => {
    expect(parseHsts('MAX-AGE=31536000; IncludeSubDomains; Preload')).toMatchObject({
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    })
  })

  it.each([null, undefined, ''])('treats %s as absent rather than throwing', (header) => {
    expect(parseHsts(header).present).toBe(false)
  })
})

describe('evaluate — the healthy case', () => {
  it('passes a fully locked-down host and counts it as measured', () => {
    const result = evaluate([healthy()])
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.measured).toBe(1)
  })
})

describe('evaluate — negative controls, each reproducing a real defect', () => {
  it('FAILS when TLS 1.0 is accepted — the media.wear-run.help state of 2026-08-30', () => {
    const result = evaluate([{ ...healthy('media.wear-run.help'), tls10: 'accepted' }])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('TLS 1.0 is ACCEPTED')
    // The message must name the fix, because the zone setting is NOT the fix here.
    expect(result.failures[0]).toContain('r2 bucket domain update')
  })

  it('FAILS when TLS 1.1 is accepted', () => {
    const result = evaluate([{ ...healthy(), tls11: 'accepted' }])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('TLS 1.1 is ACCEPTED')
  })

  it('FAILS when the HSTS header is missing', () => {
    const result = evaluate([{ ...healthy(), hstsHeader: null }])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('no Strict-Transport-Security')
  })

  it('FAILS on a max-age below one year', () => {
    const result = evaluate([{ ...healthy(), hstsHeader: 'max-age=300; includeSubDomains' }])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('below 31536000')
  })

  it('FAILS when includeSubDomains is dropped — media and cms are subdomains', () => {
    const result = evaluate([{ ...healthy(), hstsHeader: 'max-age=63072000' }])
    expect(result.ok).toBe(false)
    expect(result.failures[0]).toContain('includeSubDomains')
  })
})

/**
 * THE MEDIA HOST'S TWO RANK 8 RULES (fix plan, 2026-09-03). Both live only in Cloudflare
 * rulesets, so this probe is the one thing that notices them going. Each negative control
 * is the exact state measured before the rule existed.
 */
const mediaHeaders = () => ({
  ...healthy('media.wear-run.help'),
  hstsStatus: 404, // the root of the media host is itself a miss
  cacheControl: 'no-store',
  timingAllowOrigin: 'https://viewer.wear-run.help',
  expectMedia: true,
})

/** The same host with a poster and a model measured too, as a browser's GET gets them (IM-13). */
const healthyMedia = () => ({
  ...mediaHeaders(),
  posterStatus: 200,
  posterCorp: 'same-site' as string | null,
  modelStatus: 200,
  modelCorp: 'same-site' as string | null,
})

describe('evaluate — the media host (Rank 8)', () => {
  it('passes a miss that is no-store and carries timing-allow-origin', () => {
    const result = evaluate([healthyMedia()])
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
  })

  it('FAILS when a miss is cached for a year — the state measured 2026-09-03 before the rule (DV-03)', () => {
    const result = evaluate([{ ...healthyMedia(), cacheControl: 'max-age=31536000' }])
    expect(result.ok).toBe(false)
    expect(result.failures.join(' ')).toContain('DV-03')
  })

  it('FAILS when timing-allow-origin is missing (LIVE-11)', () => {
    const result = evaluate([{ ...healthyMedia(), timingAllowOrigin: null }])
    expect(result.ok).toBe(false)
    expect(result.failures.join(' ')).toContain('LIVE-11')
  })

  it('does not ask the other hosts for either header', () => {
    const result = evaluate([{ ...healthy('cms.wear-run.help'), cacheControl: 'max-age=31536000' }])
    expect(result.ok).toBe(true)
  })

  it('still reads a 403 as Bot Fight Mode, not as a broken rule', () => {
    const result = evaluate([{ ...healthyMedia(), hstsStatus: 403, hstsHeader: null }])
    expect(result.ok).toBe(true)
    expect(result.inconclusive.length).toBeGreaterThan(0)
  })
})

describe('evaluate — what must NOT be read as a pass', () => {
  it('does not count a CLIENT-side block as the server refusing', () => {
    const result = evaluate([
      { ...healthy(), tls10: 'blocked-by-client', tls11: 'blocked-by-client' },
    ])
    // Not a failure — the server may well be fine — but emphatically not silence.
    expect(result.failures).toEqual([])
    expect(result.inconclusive).toHaveLength(2)
    expect(result.inconclusive[0]).toContain('NOT a pass')
  })

  it('ignores a host entirely when even TLS 1.2 fails', () => {
    // Reproduces "the network is down" looking like "everything is closed".
    const result = evaluate([
      {
        host: 'viewer.wear-run.help',
        tls10: 'unknown',
        tls11: 'unknown',
        tls12: 'unknown',
        expectHsts: true,
      },
    ])
    expect(result.measured).toBe(0)
    expect(result.inconclusive[0]).toContain('prove nothing')
    // And crucially, the missing HSTS on that host is NOT reported as a failure —
    // we never reached it, so we have nothing to say about its headers either.
    expect(result.failures).toEqual([])
  })

  it('reports measured=0 when every host is unreachable, so a caller can tell', () => {
    // `ok` alone cannot distinguish this from a clean run. That ambiguity is how
    // uptime.yml reported success for 17 days while asserting nothing.
    const unreachable = { tls10: 'unknown', tls11: 'unknown', tls12: 'unknown', expectHsts: true }
    const result = evaluate([
      { host: 'a.wear-run.help', ...unreachable },
      { host: 'b.wear-run.help', ...unreachable },
    ])
    expect(result.ok).toBe(true)
    expect(result.measured).toBe(0)
  })

  it('treats a 403 as Bot Fight Mode, not a missing header', () => {
    const result = evaluate([{ ...healthy(), hstsHeader: null, hstsStatus: 403 }])
    expect(result.ok).toBe(true)
    expect(result.inconclusive[0]).toContain('Bot Fight Mode')
  })

  it('counts a partially-blocked run by what it actually reached', () => {
    const result = evaluate([
      healthy('viewer.wear-run.help'),
      {
        host: 'cms.wear-run.help',
        tls10: 'unknown',
        tls11: 'unknown',
        tls12: 'unknown',
        expectHsts: true,
      },
    ])
    expect(result.measured).toBe(1)
    expect(result.ok).toBe(true)
  })
})

/**
 * IM-13 (2026-09-17). What keeps our pictures off other websites is the CORP header one
 * Cloudflare Transform Rule adds — the WAF rule matches `.glb` alone, and images are
 * deliberately not gated (docs/CLOUDFLARE-SETUP.md). A page on another site drew nothing in
 * Chromium, Firefox and WebKit that day, because of this header, and nothing in the
 * repository could see the rule go.
 */
describe('evaluate — pictures and models refuse other sites (IM-13)', () => {
  it('passes when a poster and a model both answer same-site', () => {
    expect(MEDIA_CORP).toBe('same-site')
    const result = evaluate([healthyMedia()])
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.lines.join('\n')).toContain('poster CORP same-site ok')
    expect(result.lines.join('\n')).toContain('model CORP same-site ok')
  })

  it('FAILS on a poster answered with no CORP header, and names the rule to restore', () => {
    // The planted fault: the header is simply gone, which is what deleting the rule does.
    const result = evaluate([{ ...healthyMedia(), posterCorp: null }])
    expect(result.ok).toBe(false)
    const text = result.failures.join(' ')
    expect(text).toContain('IM-13')
    expect(text).toContain('(none)')
    expect(text).toContain('media headers')
    expect(text).toContain('docs/CLOUDFLARE-SETUP.md')
  })

  it('FAILS on a model that became cross-origin', () => {
    const result = evaluate([{ ...healthyMedia(), modelCorp: 'cross-origin' }])
    expect(result.ok).toBe(false)
    expect(result.failures.join(' ')).toContain(
      'a model answered cross-origin-resource-policy: cross-origin',
    )
  })

  it('reads a 403 on a sample as Bot Fight Mode, never as a pass or a failure', () => {
    const result = evaluate([{ ...healthyMedia(), posterStatus: 403, posterCorp: null }])
    expect(result.ok).toBe(true)
    expect(result.inconclusive.join(' ')).toContain('Bot Fight Mode')
  })

  it('reads a sample that does not exist as inconclusive, not as a header verdict', () => {
    const result = evaluate([{ ...healthyMedia(), modelStatus: 404, modelCorp: null }])
    expect(result.ok).toBe(true)
    expect(result.inconclusive.join(' ')).toContain('the model answered HTTP 404')
  })

  it('reads an unreadable payload as NOT a pass', () => {
    const unreadable = 'the live payload answered HTTP 503'
    const result = evaluate([
      { ...mediaHeaders(), posterError: unreadable, modelError: unreadable },
    ])
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.inconclusive.filter((note) => note.includes('NOT a pass'))).toHaveLength(2)
  })

  it('does not count a sample nobody measured as a pass', () => {
    const result = evaluate([{ ...mediaHeaders(), modelStatus: 200, modelCorp: 'same-site' }])
    expect(result.failures).toEqual([])
    expect(result.inconclusive.join(' ')).toContain('no poster was measured')
  })

  it('asks no other host for either header', () => {
    const result = evaluate([
      { ...healthy('cms.wear-run.help'), posterCorp: null, modelCorp: null },
    ])
    expect(result.ok).toBe(true)
    expect(result.inconclusive).toEqual([])
  })

  /**
   * M5 (2026-09-23). Before this, IM-13 sat INSIDE the HSTS success path, so a 403
   * on media.wear-run.help's own HSTS read (Bot Fight Mode, say) — or a missing
   * header, or a short max-age, or even TLS 1.2 itself failing — meant the poster
   * and model CORP lines never printed AT ALL, with no line of their own saying
   * so. Each of these plants a DIFFERENT reason evaluate() used to give up before
   * reaching IM-13; all four must still show the poster/model verdict.
   */
  it.each([
    ['a 403 on the HSTS read (Bot Fight Mode)', { hstsStatus: 403, hstsHeader: null }],
    ['no HSTS header at all', { hstsHeader: null }],
    ['an HSTS max-age below one year', { hstsHeader: 'max-age=300; includeSubDomains' }],
    ['HSTS missing includeSubDomains', { hstsHeader: 'max-age=63072000' }],
  ])(
    'never silently skips IM-13 just because the HSTS read had a problem: %s',
    (_label, override) => {
      const result = evaluate([{ ...healthyMedia(), ...override }])
      expect(result.lines.join('\n')).toContain('poster CORP same-site ok')
      expect(result.lines.join('\n')).toContain('model CORP same-site ok')
    },
  )

  it('never silently skips IM-13 even when TLS 1.2 itself never connected', () => {
    // The most extreme gate: this host told the TLS probe nothing at all, and
    // IM-13's own poster/model fetch is a plain HTTPS GET, an entirely different
    // mechanism that may have succeeded regardless.
    const result = evaluate([{ ...healthyMedia(), tls12: 'unknown' }])
    expect(result.lines.join('\n')).toContain('poster CORP same-site ok')
    expect(result.lines.join('\n')).toContain('model CORP same-site ok')
  })
})

describe('samplesFromPayload (IM-13)', () => {
  const live = {
    product: {
      glbUrl: 'https://media.wear-run.help/x-milo-pro-skin-suit-2026-09-03-optimized.glb',
    },
    selectedColourway: { poster: { url: 'https://media.wear-run.help/rxps-wine-poster.webp' } },
  }

  it('takes the poster and the model the viewer really loads', () => {
    expect(samplesFromPayload(live)).toEqual({
      poster: 'https://media.wear-run.help/rxps-wine-poster.webp',
      model: 'https://media.wear-run.help/x-milo-pro-skin-suit-2026-09-03-optimized.glb',
    })
  })

  it.each([
    ['a payload with no model', { ...live, product: { glbUrl: null } }],
    ['a payload with no poster', { ...live, selectedColourway: null }],
    ['an error body', { error: 'not_found' }],
    ['nothing at all', null],
    [
      'a poster served from another host',
      {
        ...live,
        selectedColourway: { poster: { url: 'https://cms.wear-run.help/api/media/file/x.webp' } },
      },
    ],
    [
      'a relative address',
      { ...live, selectedColourway: { poster: { url: '/api/media/file/x.webp' } } },
    ],
  ])('refuses %s rather than measuring the wrong thing', (_label, body) => {
    expect(samplesFromPayload(body)).toHaveProperty('error')
  })

  it('falls back to the colourway glbUrl in separate-file mode, where product.glbUrl is null by construction (M5)', () => {
    // projectViewer.ts:139/164 — separateMode puts the model on the COLOURWAY and
    // leaves product.glbUrl null on purpose. The "no model" case above still
    // resolves to an error, because THAT fixture's selectedColourway carries no
    // glbUrl at all — this is the genuinely-present case the fallback exists for.
    const separateFileMode = {
      product: { glbUrl: null },
      selectedColourway: {
        poster: { url: 'https://media.wear-run.help/rxps-wine-poster.webp' },
        glbUrl: 'https://media.wear-run.help/rxps-wine.glb',
      },
    }
    expect(samplesFromPayload(separateFileMode)).toEqual({
      poster: 'https://media.wear-run.help/rxps-wine-poster.webp',
      model: 'https://media.wear-run.help/rxps-wine.glb',
    })
  })
})

describe('TARGETS', () => {
  it('covers every customer-facing host', () => {
    const hosts = TARGETS.map((t: { host: string }) => t.host)
    expect(hosts).toEqual(
      expect.arrayContaining([
        'viewer.wear-run.help',
        'cms.wear-run.help',
        'media.wear-run.help',
        'wear-run.help',
      ]),
    )
  })

  it('asks the media host, and only the media host, for the two Rank 8 headers', () => {
    expect(TARGETS.filter((t) => t.media === true).map((t) => t.host)).toEqual([
      'media.wear-run.help',
    ])
  })

  it('includes media.wear-run.help — the host the zone setting does not govern', () => {
    // Not redundant with the test above. media is an R2 CUSTOM DOMAIN with its own
    // min_tls_version. On 2026-08-30 the zone was raised to 1.2 and this host stayed
    // on 1.0, serving every 3D garment over TLS 1.0 while three siblings read clean.
    // If a future edit trims this list, this is the entry that must not go.
    expect(TARGETS.some((t: { host: string }) => t.host === 'media.wear-run.help')).toBe(true)
  })

  it('expects HSTS on every target', () => {
    expect(TARGETS.every((t: { hsts: boolean }) => t.hsts)).toBe(true)
  })

  it('the guard itself can fail (negative control)', () => {
    // If `evaluate` were vacuous, every test above would pass on an empty input.
    expect(evaluate([]).measured).toBe(0)
    expect(evaluate([{ ...healthy(), tls10: 'accepted' }]).ok).toBe(false)
  })
})
