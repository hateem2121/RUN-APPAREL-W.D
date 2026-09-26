/**
 * Assert the email DNS records nothing else watches — L16-F09.
 *
 * WHY. `wear-run.help` carries SPF, DMARC, DKIM and TLS-RPT records that four
 * different senders depend on, and **nothing in this repository or in CI has ever
 * looked at any of them**. A record can be deleted, truncated or re-pointed and the
 * only symptom is mail quietly going to spam — weeks later, in someone else's inbox,
 * where nobody here can see it.
 *
 * WHAT IT CHECKS, and why exactly these six (SO-04/SO-04b added MX and CAA). Each is
 * something a bad edit breaks and nothing else would report:
 *
 *   1. The apex SPF exists and contains EXACTLY the includes intended. An extra
 *      include is a sender you did not authorise; a missing one silently fails your
 *      own mail. It also counts DNS lookups against RFC 7208's hard limit of 10 —
 *      cross it and SPF stops evaluating entirely, which fails OPEN into "no policy".
 *   2. DMARC exists and is at least `quarantine`. ⚠️ NOT `reject`: three subdomains
 *      send real mail through SendGrid and Amazon SES, so `sp=reject` would bounce
 *      customer email rather than junk it. See L16-F03.
 *   3. Both DKIM selectors resolve to a key. A DKIM CNAME that stops resolving takes
 *      every signature with it.
 *   4. TLS-RPT exists, because it is the only thing that would ever tell you a
 *      sending server could not negotiate TLS to your MX.
 *   5. At least one MX record exists AND every target it names actually resolves. An
 *      MX pointing at a dead host is a silent failure mode: the record is present,
 *      looks correct on a casual read, and mail addressed to this domain has nowhere
 *      to go.
 *   6. At least one CAA `issue`/`issuewild` record exists. Zero CAA records is not "no
 *      opinion" — it is the same as authorising every certificate authority on the
 *      internet to issue for this domain. The exact list of authorised issuers is not
 *      pinned here; that can change legitimately without being a regression.
 *
 * ⚠️ OWNERSHIP (recorded 2026-09-17). DMARC and TLS-RPT on this domain are managed by the
 * separate email-signature project (Worker `run-domain-edge`), which also owns
 * `mta-sts.wear-run.help` and the `_mta-sts` and `default._bimi` records. A value that
 * changed may be that project's deliberate edit — check with it before "fixing" one, and
 * never delete one. docs/CLOUDFLARE-SETUP.md → 11.8 lists them all.
 *
 * ⚠️ THIS IS NOT A CI GATE, DELIBERATELY. It reads live DNS, and a CI job that fails
 * on a resolver hiccup teaches everyone to ignore it — the same trap `.github/CLAUDE.md`
 * records for `wear-run.help` fetches from runners. Like
 * `scripts/queue-settings-probe.mjs`, a lookup that cannot be performed exits **2 =
 * INCONCLUSIVE**, never 0 and never 1. Only a record that resolves and is WRONG
 * exits 1.
 *
 *   node scripts/check-email-dns.mjs
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { realpathSync } from 'node:fs'

const run = promisify(execFile)

export const DOMAIN = 'wear-run.help'

/** Exactly the senders this domain authorises. An extra one is the finding. */
export const EXPECTED_SPF_INCLUDES = ['_spf.mail.hostinger.com', '_spf.google.com', 'sendgrid.net']

/** RFC 7208 §4.6.4. Cross it and SPF fails open, which is worse than failing shut. */
export const SPF_LOOKUP_LIMIT = 10

export const DKIM_SELECTORS = ['s1._domainkey', 's2._domainkey']

/** Ranked weakest to strongest, so "at least quarantine" is a comparison. */
const POLICY_RANK = { none: 0, quarantine: 1, reject: 2 }

/** Pull `p=` out of a DMARC record. */
export function dmarcPolicy(record) {
  const m = /(^|;)\s*p\s*=\s*(none|quarantine|reject)\b/i.exec(record ?? '')
  return m ? m[2].toLowerCase() : null
}

/**
 * The unique MX target hostnames, from raw `dig +short MX` lines like
 * `"5 mx1.hostinger.com."`. Priority is not read — this check only cares that a target
 * exists and resolves, not which one is preferred.
 */
export function mxHosts(lines) {
  const hosts = (lines ?? [])
    .map((line) => line.trim().split(/\s+/)[1] ?? '')
    .map((host) => host.replace(/\.$/, ''))
    .filter(Boolean)
  return [...new Set(hosts)]
}

