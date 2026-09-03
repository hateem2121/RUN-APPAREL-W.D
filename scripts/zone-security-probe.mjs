/**
 * Assert the live TLS and HSTS posture of every customer-facing host.
 *
 * WHY THIS EXISTS. The 2026-08-30 audit's headline finding was a Cloudflare Worker
 * hand-edited in the dashboard that no one could see from this repository. The
 * remediation then applied six more changes of exactly that shape — min TLS, SSL
 * mode, HSTS, CAA, an R2 custom-domain TLS floor, queue retention — all of which live
 * in Cloudflare's control plane and none of which any test could notice being undone.
 * `docs/audit-2026-08-30/CLOUDFLARE-LIVE-CHANGES.md` records them; this measures them.
 *
 * ⚠️ THE OBVIOUS VERSION OF THIS CHECK REPORTS SUCCESS WHILE MEASURING NOTHING, AND
 * IT DID SO FOR TWENTY MINUTES ON 2026-08-30. Two separate ways:
 *
 * 1. THE SHELL VERSION READ BACK ITS OWN QUESTION.
 *      openssl s_client -tls1 ... | grep 'Protocol *: *TLSv1$'
 *    `Protocol : TLSv1` is openssl echoing the version REQUESTED. It is printed even
 *    when the server answered with a protocol-version alert and no connection was
 *    made. Run against github.com — which refuses TLS 1.0 — it still matched. It
 *    returned the SAME verdict for the three hosts that were correctly refusing and
 *    the one that was not, which is how `media.wear-run.help` stayed open unnoticed.
 *
 * 2. THE NODE VERSION REFUSES CLIENT-SIDE UNLESS YOU LOWER THE SECURITY LEVEL.
 *    Measured here, against cloudflare.com, which genuinely DOES accept TLS 1.0:
 *      with    ciphers: 'DEFAULT@SECLEVEL=0'  ->  ACCEPTED   (the truth)
 *      without                                ->  ERR_SSL_NO_PROTOCOLS_AVAILABLE
 *    Without the override, OpenSSL 3 never puts a TLS 1.0 cipher suite on the wire,
 *    so every host on earth looks locked down. A probe written the obvious way would
 *    have gone green on a zone with min TLS 1.0 — the exact state it exists to catch.
 *
 * SO THE CENTRAL RULE HERE: a failed handshake is only evidence of a closed door when
 * the failure came from the SERVER. `ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION` is the
 * server refusing. `ERR_SSL_NO_PROTOCOLS_AVAILABLE` is this process refusing, and is
 * reported INCONCLUSIVE, never as a pass. See `classifyHandshake`.
 *
 * AND THE BUILT-IN CONTROL: every host is also probed at TLS 1.2, which must SUCCEED.
 * That makes each host its own negative control — if 1.2 fails too, the host is
 * unreachable or blocked and the 1.0 refusal proves nothing, so the whole host is
 * inconclusive. Without this, `unplug the network` and `perfect security` produce
 * identical output. No third-party control host is used, deliberately: depending on
 * github.com refusing TLS 1.0 forever makes this probe break on someone else's change.
 *
 * A 403/429/503 from a runner is INCONCLUSIVE, not a failure — free-plan Bot Fight
 * Mode blocks datacenter IPs intermittently and has already forced a rollback on this
 * repo. Same discipline as `scripts/apex-probe.mjs`.
 */

import tls from 'node:tls'

/**
 * Lowering OpenSSL's security level is what lets a TLS 1.0 ClientHello onto the wire
 * at all. It weakens THIS probe's own connection and nothing else — we are trying to
 * be refused. Removing it silently turns every result into a false pass.
 */
const LEGACY_CIPHERS = 'DEFAULT@SECLEVEL=0'

const HANDSHAKE_TIMEOUT_MS = 10_000

/** One year. Anything shorter is not a meaningful HSTS commitment. */
const MIN_HSTS_MAX_AGE = 31_536_000

/** Statuses that mean "ask again later", not "the host is broken". */
const INCONCLUSIVE_STATUSES = new Set([403, 429, 503])

/**
 * @typedef {{ host: string, hsts: boolean, media?: boolean }} ZoneTarget
 */

