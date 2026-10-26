/**
 * A copy of the 3D garment's current frame, for a colour change to start from. Moved here from the
 * viewer's `lib/colourCrossFade.ts` on 2026-10-26 so the website's №03 copies the same way: it took
 * a `toBlob` picture until then, which encodes and decodes a WebP before anything can move.
 *
 * ⚠️ THE COPY IS A REGION OF model-viewer's CANVAS, NOT ALL OF IT. With one garment on the page
 * model-viewer shows its shared WebGL canvas (`#webgl-canvas`) in the garment's shadow root, sized
 * for the largest view and drawn at a lower resolution while the GPU is busy; this garment's frame
 * is its top-left part (model-viewer 4.3.1, `Renderer.rescaleCanvas`, and the crop its own
 * `toBlob` makes). `frameRegion` finds that part from the canvas's own numbers, its buffer width
 * over its CSS width, so a change of render scale cannot stretch the copy. The canvas keeps its
 * last frame (`preserveDrawingBuffer: true` in model-viewer's renderer), so it can be read after it
 * was shown (MDN `drawImage`, modified 2025-09-25: a canvas is a valid source; a zero-sized one
 * throws, which is caught here).
 */

/**
 * The part of model-viewer's displayed canvas that holds THIS garment's frame, in the canvas's own
 * pixels: the top-left `box` CSS pixels at the canvas's pixels per CSS pixel. `null` when the
 * canvas has no size yet or the region would not fit inside it.
 */
export function frameRegion(
  source: { width: number; height: number; style: { width: string } },
  box: { width: number; height: number },
): { width: number; height: number } | null {
  const cssWidth = Number.parseFloat(source.style.width)
  if (!(cssWidth > 0) || source.width <= 0 || source.height <= 0) return null
  const ratio = source.width / cssWidth
  // Truncated, as model-viewer's own crop is (a fractional box measured 801.6px wide; rounding
  // took a column past what its `toBlob` copies, e2e/colour-crossfade-webgl.spec.ts).
  const width = Math.floor(box.width * ratio)
  const height = Math.floor(box.height * ratio)
  if (width <= 0 || height <= 0 || width > source.width || height > source.height) return null
  return { width, height }
}

/** The canvas model-viewer shows: its size, and its CSS width. A browser's canvas satisfies it. */
export type FrameSource = { width: number; height: number; style: { width: string } }

/** As much of model-viewer's element as the copy touches. A browser's element satisfies it. */
export type ModelLike = {
  readonly shadowRoot: { querySelector(selectors: string): object | null } | null
  getBoundingClientRect(): { width: number; height: number }
}

/** As much of a canvas as the copy draws on. A browser's canvas satisfies it. */
export type CopyTarget = {
  width: number
  height: number
  getContext(id: '2d'): {
    // `never`: a browser context takes any image source, and only the frame's canvas is passed.
    drawImage(
      source: never,
      ...rect: [number, number, number, number, number, number, number, number]
    ): void
  } | null
}

/** A canvas, by its shape: a size and a CSS width. */
function isFrameSource(value: object | null): value is FrameSource {
  const v = value as Partial<FrameSource> | null
  return (
    typeof v?.width === 'number' &&
    typeof v.height === 'number' &&
    typeof v.style?.width === 'string'
  )
}

/**
 * Copies the garment's current frame onto `into`, sized to it. Returns false, drawing nothing, when
 * there is no frame to copy (no canvas yet, a canvas of another shape, no 2D context, a read that
 * throws): the colour then changes at once.
 */
export function copyModelFrame(model: ModelLike, into: CopyTarget): boolean {
  const found = model.shadowRoot?.querySelector('#webgl-canvas, canvas.show') ?? null
  const source = isFrameSource(found) ? found : null
  const region = source ? frameRegion(source, model.getBoundingClientRect()) : null
  const context = region ? into.getContext('2d') : null
  if (!source || !region || !context) return false
  try {
    into.width = region.width
    into.height = region.height
    context.drawImage(
      source as never,
      0,
      0,
      region.width,
      region.height,
      0,
      0,
      region.width,
      region.height,
    )
  } catch {
    return false
  }
  return true
}