/**
 * The CAA property tags present, from raw `dig +short CAA` lines like
 * `'0 issue "letsencrypt.org"'`. `iodef` is a real, legal CAA tag (where to report a
 * violation) and does not authorise any issuer on its own — it must not count toward
 * "a CAA record exists that permits issuance".
 */
export function caaTags(lines) {
  const tags = new Set()
  for (const line of lines ?? []) {
    const m = /^\d+\s+(issue|issuewild|iodef)\b/i.exec(line.trim())
    if (m) tags.add(m[1].toLowerCase())
  }
  return tags
}

/** The `include:` / `redirect=` targets, in order. */
export function spfIncludes(record) {
  const out = []
  for (const token of (record ?? '').split(/\s+/)) {
    const lower = token.toLowerCase()
    if (lower.startsWith('include:')) out.push(token.slice(8))
    else if (lower.startsWith('redirect=')) out.push(token.slice(9))
  }
  return out
}

/**
 * Judge a set of already-resolved records. Pure, so the tests never touch DNS.
 *
 * @param {{spf?: string|null, dmarc?: string|null, dkim?: Record<string,string|null>,
 *          tlsrpt?: string|null, spfLookups?: number|null, mx?: string[]|null,
 *          mxResolves?: Record<string,boolean|null>, caa?: string[]|null}} found
 */
export function evaluateEmailDns(found) {
  const problems = []
  const notes = []

  if (!found.spf) {
    problems.push(`No SPF record on ${DOMAIN}. Every sender is now unauthenticated.`)
  } else {
    const includes = spfIncludes(found.spf)
    const extra = includes.filter((i) => !EXPECTED_SPF_INCLUDES.includes(i))
    const missing = EXPECTED_SPF_INCLUDES.filter((i) => !includes.includes(i))
    if (extra.length) {
      problems.push(
        `SPF authorises senders that are not in the intended list: ${extra.join(', ')}.`,
      )
    }
    if (missing.length) {
      problems.push(`SPF is missing intended senders: ${missing.join(', ')}. Their mail will fail.`)
    }
    if (typeof found.spfLookups === 'number' && found.spfLookups > SPF_LOOKUP_LIMIT) {
      problems.push(
        `SPF resolves ${found.spfLookups} DNS lookups against a hard limit of ${SPF_LOOKUP_LIMIT}. ` +
          'Past the limit SPF stops evaluating and fails OPEN.',
      )
    } else if (typeof found.spfLookups === 'number') {
      notes.push(`SPF lookups: ${found.spfLookups}/${SPF_LOOKUP_LIMIT}`)
    }
  }

  const policy = dmarcPolicy(found.dmarc)
  if (!policy) {
    problems.push(`No usable DMARC policy on _dmarc.${DOMAIN}.`)
  } else if (POLICY_RANK[policy] < POLICY_RANK.quarantine) {
    problems.push(`DMARC is p=${policy}. At least quarantine is expected.`)
  } else {
    notes.push(`DMARC: p=${policy}`)
  }

  for (const [selector, key] of Object.entries(found.dkim ?? {})) {
    if (!key) problems.push(`DKIM selector ${selector} resolves to nothing. Signatures will fail.`)
  }

  if (!found.tlsrpt) {
    problems.push(
      `No TLS-RPT on _smtp._tls.${DOMAIN}. A failed TLS negotiation would be invisible.`,
    )
  } else {
    notes.push('TLS-RPT: present')
  }

  const mx = found.mx ?? []
  if (mx.length === 0) {
    problems.push(`No MX record on ${DOMAIN}. Mail sent to this domain has nowhere to go.`)
  } else {
    const dead = mx.filter((host) => found.mxResolves?.[host] === false)
    if (dead.length) {
      problems.push(
        `MX target(s) do not resolve: ${dead.join(', ')}. Mail routed to them will fail.`,
      )
    } else {
      notes.push(`MX: ${mx.join(', ')}`)
    }
  }

  const caa = caaTags(found.caa)
  if (!caa.has('issue') && !caa.has('issuewild')) {
    problems.push(
      `No issue/issuewild CAA record on ${DOMAIN} — any certificate authority may issue for it.`,
    )
  } else {
    notes.push(`CAA: ${[...caa].sort().join(', ')}`)
  }

  return { ok: problems.length === 0, problems, notes }
}

