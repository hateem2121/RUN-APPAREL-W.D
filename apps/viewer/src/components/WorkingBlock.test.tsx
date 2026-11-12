import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOTION_REST_AFTER_MS } from '../lib/motion'
import { WorkingBlock } from './WorkingBlock'

/**
 * The 3D download block (12 Nov 2026, loader fixes C1 and C2). On a slow line the woven mark looped
 * for 16 s and more beside a page people can use, and WCAG 2.2 SC 2.2.2 asks motion over five
 * seconds next to other content to stop; the owner chose "rest after 5 s". And a screen reader can
 * now ask for the download's share at any moment, from the browser's own progress bar.
 */
let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

function draw(props: Partial<Parameters<typeof WorkingBlock>[0]> = {}) {
  act(() => {
    root.render(
      <WorkingBlock
        phase="downloading"
        percent={42}
        bytesLoaded={4_200_000}
        bytesTotal={10_000_000}
        reduceMotion={false}
        retryNote={null}
        {...props}
      />,
    )
  })
}

const block = () => host.querySelector('.working') as HTMLElement

describe('the woven mark rests after five seconds (C1)', () => {
  it('weaves from one second and is still weaving just before five seconds more', () => {
    draw()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    act(() => {
      vi.advanceTimersByTime(MOTION_REST_AFTER_MS - 100)
    })
    expect(block().classList.contains('working--rest')).toBe(false)
  })

  it('rests once it has woven for five seconds, while the numbers keep updating', () => {
    draw()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    act(() => {
      vi.advanceTimersByTime(MOTION_REST_AFTER_MS)
    })
    expect(block().classList.contains('working--rest')).toBe(true)
    draw({ percent: 77 })
    expect(host.querySelector('.working__pct')?.textContent).toBe('77%')
  })
})

describe('the browser\x27s own progress bar, for assistive technology (C2)', () => {
  it('carries the download share and a name, outside the hidden block', () => {
    draw({ percent: 42 })
    const bar = host.querySelector('progress') as HTMLProgressElement
    expect(bar).not.toBeNull()
    expect(bar.max).toBe(100)
    expect(bar.value).toBe(42)
    expect(bar.getAttribute('aria-label')).toBe('3D model download')
    expect(bar.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('has no value while the model is being prepared, so it reads as working', () => {
    draw({ phase: 'preparing', percent: 100 })
    expect((host.querySelector('progress') as HTMLProgressElement).hasAttribute('value')).toBe(
      false,
    )
  })
})

describe('3D download timing for PostHog (12 Nov 2026, F3)', () => {
  it('reports how long the block showed once the download is over, after Accept only', () => {
    const seen: Array<[string, Record<string, unknown>]> = []
    const w = window as unknown as { posthog?: unknown; runTrackersStarted?: boolean }
    w.posthog = {
      capture: (name: string, props: Record<string, unknown>) => seen.push([name, props]),
    }
    w.runTrackersStarted = true
    draw()
    act(() => root.render(null))
    expect(seen).toHaveLength(1)
    expect(seen[0]?.[1]).toMatchObject({ loader: 'model_3d' })
    delete w.posthog
    delete w.runTrackersStarted
  })
})
