import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertSafeBase,
  CMS_DEFAULT_BASE,
  CmsConfigError,
  CmsError,
  createCmsClient,
  explainPayloadError,
  resolveCmsBase,
  resolveCmsKey,
  subsetMismatches,
} from '../../../scripts/cms-client.mjs'

/**
 * `scripts/cms-client.mjs` is the one client the data scripts use to talk to the CMS. Every
 * test here runs against a FAKE `fetch` over an in-memory CMS: nothing reaches production and
 * no real key is read. The key below is made up.
 *
 * The four promises the scripted-writes rule asks for (`.claude/rules/cms-scripted-writes.md`)
 * each have a test that can FAIL: a write the CMS accepts and does not store is reported as a
 * failure; a dry run sends nothing; the key never appears in a URL or in any text the client
 * builds; the old address names still work, with one "renamed" line.
 */
const KEY = 'k-7f3a9c2e5b1d8f4a-not-a-real-key'
const BASE = 'https://cms.example'

type Call = { method: string; url: string; auth: string | null; body: unknown }
type Doc = Record<string, unknown>

type FakeOptions = {
  /** Fields the CMS accepts (200) and silently does not store — the 2026-09-04 incident. */
  dropFields?: string[]
  /** Answer every write with 403 and an error body that echoes the Authorization header. */
  refuseWrites?: boolean
  /** A DELETE that answers 200 and keeps the document. */
  keepOnDelete?: boolean
  /** Serve this body for any `https://files.example/...` URL. */
  fileBytes?: Uint8Array
}

/** An in-memory CMS: documents by path, and the list of every request it was asked. */
function fakeCms(initial: Record<string, Doc>, options: FakeOptions = {}) {
  const docs = new Map<string, Doc>(Object.entries(initial))
  const calls: Call[] = []
  let nextId = 100
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    const raw = init?.body
    calls.push({
      method,
      url,
      auth: headers.get('authorization'),
      body: typeof raw === 'string' ? JSON.parse(raw) : raw,
    })
    if (url.startsWith('https://files.example/')) {
      // A copy, not the array itself: the ambient BodyInit here does not take an
      // `ArrayBufferLike`-backed view (same gap as in shrinkPostersGently.test.ts).
      return new Response(new Uint8Array(options.fileBytes ?? []), {
        headers: { 'cf-cache-status': 'MISS' },
      })
    }
    const path = url.slice(BASE.length).split('?')[0] as string
    if (method !== 'GET' && options.refuseWrites) {
      return json(403, { errors: [{ message: `refused for ${headers.get('authorization')}` }] })
    }
    if (method === 'GET') {
      const doc = docs.get(path)
      return doc ? json(200, doc) : json(404, { errors: [{ message: 'Not Found' }] })
    }
    if (method === 'PATCH') {
      const stored = { ...(docs.get(path) ?? {}) }
      const sent = JSON.parse(String(raw)) as Doc
      for (const [key, value] of Object.entries(sent)) {
        if (!options.dropFields?.includes(key)) stored[key] = value
      }
      docs.set(path, stored)
      // Echo what was SENT, as a lazy reader of the response would believe.
      return json(200, { doc: { ...stored, ...sent }, message: 'Updated successfully.' })
    }
    if (method === 'POST') {
      const collection = path.replace('/api/', '')
      if (collection.startsWith('globals/')) {
        docs.set(path, JSON.parse(String(raw)) as Doc)
        return json(200, { result: {} })
      }
      const id = nextId++
      const sent = raw instanceof FormData ? {} : (JSON.parse(String(raw)) as Doc)
      const doc = {
        id,
        ...sent,
        ...(collection === 'media' ? { url: 'https://files.example/m.bin', filesize: 3 } : {}),
      }
      docs.set(`${path}/${id}`, doc)
      return json(201, { doc })
    }
    if (method === 'DELETE') {
      if (!options.keepOnDelete) docs.delete(path)
      return json(200, { id: 1 })
    }
    return json(405, {})
  }) as typeof fetch

  return { fetchImpl, calls, docs }
}

