import type { Endpoint, PayloadRequest } from 'payload'

/**
 * GET /api/health
 *
 * Cheap liveness probe for uptime monitoring and the CI post-deploy gate.
 * Performs one small D1 round-trip; returns 200 `{ ok: true }` when the
 * database is reachable and 503 `{ ok: false }` otherwise. No data is
 * exposed, no auth is required, and the response is never cached.
 */
export const healthEndpoint: Endpoint = {
  path: '/health',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    const headers = { 'Cache-Control': 'no-store' }
    try {
      await req.payload.count({ collection: 'users', req })
      return Response.json({ ok: true }, { headers })
    } catch {
      return Response.json({ ok: false }, { status: 503, headers })
    }
  },
}
