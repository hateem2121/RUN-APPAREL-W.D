/**
 * MO2 (polish, 2026-10-04): picking a colour fades from the old colour to the new one over
 * `--fast` (200ms, the audit's "quick cross-fade that feels like changing the fabric") instead of
 * snapping. The garment's current frame is copied onto a canvas laid over it, the colour changes
 * underneath, and once model-viewer has drawn it the copy fades away.
 *
 * ⚠️ NOT A VIEW TRANSITION, though the HD picture's switch is one (Stage.tsx, D9). A view
 * transition pauses the whole page's drawing while its update runs, and a colour swap takes
 * 121-131ms of main thread on the live garment (viewer-model-viewer rule): the dots, the colour's
 * name and the address would freeze for that long on every pick. This touches the 3D window only.
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
 *
 * Anything missing (no frame drawn yet, a canvas of another shape, no 2D context) means no copy,
 * and the colour then changes the way it always did, at once.
 */

/** The overlay's states, which page.css draws: the old frame wholly shown, or fading away. */
export type CrossFadeState = 'held' | 'fading'

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

/** The canvas model-viewer is showing for this garment: its WebGL canvas, or its 2D copy. */
function displayedCanvas(model: HTMLElement): HTMLCanvasElement | null {
  const root = model.shadowRoot
  if (!root) return null
  return root.querySelector<HTMLCanvasElement>('#webgl-canvas, canvas.show')
}

/** How many holds each overlay has seen, so an older colour's release cannot fade a newer one. */
const holds = new WeakMap<HTMLCanvasElement, number>()

/**
 * Copies the garment's current frame onto `overlay` and shows it. Returns false, showing
 * nothing, when there is no frame to copy.
 */
export function holdFrame(model: HTMLElement, overlay: HTMLCanvasElement): boolean {
  const source = displayedCanvas(model)
  const box = model.getBoundingClientRect()
  const region = source ? frameRegion(source, box) : null
  const context = region ? overlay.getContext('2d') : null
  if (!source || !region || !context) return false
  try {
    overlay.width = region.width
    overlay.height = region.height
    context.drawImage(source, 0, 0, region.width, region.height, 0, 0, region.width, region.height)
  } catch {
    return false
  }
  holds.set(overlay, (holds.get(overlay) ?? 0) + 1)
  overlay.dataset.state = 'held' satisfies CrossFadeState
  return true
}

/**
 * Fades the held frame away once model-viewer has applied the new colour (`variant-applied`, then
 * two frames, the first of which draws it), or after `timeoutMs` if it never says so, so a frame
 * can never be left over the garment. A newer hold supersedes this one: its fade does nothing.
 * Returns `stop`, which fades it at once: for a stage that changes or goes before the colour lands.
 */
export function fadeWhenApplied(
  model: HTMLElement,
  overlay: HTMLCanvasElement,
  timeoutMs = 1500,
): () => void {
  const hold = holds.get(overlay) ?? 0
  let done = false
  const fade = () => {
    if (holds.get(overlay) === hold && overlay.dataset.state === 'held') {
      overlay.dataset.state = 'fading' satisfies CrossFadeState
    }
  }
  const finish = () => {
    done = true
    model.removeEventListener('variant-applied', release)
    window.clearTimeout(timer)
  }
  const release = () => {
    if (done) return
    finish()
    requestAnimationFrame(() => requestAnimationFrame(fade))
  }
  model.addEventListener('variant-applied', release)
  const timer = window.setTimeout(release, timeoutMs)
  return () => {
    if (done) return
    finish()
    fade()
  }
}
