import { describe, expect, it, vi } from 'vitest'
import { retireOrphanedMedia } from './orphanGuard'

/**
 * The failure path must leave no orphan (fix plan Rank 12, audit Q-04) — and must never
 * delete a model something still uses. Both directions are asserted: the DELETE goes out
 * exactly when the reference check says "unused", and stays home when it says "in use" or
 * cannot answer.
 */

type Route = (req: Request) => Promise<Response> | Response

function cms(routes: Route) {
  const calls: { method: string; path: string }[] = []
  const env = {
    CMS: {
      fetch: vi.fn(async (req: Request) => {
        calls.push({ method: req.method, path: new URL(req.url).pathname })
        return routes(req)
      }),
    },
    CMS_ORIGIN: 'https://cms.example',
    CMS_ROBOT_API_KEY: 'k',
  }
  return { env, calls }
}

const count = (n: number) => new Response(JSON.stringify({ totalDocs: n }), { status: 200 })

describe('retireOrphanedMedia', () => {
  it('deletes the just-saved model when nothing references it — the failure path leaves no orphan', async () => {
    const { env, calls } = cms((req) =>
      req.method === 'DELETE' ? new Response('{}', { status: 200 }) : count(0),
    )
    const result = await retireOrphanedMedia(env, 77, 12)
    expect(result.outcome).toBe('deleted')
    expect(calls.filter((c) => c.method === 'DELETE')).toEqual([
      { method: 'DELETE', path: '/api/media/77' },
    ])
    expect(result.note).toMatch(/deleted again/)
  })

  it('keeps a model the product already points at (the auto-attach landed before the final write failed)', async () => {
    const { env, calls } = cms((req) =>
      req.method === 'DELETE'
        ? new Response('{}', { status: 200 })
        : new URL(req.url).pathname === '/api/products'
          ? count(1)
          : count(0),
    )
    const result = await retireOrphanedMedia(env, 77, 12)
    expect(result.outcome).toBe('kept-referenced')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('treats a CMS that cannot answer the reference query as "in use" and deletes nothing', async () => {
    const { env, calls } = cms(() => new Response('down', { status: 503 }))
    const result = await retireOrphanedMedia(env, 77, 12)
    expect(result.outcome).toBe('kept-referenced')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('says so when the delete itself fails, and never throws', async () => {
    const { env } = cms((req) =>
      req.method === 'DELETE' ? new Response('nope', { status: 500 }) : count(0),
    )
    const result = await retireOrphanedMedia(env, 77, 12)
    expect(result.outcome).toBe('delete-failed')
    expect(result.note).toMatch(/remove it from Media/)
  })

  it('reports delete-failed when the reference check passes but the DELETE transport throws', async () => {
    const env = {
      CMS: {
        fetch: vi.fn(async (req: Request) => {
          if (req.method === 'DELETE') throw new Error('socket hang up')
          return count(0)
        }),
      },
      CMS_ORIGIN: 'https://cms.example',
      CMS_ROBOT_API_KEY: 'k',
    }
    await expect(retireOrphanedMedia(env, 77, 12)).resolves.toMatchObject({
      outcome: 'delete-failed',
    })
  })

  it('survives a transport that throws outright', async () => {
    const env = {
      CMS: {
        fetch: vi.fn(async () => {
          throw new Error('socket hang up')
        }),
      },
      CMS_ORIGIN: 'https://cms.example',
      CMS_ROBOT_API_KEY: 'k',
    }
    await expect(retireOrphanedMedia(env, 77, 12)).resolves.toMatchObject({
      outcome: 'kept-referenced',
    })
  })
})

describe('appendToError', () => {
  it('keeps a permanent error permanent and a plain one retryable, with the note attached', async () => {
    const { appendToError } = await import('./orphanGuard')
    const { PermanentJobError } = await import('./permanentJobError')
    const permanent = appendToError(new PermanentJobError('too big'), 'model deleted.')
    expect(permanent).toBeInstanceOf(PermanentJobError)
    expect(permanent.message).toBe('too big model deleted.')
    const plain = appendToError(new Error('CMS 503'), 'kept.')
    expect(plain).not.toBeInstanceOf(PermanentJobError)
    expect(plain.message).toBe('CMS 503 kept.')
    expect(appendToError('string failure', 'x').message).toBe('string failure x')
  })
})
