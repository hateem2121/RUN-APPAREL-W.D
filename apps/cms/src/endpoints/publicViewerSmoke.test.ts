import { createServer, type Server } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * Pin the post-deploy smoke test's ability to catch a CACHED 404.
 *
 * WHY THIS LIVES HERE. `scripts/smoke-viewer-payload.mjs` asserts on the contract
 * of `publicViewer.ts` in this directory, and root `scripts/` is not a workspace
 * package so it has no runner of its own. Same arrangement as
 * `collections/mediaReferences.test.ts`, which tests a root script from in here
 * for the same reason.
 *
 * WHAT IT IS FOR. On 2026-08-06 a model the shrink worker had just written was
 * unreachable while every automated signal was green:
 *
 *     HEAD https://media.wear-run.help/…  ->  200, correct content-length
 *     GET  https://media.wear-run.help/…  ->  404, a 28 KB Cloudflare error page
 *
 * The two methods landed on different edge cache entries; the 404 was a 25-hour-old
 * cached miss from a probe made before the object existed. The file was intact in R2
 * the whole time. `artworkVerdict: ok`, the filesize, the {OPAQUE, MASK} census and
 * the smoke test's own HEAD were all green while a buyer scanning a QR tag would
 * have seen nothing.
 *
 * The fix was a bare GET, gated behind SMOKE_BROWSER_GET so it runs once per deploy
 * rather than every 15 minutes (a GET on a 27 MB model against a $5/month R2 egress
 * cap is the reason check 3 uses HEAD in the first place).
 *
 * CLAUDE.md's rule for a new test is "ask what would have to break for it to fail".
 * Here that is answered by scenario B: with the flag OFF, the identical broken
 * server passes. That asymmetry IS the regression — it reproduces the blind spot as
 * a fact rather than describing it in a comment, so shipping a change that quietly
 * drops the bare GET turns scenario A green-to-red instead of going unnoticed.
 */

const SMOKE_SCRIPT = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'scripts',
  'smoke-viewer-payload.mjs',
)

let server: Server | undefined

afterEach(async () => {
  if (!server) return
  await new Promise((resolve) => server!.close(resolve))
  server = undefined
})

/**
 * A stand-in for the CMS API and the R2 custom domain in one origin.
 *
 * `getStatus` is what a plain GET on the model returns. HEAD always returns 200
 * with a plausible content-length — that is the incident, not a contrivance: the
 * object really was there, and HEAD really did say so.
 */
async function startOrigin({ getStatus }: { getStatus: number }): Promise<number> {
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    const port = (server!.address() as { port: number }).port

    if (path.startsWith('/api/public/viewer/')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(
        JSON.stringify({
          product: {
            productCode: 'N001',
            productName: 'Test Skinsuit',
            variantMode: 'single-glb-with-variants',
            glbUrl: `http://127.0.0.1:${port}/model.glb`,
          },
          colourways: [{ slug: 'wine' }, { slug: 'black' }],
          selectedColourway: { slug: 'wine' },
        }),
      )
    }

    if (path === '/model.glb') {
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'content-length': '28271780' })
        return res.end()
      }
      if (getStatus === 200) {
        res.writeHead(200, { 'content-length': '28271780' })
        return res.end(Buffer.alloc(1024))
      }
      res.writeHead(getStatus, { 'content-type': 'text/html' })
      return res.end('<html>cloudflare error page</html>')
    }

    // `return` here, like the three branches above, so every path returns a
    // value. Without it `noImplicitReturns` (tsconfig.base.json) flags the handler
    // — correctly: a fall-through that looks like a fourth branch but is not one.
    return res.writeHead(404).end()
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return (server.address() as { port: number }).port
}

async function runSmoke(port: number, { browserGet }: { browserGet: boolean }) {
  const child = spawn(
    process.execPath,
    [SMOKE_SCRIPT, `http://127.0.0.1:${port}`, 'n001', 'wine'],
    {
      env: { ...process.env, SMOKE_BROWSER_GET: browserGet ? '1' : '' },
    },
  )
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  const [code] = (await once(child, 'exit')) as [number]
  return { code, output }
}

describe('post-deploy smoke test — cached 404', () => {
  it('fails when HEAD says 200 and a plain GET says 404', async () => {
    const port = await startOrigin({ getStatus: 404 })
    const { code, output } = await runSmoke(port, { browserGet: true })

    expect(code).not.toBe(0)
    expect(output).toContain('cached-404 signature')
    // Names the fix, because re-running the shrink is the wrong instinct here and
    // costs 20 minutes of Container time to change nothing.
    expect(output).toContain('Custom Purge')
  }, 30_000)

  it('PASSES the same broken origin with the bare GET off — the blind spot itself', async () => {
    const port = await startOrigin({ getStatus: 404 })
    const { code, output } = await runSmoke(port, { browserGet: false })

    // Not an aspiration: this is the behaviour that let the incident through, kept
    // here so the value of the flag is measured rather than asserted. If this ever
    // starts failing, the bare GET is no longer opt-in and uptime.yml is pulling a
    // 27 MB model every 15 minutes.
    expect(code).toBe(0)
    expect(output).toContain('serves a real, fetchable model')
  }, 30_000)

  it('passes a healthy origin without crying wolf', async () => {
    const port = await startOrigin({ getStatus: 200 })
    const { code, output } = await runSmoke(port, { browserGet: true })

    expect(code).toBe(0)
    expect(output).toContain('bare GET 200')
  }, 30_000)
})
