import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FLAG_AT,
  judgePosterContent,
  judgePosters,
  median,
  modelUrlFromPayload,
  OWNER_EXCEPTIONS,
  type PosterSample,
  resolveLiveModelUrl,
  webpDimensions,
} from '../../../scripts/poster-sizes.mjs'

/**
 * poster-sizes.mjs judges live poster weight against a per-family median (audit
 * L-11/IM-02). Every number below is a LIVE measurement, not invented — read
 * verbatim off production on 2026-09-17 (rows: r-afp, r-wzu, r-asb, r-ect, the
 * Sportswear family; see scripts/poster-sizes.mjs for how the whole catalogue is
 * fetched). "Before" is what production carried before the trim in
 * scripts/shrink-posters-gently.mjs; "after" is the byte counts that script
 * produces — GENTLE_TRIMS there is judged against this same median.
 */

const SPORTSWEAR = 'Sportswear'

const row = (slug: string, colour: string, bytes: number, family = SPORTSWEAR): PosterSample => ({
  slug,
  colour,
  family,
  bytes,
})

const BEFORE: PosterSample[] = [
  row('r-afp', 'petrol', 24830),
  row('r-afp', 'mustard', 33846),
  row('r-afp', 'sky', 38296),
  row('r-afp', 'mauve', 46580),
  row('r-afp', 'butter', 48988),
  row('r-wzu', 'blush', 173448),
  row('r-wzu', 'butter', 177230),
  row('r-wzu', 'powder-blue', 191264),
  row('r-wzu', 'beige', 181698),
  row('r-wzu', 'plum', 168964),
  row('r-asb', 'petrol', 40548),
  row('r-asb', 'sage', 88260),
  row('r-asb', 'pebble', 107208),
  row('r-asb', 'blush', 105972),
  row('r-asb', 'burgundy', 46690),
  row('r-ect', 'rust', 52024),
  row('r-ect', 'ash', 42704),
  row('r-ect', 'mustard', 50100),
  row('r-ect', 'lilac', 50934),
  row('r-ect', 'sage', 49566),
]

// Only r-wzu (all five, VEST) and r-asb blush/pebble are in GENTLE_TRIMS — the
// other twelve rows are exactly the BEFORE bytes above.
const AFTER: PosterSample[] = BEFORE.map((poster) => {
  const trimmed: Record<string, number> = {
    'r-wzu:blush': 133930,
    'r-wzu:butter': 133180,
    'r-wzu:powder-blue': 139524,
    'r-wzu:beige': 132298,
    'r-wzu:plum': 130004,
    'r-asb:blush': 99020,
    'r-asb:pebble': 99040,
  }
  const bytes = trimmed[`${poster.slug}:${poster.colour}`]
  return bytes === undefined ? poster : { ...poster, bytes }
})

