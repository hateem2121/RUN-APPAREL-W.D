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
  // A stalled answer (the `stall` option) would otherwise hold `close` open.
  server.closeAllConnections()
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
  apiFailures = [],
  apiCalls,
  drop,
  stall,
  completeModel,
}: {
  getStatus: number
  completeModel?: { body: Buffer; cut?: 'first' | 'every'; gets: number }
  /**
   * Paths (by prefix) that send their 200 headers and then stop partway through the body, on the
   * first request only or on `every` one, until the script's time-out ends the wait. That is what
   * the CMS Worker logged for r-cat/maroon on 28 Oct (issue #289): 200 in 1,307 ms, outcome
   * `canceled`, while the GitHub runner waited 30 s for a body that never finished arriving.
   */
  stall?: { paths: string[]; every?: boolean; seen?: Map<string, number> }
  /**
   * Paths (by prefix) whose connection is cut without an answer: on the `first` request only, or on
   * `every` one. Node's fetch then throws `TypeError: fetch failed`, as it did from a GitHub runner
   * for one poster on 27 Oct (issue #285).
   */
  drop?: { paths: string[]; every?: boolean; seen?: Map<string, number> }
  /** Statuses the garment API answers with first, one per call, before the real payload. */
  apiFailures?: number[]
  /** Counts the garment API calls, for asserting how many asks there were. */
  apiCalls?: { n: number }
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

    const dropped = drop?.paths.find((prefix) => path.startsWith(prefix))
    if (drop && dropped !== undefined) {
      if (!drop.seen) drop.seen = new Map()
      const seen = drop.seen
      const count = (seen.get(dropped) ?? 0) + 1
      seen.set(dropped, count)
      if (drop.every || count === 1) return void req.socket.destroy()
    }

    const stalled = stall?.paths.find((prefix) => path.startsWith(prefix))
    if (stall && stalled !== undefined) {
      if (!stall.seen) stall.seen = new Map()
      const seen = stall.seen
      const count = (seen.get(stalled) ?? 0) + 1
      seen.set(stalled, count)
      if (stall.every || count === 1) {
        const json = path.startsWith('/api/')
        res.writeHead(200, { 'content-type': json ? 'application/json' : 'image/webp' })
        // A first piece of the body, then nothing: the answer never ends.
        return void res.write(json ? '{"product":' : Buffer.alloc(16))
      }
    }

    if (path.startsWith('/api/public/viewer/')) {
      const call = apiCalls ? apiCalls.n++ : 0
      const failure = apiFailures[call]
      if (failure !== undefined) {
        // Payload's own 500 body for an error it does not make public (routeError).
        res.writeHead(failure, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ errors: [{ message: 'Something went wrong.' }] }))
      }
    }

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
        res.writeHead(200, { 'content-length': String(completeModel?.body.length ?? 28271780) })
        return res.end()
      }
      if (getStatus === 200) {
        if (completeModel) {
          completeModel.gets++
          res.writeHead(200, { 'content-length': String(completeModel.body.length) })
          if (completeModel.cut === 'every' || (completeModel.cut && completeModel.gets === 1)) {
            res.write(completeModel.body.subarray(0, 40))
            setTimeout(() => res.destroy(), 10)
            return
          }
          return res.end(completeModel.body)
        }
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
  {
    browserGet,
    listSaysComingSoon = false,
    completeTransfer = false,
  }: { browserGet: boolean; listSaysComingSoon?: boolean; completeTransfer?: boolean },
) {
  const child = spawn(
    process.execPath,
    [SMOKE_SCRIPT, `http://127.0.0.1:${port}`, 'n001', 'wine'],
    {
      env: {
        ...process.env,
        SMOKE_BROWSER_GET: browserGet ? '1' : '',
        SMOKE_COMPLETE_MODEL: completeTransfer ? '1' : '',
        // What smoke-live-products.mjs passes for a `modelComingSoon` row of live-products.mjs.
        SMOKE_COMING_SOON: listSaysComingSoon ? '1' : '',
        // The 5 s pause before asking again after a 5xx, shortened so a test takes no time.
        SMOKE_API_RETRY_MS: '50',
        // The 30 s wait for an answer, shortened so a stalled answer (`stall`) ends in no time.
        SMOKE_TIMEOUT_MS: '500',
      },
    },
  )
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  const [code] = (await once(child, 'exit')) as [number]
  return { code, output }
}