/** One `dig +short` lookup. Returns null when the lookup itself could not be done. */
async function dig(type, name) {
  try {
    const { stdout } = await run('dig', ['+short', type, name], { timeout: 10_000 })
    const lines = stdout
      .split('\n')
      .map((l) => l.trim().replace(/^"|"$/g, ''))
      .filter(Boolean)
    return lines.length ? lines.join('') : ''
  } catch {
    return null // resolver unavailable — INCONCLUSIVE, not a failure
  }
}

/**
 * Multiple DNS lines, each its own record. Unlike `dig()` above, these must NOT be
 * joined: `dig()` concatenates lines because a single TXT value can be split into
 * quoted chunks that belong together, but MX and CAA return one line PER DISTINCT
 * RECORD — joining those would smoosh unrelated records into one unparseable string.
 */
async function digLines(type, name) {
  try {
    const { stdout } = await run('dig', ['+short', type, name], { timeout: 10_000 })
    return stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  } catch {
    return null // resolver unavailable — INCONCLUSIVE, not a failure
  }
}

/** Count the DNS lookups an SPF record costs, following includes. */
async function countLookups(name, seen = new Set()) {
  const txt = await dig('TXT', name)
  if (txt === null) return null
  // ⚠️ EXTRACT, do not test the prefix. `dig +short TXT` on the apex returns SEVERAL
  // records concatenated — here a google-site-verification comes first — so
  // `startsWith('v=spf1')` is false and the count silently returns 0. It did: the
  // first run of this script reported "SPF lookups: 0/10" for a record with three
  // includes, which is a number that looks fine and means the check is not running.
  const record = /v=spf1[^"]*/.exec(txt)?.[0] ?? null
  if (!record) return 0
  let total = 0
  for (const target of spfIncludes(record)) {
    total += 1
    if (seen.has(target)) continue
    seen.add(target)
    const nested = await countLookups(target, seen)
    if (nested === null) return null
    total += nested
  }
  return total
}

async function main() {
  const spfRaw = await dig('TXT', DOMAIN)
  if (spfRaw === null) {
    console.log('[check-email-dns] INCONCLUSIVE: no resolver available.')
    process.exit(2)
  }
  // The apex carries several TXT records; dig +short concatenates them, so pick the
  // SPF one out rather than assuming it is alone.
  const spf = /v=spf1[^"]*/.exec(spfRaw)?.[0] ?? null

  const dkim = {}
  for (const selector of DKIM_SELECTORS) {
    const target = `${selector}.${DOMAIN}`
    const txt = await dig('TXT', target)
    if (txt === null) {
      console.log('[check-email-dns] INCONCLUSIVE: no resolver available.')
      process.exit(2)
    }
    dkim[selector] = txt || null
  }

  const mxLines = await digLines('MX', DOMAIN)
  if (mxLines === null) {
    console.log('[check-email-dns] INCONCLUSIVE: no resolver available.')
    process.exit(2)
  }
  const mx = mxHosts(mxLines)
  const mxResolves = {}
  for (const host of mx) {
    // A alone: an MX target is required to have an address record (RFC 5321 §5.1), so
    // AAAA-only is not a valid configuration this needs to also accept.
    const a = await dig('A', host)
    if (a === null) {
      console.log('[check-email-dns] INCONCLUSIVE: no resolver available.')
      process.exit(2)
    }
    mxResolves[host] = a !== ''
  }

  const caaLines = await digLines('CAA', DOMAIN)
  if (caaLines === null) {
    console.log('[check-email-dns] INCONCLUSIVE: no resolver available.')
    process.exit(2)
  }

  const found = {
    spf,
    dmarc: await dig('TXT', `_dmarc.${DOMAIN}`),
    tlsrpt: await dig('TXT', `_smtp._tls.${DOMAIN}`),
    dkim,
    spfLookups: await countLookups(DOMAIN),
    mx,
    mxResolves,
    caa: caaLines,
  }

  const { ok, problems, notes } = evaluateEmailDns(found)
  for (const note of notes) console.log(`  ${note}`)
  if (!ok) {
    for (const p of problems) console.error(`::error::${p}`)
    console.error(`\n[check-email-dns] ${problems.length} problem(s) with ${DOMAIN}'s email DNS.`)
    process.exit(1)
  }
  console.log(
    `[check-email-dns] ${DOMAIN}: SPF, DMARC, both DKIM selectors, TLS-RPT, MX and CAA all sound.`,
  )
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main()
}
