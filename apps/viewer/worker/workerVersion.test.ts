import { describe, expect, it } from 'vitest'
import { forwardsToViewer } from '../../cms/viewerForward.mjs'
import { WORKER_VERSION_PATH, workerVersionResponse } from './workerVersion'

describe('workerVersionResponse', () => {
  it('answers the version id, uncached, with the Worker-built security headers', async () => {
    const res = workerVersionResponse(WORKER_VERSION_PATH, {
      id: 'dc8dcd28-271b-4367-9840-6c244f84cb40',
    })
    expect(res).not.toBeNull()
    expect(await res?.json()).toEqual({
      worker: 'run-apparel-viewer-site',
      version: 'dc8dcd28-271b-4367-9840-6c244f84cb40',
    })
    expect(res?.headers.get('cache-control')).toBe('no-store')
    expect(res?.headers.get('content-security-policy')).toBeTruthy()
  })

  it('says null rather than inventing an id when the binding is missing', async () => {
    expect(await workerVersionResponse(WORKER_VERSION_PATH, undefined)?.json()).toMatchObject({
      version: null,
    })
  })

  it('leaves every other path alone, including a real garment page (negative control)', () => {
    expect(workerVersionResponse('/products/rxps/wine', { id: 'x' })).toBeNull()
    expect(workerVersionResponse('/products/__worker/version/', { id: 'x' })).toBeNull()
  })

  it('is a path the CMS Worker actually forwards to this Worker on wear-run.com', () => {
    // If the forwarding rules ever stop matching it, the deploy check would read the CMS's 404.
    expect(forwardsToViewer(new URL(`https://wear-run.com${WORKER_VERSION_PATH}`))).toBe(true)
  })
})