/**
 * Every host a customer's browser actually reaches.
 *
 * `media.wear-run.help` earns its place twice over: it is an R2 CUSTOM DOMAIN, and an
 * R2 custom domain carries its own `min_tls_version` that the zone setting does not
 * govern. On 2026-08-30 the zone was raised to 1.2 and this host stayed on 1.0,
 * serving every 3D garment over TLS 1.0, while three sibling hosts reported clean.
 *
 * @type {ZoneTarget[]}
 */
export const TARGETS = [
  { host: 'viewer.wear-run.help', hsts: true },
  { host: 'cms.wear-run.help', hsts: true },
  /**
   * `media` adds the two Rank 8 rules (fix plan, 2026-09-03): a MISS on this host must
   * answer `cache-control: no-store` — the Cache Rules' browser TTL stamped a YEAR on
   * 404s until then (audit DV-03) — and every response must carry
   * `timing-allow-origin` for the viewer, or Resource Timing reads the 20 MB model as
   * 0 bytes (LIVE-11). Both are Cloudflare rulesets, so nothing in the repo can see them
   * drift except this probe.
   */
  { host: 'media.wear-run.help', hsts: true, media: true },
  { host: 'wear-run.help', hsts: true },
]

/**
 * Turn a handshake outcome into one of four meanings. Pure, so the branch that only
 * happens on a misconfigured runtime is testable without one.
 *
 * @param {{ connected: boolean, code?: string, message?: string }} result
 * @returns {'accepted' | 'refused-by-server' | 'blocked-by-client' | 'unknown'}
 */
export function classifyHandshake(result) {
  if (result.connected) return 'accepted'

  const code = result.code ?? ''

  // This process could not offer the protocol, so the server never got a say.
  // Treating this as "the server refused" is the false-pass this probe exists to avoid.
  if (code === 'ERR_SSL_NO_PROTOCOLS_AVAILABLE') return 'blocked-by-client'
  if (code === 'ERR_TLS_INVALID_PROTOCOL_VERSION') return 'blocked-by-client'

  // The server sent a protocol-version alert. This is a genuine refusal.
  if (code === 'ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION') return 'refused-by-server'
  if (code === 'ERR_SSL_UNSUPPORTED_PROTOCOL') return 'refused-by-server'
  if (code === 'ERR_SSL_WRONG_VERSION_NUMBER') return 'refused-by-server'

  // Timeouts, resets and DNS failures say nothing about TLS policy.
  return 'unknown'
}

/**
 * Parse a Strict-Transport-Security header.
 *
 * @param {string | null | undefined} header
 * @returns {{ present: boolean, maxAge: number | null, includeSubDomains: boolean, preload: boolean }}
 */
export function parseHsts(header) {
  if (!header) return { present: false, maxAge: null, includeSubDomains: false, preload: false }
  const lower = header.toLowerCase()
  const match = /max-age\s*=\s*"?(\d+)"?/.exec(lower)
  return {
    present: true,
    maxAge: match ? Number(match[1]) : null,
    includeSubDomains: lower.includes('includesubdomains'),
    preload: lower.includes('preload'),
  }
}

/**
 * Turn observations into a verdict. Pure — no network.
 *
 * @param {{
 *   host: string,
 *   tls10: string,
 *   tls11: string,
 *   tls12: string,
 *   hstsHeader?: string | null,
 *   hstsStatus?: number,
 *   hstsError?: string,
 *   cacheControl?: string | null,
 *   timingAllowOrigin?: string | null,
 *   expectHsts: boolean,
 *   expectMedia?: boolean,
 * }[]} observations
 * @returns {{ ok: boolean, measured: number, failures: string[], inconclusive: string[], lines: string[] }}
 */