describe('median', () => {
  it('is 0 for an empty list', () => {
    expect(median([])).toBe(0)
  })

  it('is the middle value for an odd count', () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  it('is the mean of the two middle values for an even count', () => {
    expect(median([10, 20, 30, 40])).toBe(25)
  })

  it('matches the live Sportswear median measured 2026-09-17', () => {
    expect(median(BEFORE.map((p) => p.bytes))).toBe(50517)
  })
})

describe('OWNER_EXCEPTIONS', () => {
  it('is pinned to the one 2026-09-17 exception', () => {
    expect(OWNER_EXCEPTIONS).toEqual([
      {
        product: 'r-wzu',
        maxRatio: 3,
        reason: 'owner\'s choice on 2026-09-17, "Shrink gently": the vest keeps its detail',
      },
    ])
  })

  it('FLAG_AT is 2', () => {
    expect(FLAG_AT).toBe(2)
  })
})

describe('judgePosters — before the trim', () => {
  it('flags all five r-wzu (above the 3× exception ceiling) and two r-asb', () => {
    const { rows, medians, flagged, excepted } = judgePosters(BEFORE)
    expect(medians).toEqual({ [SPORTSWEAR]: 50517 })
    expect(flagged.map((r) => `${r.slug}:${r.colour}`).sort()).toEqual(
      [
        'r-wzu:blush',
        'r-wzu:butter',
        'r-wzu:powder-blue',
        'r-wzu:beige',
        'r-wzu:plum',
        'r-asb:pebble',
        'r-asb:blush',
      ].sort(),
    )
    expect(excepted).toEqual([])
    expect(rows).toHaveLength(20)
    // Every flagged r-wzu row says why the exception did not cover it.
    for (const r of flagged.filter((r) => r.slug === 'r-wzu')) {
      expect(r.note).toContain('above the 3× exception ceiling')
    }
  })

  it('leaves the rest ok, including r-cch at 1.96× measured live (kept out of this fixture)', () => {
    // M7 (2026-09-23): r-cch itself is NOT one of the 20 BEFORE rows (see the module
    // doc above) — this test's own name promised it and never actually included it,
    // so it only re-asserted the count the previous test's exact list already
    // implies. Added HERE as a local addition, not to the shared BEFORE fixture,
    // so the 20-row count and the 50517 median pinned elsewhere in this file stay
    // the exact 2026-09-17 measurement. Inserting one value above BEFORE's 12th-
    // ranked entry (52024) never moves the median's INDEX, so the recomputed
    // 21-poster median is 50934 (BEFORE's already-unchanged 11th-ranked value)
    // regardless of the exact byte count chosen here — 50517 was the 20-poster figure.
    const nearMissBytes = Math.round(50934 * 1.96) // 99831 — RUNBOOK's own "1.96×"
    const { flagged, rows } = judgePosters([...BEFORE, row('r-cch', 'blush', nearMissBytes)])
    expect(flagged).toHaveLength(7)
    // The real boundary assertion: a near-miss just under FLAG_AT is 'ok', not
    // merely absent from a length count that would also pass if it were dropped
    // from the fixture entirely.
    expect(rows.find((r) => r.slug === 'r-cch')?.verdict).toBe('ok')
  })
})

describe('poster-sizes CLI — exit codes (#14)', () => {
  const SCRIPT = join(import.meta.dirname, '..', '..', '..', 'scripts', 'poster-sizes.mjs')
  let server: Server | undefined

  afterEach(async () => {
    if (!server) return
    await new Promise((resolve) => server!.close(resolve))
    server = undefined
  })

  /**
   * docs/RUNBOOK.md's own documented contract is "2 if anything could not be
   * read" — distinct from 1, "flagged". Before this fix, a THROWN error (a fetch
   * that never got a response, or response.json() failing on a non-JSON body,
   * such as a Cloudflare challenge page) fell into the top-level `.catch()`,
   * which exited 1 — the same code as "a poster is too heavy", a verdict this run
   * never reached at all.
   */
  it('exits 2 on a thrown read error, not 1 — a non-JSON body such as a challenge page', async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html>cloudflare challenge</html>')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as { port: number }).port

    const child = spawn(process.execPath, [SCRIPT], {
      env: { ...process.env, CMS_API_BASE: `http://127.0.0.1:${port}` },
    })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const [code] = (await once(child, 'exit')) as [number]

    expect(code).toBe(2)
    expect(output).toContain('poster-sizes:')
  }, 30_000)

  /**
   * The negative control: an ordinary handled failure (a non-200 response) is
   * "unreadable" too, and already exited 2 before this fix — proving THAT path
   * alone would not have caught a regression back to exit 1 on the THROWN path
   * this finding is actually about.
   */
  it('also exits 2 on a plain non-200 (the pre-existing, already-handled path)', async () => {
    server = createServer((_req, res) => {
      res.writeHead(503, { 'content-type': 'text/plain' })
      res.end('service unavailable')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as { port: number }).port

    const child = spawn(process.execPath, [SCRIPT], {
      env: { ...process.env, CMS_API_BASE: `http://127.0.0.1:${port}` },
    })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const [code] = (await once(child, 'exit')) as [number]

    expect(code).toBe(2)
  }, 30_000)
})

describe('judgePosters — after the trim', () => {
  it('flags nothing and excepts the five r-wzu rows', () => {
    const { flagged, excepted } = judgePosters(AFTER)
    expect(flagged).toEqual([])
    expect(excepted.map((r) => r.colour).sort()).toEqual(
      ['blush', 'butter', 'powder-blue', 'beige', 'plum'].sort(),
    )
    expect(excepted.every((r) => r.slug === 'r-wzu')).toBe(true)
  })

  it('negative control: WITHOUT the exception, those same five r-wzu rows flag instead', () => {
    // Proves the exception is doing real work rather than being vacuously true —
    // root CLAUDE.md, "a negative control must run both ways".
    const { flagged, excepted } = judgePosters(AFTER, { exceptions: [] })
    expect(excepted).toEqual([])
    expect(flagged.filter((r) => r.slug === 'r-wzu')).toHaveLength(5)
  })
})

describe('judgePosters — a planted spike', () => {
  it('a 21st Sportswear poster at 110000 moves the median and is itself flagged', () => {
    const planted = [...BEFORE, row('r-ect', 'planted', 110000)]
    const { medians, rows } = judgePosters(planted)
    expect(medians[SPORTSWEAR]).toBe(50934)
    const spike = rows.find((r) => r.colour === 'planted')
    expect(spike?.verdict).toBe('flagged')
    expect(spike?.ratio).toBeCloseTo(2.16, 2)
  })
})

describe('judgePosters — families are judged separately', () => {
  it('the same byte count is ok in one family and flagged in another', () => {
    // Family A's median is 1000 (three equal posters); family B's is 500, made of
    // two small posters and one already-heavy one. A poster of 1900 bytes in family
    // B is 3.8× ITS OWN median — flagged. Judged against family A's median instead
    // it would read as 1.9× — ok. If the two medians were ever accidentally pooled,
    // this is the case that would silently pass.
    const posters: PosterSample[] = [
      row('a1', 'x', 1000, 'Family A'),
      row('a2', 'x', 1000, 'Family A'),
      row('a3', 'x', 1000, 'Family A'),
      row('b1', 'x', 500, 'Family B'),
      row('b2', 'x', 500, 'Family B'),
      row('b3', 'x', 1900, 'Family B'),
    ]
    const { medians, rows } = judgePosters(posters, { exceptions: [] })
    expect(medians).toEqual({ 'Family A': 1000, 'Family B': 500 })
    const spike = rows.find((r) => r.slug === 'b3')
    expect(spike?.ratio).toBeCloseTo(3.8, 5)
    expect(spike?.verdict).toBe('flagged')
    for (const r of rows.filter((r) => r.family === 'Family A')) expect(r.verdict).toBe('ok')
  })
})

/**
 * The shared live-model-URL resolver (SE-16's provenance probe needs it, and it is
 * built to the exact contract a second caller can import by name — see the doc
 * comment on `resolveLiveModelUrl` in poster-sizes.mjs).
 */
describe('modelUrlFromPayload — pure, no network', () => {
  it('takes product.glbUrl when set (single-glb-variants mode)', () => {
    const result = modelUrlFromPayload({
      product: { glbUrl: 'https://media.wear-run.help/a.glb' },
      selectedColourway: { glbUrl: null },
    })
    expect(result).toEqual({ url: 'https://media.wear-run.help/a.glb' })
  })

  it('falls back to selectedColourway.glbUrl in separate-file mode, where product.glbUrl is null by construction', () => {
    const result = modelUrlFromPayload({
      product: { glbUrl: null },
      selectedColourway: { glbUrl: 'https://media.wear-run.help/b.glb' },
    })
    expect(result).toEqual({ url: 'https://media.wear-run.help/b.glb' })
  })

  it('names the error rather than throwing when neither is a real URL', () => {
    const result = modelUrlFromPayload({ product: {}, selectedColourway: {} })
    expect('error' in result && result.error).toContain('no model')
  })

  it('does not throw on a malformed payload', () => {
    expect(() => modelUrlFromPayload(null)).not.toThrow()
    expect(() => modelUrlFromPayload('not an object')).not.toThrow()
  })
})

describe('resolveLiveModelUrl — the network half', () => {
  let server: Server | undefined

  afterEach(async () => {
    if (server) await new Promise((resolve) => server?.close(resolve))
    server = undefined
  })

  it('fetches the per-colourway payload and resolves the model URL', async () => {
    server = createServer((req, res) => {
      expect(req.url).toBe('/api/public/viewer/rxps/wine')
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ product: { glbUrl: 'https://media.wear-run.help/rxps-wine.glb' } }))
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as { port: number }).port

    const result = await resolveLiveModelUrl('rxps', 'wine', {
      apiBase: `http://127.0.0.1:${port}`,
    })
    expect(result).toEqual({ url: 'https://media.wear-run.help/rxps-wine.glb' })
  })

  it('names a non-200 response rather than throwing', async () => {
    server = createServer((_req, res) => {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as { port: number }).port

    const result = await resolveLiveModelUrl('nope', 'nope', {
      apiBase: `http://127.0.0.1:${port}`,
    })
    expect('error' in result && result.error).toContain('404')
  })
})