const writes = (calls: Call[]) => calls.filter((call) => call.method !== 'GET')

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('resolveCmsBase — one name, the old two still work', () => {
  const notes = () => {
    const lines: string[] = []
    return { lines, note: (line: string) => lines.push(line) }
  }

  it('defaults to production with no variable set, and says nothing', () => {
    const { lines, note } = notes()
    expect(resolveCmsBase({ env: {}, note })).toBe(CMS_DEFAULT_BASE)
    expect(lines).toEqual([])
  })

  it('reads CMS_API_BASE, drops a trailing slash, and says nothing', () => {
    const { lines, note } = notes()
    expect(resolveCmsBase({ env: { CMS_API_BASE: 'https://a.example//' }, note })).toBe(
      'https://a.example',
    )
    expect(lines).toEqual([])
  })

  it.each([['CMS_ORIGIN'], ['CMS_URL']])(
    'still honours the old name %s, with exactly one "renamed, use CMS_API_BASE" line',
    (old) => {
      const { lines, note } = notes()
      expect(resolveCmsBase({ env: { [old]: 'https://old.example' }, note })).toBe(
        'https://old.example',
      )
      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain(old)
      expect(lines[0]).toContain('renamed, use CMS_API_BASE')
    },
  )

  it('the new name wins when an old one is set beside it, and the note says the old one is ignored', () => {
    const { lines, note } = notes()
    const env = { CMS_API_BASE: 'https://new.example', CMS_ORIGIN: 'https://old.example' }
    expect(resolveCmsBase({ env, note })).toBe('https://new.example')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('CMS_ORIGIN')
    expect(lines[0]).toContain('ignored')
  })

  it('with both old names and no new one, CMS_ORIGIN wins and CMS_URL is named as ignored', () => {
    const { lines, note } = notes()
    const env = { CMS_ORIGIN: 'https://o.example', CMS_URL: 'https://u.example' }
    expect(resolveCmsBase({ env, note })).toBe('https://o.example')
    expect(lines).toHaveLength(2)
    expect(lines.join(' ')).toContain('CMS_URL is renamed to CMS_API_BASE and is ignored')
  })

  it('treats an empty value as not set', () => {
    const { lines, note } = notes()
    expect(resolveCmsBase({ env: { CMS_API_BASE: '  ', CMS_ORIGIN: '' }, note })).toBe(
      CMS_DEFAULT_BASE,
    )
    expect(lines).toEqual([])
  })
})

describe('resolveCmsKey — the environment, then the Keychain only when asked', () => {
  it('reads CMS_API_KEY', () => {
    expect(resolveCmsKey({ env: { CMS_API_KEY: KEY } })).toBe(KEY)
  })

  it('does NOT reach for the Keychain unless asked (a dry run must not start using a stored key)', () => {
    const readKeychain = vi.fn(() => 'from-keychain')
    expect(resolveCmsKey({ env: {}, readKeychain })).toBe('')
    expect(readKeychain).not.toHaveBeenCalled()
  })

  it('falls back to the Keychain when asked, and the environment still wins over it', () => {
    const readKeychain = vi.fn(() => 'from-keychain')
    expect(resolveCmsKey({ env: {}, keychain: true, readKeychain })).toBe('from-keychain')
    expect(resolveCmsKey({ env: { CMS_API_KEY: KEY }, keychain: true, readKeychain })).toBe(KEY)
    expect(readKeychain).toHaveBeenCalledTimes(1)
  })
})

