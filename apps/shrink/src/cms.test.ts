import { describe, expect, it } from 'vitest'
import { isMediaReferenced } from './cms'

/**
 * `isMediaReferenced` is the guard in front of an irreversible DELETE against
 * production media. Its only job is to be wrong in the safe direction, so that
 * is what these test: every failure mode has to answer "still referenced".
 *
 * The shrink Worker had no tests at all before this. That was defensible while
 * it only created things; it stopped being defensible the moment it could
 * delete one.
 */

type FetchStub = (path: string) => { status?: number; body?: unknown } | Error

/** Minimal Env with a CMS service binding driven by a per-path stub. */
function envWith(stub: FetchStub) {
  const calls: string[] = []
  return {
    calls,
    env: {
      CMS: {
        fetch: (request: Request) => {
          const path = new URL(request.url).pathname + new URL(request.url).search
          calls.push(path)
          const result = stub(path)
          if (result instanceof Error) return Promise.reject(result)
          return Promise.resolve(
            new Response(JSON.stringify(result.body ?? {}), {
              status: result.status ?? 200,
              headers: { 'content-type': 'application/json' },
            }),
          )
        },
      },
      CMS_ORIGIN: 'https://cms.example',
      CMS_ROBOT_API_KEY: 'test-key',
    } as never,
  }
}

const nothingFound = { body: { totalDocs: 0 } }

describe('isMediaReferenced', () => {
  it('reports unreferenced only when BOTH collections come back empty', async () => {
    const { env } = envWith(() => nothingFound)
    expect(await isMediaReferenced(env, 7)).toBe(false)
  })

  it('reports referenced when a product uses it', async () => {
    const { env } = envWith((path) =>
      path.startsWith('/api/products') ? { body: { totalDocs: 1 } } : nothingFound,
    )
    expect(await isMediaReferenced(env, 7)).toBe(true)
  })

  it('reports referenced when another raw upload uses it', async () => {
    // The gap this closes: the Worker used to check products only, while
    // find-orphan-media.mjs checked raw uploads too. Two definitions of
    // "orphan", one of which deletes.
    const { env } = envWith((path) =>
      path.startsWith('/api/raw-uploads') ? { body: { totalDocs: 1 } } : nothingFound,
    )
    expect(await isMediaReferenced(env, 7)).toBe(true)
  })

  it('excludes the upload being processed, whose pointer has already moved', async () => {
    const { env, calls } = envWith(() => nothingFound)
    await isMediaReferenced(env, 7, 42)
    const uploadsCall = calls.find((c) => c.startsWith('/api/raw-uploads'))
    expect(uploadsCall).toContain('not_equals')
    expect(decodeURIComponent(uploadsCall!)).toContain('42')
  })

  it.each([
    ['a 500 from the CMS', { status: 500, body: {} }],
    ['a 401 from the CMS', { status: 401, body: {} }],
    ['a body with no totalDocs', { body: { docs: [] } }],
    ['a body that is not an object', { body: 'nope' }],
  ])('assumes referenced on %s', async (_label, response) => {
    for (const failing of ['/api/products', '/api/raw-uploads']) {
      const { env } = envWith((path) => (path.startsWith(failing) ? response : nothingFound))
      expect(await isMediaReferenced(env, 7)).toBe(true)
    }
  })

  it('assumes referenced when the request throws outright', async () => {
    const { env } = envWith(() => new Error('network down'))
    expect(await isMediaReferenced(env, 7)).toBe(true)
  })

  it('queries every field that can point at Media', async () => {
    // A Media relationship added to a collection without being added here would
    // make the reaper treat a live asset as an orphan.
    const { env, calls } = envWith(() => nothingFound)
    await isMediaReferenced(env, 7)
    const productsCall = decodeURIComponent(calls.find((c) => c.startsWith('/api/products'))!)
    for (const path of ['glbAsset', 'posterFallback', 'colourways.posterPreview', 'colourways.glbAsset']) {
      expect(productsCall).toContain(path)
    }
  })

  it('sends the robot API key', async () => {
    const seen: string[] = []
    const env = {
      CMS: {
        fetch: (request: Request) => {
          seen.push(request.headers.get('Authorization') ?? '')
          return Promise.resolve(new Response(JSON.stringify({ totalDocs: 0 })))
        },
      },
      CMS_ORIGIN: 'https://cms.example',
      CMS_ROBOT_API_KEY: 'secret',
    } as never
    await isMediaReferenced(env, 7)
    expect(seen.every((h) => h === 'users API-Key secret')).toBe(true)
  })
})
