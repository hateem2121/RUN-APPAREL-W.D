import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { SECURITY_TXT } from '@run-apparel/shared'
import { describe, expect, it, vi } from 'vitest'
import { CACHE_CONTROL, FILES, createHandler } from '../../../infra/apex-404/index.js'
import { createVisitRecorder } from '../../../infra/apex-404/visits.js'
import { migratedDatabase } from './migrationReplay/migrated'
import { d1From } from './migrationReplay/sqliteD1'

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
 *   5. A visit is recorded only for a GET, only after the response is built, and only
 *      through `ctx.waitUntil`: a failed write changes no status, header or byte, and no
 *      stored visit row holds a code (owner decisions D24–D32, 2026-09-15).
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
type Ctx = { waitUntil(promise: Promise<unknown>): void }
type StoredVisit = Record<string, string | number | null>

/** Every response this file produces, for the leak scan at the end. */
const captured: Captured[] = []
/** Every visit row this file reads back, for the same scan. */
const stored: StoredVisit[] = []

/**
 * One handler for the whole file, with a fixed clock and a fixed salt so every stored row
 * is predictable. A request sent without a `ctx` records nothing at all, which is exactly
 * how the Worker behaved before visits, and what every older test below still checks.
 */
const handle = createHandler({
  timingSafeEqual: (a, b) => nodeTimingSafeEqual(a, b),
  recordVisit: createVisitRecorder({
    now: () => new Date('2026-09-15T10:00:00.000Z'),
    randomHex: () => 'ab'.repeat(32),
  }),
})

async function send(
  url: string,
  init: RequestInit = {},
  over: {
    objects?: Record<string, string>
    env?: Record<string, unknown>
    cf?: Record<string, string>
    ctx?: Ctx
  } = {},
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
  const request = new Request(url, init)
  // Cloudflare attaches `request.cf`; a Node Request has none, so a test lends it one.
  if (over.cf) Object.defineProperty(request, 'cf', { value: over.cf })
  const res = await handle(request, env as never, over.ctx)
  // Bytes, not text: a marker's GIF is compared byte for byte. A null body reads as none.
  const bytes = new Uint8Array(await res.arrayBuffer())
  const body = new TextDecoder().decode(bytes)
  captured.push({ url, status: res.status, headers: [...res.headers], body })
  return { res, body, bytes, calls }
}

/** Both address families serve the same documents (decided 2026-09-17). */
const FAMILIES = ['wear-run.help', 'wear-run.com'] as const
type Family = (typeof FAMILIES)[number]
const catalogue = (path = '', family: Family = 'wear-run.help') =>
  `https://catalogue.${family}/${CATALOGUE_CODE}${path}`
const profile = (path = '', family: Family = 'wear-run.help') =>
  `https://profile.${family}/${PROFILE_CODE}${path}`
const MESSAGE = 'This link is not complete or no longer active.'

/** Safari on an iPhone (iOS 17.5), in the format WebKit sends. */
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
/** WhatsApp's link-preview fetcher: `WhatsApp/<version> <platform letter>`. */
const WHATSAPP = 'WhatsApp/2.23.20.0 A'
/** A person, as a browser and Cloudflare describe one. 203.0.113.7 is a documentation address. */
const PERSON = {
  'user-agent': IPHONE_SAFARI,
  'cf-connecting-ip': '203.0.113.7',
  'accept-language': 'en-GB,en;q=0.9',
  referer: 'https://mail.google.com/mail/u/0/',
}
const CF = {
  country: 'PK',
  region: 'Punjab',
  city: 'Lahore',
  timezone: 'Asia/Karachi',
  asOrganization: 'Example Network',
}
/** Three pages, so `pages_total` (3) can never pass for `furthest_page` (1). */
const THREE_PAGES: Record<string, string> = {
  ...OBJECTS,
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
    pages: [
      { number: 1, parts: [part('p001a'), part('p001b')] },
      { number: 2, parts: [part('p002a'), part('p002b')] },
      { number: 3, parts: [part('p003w', 4800)] },
    ],
  }),
}
/**
 * The marker's bytes, decoded here with Node's own base64, not the Worker's `atob`, so a
 * wrong constant in index.js cannot pass by being compared with itself. 42 bytes: the
 * base64 is 56 characters with no padding.
 */
const TRANSPARENT_GIF = new Uint8Array(
  Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
)

/**
 * A fresh database with every real migration applied, and a ctx that keeps whatever the
 * Worker hands to waitUntil. The write runs AFTER the response, so a test that read the
 * table without waiting for it would pass against an empty table.
 */