describe('the key never appears in a URL or in anything the client prints', () => {
  it('sends it only in the Authorization header, across every kind of request', async () => {
    const { fetchImpl, calls } = fakeCms({ '/api/products/1': { id: 1, name: 'x' } })
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl })
    await client.get('/api/products/1?depth=0')
    await client.productBySlug('rxps')
    await client.patchDoc('products', 1, { name: 'y' })
    await client.createDoc('products', { json: { name: 'z' } })
    await client.updateGlobal('site-settings', { a: 1 })
    await client.uploadMedia({
      filename: 'a.bin',
      bytes: new Uint8Array([1, 2, 3]),
      type: 'application/octet-stream',
      fields: { alt: 'a' },
      expectServed: { byteLength: 3 },
    })
    await client.deleteDoc('products', 1)
    expect(calls.length).toBeGreaterThan(8)
    // Control: the header DID carry it, so "never in a URL" is not "never sent at all".
    expect(calls.some((call) => call.auth === `users API-Key ${KEY}`)).toBe(true)
    for (const call of calls) expect(call.url).not.toContain(KEY)
  })

  it('refuses a path that contains the key, before any request', async () => {
    const { fetchImpl, calls } = fakeCms({})
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl })
    await expect(client.get(`/api/products?token=${KEY}`)).rejects.toThrow(CmsConfigError)
    expect(calls).toEqual([])
  })

  it('removes the key from error text even when the server echoes it back', async () => {
    const { fetchImpl } = fakeCms({ '/api/products/1': { id: 1 } }, { refuseWrites: true })
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl })
    const result = await client.patchDoc('products', 1, { name: 'y' })
    expect(result.ok).toBe(false)
    expect(result.stage).toBe('write')
    expect(result.status).toBe(403)
    // Control: the server DID echo it, so there was something to remove.
    expect(JSON.stringify(result.json)).toContain(KEY)
    expect(`${result.detail} ${result.error} ${result.mismatches.join(' ')}`).not.toContain(KEY)
  })

  it('removes the key from a thrown CmsError and from a network error that names it', async () => {
    const leaky = (async () => {
      throw new Error(`connect failed using users API-Key ${KEY}`)
    }) as unknown as typeof fetch
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl: leaky })
    const failure = await client.get('/api/products').catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(CmsError)
    expect(String((failure as Error).message)).not.toContain(KEY)

    const refused = fakeCms({}, {})
    const strict = createCmsClient({
      base: BASE,
      key: KEY,
      apply: true,
      fetchImpl: refused.fetchImpl,
    })
    const missing = await strict.getJson('/api/products/404').catch((error: unknown) => error)
    expect(missing).toBeInstanceOf(CmsError)
    expect(String((missing as Error).message)).toContain('404')
  })

  it('prints nothing at all while working, and the client object cannot show the key', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { fetchImpl } = fakeCms({ '/api/products/1': { id: 1 } })
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl })
    await client.patchDoc('products', 1, { name: 'y' })
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(JSON.stringify(client)).not.toContain(KEY)
    expect(inspect(client, { depth: 6, showHidden: true })).not.toContain(KEY)
  })

  it('sends no Authorization header at all for a keyless (public) client', async () => {
    const { fetchImpl, calls } = fakeCms({ '/api/public/viewer/rxps': { product: {} } })
    const client = createCmsClient({ base: BASE, fetchImpl })
    await client.get('/api/public/viewer/rxps')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.auth).toBeNull()
  })
})

