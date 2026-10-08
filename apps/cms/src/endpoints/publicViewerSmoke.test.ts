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
 * rather than every 15 minutes (a GET on a multi-megabyte model against a $5/month
 * R2 egress cap is the reason check 3 uses HEAD in the first place).
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
async function startOrigin({
  getStatus,
  glbBytes,
  comingSoon,
}: {
  getStatus: number
  /** The model's size as the garment data declares it (polish F12); absent if unset. */
  glbBytes?: number
  /**
   * A garment with NO model ("3D coming soon", 2026-10-08): `flag` is what the payload says,
   * `pictures` how many of its two colourways carry a picture (served at /poster.webp).
   */
  comingSoon?: { flag: boolean; pictures: number }
}): Promise<number> {
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    const port = (server!.address() as { port: number }).port

    if (path.startsWith('/api/public/viewer/') && comingSoon) {
      const picture = { url: `http://127.0.0.1:${port}/poster.webp` }
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(
        JSON.stringify({
          product: {
            productCode: 'N003',
            productName: 'Test Polo Set',
            variantMode: 'single-glb-variants',
            glbUrl: null,
            ...(comingSoon.flag ? { modelComingSoon: true } : {}),
          },
          colourways: [
            { slug: 'sage', poster: comingSoon.pictures >= 1 ? picture : null },
            { slug: 'lilac', poster: comingSoon.pictures >= 2 ? picture : null },
          ],
          selectedColourway: { slug: 'sage' },
        }),
      )
    }

    if (path === '/poster.webp') {
      res.writeHead(200, { 'content-type': 'image/webp' })
      return res.end(Buffer.alloc(512))
    }

    if (path.startsWith('/api/public/viewer/')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(
        JSON.stringify({
          product: {
            productCode: 'N001',
            productName: 'Test Skinsuit',
            variantMode: 'single-glb-with-variants',
            glbUrl: `http://127.0.0.1:${port}/model.glb`,
            ...(glbBytes === undefined ? {} : { glbBytes }),
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

async function runSmoke(
  port: number,
  { browserGet, listSaysComingSoon = false }: { browserGet: boolean; listSaysComingSoon?: boolean },
) {
  const child = spawn(
    process.execPath,
    [SMOKE_SCRIPT, `http://127.0.0.1:${port}`, 'n001', 'wine'],
    {
      env: {
        ...process.env,
        SMOKE_BROWSER_GET: browserGet ? '1' : '',
        // What smoke-live-products.mjs passes for a `modelComingSoon` row of live-products.mjs.
        SMOKE_COMING_SOON: listSaysComingSoon ? '1' : '',
      },
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
    // whole model every 15 minutes.
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

/*
 * Polish F12 (2026-10-04): the garment data's `glbBytes` is the total behind the page's download
 * percentage. A file replaced without its record would make the percentage lie, so the
 * post-deploy check holds the two together.
 */
describe('post-deploy smoke test — the size behind the download percentage (F12)', () => {
  it('fails when the garment data names a size the file does not have', async () => {
    const port = await startOrigin({ getStatus: 200, glbBytes: 1_234_567 })
    const { code, output } = await runSmoke(port, { browserGet: false })
    expect(code).not.toBe(0)
    expect(output).toContain("the page's download percentage would be wrong")
  }, 30_000)

  it('passes when it is the file’s own size', async () => {
    const port = await startOrigin({ getStatus: 200, glbBytes: 28_271_780 })
    const { code, output } = await runSmoke(port, { browserGet: false })
    expect(code).toBe(0)
    expect(output).toContain('28271780 in the data, the same as the file')
  }, 30_000)
})

/*
 * "3D coming soon" (owner decision 2026-10-08): a garment live on its pictures while its 3D file
 * is redone. The LIST (live-products.mjs) decides that a garment may have no model — never the
 * payload — so a stray tick in the CMS cannot turn a garment that lost its model green.
 */
describe('post-deploy smoke test — 3D coming soon', () => {
  it('passes a model-less garment the list AND the payload call coming soon, with every picture', async () => {
    const port = await startOrigin({ getStatus: 200, comingSoon: { flag: true, pictures: 2 } })
    const { code, output } = await runSmoke(port, { browserGet: true, listSaysComingSoon: true })
    expect(code, output).toBe(0)
    expect(output).toContain('3D coming soon: every colourway serves its picture')
  }, 30_000)

  it('NEGATIVE CONTROL: the same garment fails when the list does not say coming soon', async () => {
    const port = await startOrigin({ getStatus: 200, comingSoon: { flag: true, pictures: 2 } })
    const { code, output } = await runSmoke(port, { browserGet: true })
    expect(code).not.toBe(0)
    expect(output).toContain('the product has no glbUrl')
  }, 30_000)

  it('fails when the list says coming soon but the payload has neither a model nor the flag', async () => {
    const port = await startOrigin({ getStatus: 200, comingSoon: { flag: false, pictures: 2 } })
    const { code, output } = await runSmoke(port, { browserGet: true, listSaysComingSoon: true })
    expect(code).not.toBe(0)
    expect(output).toContain('The 3D view is not available')
  }, 30_000)

  it('fails a coming-soon garment with a colour that has no picture: there is nothing else to show', async () => {
    const port = await startOrigin({ getStatus: 200, comingSoon: { flag: true, pictures: 1 } })
    const { code, output } = await runSmoke(port, { browserGet: true, listSaysComingSoon: true })
    expect(code).not.toBe(0)
    expect(output).toContain('1 colourway(s) have no picture')
  }, 30_000)
})
