import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The footer's lazy prompt when a deploy has deleted its chunk (2026-10-22).
 *
 * Before: the failed `lazy()` threw out of `<Suspense>` with no boundary below main.tsx's
 * page-wide one, so the whole garment page became "This page ran into a problem". The test mounts
 * the footer under a boundary of its OWN that records a throw, which stands in for that page-wide
 * one: if the footer lets the failure out, the marker appears.
 *
 * What would have to break for this to fail: the footer's pieces losing their local boundary
 * (the marker shows), or the missing file no longer asking for the page's one reload.
 */

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.resetModules()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.doUnmock('./FooterPrompt')
  vi.doUnmock('../lib/staleChunkReload')
})

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

describe('Footer when its prompt chunk is missing', () => {
  it('asks for one reload, draws the rest of the footer, and lets nothing reach the page-wide boundary', async () => {
    vi.doMock('./FooterPrompt', () => {
      throw new Error('Failed to fetch dynamically imported module')
    })
    const reloads: string[] = []
    vi.doMock('../lib/staleChunkReload', () => ({
      reloadOnChunkFailure: (chunk: string, loading: Promise<unknown>) =>
        loading.catch((error: unknown) => {
          reloads.push(chunk)
          throw error
        }),
    }))
    const reports: string[] = []
    const listen = (event: Event) =>
      reports.push((event as CustomEvent<{ kind: string }>).detail.kind)
    document.addEventListener('run:diagnostic', listen)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // React logs a caught render error; this one is the expected failure.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    // biome-ignore lint/correctness/noComponentHookFactories: built once per test, never per render; it must extend the React copy loaded after the module reset, so it cannot be hoisted to the top of the file
    class PageWideStandIn extends (await import('react')).Component<
      { children: React.ReactNode },
      { crashed: boolean }
    > {
      override state = { crashed: false }
      static getDerivedStateFromError() {
        return { crashed: true }
      }
      override render() {
        return this.state.crashed ? (
          <p data-testid="page-crashed">This page ran into a problem</p>
        ) : (
          this.props.children
        )
      }
    }

    try {
      const { Footer } = await import('./Footer')
      act(() =>
        root.render(
          <PageWideStandIn>
            <Footer settings={DEFAULT_SITE_SETTINGS} />
          </PageWideStandIn>,
        ),
      )
      for (
        let step = 0;
        step < 50 && reports.filter((k) => k === 'lazy-piece-failed').length < 2;
        step++
      ) {
        await settle()
      }

      expect(
        host.querySelector('[data-testid="page-crashed"]'),
        'the page-wide boundary caught it',
      ).toBeNull()
      expect(host.querySelector('footer'), 'the footer survived').not.toBeNull()
      expect(
        host.querySelector('footer h3')?.textContent,
        'its other blocks are still drawn',
      ).toBeTruthy()
      // One shared import, so one request for the reload, however many pieces wait on it.
      expect(reloads).toEqual(['footer-prompt'])
      // Each piece reports its own failure: a caught error no longer reaches window.onerror.
      expect(reports.filter((k) => k === 'lazy-piece-failed')).toHaveLength(2)
    } finally {
      document.removeEventListener('run:diagnostic', listen)
      warn.mockRestore()
      logged.mockRestore()
    }
  })
})
