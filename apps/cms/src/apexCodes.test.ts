import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { codesMatch, normaliseCode } from '../../../infra/apex-404/codes.js'
import {
  DOCUMENTS,
  DOCUMENT_HOSTS,
  RETIRED_HOSTS,
  documentForHost,
} from '../../../infra/apex-404/documents.js'

/**
 * The private document links' two security primitives: which host is which document,
 * and whether a code matches.
 *
 * ⚠️ `crypto.subtle.timingSafeEqual` is a Workers extension that Node does not have, so
 * every comparison here injects Node's own `timingSafeEqual`. Production uses the
 * Workers one; R8 in the rollout proves it runs there (a right code opens, a wrong one
 * does not).
 *
 * The example codes are made of non-words (`zzzz`, `yyyy`, …) on purpose: the real links'
 * words must never appear in this public repository, not even as a test fixture.
 */
const equal = (a: Uint8Array, b: Uint8Array) => nodeTimingSafeEqual(a, b)
const SECRET = 'zzzz-yyyy-xxxx-wwww-vvvv-uuuu'

describe('documents', () => {
  it.each([
    ['catalogue.wear-run.help', 'catalogue'],
    ['catalogue.wear-run.com', 'catalogue'],
    ['profile.wear-run.help', 'profile'],
    ['profile.wear-run.com', 'profile'],
    ['PROFILE.wear-run.help', 'profile'],
    ['Catalogue.Wear-Run.COM', 'catalogue'],
  ])('maps %s to the %s, case-insensitively', (host, id) => {
    expect(documentForHost(host)?.id).toBe(id)
  })

  it('lists every document host in one place, .help first (decided 2026-09-17)', () => {
    expect(DOCUMENT_HOSTS).toEqual([
      'catalogue.wear-run.help',
      'catalogue.wear-run.com',
      'profile.wear-run.help',
      'profile.wear-run.com',
    ])
  })

  it.each([
    'wear-run.help',
    'www.wear-run.help',
    'wear-run.com',
    'www.wear-run.com',
    'go.wear-run.com',
    'mta-sts.wear-run.com',
    'mta-sts.wear-run.help',
    'catalogue.wear-run.help.example.com',
    'catalogue.wear-run.com.example.com',
    'catalogue.wear-run.co',
  ])('maps nothing to %s — not an apex, not the email project, not a look-alike', (host) => {
    expect(documentForHost(host)).toBeUndefined()
  })

  it('keeps the R2 keys exactly as the objects are named, typo included', () => {
    expect(DOCUMENTS.catalogue.pdfKey).toBe('RUN PRODUCT CATALOUGE.pdf')
    expect(DOCUMENTS.profile.pdfKey).toBe('Company Profile.pdf')
  })

  it('reads each document code from its own secret', () => {
    expect(DOCUMENTS.catalogue.secret).toBe('CATALOGUE_CODE')
    expect(DOCUMENTS.profile.secret).toBe('PROFILE_CODE')
  })

  it('retires exactly the apex and www hosts', () => {
    expect([...RETIRED_HOSTS].sort()).toEqual(['wear-run.help', 'www.wear-run.help'])
  })
})

describe('normaliseCode', () => {
  it('accepts a code and lower-cases it, because an app may capitalise the first letter', () => {
    expect(normaliseCode(SECRET)).toBe(SECRET)
    expect(normaliseCode('Zzzz-Yyyy-Xxxx-Wwww-Vvvv-Uuuu')).toBe(SECRET)
  })

  it('accepts digits, because chosen words may carry a year', () => {
    expect(normaliseCode('zzzz-9999')).toBe('zzzz-9999')
  })

  it.each([
    '',
    '-',
    'zzzz--yyyy',
    'zzzz-',
    '-zzzz',
    'zzzz%2Dyyyy',
    'zzzz yyyy',
    'zzzz_yyyy',
    'zéro',
    'z'.repeat(65),
  ])('refuses %j', (input) => {
    expect(normaliseCode(input)).toBeNull()
  })
})

describe('codesMatch', () => {
  it('matches the exact code', () => {
    expect(codesMatch(SECRET, SECRET, equal)).toBe(true)
  })

  it('tolerates a trailing newline or capitals in the stored secret', () => {
    // `wrangler secret put` from a terminal can keep the newline typed after the value.
    expect(codesMatch(SECRET, `${SECRET.toUpperCase()}\n`, equal)).toBe(true)
  })

  it('refuses a code one letter away', () => {
    expect(codesMatch('zzzz-yyyy-xxxx-wwww-vvvv-uuut', SECRET, equal)).toBe(false)
  })

  it('compares in constant time when lengths differ — the input against itself, negated', () => {
    const spy = vi.fn(equal)
    expect(codesMatch('zzzz-yyyy', SECRET, spy)).toBe(false)
    expect(spy).toHaveBeenCalledTimes(1)
    const [first, second] = spy.mock.calls[0] as [Uint8Array, Uint8Array]
    expect(first).toBe(second)
  })

  it.each([undefined, '', '   \n'])('fails closed when the secret is %j', (missing) => {
    const spy = vi.fn(equal)
    expect(codesMatch(SECRET, missing, spy)).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })
})