async function visitsDatabase() {
  const database = await migratedDatabase()
  const pending: Promise<unknown>[] = []
  const ctx: Ctx = {
    waitUntil: (promise) => {
      pending.push(promise)
    },
  }
  const rows = async () => {
    await Promise.all(pending)
    const found = database
      .prepare('SELECT * FROM document_visits ORDER BY id')
      .all() as StoredVisit[]
    stored.push(...found)
    return found
  }
  return { env: { VISITS: d1From(database) }, ctx, pending, rows }
}

/**
 * index.js says these are "Asserted as whole strings" — pin them here as literals, not
 * by re-deriving them from CACHE_CONTROL, or a value could drift with every assertion
 * below still passing because both sides changed together.
 *
 * ⚠️ `page` IS `no-store` FOR THE VISIT RECORDS (owner decision D32, 2026-09-15). It was
 * `public, max-age=300`, and a cache HIT never runs the Worker, so an open served from that
 * copy could not be counted. The pictures and the PDF keep their long cache.
 */
describe('CACHE_CONTROL is pinned to literal strings', () => {
  it('matches exactly what every response below is compared against', () => {
    expect(CACHE_CONTROL).toEqual({
      page: 'no-store',
      picture: 'public, max-age=31536000, immutable',
      download: 'public, max-age=3600',
      none: 'no-store',
      securityTxt: 'public, max-age=3600',
    })
  })
})

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

/**
 * THE SAME DOCUMENTS ON wear-run.com (decided 2026-09-17, live from the merge that deploys
 * it). Same words, same pictures, same PDF — and the .help addresses keep working, because
 * links already sent use them.
 */
describe('both address families open the same document', () => {
  // `[...FAMILIES]`, not FAMILIES: it.each takes a mutable array, and a readonly tuple
  // fails `tsc --noEmit`, which does check test files here.
  it.each([...FAMILIES])(
    'the catalogue opens on catalogue.%s, reading only its manifest',
    async (family) => {
      const { res, body, calls } = await send(catalogue('', family))
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe(CACHE_CONTROL.page)
      expect(body).toContain(`/${CATALOGUE_CODE}/p/${CATALOGUE_VERSION}/p001a-1600.webp`)
      expect(calls).toEqual([{ key: 'documents/catalogue/manifest.json', ranged: false }])
    },
  )

  it.each([...FAMILIES])('the profile opens on profile.%s', async (family) => {
    const { res, body } = await send(profile('', family))
    expect(res.status).toBe(200)
    expect(body).toContain(`/${PROFILE_CODE}/p/${PROFILE_VERSION}/p001w-1600.webp`)
  })

  it('serves the same picture and the same download on wear-run.com', async () => {
    const picture = await send(catalogue(`/p/${CATALOGUE_VERSION}/p001a-1600.webp`, 'wear-run.com'))
    expect(picture.res.status).toBe(200)
    expect(picture.body).toBe('webp:catalogue:p001a')
    expect(picture.res.headers.get('cache-control')).toBe(CACHE_CONTROL.picture)
    const download = await send(profile('/download', 'wear-run.com'))
    expect(download.res.status).toBe(200)
    expect(download.body).toBe('%PDF-profile')
    expect(download.res.headers.get('content-disposition')).toBe(
      'attachment; filename="RUN-Apparel-Company-Profile.pdf"',
    )
  })
})

/**
 * security.txt (RFC 9116) on every document host — decided 2026-09-18, live from the merge
 * that deploys it. It is answered BEFORE the word check (a `.well-known` segment is never a
 * code), costs no R2 read, and is never offered to the visit recorder.
 */
describe('security.txt', () => {
  it.each([
    'https://catalogue.wear-run.help/.well-known/security.txt',
    'https://profile.wear-run.help/.well-known/security.txt',
    'https://catalogue.wear-run.com/.well-known/security.txt',
    'https://profile.wear-run.com/.well-known/security.txt',
  ])('%s is the shared text, as plain UTF-8, cacheable, with no R2 read', async (url) => {
    const { res, body, calls } = await send(url)
    expect(res.status).toBe(200)
    expect(body).toBe(SECURITY_TXT)
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(calls).toEqual([])
  })

  it('HEAD gets the same headers and no body', async () => {
    const { res, body } = await send('https://catalogue.wear-run.com/.well-known/security.txt', {
      method: 'HEAD',
    })
    expect(res.status).toBe(200)
    expect(body).toBe('')
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  })

  it('is never recorded as a visit', async () => {
    const visits = await visitsDatabase()
    const { res } = await send(
      'https://profile.wear-run.help/.well-known/security.txt',
      { headers: PERSON },
      { env: visits.env, cf: CF, ctx: visits.ctx },
    )
    expect(res.status).toBe(200)
    expect(visits.pending).toEqual([])
  })

  it('only the exact path — anything else under .well-known is the not-active page', async () => {
    const { res, calls } = await send('https://catalogue.wear-run.help/.well-known/other.txt')
    expect(res.status).toBe(404)
    expect(calls).toEqual([])
  })
})