export function evaluate(observations) {
  const failures = []
  const inconclusive = []
  const lines = []
  /**
   * How many hosts this run actually reached a verdict on.
   *
   * ⚠️ WITHOUT THIS, "EVERY HOST WAS BLOCKED" AND "EVERYTHING IS SECURE" PRODUCE THE
   * SAME EXIT CODE. Bot Fight Mode blocking all four hosts must not read as a clean
   * run — that is precisely how `uptime.yml` sat dead for 17 days reporting success.
   * Inconclusive still must not FAIL the build (an alarm that fires on Cloudflare's
   * mood gets muted, which is the same outcome by a different route), so the caller
   * gets the count and decides. `scripts/apex-probe.mjs` does not yet make this
   * distinction and has the same blind spot.
   */
  let measured = 0

  for (const o of observations) {
    const label = o.host.padEnd(24)

    // THE CONTROL, FIRST. If the modern handshake did not succeed, this host told us
    // nothing at all and its 1.0/1.1 refusals are worthless. Reporting them as a pass
    // is how "the network is down" becomes indistinguishable from "we are secure".
    if (o.tls12 !== 'accepted') {
      inconclusive.push(
        `${o.host}: TLS 1.2 did not connect (${o.tls12}), so this host is unreachable ` +
          'or blocked. Its TLS 1.0/1.1 results prove nothing and are ignored.',
      )
      lines.push(`  ${label} TLS1.2 ${o.tls12} — inconclusive, host not measured`)
      continue
    }
    measured += 1

    for (const [version, outcome] of [
      ['1.0', o.tls10],
      ['1.1', o.tls11],
    ]) {
      if (outcome === 'refused-by-server') continue

      if (outcome === 'accepted') {
        failures.push(
          `${o.host}: TLS ${version} is ACCEPTED. If this host is an R2 custom domain, ` +
            'the zone min_tls_version does NOT govern it — raise it with ' +
            '`wrangler r2 bucket domain update <bucket> --domain <host> --min-tls 1.2`.',
        )
        lines.push(`  ${label} TLS${version} ACCEPTED  FAIL`)
        continue
      }

      if (outcome === 'blocked-by-client') {
        inconclusive.push(
          `${o.host}: this process would not offer TLS ${version} (SECLEVEL), so the ` +
            'server never answered. NOT a pass — see the header of this file.',
        )
        lines.push(`  ${label} TLS${version} client-blocked — inconclusive`)
        continue
      }

      inconclusive.push(`${o.host}: TLS ${version} handshake was ${outcome}.`)
      lines.push(`  ${label} TLS${version} ${outcome} — inconclusive`)
    }

    if (!o.expectHsts) continue

    if (o.hstsError) {
      inconclusive.push(`${o.host}: could not read headers (${o.hstsError}).`)
      lines.push(`  ${label} HSTS   unread — inconclusive`)
      continue
    }
    if (o.hstsStatus !== undefined && INCONCLUSIVE_STATUSES.has(o.hstsStatus)) {
      inconclusive.push(
        `${o.host}: HTTP ${o.hstsStatus} from a datacenter IP — Bot Fight Mode, ` +
          'inconclusive rather than a failure.',
      )
      lines.push(`  ${label} HSTS   ${o.hstsStatus} — inconclusive`)
      continue
    }

    const hsts = parseHsts(o.hstsHeader)
    if (!hsts.present) {
      failures.push(`${o.host}: no Strict-Transport-Security header.`)
      lines.push(`  ${label} HSTS   MISSING  FAIL`)
      continue
    }
    if (hsts.maxAge === null || hsts.maxAge < MIN_HSTS_MAX_AGE) {
      failures.push(`${o.host}: HSTS max-age is ${hsts.maxAge}, below ${MIN_HSTS_MAX_AGE}.`)
      lines.push(`  ${label} HSTS   max-age=${hsts.maxAge}  FAIL`)
      continue
    }
    if (!hsts.includeSubDomains) {
      failures.push(`${o.host}: HSTS lacks includeSubDomains.`)
      lines.push(`  ${label} HSTS   no includeSubDomains  FAIL`)
      continue
    }
    // preload is deliberately absent — an owner ruling of 2026-08-30, recorded in
    // docs/audit-2026-08-30/CLOUDFLARE-LIVE-CHANGES.md. It is NOT asserted either way:
    // asserting its absence would fight the owner if they later choose to enable it.
    lines.push(`  ${label} TLS1.0/1.1 closed · TLS1.2 ok · HSTS ${hsts.maxAge}s ok`)

    // The media host's two Rank 8 rules, read off the same response (the root of the
    // media host is itself a miss, so one GET measures both).
    if (o.expectMedia) {
      const cc = (o.cacheControl ?? '').toLowerCase()
      if (o.hstsStatus !== undefined && o.hstsStatus >= 400 && !cc.includes('no-store')) {
        failures.push(
          `${o.host}: a miss answers "cache-control: ${o.cacheControl ?? '(none)'}" — a browser would keep that 404 (DV-03: must be no-store).`,
        )
        lines.push(`  ${label} 404 cache-control ${o.cacheControl ?? '(none)'}  FAIL`)
      } else {
        lines.push(`  ${label} 404 no-store ok`)
      }
      if (!o.timingAllowOrigin) {
        failures.push(
          `${o.host}: no timing-allow-origin header — the viewer's Resource Timing reads the model as 0 bytes (LIVE-11).`,
        )
        lines.push(`  ${label} timing-allow-origin missing  FAIL`)
      } else {
        lines.push(`  ${label} timing-allow-origin ${o.timingAllowOrigin} ok`)
      }
    }
  }

  return { ok: failures.length === 0, measured, failures, inconclusive, lines }
}

