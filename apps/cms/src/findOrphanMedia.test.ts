import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * `scripts/find-orphan-media.mjs` runs `main()` at import, so this runs the real script as a
 * child process against a fake CMS on a local port (dry run: it never deletes).
 *
 * WHY. The site logo (`site-settings.logo`, the browser-tab icon) is a Media field on a GLOBAL.
 * The finder walked products, raw uploads and three collections, never a global, so `--delete`
 * would have listed the live logo as an orphan (found 2026-10-24).
 */
const SCRIPT = fileURLToPath(new URL('../../../scripts/find-orphan-media.mjs', import.meta.url))
const run = promisify(execFile)

let server: Server | undefined
afterEach(() => {
  server?.close()
  server = undefined
})

type Fake = { siteSettings?: unknown; seenKeys: string[]; paths: string[] }

/** A CMS with three media files: a logo, one a product uses, and one nothing points at. */
async function startFakeCms(siteSettings: unknown): Promise<{ url: string; fake: Fake }> {
  const fake: Fake = { siteSettings, seenKeys: [], paths: [] }
  const empty = { docs: [], hasNextPage: false }
  const created = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0] as string
    fake.paths.push(path)
    fake.seenKeys.push(String(req.headers.authorization ?? ''))
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (path === '/api/media') {
      return send(200, {
        docs: [
          { id: 1, filename: 'site-logo-square.png', filesize: 2048 },
          { id: 2, filename: 'product-model.glb', filesize: 4096 },
          { id: 3, filename: 'nothing-uses-this.png', filesize: 1024 },
        ],
        hasNextPage: false,
      })
    }
    if (path === '/api/products') return send(200, { docs: [{ glbAsset: 2 }], hasNextPage: false })
    if (path === '/api/globals/site-settings') return send(200, fake.siteSettings)
    if (path.startsWith('/api/')) return send(200, empty)
    return send(404, {})
  })
  server = created
  await new Promise<void>((resolve) => created.listen(0, '127.0.0.1', resolve))
  const { port } = created.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, fake }
}

async function dryRun(url: string): Promise<string> {
  const { stdout } = await run(process.execPath, [SCRIPT, '--url', url], {
    env: { ...process.env, CMS_API_KEY: 'test-key' },
    timeout: 20_000,
  })
  return stdout
}

describe('find-orphan-media.mjs and the site logo', () => {
  it('does NOT report a file that only site-settings.logo points at', async () => {
    const { url, fake } = await startFakeCms({ id: 1, logo: 1 })
    const out = await dryRun(url)
    expect(fake.paths).toContain('/api/globals/site-settings')
    expect(out).not.toContain('site-logo-square.png')
    expect(out).toContain('nothing-uses-this.png')
    expect(out).toContain('2 referenced, 1 unreferenced')
    expect(fake.seenKeys.every((key) => key === 'users API-Key test-key')).toBe(true)
  })

  it('also sees the logo when the CMS returns it populated as an object', async () => {
    const { url } = await startFakeCms({ logo: { id: 1, filename: 'site-logo-square.png' } })
    expect(await dryRun(url)).not.toContain('site-logo-square.png')
  })

  it('⚠️ CONTROL: with no logo picked, the same file IS reported (the test can fail)', async () => {
    const { url } = await startFakeCms({ id: 1, logo: null })
    const out = await dryRun(url)
    expect(out).toContain('site-logo-square.png')
    expect(out).toContain('1 referenced, 2 unreferenced')
  })

  it('stops instead of guessing when the global cannot be read', async () => {
    const { url } = await startFakeCms({})
    server?.removeAllListeners('request')
    server?.on('request', (req, res) => {
      const path = (req.url ?? '').split('?')[0]
      res.writeHead(path === '/api/globals/site-settings' ? 403 : 200, {
        'content-type': 'application/json',
      })
      res.end(JSON.stringify({ docs: [], hasNextPage: false }))
    })
    await expect(dryRun(url)).rejects.toThrow(/\/api\/globals\/site-settings\?depth=0 returned 403/)
  })
})