/**
 * IM-03 — what every poster must BE. Built from a real WebP container header (RIFF, then a
 * VP8X chunk carrying width-1 and height-1 as 24-bit little-endian), the layout all 80 live
 * posters use (measured 2026-09-25).
 */
function vp8xHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
  }
  const u24 = (offset: number, value: number) => {
    bytes[offset] = value & 0xff
    bytes[offset + 1] = (value >> 8) & 0xff
    bytes[offset + 2] = (value >> 16) & 0xff
  }
  ascii(0, 'RIFF')
  ascii(8, 'WEBP')
  ascii(12, 'VP8X')
  bytes[16] = 10
  u24(24, width - 1)
  u24(27, height - 1)
  return bytes
}

const LIVE_POSTER = {
  head: vp8xHeader(1200, 1500),
  contentType: 'image/webp',
  cacheControl: 'max-age=604800',
  cache: ['HIT'],
}

describe('webpDimensions — the pixel size read from the bytes (IM-03)', () => {
  it('reads a VP8X header', () => {
    expect(webpDimensions(vp8xHeader(1200, 1500))).toEqual({ width: 1200, height: 1500 })
  })

  it('is null for bytes that are not a WebP, e.g. a JPEG served under the same name', () => {
    const jpeg = new Uint8Array(30)
    jpeg.set([0xff, 0xd8, 0xff, 0xe0])
    expect(webpDimensions(jpeg)).toBeNull()
  })
})

