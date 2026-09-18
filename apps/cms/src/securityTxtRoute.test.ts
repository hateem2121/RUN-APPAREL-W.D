import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SECURITY_TXT } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { GET, dynamic } from './app/.well-known/security.txt/route'

/**
 * The site's `/.well-known/security.txt` (decided 2026-09-18, live from the merge that
 * deploys it). The route returns the shared text; the build proved Next registers a
 * dot-folder route (`○ /.well-known/security.txt`, prerendered byte-identical, 613 bytes).
 */
describe('/.well-known/security.txt on the site', () => {
  it('is the one shared text, as plain UTF-8, cached for an hour', async () => {
    const response = GET()
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(SECURITY_TXT)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
  })

  it('is prerendered, like robots.txt and llms.txt', () => {
    expect(dynamic).toBe('force-static')
  })

  /**
   * ⚠️ OUTSIDE BOTH ROUTE GROUPS, or `(frontend)/layout.tsx` wraps it in `<html>` and it
   * stops being a text file. The folder's location IS the guarantee, so pin it.
   */
  it('sits at src/app/, outside the (frontend) and (payload) groups', () => {
    const path = fileURLToPath(new URL('./app/.well-known/security.txt/route.ts', import.meta.url))
    expect(readFileSync(path, 'utf8')).toContain("from '@run-apparel/shared'")
    expect(path).not.toMatch(/\((frontend|payload)\)/)
  })
})
