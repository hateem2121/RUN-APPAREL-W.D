import { describe, expect, it } from 'vitest'
import { isMediaReferenced } from './cms'
import { CMS_TIMEOUT_MS, cmsFetch as cmsFetchWithTimeout } from './cms'

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
    for (const path of [
      'glbAsset',
      'posterFallback',
      'colourways.posterPreview',
      'colourways.glbAsset',
    ]) {
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

/**
 * A stalled CMS write aborts INSIDE the Worker (fix plan Rank 12, audit Q-03). Until
 * 2026-09-03 the container fetch was the only outbound call with a timeout; a CMS call
 * that never answered was killed only by the queue's 15-minute ceiling, which reports
 * nothing. Two transports are tried: one that honours the request's AbortSignal, and one
 * that ignores it entirely and never settles — the Worker must move on in both cases.
 */
describe('cmsFetch — every CMS call has a timeout', () => {
  const env = (fetch: (req: Request) => Promise<Response>) => ({
    CMS: { fetch },
    CMS_ORIGIN: 'https://cms.example',
    CMS_ROBOT_API_KEY: 'k',
    CMS_TIMEOUT_MS: '30',
  })

  it('rejects, naming the call, when the transport honours the abort', async () => {
    const stalled = env(
      (req) =>
        new Promise<Response>((_, reject) => {
          req.signal.addEventListener('abort', () => reject(req.signal.reason))
        }),
    )
    const started = Date.now()
    await expect(
      cmsFetchWithTimeout(stalled, '/api/raw-uploads/12', { method: 'PATCH' }),
    ).rejects.toThrow(/did not answer within 0s: PATCH \/api\/raw-uploads\/12/)
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('rejects even when the transport IGNORES the signal and never settles', async () => {
    const black_hole = env(() => new Promise<Response>(() => {}))
    const started = Date.now()
    await expect(cmsFetchWithTimeout(black_hole, '/api/media', { method: 'POST' })).rejects.toThrow(
      /did not answer within/,
    )
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('passes a prompt answer straight through, and sends the timeout on the request', async () => {
    let seen: Request | undefined
    const prompt = env(async (req) => {
      seen = req
      return new Response('ok', { status: 200 })
    })
    const res = await cmsFetchWithTimeout(prompt, '/api/products/1', { method: 'GET' })
    expect(res.status).toBe(200)
    expect(seen?.signal).toBeInstanceOf(AbortSignal)
    expect(seen?.signal.aborted).toBe(false)
  })

  it('defaults to two minutes when the override is absent or nonsense', async () => {
    expect(CMS_TIMEOUT_MS).toBe(120_000)
    const nonsense = { ...env(async () => new Response('ok')), CMS_TIMEOUT_MS: 'soon' }
    await expect(
      cmsFetchWithTimeout(nonsense, '/api/x', { method: 'GET' }),
    ).resolves.toBeInstanceOf(Response)
  })

  it('passes a transport failure through as itself, not as a timeout', async () => {
    const broken = env(async () => {
      throw new Error('socket hang up')
    })
    await expect(cmsFetchWithTimeout(broken, '/api/x', { method: 'GET' })).rejects.toThrow(
      'socket hang up',
    )
  })

  it('a caller’s own already-aborted signal is refused up front', async () => {
    const never = env(() => new Promise<Response>(() => {}))
    const controller = new AbortController()
    controller.abort()
    await expect(
      cmsFetchWithTimeout(never, '/api/x', { method: 'GET', signal: controller.signal }),
    ).rejects.toThrow(/did not answer/)
  })
})
