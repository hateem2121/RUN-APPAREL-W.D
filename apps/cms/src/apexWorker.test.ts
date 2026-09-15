import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CACHE_CONTROL, FILES, createHandler } from '../../../infra/apex-404/index.js'

/**
 * The private document Worker end to end, against a stub R2 bucket.
 *
 * WHAT MUST NEVER BREAK, in order of cost if it did:
 *   1. No code, a wrong code, or the other document's code → the "not active" page, and
 *      R2 is NEVER read. Every refusal below asserts `calls` is empty.
 *   2. A picture is served only if the manifest lists it — the bucket cannot be walked.
 *   3. The download is a whole 200 and never forwards the Range to R2 — a 206 from a
 *      Worker is not cached (the 2026-08-30 incident), so the edge must slice.
 *   4. No response header, and no body except a page the code opened, contains a code.
 *
 * The codes are non-words on purpose: the real links' words must never appear in this
 * public repository.
 */
const CATALOGUE_CODE = 'zzzz-yyyy-xxxx-wwww-vvvv-uuuu'
const PROFILE_CODE = 'tttt-ssss-rrrr-qqqq-pppp-oooo'
const CATALOGUE_VERSION = '20260911-e8698731'
const PROFILE_VERSION = '20260911-ea7936d5'
const part = (id: string, width = 2400, height = 1350) => ({ id, width, height })

const OBJECTS: Record<string, string> = {
  'documents/catalogue/manifest.json': JSON.stringify({
    schema: 1,
    document: 'catalogue',
    version: CATALOGUE_VERSION,
    widths: [800, 1600, 2400],
    pdf: {
      key: 'RUN PRODUCT CATALOUGE.pdf',
      bytes: 54_336_461,
      md5: 'e8698731ac2348595c3268dfd6d466c6',
    },
    pages: [{ number: 1, parts: [part('p001a'), part('p001b')] }],
  }),
  'documents/profile/manifest.json': JSON.stringify({
    schema: 1,
    document: 'profile',
    version: PROFILE_VERSION,
    widths: [800, 1600, 2400],
    pdf: { key: 'Company Profile.pdf', bytes: 16_891_515, md5: 'ea7936d585961a06d1e83c4cd8d02b14' },
    pages: [{ number: 1, parts: [part('p001w')] }],
  }),
  [`documents/catalogue/${CATALOGUE_VERSION}/p001a-1600.webp`]: 'webp:catalogue:p001a',
  [`documents/profile/${PROFILE_VERSION}/p001w-800.webp`]: 'webp:profile:p001w',
  'RUN PRODUCT CATALOUGE.pdf': '%PDF-catalogue',
  'Company Profile.pdf': '%PDF-profile',
}

type Call = { key: string; ranged: boolean }
type Captured = { url: string; status: number; headers: [string, string][]; body: string }

/** Every response this file produces, for the leak scan at the end. */
const captured: Captured[] = []

const handle = createHandler({ timingSafeEqual: (a, b) => nodeTimingSafeEqual(a, b) })

async function send(
  url: string,
  init: RequestInit = {},
  over: { objects?: Record<string, string>; env?: Record<string, unknown> } = {},
) {
  const calls: Call[] = []
  const objects = over.objects ?? OBJECTS
  const env = {
    CATALOGUE_CODE,
    PROFILE_CODE,
    ...over.env,
    ASSETS: {
      get: async (key: string, options?: { range?: unknown }) => {
        calls.push({ key, ranged: options?.range !== undefined })
        const body = objects[key]
        return body === undefined
          ? null
          : { body, httpEtag: `"etag:${key}"`, text: async () => body }
      },
    },
  }
  const res = await handle(new Request(url, init), env as never)
  const body = res.body === null ? '' : await res.text()
  captured.push({ url, status: res.status, headers: [...res.headers], body })
  return { res, body, calls }
}

const catalogue = (path = '') => `https://catalogue.wear-run.help/${CATALOGUE_CODE}${path}`
const profile = (path = '') => `https://profile.wear-run.help/${PROFILE_CODE}${path}`
const MESSAGE = 'This link is not complete or no longer active.'

describe('a document page', () => {
  it('opens with the right code on its own host, reading only the manifest', async () => {
    const { res, body, calls } = await send(catalogue())
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe(CACHE_CONTROL.page)
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(body).toContain(`/${CATALOGUE_CODE}/p/${CATALOGUE_VERSION}/p001a-1600.webp`)
    expect(calls).toEqual([{ key: 'documents/catalogue/manifest.json', ranged: false }])
  })

  it('opens with a trailing slash too', async () => {
    expect((await send(catalogue('/'))).res.status).toBe(200)
  })

  it('forgives capitals, which a messaging app may add', async () => {
    const url = `https://catalogue.wear-run.help/${CATALOGUE_CODE.toUpperCase()}`
    expect((await send(url)).res.status).toBe(200)
  })

  it('opens the profile with its own code', async () => {
    const { res, body } = await send(profile())
    expect(res.status).toBe(200)
    expect(body).toContain(`/${PROFILE_CODE}/p/${PROFILE_VERSION}/p001w-1600.webp`)
  })
})

