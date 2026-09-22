import { describe, expect, it } from 'vitest'
import {
  SECURITY_TXT,
  SECURITY_TXT_CANONICAL,
  SECURITY_TXT_CONTACT,
  SECURITY_TXT_EXPIRES,
  SECURITY_TXT_POLICY,
  SECURITY_TXT_REVIEWED,
  securityTxtProblems,
} from './securityTxt'

const DAY = 86_400_000

/**
 * The one security.txt every host serves (RFC 9116), decided 2026-09-18, live from the
 * merge that deploys it. None of these compare with TODAY: a test that failed on a calendar
 * date would redden every unrelated pull request. Expiry is watched by the daily live probe
 * (`scripts/public-security-probe.mjs`) instead, which warns 30 days ahead.
 */
describe('the security.txt every host serves', () => {
  it('names the contact the owner chose, exactly once', () => {
    expect(SECURITY_TXT_CONTACT).toBe('mailto:team@wear-run.com')
    expect(SECURITY_TXT.match(/^Contact: /gm)).toHaveLength(1)
    expect(SECURITY_TXT).toContain(`Contact: ${SECURITY_TXT_CONTACT}\n`)
  })

  it('expires after it was last reviewed, and at most a year after (RFC 9116 §2.5.5)', () => {
    const reviewed = Date.parse(`${SECURITY_TXT_REVIEWED}T00:00:00Z`)
    const expires = Date.parse(SECURITY_TXT_EXPIRES)
    expect(Number.isNaN(expires)).toBe(false)
    expect(expires).toBeGreaterThan(reviewed)
    expect(expires - reviewed).toBeLessThanOrEqual(365 * DAY)
    expect(SECURITY_TXT.match(/^Expires: /gm)).toHaveLength(1)
    expect(SECURITY_TXT).toContain(`Expires: ${SECURITY_TXT_EXPIRES}\n`)
  })

  it('lists every address that serves it as Canonical — no more, no fewer', () => {
    expect(SECURITY_TXT_CANONICAL).toEqual([
      'https://wear-run.help/.well-known/security.txt',
      'https://cms.wear-run.help/.well-known/security.txt',
      'https://viewer.wear-run.help/.well-known/security.txt',
      'https://catalogue.wear-run.help/.well-known/security.txt',
      'https://profile.wear-run.help/.well-known/security.txt',
      'https://catalogue.wear-run.com/.well-known/security.txt',
      'https://profile.wear-run.com/.well-known/security.txt',
    ])
    const listed = [...SECURITY_TXT.matchAll(/^Canonical: (.+)$/gm)].map((m) => m[1])
    expect(listed).toEqual(SECURITY_TXT_CANONICAL)
  })

  it('points at the repository security policy and prefers English', () => {
    expect(SECURITY_TXT).toContain(`Policy: ${SECURITY_TXT_POLICY}\n`)
    expect(SECURITY_TXT_POLICY).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\/security\/policy$/)
    expect(SECURITY_TXT).toContain('Preferred-Languages: en\n')
  })

  it('is plain "Field: value" lines ending in LF, with a final newline', () => {
    expect(SECURITY_TXT.endsWith('\n')).toBe(true)
    expect(SECURITY_TXT).not.toContain('\r')
    for (const line of SECURITY_TXT.trimEnd().split('\n')) {
      expect(line).toMatch(/^[A-Z][A-Za-z-]+: \S/)
    }
  })

  it('passes its own checker on the day it was reviewed', () => {
    expect(
      securityTxtProblems(SECURITY_TXT, new Date(`${SECURITY_TXT_REVIEWED}T00:00:00Z`)),
    ).toEqual([])
  })
})

describe('securityTxtProblems — each fault is caught (negative controls)', () => {
  const now = new Date('2026-09-18T00:00:00Z')
  const withExpires = (value: string) => SECURITY_TXT.replace(/^Expires: .*$/m, `Expires: ${value}`)

  it.each<[string, string, string]>([
    ['no Contact line', SECURITY_TXT.replace(/^Contact: .*\n/m, ''), 'no Contact'],
    ['no Expires line', SECURITY_TXT.replace(/^Expires: .*\n/m, ''), 'no Expires'],
    ['an Expires that is not a date', withExpires('next year'), 'not a date'],
    ['an Expires in the past', withExpires('2026-09-17T00:00:00.000Z'), 'expired'],
    [
      'an Expires more than a year away',
      withExpires('2027-09-19T00:00:00.000Z'),
      'more than a year',
    ],
    ['an Expires inside the 30-day warning', withExpires('2026-10-10T00:00:00.000Z'), 'renew'],
  ])('%s', (_label, text, expected) => {
    const problems = securityTxtProblems(text, now)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join(' | ')).toContain(expected)
  })

  it('an Expires 31 days away is still fine (the control for the warning above)', () => {
    expect(securityTxtProblems(withExpires('2026-10-19T00:00:00.000Z'), now)).toEqual([])
  })
})
