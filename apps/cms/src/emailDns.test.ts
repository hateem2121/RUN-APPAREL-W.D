/**
 * Guards for `scripts/check-email-dns.mjs` — L16-F09.
 *
 * WHAT WOULD HAVE TO BREAK FOR THESE TO FAIL. The script exists because nothing in
 * this repository has ever looked at the domain's email records, and the symptom of
 * a bad edit is mail going quietly to spam in someone else's inbox weeks later. So
 * every test below feeds it a record that IS broken and asserts it says so — a suite
 * that only fed it today's good records would pass against a function returning
 * `{ ok: true }`.
 *
 * `evaluateEmailDns` is pure on purpose: the tests never touch DNS, so they cannot
 * fail on a resolver hiccup. The live lookups are the script's job, and its
 * INCONCLUSIVE exit is what stops a resolver problem being reported as a fault.
 */
import { describe, expect, it } from 'vitest'
import {
  DKIM_SELECTORS,
  EXPECTED_SPF_INCLUDES,
  SPF_LOOKUP_LIMIT,
  dmarcPolicy,
  evaluateEmailDns,
  spfIncludes,
} from '../../../scripts/check-email-dns.mjs'

/** Today's live records, measured 2026-08-31. The baseline everything else varies from. */
const GOOD = {
  spf: 'v=spf1 include:_spf.mail.hostinger.com include:_spf.google.com include:sendgrid.net ~all',
  dmarc: 'v=DMARC1; p=quarantine; pct=100; fo=1; rua=mailto:x@dmarc.mailgun.org;',
  tlsrpt: 'v=TLSRPTv1; rua=mailto:hateemjamshaid@gmail.com',
  dkim: { 's1._domainkey': 'k=rsa; p=MIIB...', 's2._domainkey': 'k=rsa; p=MIIB...' },
  spfLookups: 6,
}

describe('spfIncludes', () => {
  it('pulls include: and redirect= targets, ignoring mechanisms', () => {
    expect(spfIncludes('v=spf1 a mx include:one.example redirect=two.example ~all')).toEqual([
      'one.example',
      'two.example',
    ])
  })
  it('is empty for a record with none', () => {
    expect(spfIncludes('v=spf1 -all')).toEqual([])
  })
})

describe('dmarcPolicy', () => {
  it.each([
    ['v=DMARC1; p=none;', 'none'],
    ['v=DMARC1; p=quarantine; pct=100;', 'quarantine'],
    ['v=DMARC1;p=reject', 'reject'],
  ])('reads %s', (record, expected) => {
    expect(dmarcPolicy(record)).toBe(expected)
  })

  /**
   * `sp=` is the SUBDOMAIN policy and is NOT the answer to "what is p". Reading the
   * wrong one would report a domain as stricter than it is — and this domain
   * deliberately leaves subdomains at quarantine because three of them send real
   * mail (L16-F03).
   */
  it('does not mistake sp= for p=', () => {
    expect(dmarcPolicy('v=DMARC1; sp=reject;')).toBeNull()
    expect(dmarcPolicy('v=DMARC1; p=quarantine; sp=reject;')).toBe('quarantine')
  })
})

describe('evaluateEmailDns', () => {
  it('accepts the records as they stand today', () => {
    const r = evaluateEmailDns(GOOD)
    expect(r.problems).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('rejects a missing SPF record outright', () => {
    const r = evaluateEmailDns({ ...GOOD, spf: null })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/No SPF record/)
  })

  /** An include nobody added on purpose is a sender authorised to be you. */
  it('rejects an SPF include that is not in the intended list', () => {
    const r = evaluateEmailDns({ ...GOOD, spf: `${GOOD.spf} include:stranger.example` })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/stranger\.example/)
  })

  it('rejects an intended sender going missing', () => {
    const r = evaluateEmailDns({ ...GOOD, spf: 'v=spf1 include:sendgrid.net ~all' })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/_spf\.mail\.hostinger\.com/)
  })

  /**
   * Past ten lookups SPF stops evaluating and fails OPEN — the domain ends up with
   * no effective policy while every record still looks present. Exactly the shape of
   * failure nothing else here would report.
   */
  it('rejects an SPF record over the lookup limit, and accepts one at it', () => {
    expect(evaluateEmailDns({ ...GOOD, spfLookups: SPF_LOOKUP_LIMIT + 1 }).ok).toBe(false)
    expect(evaluateEmailDns({ ...GOOD, spfLookups: SPF_LOOKUP_LIMIT }).ok).toBe(true)
  })

  it('rejects DMARC weakened to none, and accepts reject', () => {
    expect(evaluateEmailDns({ ...GOOD, dmarc: 'v=DMARC1; p=none;' }).ok).toBe(false)
    expect(evaluateEmailDns({ ...GOOD, dmarc: 'v=DMARC1; p=reject;' }).ok).toBe(true)
  })

  it('rejects a DKIM selector that stopped resolving', () => {
    const r = evaluateEmailDns({ ...GOOD, dkim: { ...GOOD.dkim, 's2._domainkey': null } })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/s2\._domainkey/)
  })

  it('rejects a missing TLS-RPT record', () => {
    expect(evaluateEmailDns({ ...GOOD, tlsrpt: null }).ok).toBe(false)
  })

  /**
   * Pins the intended sender list and the selectors. Adding a sender is a decision
   * about who may send as this domain, and it should have to be made here rather
   * than arrived at by editing DNS and letting the check follow.
   */
  it('pins the intended senders and selectors', () => {
    expect([...EXPECTED_SPF_INCLUDES]).toEqual([
      '_spf.mail.hostinger.com',
      '_spf.google.com',
      'sendgrid.net',
    ])
    expect([...DKIM_SELECTORS]).toEqual(['s1._domainkey', 's2._domainkey'])
  })
})