describe('judgePosterContent — WebP, 1200x1500, 7-day cache, edge-cached (IM-03)', () => {
  it('passes a poster exactly as the live ones measure', () => {
    expect(judgePosterContent(LIVE_POSTER)).toEqual([])
  })

  it('passes a cold file whose SECOND GET comes from the edge', () => {
    expect(judgePosterContent({ ...LIVE_POSTER, cache: ['MISS', 'HIT'] })).toEqual([])
  })

  it('FAILS a poster whose bytes say another size, whatever its name says', () => {
    expect(judgePosterContent({ ...LIVE_POSTER, head: vp8xHeader(1200, 1200) })).toEqual([
      '1200x1200, not 1200x1500',
    ])
  })

  it('FAILS a poster served as a JPEG', () => {
    expect(judgePosterContent({ ...LIVE_POSTER, contentType: 'image/jpeg' }).join(' ')).toContain(
      'not image/webp',
    )
  })

  it('FAILS a shorter cache lifetime than the measured 7 days', () => {
    expect(
      judgePosterContent({ ...LIVE_POSTER, cacheControl: 'max-age=3600' }).join(' '),
    ).toContain('under 7 days')
  })

  it('FAILS a poster the edge never caches', () => {
    expect(judgePosterContent({ ...LIVE_POSTER, cache: ['MISS', 'MISS'] }).join(' ')).toContain(
      'not served from the edge cache',
    )
  })
})