describe('post-deploy smoke test — complete model transfers', () => {
  // A complete texture-free GLB, padded with legal JSON whitespace above the
  // probe's minimum size. This measures transport/acceptance, not rendering.
  const completeGlb = () => {
    const bytes = Buffer.alloc(128 * 1024, 32)
    bytes.writeUInt32LE(0x46546c67, 0)
    bytes.writeUInt32LE(2, 4)
    bytes.writeUInt32LE(bytes.length, 8)
    bytes.writeUInt32LE(bytes.length - 20, 12)
    bytes.writeUInt32LE(0x4e4f534a, 16)
    bytes.write('{"asset":{"version":"2.0"}}', 20)
    return bytes
  }

  it('retries one cut after headers and verifies the complete second response', async () => {
    const completeModel = { body: completeGlb(), cut: 'first' as const, gets: 0 }
    const port = await startOrigin({
      getStatus: 200,
      glbBytes: completeModel.body.length,
      completeModel,
    })
    const { code, output } = await runSmoke(port, { browserGet: true, completeTransfer: true })
    expect(code, output).toBe(0)
    expect(output).toContain('::warning::the connection to')
    expect(output).toContain('complete GET: 131072 bytes')
    expect(completeModel.gets).toBe(2)
  }, 30_000)

  it('fails after two cut bodies instead of retrying indefinitely', async () => {
    const completeModel = { body: completeGlb(), cut: 'every' as const, gets: 0 }
    const port = await startOrigin({
      getStatus: 200,
      glbBytes: completeModel.body.length,
      completeModel,
    })
    const { code, output } = await runSmoke(port, { browserGet: true, completeTransfer: true })
    expect(code, output).not.toBe(0)
    expect(output).toContain('could not be fetched')
    expect(completeModel.gets).toBe(2)
  }, 30_000)

  it('does not retry a complete response whose model bytes are invalid', async () => {
    const completeModel = { body: Buffer.alloc(128 * 1024), gets: 0 }
    const port = await startOrigin({
      getStatus: 200,
      glbBytes: completeModel.body.length,
      completeModel,
    })
    const { code, output } = await runSmoke(port, { browserGet: true, completeTransfer: true })
    expect(code).not.toBe(0)
    expect(output).toContain('model-image-check')
    expect(completeModel.gets).toBe(1)
  }, 30_000)
})

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
 * Issue #189 (2026-10-14 17:20 UTC): the garment API answered 500 for r-xmp/wine and
 * r-afp/petrol, two seconds apart, because D1 failed on Cloudflare's side; the next request
 * succeeded 0.8 s later. Every other check in that run passed, and the uptime job opened an
 * outage issue. The health check beside it already asks three times (`curl --retry 2`).
 */
describe('post-deploy smoke test — one more ask after a server error (#189)', () => {
  it('passes when one 500 is followed by the payload, and says it had to ask twice', async () => {
    const apiCalls = { n: 0 }
    const port = await startOrigin({ getStatus: 200, apiFailures: [500], apiCalls })
    const { code, output } = await runSmoke(port, { browserGet: true })
    expect(code, output).toBe(0)
    expect(apiCalls.n).toBe(2)
    // Still visible in the job's log and summary, so a blip is never silent.
    expect(output).toContain('::warning::the viewer endpoint answered HTTP 500')
    expect(output).toContain('serves a real, fetchable model')
  }, 30_000)

  it('still fails when the second ask is a 500 too: a real outage fails every ask', async () => {
    const apiCalls = { n: 0 }
    const port = await startOrigin({ getStatus: 200, apiFailures: [500, 500, 500], apiCalls })
    const { code, output } = await runSmoke(port, { browserGet: true })
    expect(code).not.toBe(0)
    expect(output).toContain('the viewer endpoint did not return JSON: HTTP 500')
    expect(apiCalls.n, 'one more ask, not a loop').toBe(2)
  }, 30_000)

  it('does not ask again after a 404: that is an answer about the garment', async () => {
    const apiCalls = { n: 0 }
    const port = await startOrigin({ getStatus: 200, apiFailures: [404], apiCalls })
    const { code, output } = await runSmoke(port, { browserGet: true })
    expect(code).not.toBe(0)
    expect(output).toContain('HTTP 404')
    expect(apiCalls.n).toBe(1)
  }, 30_000)
})

/*
 * Issue #285 (27 Oct 2026): after #282 deployed, one poster fetch from the GitHub runner ended in
 * `fetch failed`, a cut connection rather than an answer. The same poster answered 200 three times
 * from Pakistan straight after, and the failed check stopped the deploy before its warm-ups. A cut
 * connection is asked once more, like a 5xx (#189); one that is cut again still fails.
 */
