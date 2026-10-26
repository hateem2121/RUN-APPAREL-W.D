import { describe, expect, it } from 'vitest'
import { type CopyTarget, copyModelFrame, frameRegion, type ModelLike } from './frameCopy'

/**
 * The garment's current frame, copied from model-viewer's canvas so a colour change can start from
 * it (moved here from the viewer's colourCrossFade.ts on 2026-10-26, so №03 copies the same way). The
 * browser half (the copy lying exactly on the frame, in a real WebGL canvas) is the viewer's
 * e2e/colour-crossfade-webgl.spec.ts. What would have to break for these to fail: a copy taken from
 * the whole shared canvas (stretched or shifted), or one that throws on an empty canvas.
 */

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

type Drawn = unknown[]

/** A model-viewer stand-in: a shadow root holding its displayed canvas, and a 400 x 300 box. */
function model(source: object | null) {
  return {
    shadowRoot: source ? { querySelector: () => source } : null,
    getBoundingClientRect: () => ({ width: 400, height: 300 }),
  } as unknown as ModelLike
}

function target(throws = false) {
  const drawn: Drawn[] = []
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: (...args: unknown[]) => {
        if (throws) throw new Error('InvalidStateError')
        drawn.push(args)
      },
    }),
  }
  return { canvas: canvas as unknown as CopyTarget, drawn }
}

describe('copyModelFrame', () => {
  const source = { width: 1000, height: 800, style: { width: '500px' } }

  it('draws this garment’s part of the canvas, at its own size', () => {
    const into = target()
    expect(copyModelFrame(model(source), into.canvas)).toBe(true)
    expect([into.canvas.width, into.canvas.height]).toEqual([800, 600])
    expect(into.drawn).toEqual([[source, 0, 0, 800, 600, 0, 0, 800, 600]])
  })

  it('copies nothing when there is no canvas to read, or the read throws', () => {
    expect(copyModelFrame(model(null), target().canvas)).toBe(false)
    expect(copyModelFrame(model(source), target(true).canvas)).toBe(false)
  })
})
