import type { ViewerApiSuccess } from '@run-apparel/shared'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { filmMayAutoplay, ProductFilm } from './ProductFilm'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The 360° film under a ball's facts (owner, 2026-11-20). What would break in production, and the
 * case that catches it:
 *  - a film on a garment page that has none → "draws nothing for a product with no film";
 *  - a caption naming the colour the VISITOR picked while the film shows another → the caption test
 *    selects nothing and still expects the film's own colour;
 *  - a 2 MB film fetched while the 3D model is still downloading → "attaches no source until near";
 *  - a film that moves for ten seconds with no way to stop it (WCAG 2.2.2) → the pause test.
 */

const colourway = (slug: string, displayName: string) => ({ slug, displayName }) as never

const ball = (slug: string, colourways = [colourway('red-navy', 'Cricket Ball / Derby Red')]) =>
  ({
    product: { slug, productName: 'KURA' },
    colourways,
  }) as unknown as ViewerApiSuccess

let host: HTMLDivElement
let root: Root
let observed: IntersectionObserverCallback | undefined

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  observed = undefined
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observed = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  // jsdom has no media playback: record the calls instead.
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const draw = (data: ViewerApiSuccess) => act(() => root.render(<ProductFilm data={data} />))
const comeNear = () =>
  act(() => observed?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as never))

describe('ProductFilm', () => {
  it('draws nothing for a product with no film', () => {
    draw(ball('rxps'))
    expect(host.innerHTML).toBe('')
  })

  it('draws nothing when the colour the film shows is no longer offered', () => {
    draw(ball('kura', [colourway('teal', 'Deep End')]))
    expect(host.innerHTML).toBe('')
  })

  it('captions the colour the film shows, by its page name', () => {
    draw(
      ball('kura', [
        colourway('teal', 'Deep End'),
        colourway('red-navy', 'Cricket Ball / Derby Red'),
      ]),
    )
    expect(host.querySelector('figcaption span')?.textContent).toBe(
      'KURA in Cricket Ball / Derby Red, turning 360°',
    )
    expect(host.querySelector('video')?.getAttribute('aria-label')).toContain('Cricket Ball')
  })

  it('attaches no source and downloads nothing until it is near the screen', () => {
    draw(ball('kura'))
    const video = host.querySelector('video') as HTMLVideoElement
    expect(video.getAttribute('preload')).toBe('none')
    expect(host.querySelectorAll('source')).toHaveLength(0)
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled()

    comeNear()
    const sources = [...host.querySelectorAll('source')].map((s) => [
      s.getAttribute('src'),
      s.getAttribute('type'),
    ])
    // AV1 first: a browser plays the first type it can decode.
    expect(sources).toEqual([
      ['https://media.wear-run.com/kura-360-av1.mp4', 'video/mp4; codecs="av01.0.08M.08"'],
      ['https://media.wear-run.com/kura-360-h264.mp4', 'video/mp4; codecs="avc1.64002A"'],
    ])
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1)
  })

  it('is muted and inline, so a phone may play it without a tap', () => {
    draw(ball('kura'))
    const video = host.querySelector('video') as HTMLVideoElement
    expect(video.muted).toBe(true)
    expect(video.hasAttribute('playsinline')).toBe(true)
    expect(video.loop).toBe(true)
  })

  // jsdom has no `navigator.webdriver`; define it, and run the same mount both ways so the
  // "not called" is a result, not a harness that never could have called it.
  const setWebdriver = (value: boolean) =>
    Object.defineProperty(navigator, 'webdriver', { value, configurable: true })
  afterEach(() => Reflect.deleteProperty(navigator, 'webdriver'))

  it('starts by itself on an ordinary visit once near (the control)', () => {
    setWebdriver(false)
    draw(ball('kura'))
    comeNear()
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  })

  it('does not start by itself under automation', () => {
    setWebdriver(true)
    draw(ball('kura'))
    comeNear()
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
  })

  it('has a button that pauses a playing film and plays a paused one', () => {
    draw(ball('kura'))
    comeNear()
    const video = host.querySelector('video') as HTMLVideoElement
    const button = host.querySelector('button') as HTMLButtonElement
    expect(button.textContent).toBe('Play')

    vi.spyOn(video, 'paused', 'get').mockReturnValue(true)
    act(() => button.click())
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()

    act(() => video.dispatchEvent(new Event('play')))
    expect(button.textContent).toBe('Pause')
    expect(button.getAttribute('aria-pressed')).toBe('true')

    vi.spyOn(video, 'paused', 'get').mockReturnValue(false)
    act(() => button.click())
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
  })

  /*
   * A browser whose play() returns nothing instead of a promise (old WebKit builds and some
   * in-app browsers; the class of Sentry VIEWER-N, fixed for decode() and register() in #432).
   * `.catch` on nothing throws: inside the effect that takes the garment page down with it, and
   * in the button's handler it is an error on every tap.
   */
  it('does not throw when play() returns nothing, by itself or from the button', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
      () => undefined as unknown as Promise<void>,
    )
    setWebdriver(false)
    draw(ball('kura'))
    expect(() => comeNear()).not.toThrow()
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)

    const video = host.querySelector('video') as HTMLVideoElement
    const button = host.querySelector('button') as HTMLButtonElement
    vi.spyOn(video, 'paused', 'get').mockReturnValue(true)
    expect(() => act(() => button.click())).not.toThrow()
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2)
  })
})

describe('filmMayAutoplay — the products-page film’s own stops', () => {
  const visit = { reducedMotion: false, saveData: false, webdriver: false, effectiveType: '4g' }
  it('plays on an ordinary visit', () => expect(filmMayAutoplay(visit)).toBe(true))
  it.each([
    ['reduced motion', { reducedMotion: true }],
    ['Data Saver', { saveData: true }],
    ['automation', { webdriver: true }],
    ['2G', { effectiveType: '2g' }],
    ['slow 2G', { effectiveType: 'slow-2g' }],
  ])('stays still under %s', (_, change) =>
    expect(filmMayAutoplay({ ...visit, ...change })).toBe(false),
  )
})