describe('post-deploy smoke test — one more ask after a dropped connection (#285)', () => {
  it('passes when a poster’s first connection drops and the second answers, with a warning', async () => {
    const drop = { paths: ['/poster.webp'] }
    const port = await startOrigin({
      getStatus: 200,
      comingSoon: { flag: true, pictures: 2 },
      drop,
    })
    const { code, output } = await runSmoke(port, { browserGet: true, listSaysComingSoon: true })
    expect(code, output).toBe(0)
    expect(output).toContain('::warning::the connection to')
    expect(output).toContain('every colourway serves its picture')
  }, 30_000)

  it('still fails when the poster’s connection drops every time', async () => {
    const drop = { paths: ['/poster.webp'], every: true, seen: new Map<string, number>() }
    const port = await startOrigin({
      getStatus: 200,
      comingSoon: { flag: true, pictures: 2 },
      drop,
    })
    const { code, output } = await runSmoke(port, { browserGet: true, listSaysComingSoon: true })
    expect(code).not.toBe(0)
    expect(output).toContain('could not be fetched')
    // Two posters, two asks each: one more ask, not a loop.
    expect(drop.seen.get('/poster.webp')).toBe(4)
  }, 30_000)

  it('passes when the garment data’s first connection drops', async () => {
    const port = await startOrigin({ getStatus: 200, drop: { paths: ['/api/public/viewer/'] } })
    const { code, output } = await runSmoke(port, { browserGet: true })
    expect(code, output).toBe(0)
    expect(output).toContain('serves a real, fetchable model')
  }, 30_000)
})

/*
 * Issue #289 (28 Oct 2026): two deploys in a row stopped at this check on a TIME-OUT, not a cut
 * connection. In the first, 5 of 41 garments passed the 30 s limit while the CMS Worker answered
 * every request within 8.0 s; in the second, r-cat/maroon's 200 left the Worker in 1,307 ms and the
 * runner was still waiting 30 s later. Both during Cloudflare's "Network Performance Issues in
 * Ashburn, IAD". The same garments answered at once from Pakistan. A time-out, while the answer
 * is arriving or before it starts, is asked once more like a cut connection (#285).
 */
describe('post-deploy smoke test — one more ask after a time-out (#289)', () => {
  it('passes when the garment data stalls once after its 200, with a warning', async () => {
    const stall = { paths: ['/api/public/viewer/'], seen: new Map<string, number>() }
    const port = await startOrigin({ getStatus: 200, stall })
    const { code, output } = await runSmoke(port, { browserGet: true })
    expect(code, output).toBe(0)
    expect(output).toContain('::warning::')
    expect(output).toContain('did not finish within')
    expect(output).toContain('serves a real, fetchable model')
    expect(stall.seen.get('/api/public/viewer/')).toBe(2)
  }, 30_000)

  it('still fails when the garment data stalls every time, after exactly one more ask', async () => {
    const stall = { paths: ['/api/public/viewer/'], every: true, seen: new Map<string, number>() }
    const port = await startOrigin({ getStatus: 200, stall })
    const { code, output } = await runSmoke(port, { browserGet: true })
    expect(code).not.toBe(0)
    expect(output).toContain('the viewer endpoint did not return JSON')
    expect(stall.seen.get('/api/public/viewer/'), 'one more ask, not a loop').toBe(2)
  }, 30_000)

  it('passes when a poster stalls once', async () => {
    const stall = { paths: ['/poster.webp'], seen: new Map<string, number>() }
    const port = await startOrigin({
      getStatus: 200,
      comingSoon: { flag: true, pictures: 2 },
      stall,
    })
    const { code, output } = await runSmoke(port, { browserGet: true, listSaysComingSoon: true })
    expect(code, output).toBe(0)
    expect(output).toContain('did not finish within')
    expect(output).toContain('every colourway serves its picture')
  }, 30_000)

  it('still fails when a poster stalls every time', async () => {
    const stall = { paths: ['/poster.webp'], every: true, seen: new Map<string, number>() }
    const port = await startOrigin({
      getStatus: 200,
      comingSoon: { flag: true, pictures: 2 },
      stall,
    })
    const { code, output } = await runSmoke(port, { browserGet: true, listSaysComingSoon: true })
    expect(code).not.toBe(0)
    expect(output).toContain('could not be fetched')
    // Two posters, two asks each: one more ask, not a loop.
    expect(stall.seen.get('/poster.webp')).toBe(4)
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