describe('refusals never touch R2', () => {
  const cases: [string, string][] = [
    ['a code one letter away', 'https://catalogue.wear-run.help/zzzz-yyyy-xxxx-wwww-vvvv-uuut'],
    ['the bare host', 'https://catalogue.wear-run.help/'],
    ['five words', 'https://catalogue.wear-run.help/zzzz-yyyy-xxxx-wwww-vvvv'],
    ['seven words', 'https://catalogue.wear-run.help/zzzz-yyyy-xxxx-wwww-vvvv-uuuu-tttt'],
    ["the profile's code on the catalogue host", `https://catalogue.wear-run.help/${PROFILE_CODE}`],
    ["the catalogue's code on the profile host", `https://profile.wear-run.help/${CATALOGUE_CODE}`],
    ['a percent-encoded code', 'https://catalogue.wear-run.help/zzzz%2Dyyyy-xxxx-wwww-vvvv-uuuu'],
    ['an underscore in the code', 'https://catalogue.wear-run.help/zzzz_yyyy-xxxx-wwww-vvvv-uuuu'],
    ['an unknown sub-path', catalogue('/admin')],
    ['extra segments', catalogue(`/p/${CATALOGUE_VERSION}/p001a-1600.webp/more`)],
  ]

  it.each(cases)('%s → the not-active page', async (_label, url) => {
    const { res, body, calls } = await send(url)
    expect(res.status).toBe(404)
    expect(body).toContain(MESSAGE)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(calls).toEqual([])
  })
})

describe('fails closed without a secret', () => {
  it.each([undefined, '', '  \n'])(
    'CATALOGUE_CODE = %j → not active, no R2 read',
    async (secret) => {
      const { res, calls } = await send(catalogue(), {}, { env: { CATALOGUE_CODE: secret } })
      expect(res.status).toBe(404)
      expect(calls).toEqual([])
    },
  )

  it('and the same request opens once the secret is set (positive control)', async () => {
    expect((await send(catalogue(), {}, { env: { CATALOGUE_CODE } })).res.status).toBe(200)
  })
})