describe('a dry run makes no write request', () => {
  it('answers every write method with a no-op and never touches the network', async () => {
    const { fetchImpl, calls } = fakeCms({})
    const client = createCmsClient({ base: BASE, key: KEY, fetchImpl }) // apply defaults to false
    const results = [
      await client.patchDoc('products', 1, { a: 1 }),
      await client.createDoc('products', { json: { a: 1 } }),
      await client.updateGlobal('site-settings', { a: 1 }),
      await client.deleteDoc('media', 3),
      await client.write({ method: 'PATCH', path: '/api/products/1', json: { a: 1 } }),
      await client.uploadMedia({
        filename: 'a.bin',
        bytes: new Uint8Array([1]),
        type: 'application/octet-stream',
        expectServed: { byteLength: 1 },
      }),
    ]
    expect(calls).toEqual([])
    for (const result of results) {
      expect(result.ok).toBe(true)
      expect(result.dryRun).toBe(true)
      expect(result.stage).toBe('dry-run')
    }
  })

  it('CONTROL: the same calls with apply: true DO write (so the test above can fail)', async () => {
    const { fetchImpl, calls } = fakeCms({ '/api/products/1': { id: 1 } })
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl })
    await client.patchDoc('products', 1, { a: 1 })
    expect(writes(calls).map((call) => call.method)).toEqual(['PATCH'])
  })

  it('still reads in a dry run (a script plans from what is stored)', async () => {
    const { fetchImpl, calls } = fakeCms({ '/api/products/1': { id: 1 } })
    const client = createCmsClient({ base: BASE, key: KEY, fetchImpl })
    expect((await client.get('/api/products/1?depth=0')).json).toEqual({ id: 1 })
    expect(calls).toHaveLength(1)
  })
})