/**
 * A host this Worker has no document for. Production never routes one here — there is no
 * route on wear-run.com's own apex, which belongs to the separate email-signature project
 * — but if one arrived it must learn nothing and cost nothing.
 */
describe('a host this Worker does not serve', () => {
  it.each([
    'https://wear-run.com/catalogue',
    'https://go.wear-run.com/',
    `https://catalogue.wear-run.co/${CATALOGUE_CODE}`,
  ])('%s → a plain 404, no R2 read, never cached', async (url) => {
    const { res, body, calls } = await send(url)
    expect(res.status).toBe(404)
    expect(body).toBe('Not found.')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(calls).toEqual([])
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
    [
      "the profile's code on catalogue.wear-run.com",
      `https://catalogue.wear-run.com/${PROFILE_CODE}`,
    ],
    [
      "the catalogue's code on profile.wear-run.com",
      `https://profile.wear-run.com/${CATALOGUE_CODE}`,
    ],
    ['the bare wear-run.com host', 'https://profile.wear-run.com/'],
    [
      'a code one letter away on wear-run.com',
      'https://profile.wear-run.com/tttt-ssss-rrrr-qqqq-pppp-ooon',
    ],
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
      // 2026-09-16 (re-review, New Breakage): every existing prefix case used
      // "catalogue"; a regression that hard-coded that word at index.js's badPrefix
      // check would have stayed green. RETIRED_PATH_NAMES.find(...) is already generic,
      // so this passes today — it is the guard against that regression, not a fix.
      'PROFILE_CODE starts with its OWN retired word, e.g. "profile-2027"',
      'https://profile.wear-run.help/profile-2027',
      { PROFILE_CODE: 'profile-2027' },
      `[apex] profile's code starts with the retired path "profile" and cannot be served`,
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
    [
      // 2026-09-17: the rule is about the DOCUMENT, so a second address changes nothing —
      // and that is worth pinning, because wear-run.com has no retired route of its own.
      'the retired-word rule holds on wear-run.com too',
      'https://catalogue.wear-run.com/catalogue-2027',
      { CATALOGUE_CODE: 'catalogue-2027' },
      `[apex] catalogue's code starts with the retired path "catalogue" and cannot be served`,
    ],
    [
      'and so does the shared-code rule',
      'https://profile.wear-run.com/zzzz-shared-code',
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
      expect(loggedText).not.toContain('profile-2027')
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

describe('visits: opening the page', () => {
  it('a GET from an iPhone is one person row, and the page itself is never cached', async () => {
    const visits = await visitsDatabase()
    const { res } = await send(
      catalogue(),
      { headers: PERSON },
      { objects: THREE_PAGES, env: visits.env, cf: CF, ctx: visits.ctx },
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const rows = await visits.rows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      day: '2026-09-15',
      document: 'catalogue',
      kind: 'person',
      first_at: '2026-09-15T10:00:00.000Z',
      last_at: '2026-09-15T10:00:00.000Z',
      minutes_active: 0,
      opens: 1,
      furthest_page: 1,
      pages_total: 3,
      downloads: 0,
      country: 'PK',
      region: 'Punjab',
      city: 'Lahore',
      timezone: 'Asia/Karachi',
      network: 'Example Network',
      device: 'phone',
      system: 'iOS',
      browser: 'Safari',
      language: 'en-GB',
      came_from: 'mail.google.com',
    })
    expect(rows[0]?.visitor).toMatch(/^[0-9a-f]{16}$/)
  })

  /**
   * Owner decision W4, 2026-09-17: the two addresses are ONE document. A visit row is
   * keyed on (day, document, visitor, kind) and carries no hostname, so the same reader
   * opening each address is one row with two opens — not two rows, and not a second
   * "document".
   */
  it('an open on each address family is the same document, counted in one row', async () => {
    const visits = await visitsDatabase()
    for (const family of FAMILIES) {
      const { res } = await send(
        catalogue('', family),
        { headers: PERSON },
        { objects: THREE_PAGES, env: visits.env, cf: CF, ctx: visits.ctx },
      )
      expect(res.status).toBe(200)
    }
    const rows = await visits.rows()
    expect(rows).toHaveLength(1)
    // Only what this change is about: one row, one document, both opens counted. The
    // test above pins every other column of a row like this one.
    expect(rows[0]).toMatchObject({ document: 'catalogue', opens: 2 })
  })

  it('a HEAD is not an open, and is never offered to the recorder', async () => {
    const visits = await visitsDatabase()
    const { res } = await send(
      catalogue(),
      { method: 'HEAD', headers: PERSON },
      { objects: THREE_PAGES, env: visits.env, ctx: visits.ctx },
    )
    expect(res.status).toBe(200)
    expect(visits.pending).toEqual([])
    expect(await visits.rows()).toEqual([])
  })

  it('a wrong code records nothing', async () => {
    const visits = await visitsDatabase()
    const { res } = await send(
      'https://catalogue.wear-run.help/zzzz-yyyy-xxxx-wwww-vvvv-uuut',
      { headers: PERSON },
      { env: visits.env, ctx: visits.ctx },
    )
    expect(res.status).toBe(404)
    expect(visits.pending).toEqual([])
    expect(await visits.rows()).toEqual([])
  })

  it('without a ctx no write is even attempted, although VISITS is bound', async () => {
    const VISITS = { prepare: vi.fn(), batch: vi.fn() }
    const { res } = await send(catalogue(), { headers: PERSON }, { env: { VISITS } })
    expect(res.status).toBe(200)
    expect(VISITS.prepare).not.toHaveBeenCalled()
    expect(VISITS.batch).not.toHaveBeenCalled()
  })
})

describe('visits: reading markers', () => {
  it('answers a transparent GIF, never cached, without touching R2, and records the page', async () => {
    const visits = await visitsDatabase()
    const { res, bytes, calls } = await send(
      catalogue('/seen/3'),
      { headers: PERSON },
      { env: visits.env, ctx: visits.ctx },
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/gif')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin')
    expect(bytes).toEqual(TRANSPARENT_GIF)
    expect(bytes).toHaveLength(42)
    expect(calls).toEqual([])
    const rows = await visits.rows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'person', opens: 0, furthest_page: 3, downloads: 0 })
  })

  it.each(['/seen/0', '/seen/1000', '/seen/abc'])(
    '%s → the not-active page, no R2 read, nothing recorded',
    async (path) => {
      const visits = await visitsDatabase()
      const { res, body, calls } = await send(
        catalogue(path),
        { headers: PERSON },
        { env: visits.env, ctx: visits.ctx },
      )
      expect(res.status).toBe(404)
      expect(body).toContain(MESSAGE)
      expect(calls).toEqual([])
      expect(visits.pending).toEqual([])
    },
  )
})

describe('visits: the download stop', () => {
  it('counts a press and sends the browser on, with no R2 read and no code in any header', async () => {
    const visits = await visitsDatabase()
    const { res, body, calls } = await send(
      catalogue('/get'),
      { headers: PERSON },
      { env: visits.env, ctx: visits.ctx },
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('download')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(body).toBe('')
    expect(calls).toEqual([])
    // A browser resolves the relative location against the stop's own address.
    expect(new URL('download', catalogue('/get')).href).toBe(catalogue('/download'))
    const rows = await visits.rows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'person', opens: 0, furthest_page: 0, downloads: 1 })
  })

  it('refuses a speculative prefetch and counts nothing', async () => {
    const visits = await visitsDatabase()
    const { res, calls } = await send(
      catalogue('/get'),
      { headers: { ...PERSON, 'sec-purpose': 'prefetch' } },
      { env: visits.env, ctx: visits.ctx },
    )
    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(calls).toEqual([])
    expect(visits.pending).toEqual([])
    expect(await visits.rows()).toEqual([])
  })
})

describe('visits: the retired addresses', () => {
  it.each([
    ['https://wear-run.help/catalogue', 'catalogue'],
    ['https://www.wear-run.help/profile', 'profile'],
  ])(
    'a person at %s is one old-link try for the %s, and the 410 is unchanged',
    async (url, document) => {
      const visits = await visitsDatabase()
      const { res, body, calls } = await send(
        url,
        { headers: PERSON },
        { env: visits.env, ctx: visits.ctx },
      )
      expect(res.status).toBe(410)
      expect(body).toContain(MESSAGE)
      expect(calls).toEqual([])
      const rows = await visits.rows()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        document,
        kind: 'old-link',
        opens: 1,
        furthest_page: 0,
        pages_total: 0,
        downloads: 0,
      })
    },
  )

  it.each<[string, Record<string, string>]>([
    ['asks not to be tracked (Sec-GPC: 1)', { ...PERSON, 'sec-gpc': '1' }],
    ['comes from curl', { ...PERSON, 'user-agent': 'curl/8.7.1' }],
  ])('a GET that %s is not recorded', async (_label, headers) => {
    const visits = await visitsDatabase()
    const { res } = await send(
      'https://wear-run.help/catalogue',
      { headers },
      { env: visits.env, ctx: visits.ctx },
    )
    expect(res.status).toBe(410)
    expect(await visits.rows()).toEqual([])
  })

  it('a HEAD is never offered to the recorder', async () => {
    const visits = await visitsDatabase()
    const { res } = await send(
      'https://wear-run.help/catalogue',
      { method: 'HEAD', headers: PERSON },
      { env: visits.env, ctx: visits.ctx },
    )
    expect(res.status).toBe(410)
    expect(visits.pending).toEqual([])
    expect(await visits.rows()).toEqual([])
  })
})