describe('pictures', () => {
  it('serves a listed picture, immutable, same-origin only', async () => {
    const { res, body, calls } = await send(catalogue(`/p/${CATALOGUE_VERSION}/p001a-1600.webp`))
    expect(res.status).toBe(200)
    expect(body).toBe('webp:catalogue:p001a')
    expect(res.headers.get('content-type')).toBe('image/webp')
    expect(res.headers.get('cache-control')).toBe(CACHE_CONTROL.picture)
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin')
    expect(calls.map((c) => c.key)).toEqual([
      'documents/catalogue/manifest.json',
      `documents/catalogue/${CATALOGUE_VERSION}/p001a-1600.webp`,
    ])
  })

  it.each([
    ['an unlisted part', `/p/${CATALOGUE_VERSION}/p009a-1600.webp`],
    ['an unlisted width', `/p/${CATALOGUE_VERSION}/p001a-1200.webp`],
    ['an old version', `/p/20250101-e8698731/p001a-1600.webp`],
    ['an encoded slash', `/p/${CATALOGUE_VERSION}/p001a%2F1600.webp`],
    ['the manifest', `/p/${CATALOGUE_VERSION}/manifest.json`],
  ])('refuses %s after reading only the manifest', async (_label, path) => {
    const { res, calls } = await send(catalogue(path))
    expect(res.status).toBe(404)
    expect(calls.map((c) => c.key)).toEqual(['documents/catalogue/manifest.json'])
  })

  it('answers 503, not cached, when a listed picture is missing from R2', async () => {
    const { res } = await send(catalogue(`/p/${CATALOGUE_VERSION}/p001b-1600.webp`))
    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('the download', () => {
  it('is the original PDF, as an attachment, cacheable for an hour', async () => {
    const { res, body, calls } = await send(catalogue('/download'))
    expect(res.status).toBe(200)
    expect(body).toBe('%PDF-catalogue')
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="RUN-Apparel-Catalogue.pdf"',
    )
    expect(res.headers.get('cache-control')).toBe(CACHE_CONTROL.download)
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(calls).toEqual([{ key: 'RUN PRODUCT CATALOUGE.pdf', ranged: false }])
  })

  it('answers a Range request with a whole 200 and never forwards the Range', async () => {
    const { res, calls } = await send(catalogue('/download'), {
      headers: { range: 'bytes=0-1023' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-range')).toBeNull()
    expect(calls[0]?.ranged).toBe(false)
  })

  it('refuses a speculative prefetch, so nobody downloads 54 MB by hovering', async () => {
    const { res, calls } = await send(catalogue('/download'), {
      headers: { 'sec-purpose': 'prefetch' },
    })
    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(calls).toEqual([])
  })

  it('names the profile download after the profile', async () => {
    const { res } = await send(profile('/download'))
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="RUN-Apparel-Company-Profile.pdf"',
    )
  })
})

describe('the retired apex addresses', () => {
  it.each([
    'https://wear-run.help/catalogue',
    'https://wear-run.help/CATALOGUE/',
    'https://wear-run.help/catalogue.pdf',
    'https://www.wear-run.help/catalogue',
    'https://wear-run.help/profile',
    'https://wear-run.help/profile/anything',
    'https://www.wear-run.help/profile',
  ])('%s → 410 not active, never a PDF, no R2 read', async (url) => {
    const { res, body, calls } = await send(url)
    expect(res.status).toBe(410)
    expect(body).toContain(MESSAGE)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(calls).toEqual([])
  })

  it('refuses every method the same way', async () => {
    const { res, calls } = await send('https://wear-run.help/catalogue', { method: 'POST' })
    expect(res.status).toBe(410)
    expect(calls).toEqual([])
  })
})

describe('methods', () => {
  it('HEAD gets the page headers and no body', async () => {
    const { res, body } = await send(catalogue(), { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(body).toBe('')
    expect(res.headers.get('cache-control')).toBe(CACHE_CONTROL.page)
  })

  it('any other method on a matching code → 405 with an allow header', async () => {
    const { res, calls } = await send(catalogue(), { method: 'POST' })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
    expect(calls).toEqual([])
  })
})

describe('a broken upload is diagnosable and never cached', () => {
  // The Worker logs why it refused a manifest. The spy keeps that line out of the test
  // output and proves the reason is there for whoever reads the Worker's logs.
  it.each<[string, Record<string, string>, string | null]>([
    ['a missing manifest', {}, null],
    ['a manifest that is not JSON', { 'documents/catalogue/manifest.json': '{' }, 'is not JSON'],
    [
      "the profile's manifest under the catalogue's key",
      { 'documents/catalogue/manifest.json': OBJECTS['documents/profile/manifest.json']! },
      'document must be catalogue',
    ],
  ])('%s → 503', async (_label, objects, logged) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { res } = await send(catalogue(), {}, { objects })
      expect(res.status).toBe(503)
      expect(res.headers.get('cache-control')).toBe('no-store')
      if (logged === null) expect(log).not.toHaveBeenCalled()
      else expect(log).toHaveBeenCalledWith(expect.stringContaining(logged))
    } finally {
      log.mockRestore()
    }
  })
})

/**
 * THE WORD RULE (review Important 1, owner decision D18, 2026-09-15). Workers Caching
 * keys on path, not host, and the four retired zone routes match any suffix
 * (`wear-run.help/catalogue*`, `/profile*`, and the `www.` pair) — so a code shaped
 * like a retired word could be served from a cache entry the retired routes still
 * match, and two documents sharing one code would answer for each other. Checked
 * against the deployed secret itself, before the code comparison, so it costs no R2
 * read either way.
 */
describe('the word rule: a retired path word or a shared code refuses, before any R2 read', () => {
  it.each<[string, string, Record<string, string>, string]>([
    [
      'CATALOGUE_CODE is exactly the retired word "catalogue"',
      'https://catalogue.wear-run.help/catalogue',
      { CATALOGUE_CODE: 'catalogue' },
      `[apex] catalogue's code starts with the retired path "catalogue" and cannot be served`,
    ],
    [
      'CATALOGUE_CODE starts with the retired word, e.g. "catalogue-2027"',
      'https://catalogue.wear-run.help/catalogue-2027',
      { CATALOGUE_CODE: 'catalogue-2027' },
      `[apex] catalogue's code starts with the retired path "catalogue" and cannot be served`,
    ],
    [
      "PROFILE_CODE starts with the OTHER document's retired word too",
      'https://profile.wear-run.help/catalogue-oops',
      { PROFILE_CODE: 'catalogue-oops' },
      `[apex] profile's code starts with the retired path "catalogue" and cannot be served`,
    ],
    [
      'CATALOGUE_CODE equals PROFILE_CODE',
      'https://catalogue.wear-run.help/zzzz-shared-code',
      { CATALOGUE_CODE: 'zzzz-shared-code', PROFILE_CODE: 'zzzz-shared-code' },
      `[apex] catalogue's code equals profile's code and cannot be served`,
    ],
    [
      'the same shared code also refuses on the profile host',
      'https://profile.wear-run.help/zzzz-shared-code',
      { CATALOGUE_CODE: 'zzzz-shared-code', PROFILE_CODE: 'zzzz-shared-code' },
      `[apex] profile's code equals catalogue's code and cannot be served`,
    ],
  ])('%s → the not-active page, no R2 read', async (_label, url, env, logged) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { res, calls } = await send(url, {}, { env })
      expect(res.status).toBe(404)
      expect(calls).toEqual([])
      expect(log).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith(logged)
      // Never the secret's value — only the retired word or the other document's name.
      const loggedText = log.mock.calls.flat().join('\n')
      expect(loggedText).not.toContain('zzzz-shared-code')
      expect(loggedText).not.toContain('catalogue-2027')
      expect(loggedText).not.toContain('catalogue-oops')
    } finally {
      log.mockRestore()
    }
  })

  it('the control "zzzz-catalogue" — contains but does not START WITH the word — still opens', async () => {
    const { res, calls } = await send(
      'https://catalogue.wear-run.help/zzzz-catalogue',
      {},
      {
        env: { CATALOGUE_CODE: 'zzzz-catalogue' },
      },
    )
    expect(res.status).toBe(200)
    expect(calls).toEqual([{ key: 'documents/catalogue/manifest.json', ranged: false }])
  })
})

describe('the backup script still finds both PDFs', () => {
  it('exports FILES with the real R2 keys', () => {
    expect(Object.values(FILES).map((f) => f.key)).toEqual([
      'RUN PRODUCT CATALOUGE.pdf',
      'Company Profile.pdf',
    ])
  })
})

/**
 * The owner's words for each link must exist ONLY as Worker secrets. This proves the
 * Worker compares a request against `env[doc.secret]` and never against text written in
 * its source — which is how a real link's words would otherwise end up in this public
 * repository.
 */
describe("no link's words are ever written into the Worker", () => {
  const dir = join(import.meta.dirname, '..', '..', '..', 'infra', 'apex-404')
  const sources = readdirSync(dir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, text: readFileSync(join(dir, file), 'utf8') }))
  const literalCompare = /codesMatch\([^,)]+,\s*['"`]/

  it('compares a request only against the secret held in env', () => {
    const sites = sources
      .filter((s) => s.file !== 'codes.js')
      .flatMap((s) =>
        [...s.text.matchAll(/codesMatch\(([^)]*)\)/g)].map((m) => ({ file: s.file, args: m[1]! })),
      )
    expect(sites.length).toBeGreaterThan(0)
    for (const site of sites) {
      expect(site.args.split(',')[1]?.trim(), site.file).toBe('env[doc.secret]')
    }
  })

  it('passes no string literal to codesMatch anywhere (negative control included)', () => {
    for (const { file, text } of sources) {
      expect(literalCompare.test(text), file).toBe(false)
    }
    expect(literalCompare.test("codesMatch(code, 'zzzz-yyyy', equal)")).toBe(true)
  })
})

describe('every response', () => {
  it('asks not to be indexed, not to pass on the address, and not to be sniffed', () => {
    expect(captured.length).toBeGreaterThan(30)
    for (const response of captured) {
      const headers = new Map(response.headers)
      expect(headers.get('x-robots-tag'), response.url).toBe('noindex, nofollow')
      expect(headers.get('referrer-policy'), response.url).toBe('no-referrer')
      expect(headers.get('x-content-type-options'), response.url).toBe('nosniff')
    }
  })

  it('never carries a code — except the links inside a page that code opened', () => {
    for (const response of captured) {
      const headerText = response.headers.map(([k, v]) => `${k}: ${v}`).join('\n')
      expect(headerText, response.url).not.toContain(CATALOGUE_CODE)
      expect(headerText, response.url).not.toContain(PROFILE_CODE)
      const openedPage =
        response.status === 200 &&
        response.headers.some(([k, v]) => k === 'content-type' && v.startsWith('text/html'))
      if (!openedPage) {
        expect(response.body, response.url).not.toContain(CATALOGUE_CODE)
        expect(response.body, response.url).not.toContain(PROFILE_CODE)
      } else {
        const other = response.url.includes('catalogue.') ? PROFILE_CODE : CATALOGUE_CODE
        expect(response.body, response.url).not.toContain(other)
      }
    }
  })
})