describe('every write is read back, and a read-back that differs is a failure', () => {
  it('a field the CMS accepts with 200 and does not store is reported NOT stored', async () => {
    const { fetchImpl, calls } = fakeCms(
      { '/api/products/1': { id: 1, garmentType: '' } },
      { dropFields: ['garmentType'] },
    )
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl })
    const result = await client.patchDoc('products', 1, { garmentType: 'Tracksuit' })
    // The write itself answered 200 and echoed the field: only the read-back can tell.
    expect(result.status).toBe(200)
    expect((result.json as { doc: Doc }).doc.garmentType).toBe('Tracksuit')
    expect(result.ok).toBe(false)
    expect(result.stage).toBe('verify')
    expect(result.mismatches.join(' ')).toContain('garmentType')
    expect(result.error).toContain('stored')
    // And the read-back was a depth-0 GET of the same document, after the PATCH.
    expect(calls.map((call) => `${call.method} ${call.url.slice(BASE.length)}`)).toEqual([
      'PATCH /api/products/1',
      'GET /api/products/1?depth=0',
    ])
  })

  it('CONTROL: the same write to a field the CMS does store is reported stored', async () => {
    const { fetchImpl } = fakeCms({ '/api/products/1': { id: 1, garmentType: '' } })
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl })
    const result = await client.patchDoc('products', 1, { garmentType: 'Tracksuit' })
    expect(result.ok).toBe(true)
    expect(result.stage).toBe('done')
    expect(result.mismatches).toEqual([])
    expect((result.stored as Doc).garmentType).toBe('Tracksuit')
  })

  it('compares a list by length and order, so a dropped or reordered row is caught', async () => {
    const rows = [
      { id: 'a', slug: 'wine' },
      { id: 'b', slug: 'blush' },
    ]
    const { fetchImpl, docs } = fakeCms({ '/api/products/1': { id: 1, colourways: rows } })
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl })
    // The CMS stored the rows in the other order (a PATCH that reordered them).
    docs.set('/api/products/1', { id: 1, colourways: [rows[1], rows[0]] })
    const reordered = await client.write({
      method: 'PATCH',
      path: '/api/products/1',
      json: {},
      readPath: '/api/products/1',
      verify: (stored) => subsetMismatches({ colourways: rows }, stored),
    })
    expect(reordered.ok).toBe(false)
    expect(reordered.mismatches.join(' ')).toContain('colourways[0].id')

    // And a row the CMS dropped is caught by length: it keeps the one-row list it had.
    const keeps = fakeCms(
      { '/api/products/1': { id: 1, colourways: [rows[0]] } },
      { dropFields: ['colourways'] },
    )
    const dropped = await createCmsClient({
      base: BASE,
      key: KEY,
      apply: true,
      fetchImpl: keeps.fetchImpl,
    }).patchDoc('products', 1, { colourways: rows })
    expect(dropped.ok).toBe(false)
    expect(dropped.mismatches).toEqual(['colourways: sent 2 item(s), stored 1'])
  })

  it('a verify() that returns nothing is a programming error, never a pass', async () => {
    const { fetchImpl } = fakeCms({ '/api/products/1': { id: 1 } })
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl })
    await expect(
      client.patchDoc('products', 1, { a: 1 }, { verify: (() => undefined) as never }),
    ).rejects.toThrow(/array of mismatch strings/)
  })

  it('a write with no JSON body and no verify() is refused before anything is sent', async () => {
    const { fetchImpl, calls } = fakeCms({})
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl })
    await expect(client.write({ method: 'POST', path: '/api/media' })).rejects.toThrow(/verify/)
    expect(calls).toEqual([])
  })

  it('a refused write is stage "write" with the CMS\'s own words, and nothing is read back', async () => {
    const { fetchImpl, calls } = fakeCms({}, { refuseWrites: true })
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl })
    const result = await client.patchDoc('products', 1, { a: 1 })
    expect(result.ok).toBe(false)
    expect(result.stage).toBe('write')
    expect(calls).toHaveLength(1)
  })

  it('a read-back that cannot be fetched is stage "read", not a success', async () => {
    // The PATCH is accepted; the GET that should confirm it answers 500.
    const failing = (async (_input: string | URL | Request, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? new Response('{}', { status: 200 })
        : new Response('{"errors":[{"message":"down"}]}', { status: 500 })) as typeof fetch
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl: failing })
    const result = await client.patchDoc('products', 1, { a: 1 })
    expect(result.ok).toBe(false)
    expect(result.stage).toBe('read')
    expect(result.status).toBe(500)
  })

  it('createDoc reads back the id the CMS answered with', async () => {
    const { fetchImpl, calls } = fakeCms({})
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl })
    const result = await client.createDoc('products', { json: { productCode: 'R-ABC' } })
    expect(result.ok).toBe(true)
    expect(calls.at(-1)?.url).toBe(`${BASE}/api/products/100?depth=0`)
  })

  it('createDoc fails when the CMS names no document to read back', async () => {
    const odd = (async (_input: string | URL | Request, init?: RequestInit) =>
      new Response(JSON.stringify(init?.method === 'POST' ? { message: 'ok' } : {}), {
        status: 200,
      })) as typeof fetch
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl: odd })
    const result = await client.createDoc('products', { json: { a: 1 } })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('no document to read back')
  })

  it('a delete is verified by the document being GONE', async () => {
    const gone = fakeCms({ '/api/media/3': { id: 3 } })
    const ok = await createCmsClient({
      base: BASE,
      key: KEY,
      apply: true,
      fetchImpl: gone.fetchImpl,
    }).deleteDoc('media', 3)
    expect(ok.ok).toBe(true)

    // CONTROL: the CMS answers 200 and keeps the file — that is a failure, not a delete.
    const kept = fakeCms({ '/api/media/3': { id: 3 } }, { keepOnDelete: true })
    const bad = await createCmsClient({
      base: BASE,
      key: KEY,
      apply: true,
      fetchImpl: kept.fetchImpl,
    }).deleteDoc('media', 3)
    expect(bad.ok).toBe(false)
    expect(bad.stage).toBe('verify')
    expect(bad.mismatches.join(' ')).toContain('still readable')
  })

  it('an upload is checked against the served file, by size and by sha256', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const sha = '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81'
    const good = fakeCms({}, { fileBytes: bytes })
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl: good.fetchImpl })
    const result = await client.uploadMedia({
      filename: 'a.bin',
      bytes,
      type: 'application/octet-stream',
      fields: { alt: 'an alt' },
      expectServed: { byteLength: 3, sha256: sha },
    })
    expect(result.ok).toBe(true)
    expect(result.served?.status).toBe(200)
    expect(result.served?.cache).toBe('MISS')
    // The multipart body: `_payload` first, then the file, with its name and type.
    const form = good.calls.find((call) => call.method === 'POST')?.body as FormData
    expect(JSON.parse(String(form.get('_payload')))).toEqual({ alt: 'an alt' })
    const file = form.get('file') as File
    expect([file.name, file.type]).toEqual(['a.bin', 'application/octet-stream'])
    // With only expectServed, no media document GET is made (the served file is the check).
    expect(good.calls.filter((call) => call.url.includes('/api/media/'))).toEqual([])

    // CONTROL: the file serves back truncated, then with the right length and other bytes.
    for (const served of [new Uint8Array([1, 2]), new Uint8Array([9, 9, 9])]) {
      const bad = fakeCms({}, { fileBytes: served })
      const failed = await createCmsClient({
        base: BASE,
        key: KEY,
        apply: true,
        fetchImpl: bad.fetchImpl,
      }).uploadMedia({
        filename: 'a.bin',
        bytes,
        type: 'application/octet-stream',
        expectServed: { byteLength: 3, sha256: sha },
      })
      expect(failed.ok).toBe(false)
      expect(failed.stage).toBe('verify')
    }
  })

  it('an upload can also compare the stored media document, and refuses to run with neither check', async () => {
    const { fetchImpl, calls } = fakeCms({}, { fileBytes: new Uint8Array([1, 2, 3]) })
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl })
    const upload = {
      filename: 'a.bin',
      bytes: new Uint8Array([1, 2, 3]),
      type: 'application/octet-stream',
    }
    const wrong = await client.uploadMedia({
      ...upload,
      verifyDoc: (stored) =>
        (stored as Doc).filesize === 99 ? [] : [`filesize ${String((stored as Doc).filesize)}`],
    })
    expect(wrong.ok).toBe(false)
    expect(wrong.mismatches).toEqual(['filesize 3'])
    await expect(client.uploadMedia(upload)).rejects.toThrow(/verifyDoc or expectServed/)
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1)
  })
})

