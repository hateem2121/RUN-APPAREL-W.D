import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { forwardsToViewer } from '../viewerForward.mjs'
import { WORKER_VERSION_PATH, workerVersionResponse } from '../workerVersion.mjs'

describe('workerVersionResponse', () => {
  it('answers the version id, uncached', async () => {
    const res = workerVersionResponse(new URL(`https://cms.wear-run.help${WORKER_VERSION_PATH}`), {
      id: 'dc8dcd28-271b-4367-9840-6c244f84cb40',
    })
    expect(await res?.json()).toEqual({
      worker: 'run-apparel-viewer-cms',
      version: 'dc8dcd28-271b-4367-9840-6c244f84cb40',
    })
    expect(res?.headers.get('cache-control')).toBe('no-store')
  })

  it('leaves every other path alone (negative control)', () => {
    expect(workerVersionResponse(new URL('https://wear-run.com/'), { id: 'x' })).toBeNull()
    expect(
      workerVersionResponse(new URL('https://wear-run.com/__worker/version/x'), { id: 'x' }),
    ).toBeNull()
  })

  it('is answered by the CMS, not forwarded to the viewer, on the site host', () => {
    expect(forwardsToViewer(new URL(`https://wear-run.com${WORKER_VERSION_PATH}`))).toBe(false)
  })

  it('runs in the default entrypoint before OpenNext and before the page store', () => {
    // Source order is the guarantee: kept answers are served further down. Since 20 Nov 2026 the
    // order is siteEdge.mjs's (it calls the Worker's own early answers, `first`, before the garment
    // data, the store and the drawing), and worker.mjs's `first` is where the version is answered.
    const worker = readFileSync(join(import.meta.dirname, '..', 'worker.mjs'), 'utf8')
    const firstAt = worker.indexOf('    first(request, env) {')
    expect(firstAt).toBeGreaterThan(-1)
    expect(worker.indexOf('workerVersionResponse(', firstAt)).toBeGreaterThan(firstAt)
    const edge = readFileSync(join(import.meta.dirname, '..', 'siteEdge.mjs'), 'utf8')
    const handler = edge.slice(edge.indexOf('export function createSiteFetch('))
    const early = handler.indexOf('await edge.first?.(request, env, ctx)')
    expect(early).toBeGreaterThan(-1)
    for (const later of ['serveViewerApi(', 'fromSharedStore(', 'edge.draw(']) {
      expect(handler.indexOf(later), later).toBeGreaterThan(early)
    }
  })
})