describe('visits: who is counted', () => {
  it('Sec-GPC: 1 on the page is a private visit that keeps nothing about the visitor', async () => {
    const visits = await visitsDatabase()
    await send(
      catalogue(),
      { headers: { ...PERSON, 'sec-gpc': '1' } },
      { objects: THREE_PAGES, env: visits.env, cf: CF, ctx: visits.ctx },
    )
    const rows = await visits.rows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'private',
      visitor: '',
      opens: 1,
      country: '',
      region: '',
      city: '',
      timezone: '',
      network: '',
      device: '',
      system: '',
      browser: '',
      language: '',
      came_from: '',
    })
  })

  it("WhatsApp's link-preview fetcher is a link preview, named as such", async () => {
    const visits = await visitsDatabase()
    await send(
      catalogue(),
      { headers: { 'user-agent': WHATSAPP } },
      { objects: THREE_PAGES, env: visits.env, ctx: visits.ctx },
    )
    const rows = await visits.rows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'link-preview',
      browser: 'WhatsApp',
      device: 'unknown',
      opens: 1,
    })
  })
})

describe('visits: a failing database changes nothing a visitor receives', () => {
  it('same status, headers and bytes as with no database, and one fixed log line', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const pending: Promise<unknown>[] = []
      const ctx: Ctx = {
        waitUntil: (promise) => {
          pending.push(promise)
        },
      }
      const failing = {
        prepare: () => {
          throw new Error('D1_ERROR: no such table: document_visits')
        },
        batch: async () => [],
      }
      const init = { headers: PERSON }
      const plain = await send(catalogue(), init, { objects: THREE_PAGES, cf: CF, ctx })
      const broken = await send(catalogue(), init, {
        objects: THREE_PAGES,
        env: { VISITS: failing },
        cf: CF,
        ctx,
      })
      await Promise.all(pending)
      expect(broken.res.status).toBe(plain.res.status)
      expect([...broken.res.headers]).toEqual([...plain.res.headers])
      expect(broken.bytes).toEqual(plain.bytes)
      // One write was attempted — the plain request has no database to try — and it failed.
      expect(pending).toHaveLength(1)
      expect(log).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith('[visits] could not record:', 'Error')
    } finally {
      log.mockRestore()
    }
  })
})