describe('https, or localhost — the guard sits beside the fetch', () => {
  it('refuses a keyed request, and any write, to a plain http address', async () => {
    const { fetchImpl, calls } = fakeCms({})
    const keyed = createCmsClient({ base: 'http://cms.example', key: KEY, apply: true, fetchImpl })
    await expect(keyed.get('/api/products')).rejects.toThrow(/must be https/)
    const keyless = createCmsClient({ base: 'http://cms.example', apply: true, fetchImpl })
    await expect(keyless.patchDoc('products', 1, { a: 1 })).rejects.toThrow(CmsConfigError)
    expect(calls).toEqual([])
  })

  it('allows an unkeyed public READ over http (the poster-size tests point at a local server)', async () => {
    const { fetchImpl } = fakeCms({})
    const response = await createCmsClient({ base: 'http://cms.example', fetchImpl }).fetchRaw(
      '/api/public/viewer/x',
      { auth: false },
    )
    expect(response.status).toBe(404) // the fake has no such document: it answered, nothing was refused
  })

  it.each([['http://localhost:4174'], ['http://127.0.0.1:4174'], ['http://[::1]:4174']])(
    'allows plain http to this machine: %s',
    (base) => {
      expect(() => assertSafeBase(base)).not.toThrow()
    },
  )

  it.each([['http://cms.example'], ['http://localhost.evil.example'], ['ftp://x'], ['']])(
    'assertSafeBase refuses %j',
    (base) => {
      expect(() => assertSafeBase(base)).toThrow(/must be https/)
    },
  )

  it('fetchRaw reads only: a write has no door that skips the read-back', () => {
    const { fetchImpl } = fakeCms({})
    const client = createCmsClient({ base: BASE, key: KEY, apply: true, fetchImpl })
    expect(() => client.fetchRaw('/api/products/1', { method: 'PATCH' as never })).toThrow(
      CmsConfigError,
    )
  })
})

