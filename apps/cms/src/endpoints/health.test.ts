import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { healthEndpoint } from './health'

/**
 * `/api/health` is the endpoint the deploy gate and both uptime monitors point at,
 * and it had no test.
 *
 * WHY THAT MATTERS MORE THAN ITS SIZE. Everything downstream reads this as ground
 * truth: `ci.yml`'s post-deploy health check fails the deploy on a non-2xx,
 * `uptime.yml` opens an `outage` issue, and the external UptimeRobot check emails the
 * owner. A health endpoint that answers 200 while the database is unreachable turns
 * all three of those into decorations — the exact failure this repo already had in a
 * different form, when the uptime workflow sat dead for ~23 hours while looking
 * healthy (CLAUDE.md, "Silence is not success").
 *
 * The 503 branch is the one that has never run in production and therefore the one
 * worth pinning: it only executes when D1 is down, which is precisely when nobody is
 * in a position to debug it.
 */

const makeReq = (count: () => Promise<unknown>): PayloadRequest =>
  ({ payload: { count } }) as unknown as PayloadRequest

const handler = healthEndpoint.handler as (req: PayloadRequest) => Promise<Response>

describe('GET /api/health', () => {
  it('is registered at the path the monitors and the deploy gate gates on', () => {
    // Hard-coded in ci.yml, uptime.yml and the two UptimeRobot checks. Renaming it
    // here silently disarms all four; they would keep passing against a 404 only if
    // someone also removed the `-f` from curl, which is the point of asserting it.
    expect(healthEndpoint.path).toBe('/health')
    expect(healthEndpoint.method).toBe('get')
  })

  it('answers 200 {ok:true} when the database round-trip succeeds', async () => {
    const count = vi.fn().mockResolvedValue({ totalDocs: 1 })
    const res = await handler(makeReq(count))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    expect(count).toHaveBeenCalledOnce()
  })

  it('answers 503 {ok:false} when the database throws', async () => {
    const res = await handler(makeReq(() => Promise.reject(new Error('D1_ERROR: no such table'))))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ ok: false })
  })

  /**
   * A cached health check is worse than none: the edge would serve the last 200 for
   * the whole TTL while the site is down, and the monitors would report healthy
   * throughout. `no-store` on BOTH branches is what prevents that, and the failure
   * branch is the easy one to forget.
   */
  it.each([
    ['success', () => Promise.resolve({ totalDocs: 1 })],
    ['failure', () => Promise.reject(new Error('down'))],
  ])('never allows the %s response to be cached', async (_label, count) => {
    const res = await handler(makeReq(count))
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  /**
   * The probe must stay cheap — it runs every 5 minutes from UptimeRobot plus every
   * uptime.yml firing, forever. `count` on one small collection is the whole budget;
   * a `find` returning documents would put row payloads on that schedule.
   */
  it('probes with a count, not a document fetch', async () => {
    const count = vi.fn().mockResolvedValue({ totalDocs: 0 })
    const find = vi.fn()
    const req = { payload: { count, find } } as unknown as PayloadRequest

    await handler(req)

    expect(find).not.toHaveBeenCalled()
    expect(count.mock.calls[0]?.[0]).toMatchObject({ collection: 'users' })
  })
})