describe('every response', () => {
  it('asks not to be indexed, not to pass on the address, and not to be sniffed', () => {
    expect(captured.length).toBeGreaterThan(30)
    // The visit routes are inside this scan, not beside it.
    expect(captured.some((r) => r.url.includes('/seen/') && r.status === 200)).toBe(true)
    expect(captured.some((r) => r.url.endsWith('/get') && r.status === 302)).toBe(true)
    for (const response of captured) {
      const headers = new Map(response.headers)
      expect(headers.get('x-robots-tag'), response.url).toBe('noindex, nofollow')
      expect(headers.get('referrer-policy'), response.url).toBe('no-referrer')
      expect(headers.get('x-content-type-options'), response.url).toBe('nosniff')
      // 2026-09-18: the two headers securityheaders.com and internet.nl found missing on
      // these hosts. The value is the site's own, byte for byte.
      expect(headers.get('x-frame-options'), response.url).toBe('DENY')
      expect(headers.get('permissions-policy'), response.url).toBe(
        'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()',
      )
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

  it('and no visit row this file stored ever holds a code', () => {
    expect(stored.length).toBeGreaterThan(5)
    for (const row of stored) {
      const text = Object.values(row).join('\n')
      expect(text).not.toContain(CATALOGUE_CODE)
      expect(text).not.toContain(PROFILE_CODE)
    }
  })
})