/**
 * One handshake at exactly one protocol version.
 *
 * @param {string} host
 * @param {string} version
 * @returns {Promise<string>} a `classifyHandshake` verdict
 */
export function handshake(host, version) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (/** @type {any} */ result) => {
      if (settled) return
      settled = true
      resolve(classifyHandshake(result))
    }

    let socket
    try {
      socket = tls.connect(
        {
          host,
          port: 443,
          servername: host,
          minVersion: version,
          maxVersion: version,
          ciphers: LEGACY_CIPHERS,
          timeout: HANDSHAKE_TIMEOUT_MS,
        },
        () => {
          socket.destroy()
          finish({ connected: true })
        },
      )
    } catch (error) {
      // tls.connect throws synchronously when Node itself rejects the version.
      finish({ connected: false, code: error.code, message: error.message })
      return
    }

    socket.on('error', (error) => {
      socket.destroy()
      finish({ connected: false, code: error.code, message: error.message })
    })
    socket.on('timeout', () => {
      socket.destroy()
      finish({ connected: false, code: 'ETIMEDOUT' })
    })
  })
}

/** Fetch one host's response headers, tolerating every way that can fail. */
async function readHeaders(host) {
  try {
    const response = await fetch(`https://${host}/`, {
      method: 'GET',
      headers: { range: 'bytes=0-0' },
      signal: AbortSignal.timeout(20_000),
    })
    return {
      hstsHeader: response.headers.get('strict-transport-security'),
      hstsStatus: response.status,
      cacheControl: response.headers.get('cache-control'),
      timingAllowOrigin: response.headers.get('timing-allow-origin'),
    }
  } catch (error) {
    return { hstsError: error.message ?? String(error) }
  }
}

/** Gather every observation. All network lives here. */
export async function probe(targets = TARGETS) {
  return Promise.all(
    targets.map(async (target) => {
      const [tls10, tls11, tls12, headers] = await Promise.all([
        handshake(target.host, 'TLSv1'),
        handshake(target.host, 'TLSv1.1'),
        handshake(target.host, 'TLSv1.2'),
        target.hsts ? readHeaders(target.host) : Promise.resolve({}),
      ])
      return {
        host: target.host,
        tls10,
        tls11,
        tls12,
        expectHsts: target.hsts,
        expectMedia: target.media === true,
        ...headers,
      }
    }),
  )
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const observations = await probe()
  const { ok, measured, failures, inconclusive, lines } = evaluate(observations)

  console.log('zone security probe — TLS floor and HSTS on every customer-facing host\n')
  for (const line of lines) console.log(line)

  if (inconclusive.length) {
    console.log('\ninconclusive (NOT a pass, NOT a failure):')
    for (const note of inconclusive) console.log(`  - ${note}`)
  }

  if (!ok) {
    console.log('\nFAILURES:')
    for (const failure of failures) console.log(`  - ${failure}`)
    console.log(
      '\nBaseline to restore from: docs/audit-2026-08-30/cf-baseline/\n' +
        'What each setting is and why: docs/audit-2026-08-30/CLOUDFLARE-LIVE-CHANGES.md',
    )
    process.exit(1)
  }

  if (measured === 0) {
    // Deliberately a warning and exit 0, not a failure: every host being unreachable
    // from a runner is Bot Fight Mode, not an outage. But it is NOT a pass either, and
    // silence here is how a dead check goes unnoticed for weeks.
    console.log(
      '::warning::zone-security-probe reached NO host — this run asserted nothing ' +
        'about TLS or HSTS. Not a failure (datacenter IPs are blocked intermittently), ' +
        'but do not read the green tick as evidence.',
    )
    console.log(`\n⚠ 0 of ${observations.length} hosts measured. Nothing was verified.`)
  } else {
    console.log(
      `\n✓ ${measured}/${observations.length} hosts measured: TLS 1.0 and 1.1 refused, ` +
        'TLS 1.2 negotiates, HSTS in force.',
    )
  }
}