describe('the rest of the client', () => {
  it('looks up `fetch` when it is called, so a stub installed later is seen', async () => {
    const client = createCmsClient({ base: BASE, key: KEY })
    const stub = vi.fn(async () => new Response('{"docs":[{"id":7}]}'))
    vi.stubGlobal('fetch', stub)
    const found = await client.productBySlug('r-asb')
    expect(found.doc).toEqual({ id: 7 })
    expect(String((stub.mock.calls[0] as unknown[])[0])).toBe(
      `${BASE}/api/products?where%5Bslug%5D%5Bequals%5D=r-asb&depth=0&limit=1`,
    )
  })

  it('reports a body that is not JSON as parsed: false, and getJson refuses it', async () => {
    const challenge = (async () =>
      new Response('<html>cloudflare challenge</html>', { status: 200 })) as unknown as typeof fetch
    const client = createCmsClient({ base: BASE, key: KEY, fetchImpl: challenge })
    const read = await client.get('/api/products')
    expect(read.parsed).toBe(false)
    expect(read.json).toEqual({ raw: '<html>cloudflare challenge</html>' })
    await expect(client.getJson('/api/products')).rejects.toThrow(/not JSON/)
  })

  it("explainPayloadError names Payload's inner field, which the outer message hides", () => {
    expect(
      explainPayloadError({
        errors: [
          {
            message: 'The following field is invalid: slug',
            data: { errors: [{ field: 'slug', message: 'Value must be unique.' }] },
          },
        ],
      }),
    ).toBe('slug: Value must be unique.')
    expect(explainPayloadError({ errors: [{ message: 'Forbidden' }] })).toBe('Forbidden')
    expect(explainPayloadError({ raw: '<html>' })).toBe('<html>')
    expect(explainPayloadError(undefined)).toBe('null')
  })

  it('subsetMismatches: only what was sent is compared, and a dropped key shows as nothing', () => {
    expect(subsetMismatches({ a: 1 }, { a: 1, id: 5, updatedAt: 'x' })).toEqual([])
    expect(subsetMismatches({ a: 1 }, { id: 5 })).toEqual(['a: sent 1, stored nothing'])
    expect(subsetMismatches({ rows: [{ id: 1 }] }, { rows: [{ id: 1, extra: true }] })).toEqual([])
    expect(subsetMismatches({ rows: [{ id: 1 }, { id: 2 }] }, { rows: [{ id: 1 }] })).toEqual([
      'rows: sent 2 item(s), stored 1',
    ])
    expect(subsetMismatches({ a: null }, {})).toEqual([])
    expect(subsetMismatches({ a: null }, { a: 3 })).toEqual(['a: sent empty, stored 3'])
  })
})

/**
 * The reason this module exists: fourteen scripts each read the address and the key their own
 * way, under three names. A script that goes back to `process.env.CMS_ORIGIN` would quietly
 * restore the second name. This reads every script's source, so the next one cannot.
 */
describe('no script outside the client reads the CMS address or key itself', () => {
  const SCRIPTS = join(import.meta.dirname, '..', '..', '..', 'scripts')
  const OWN_READ = /process\.env\.CMS_(API_BASE|ORIGIN|URL|API_KEY)\b|env\[['"]CMS_/

  it('finds none in scripts/*.mjs except cms-client.mjs', () => {
    const offenders = readdirSync(SCRIPTS)
      .filter((name) => name.endsWith('.mjs') && name !== 'cms-client.mjs')
      .filter((name) => OWN_READ.test(readFileSync(join(SCRIPTS, name), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('CONTROL: the same scan DOES flag a script that reads one of the old names', () => {
    expect(OWN_READ.test("const CMS = process.env.CMS_ORIGIN ?? 'https://cms.wear-run.help'")).toBe(
      true,
    )
    expect(OWN_READ.test('const key = process.env.CMS_API_KEY')).toBe(true)
    expect(OWN_READ.test("const base = env['CMS_URL']")).toBe(true)
    expect(OWN_READ.test('const base = resolveCmsBase()')).toBe(false)
  })
})
