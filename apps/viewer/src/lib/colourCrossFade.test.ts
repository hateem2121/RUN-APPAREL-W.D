import { afterEach, describe, expect, it, vi } from 'vitest'
import { fadeWhenApplied, frameRegion, holdFrame } from './colourCrossFade'

/**
 * MO2 (polish, 2026-10-04): a colour change fades from the garment's old frame. The browser half
 * (the copy lying exactly on the frame, in a real WebGL canvas) is e2e/colour-crossfade-webgl.spec.ts;
 * this pins the arithmetic and the lifecycle, which a browser test would only meet by chance.
 *
 * What would have to break for these to fail: a copy taken from the whole shared canvas instead of
 * this garment's part of it (stretched or shifted), a copy that throws on an empty canvas, a frame
 * left over the garment when model-viewer never answers, or an older colour fading a newer one.
 */

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('frameRegion', () => {
  it('takes the top-left box at the canvas’s own pixels per CSS pixel', () => {
    // A shared canvas sized for a 500px-wide view at 2x, holding a 400 x 300 garment.
    expect(
      frameRegion(
        { width: 1000, height: 800, style: { width: '500px' } },
        { width: 400, height: 300 },
      ),
    ).toEqual({ width: 800, height: 600 })
  })

  it('follows a lowered render scale, so the copy is never stretched', () => {
    // model-viewer drew at half resolution while the GPU was busy: 500 CSS px, 500 buffer px.
    expect(
      frameRegion(
        { width: 500, height: 400, style: { width: '500px' } },
        { width: 400, height: 300 },
      ),
    ).toEqual({ width: 400, height: 300 })
  })

  it('has nothing to copy from a canvas with no size yet, or a box larger than the canvas', () => {
    expect(
      frameRegion({ width: 0, height: 0, style: { width: '' } }, { width: 400, height: 300 }),
    ).toBeNull()
    expect(
      frameRegion({ width: 800, height: 600, style: { width: '' } }, { width: 400, height: 300 }),
    ).toBeNull()
    expect(
      frameRegion(
        { width: 400, height: 300, style: { width: '200px' } },
        { width: 400, height: 300 },
      ),
    ).toBeNull()
  })
})

/** A model-viewer stand-in: its shadow root holds the displayed WebGL canvas. */
function model(canvas: { width: number; height: number; cssWidth: string } | null) {
  const element = document.createElement('div')
  element.getBoundingClientRect = () => ({ width: 400, height: 300 }) as DOMRect
  const root = element.attachShadow({ mode: 'open' })
  if (canvas) {
    const source = document.createElement('canvas')
    source.id = 'webgl-canvas'
    source.width = canvas.width
    source.height = canvas.height
    source.style.width = canvas.cssWidth
    root.append(source)
  }
  document.body.append(element)
  return element
}

function overlay() {
  const element = document.createElement('canvas')
  const drawImage = vi.fn()
  element.getContext = (() => ({ drawImage })) as unknown as HTMLCanvasElement['getContext']
  return { element, drawImage }
}

describe('holdFrame', () => {
  it('copies this garment’s part of the displayed canvas and shows it', () => {
    const garment = model({ width: 1000, height: 800, cssWidth: '500px' })
    const { element, drawImage } = overlay()
    expect(holdFrame(garment, element)).toBe(true)
    expect([element.width, element.height]).toEqual([800, 600])
    expect(drawImage).toHaveBeenCalledWith(
      garment.shadowRoot?.querySelector('canvas'),
      0,
      0,
      800,
      600,
      0,
      0,
      800,
      600,
    )
    expect(element.dataset.state).toBe('held')
  })

  it('shows nothing when there is no frame: no canvas, an empty one, or a copy that throws', () => {
    const empty = overlay()
    expect(holdFrame(model(null), empty.element)).toBe(false)
    expect(holdFrame(model({ width: 0, height: 0, cssWidth: '' }), empty.element)).toBe(false)
    const throwing = overlay()
    throwing.drawImage.mockImplementation(() => {
      throw new DOMException('no image data', 'InvalidStateError')
    })
    expect(holdFrame(model({ width: 800, height: 600, cssWidth: '400px' }), throwing.element)).toBe(
      false,
    )
    expect(empty.element.dataset.state).toBeUndefined()
    expect(throwing.element.dataset.state).toBeUndefined()
  })
})

describe('fadeWhenApplied', () => {
  const frames = () => vi.advanceTimersByTime(40)

  it('fades the held frame two frames after model-viewer applies the colour', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
    const garment = model({ width: 800, height: 600, cssWidth: '400px' })
    const { element } = overlay()
    holdFrame(garment, element)
    fadeWhenApplied(garment, element)
    expect(element.dataset.state).toBe('held')
    garment.dispatchEvent(new CustomEvent('variant-applied'))
    frames()
    expect(element.dataset.state).toBe('fading')
  })

  it('never leaves a frame over the garment: it fades by itself if no answer comes', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
    const garment = model({ width: 800, height: 600, cssWidth: '400px' })
    const { element } = overlay()
    holdFrame(garment, element)
    fadeWhenApplied(garment, element, 1500)
    vi.advanceTimersByTime(1499)
    expect(element.dataset.state).toBe('held')
    vi.advanceTimersByTime(1)
    frames()
    expect(element.dataset.state).toBe('fading')
  })

  it('lets a newer colour’s hold stand: the older answer fades nothing', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
    const garment = model({ width: 800, height: 600, cssWidth: '400px' })
    const { element } = overlay()
    holdFrame(garment, element)
    fadeWhenApplied(garment, element)
    holdFrame(garment, element) // a second pick before the first landed
    garment.dispatchEvent(new CustomEvent('variant-applied')) // the first colour's answer
    frames()
    // It released the first hold, which is no longer the overlay's: the second stays shown.
    expect(element.dataset.state).toBe('held')
    fadeWhenApplied(garment, element)
    garment.dispatchEvent(new CustomEvent('variant-applied')) // the second colour's answer
    frames()
    expect(element.dataset.state).toBe('fading')
  })

  it('stop fades at once, for a stage that changes before the colour lands', () => {
    const garment = model({ width: 800, height: 600, cssWidth: '400px' })
    const { element } = overlay()
    holdFrame(garment, element)
    const stop = fadeWhenApplied(garment, element)
    stop()
    expect(element.dataset.state).toBe('fading')
  })
})
