import { arrivalField, coverAt, type DyeTiming, dyeDuration, dyeOrigin, wetShade } from './dye.ts'

/**
 * Plays the site's colour change (owner, 2026-10-26: one dye everywhere a garment changes colour).
 * The NEW colour is already in place underneath; this draws the OLD picture on a canvas laid over
 * it and erases it along `arrivalField`, one frame at a time, so the new colour soaks in from the
 * dot that chose it. A canvas, because no CSS mask can threshold a noise field (dye.ts).
 *
 * ⚠️ THE OVERLAY MUST NEVER OUTLIVE THE CHANGE. It is cleared when the dye finishes, when it is
 * cancelled (a newer pick), and the moment the tab is hidden, because a hidden tab gets no animation
 * frames and an overlay left there would show the old colour over the new one on return. Under
 * reduced motion nothing is drawn at all: the colour simply changes.
 *
 * The browser is reached through `DyeEnv`, typed by what it touches (this package also feeds
 * Workers, which have no DOM), so the player is driven frame by frame in its tests.
 */

/** As much of a 2D context as the player draws with. A browser's context satisfies it. */
export type DyeContext = {
  globalCompositeOperation: string
  imageSmoothingEnabled: boolean
  clearRect(x: number, y: number, w: number, h: number): void
  // `never`: a browser context takes any image source; the player passes only canvases and pictures.
  drawImage(source: never, ...rect: number[]): void
  putImageData(data: never, x: number, y: number): void
  createImageData(w: number, h: number): { data: Uint8ClampedArray }
}

/** The canvas the dye is drawn on, laid exactly over the picture. A browser's canvas satisfies it. */
export type DyeLayer = {
  width: number
  height: number
  getBoundingClientRect(): { width: number; height: number }
  getContext(id: '2d'): DyeContext | null
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/** What the player needs of the browser. `browserDyeEnv()` is the real one. */
export type DyeEnv = {
  now(): number
  frame(callback: (time: number) => void): number
  cancelFrame(id: number): void
  reducedMotion(): boolean
  /** Calls back once the tab is hidden; returns the unsubscribe. */
  onHidden(callback: () => void): () => void
  mark(name: string): void
  pixelRatio(): number
  /** A small canvas for the dye's mask, `w` × `h` cells. */
  makeCanvas(w: number, h: number): { canvas: object; context: DyeContext } | null
}

export type DyeRun = {
  finished: Promise<void>
  /**
   * The first opened frame is drawn (or there is nothing to draw). A caller with heavy work to do,
   * such as model-viewer swapping a colour (121-131 ms of main thread on the live garment, measured
   * 2026-08-21), starts it one frame after this, so the visitor's first change is not held behind it.
   */
  firstFrame: Promise<void>
  cancel(): void
}

export type DyeOptions = {
  layer: DyeLayer
  /**
   * The old colour's picture, the same shape as the layer's box. `null` where there is none to read
   * (a picture not loaded): the dye then runs only if an earlier one is still on this layer, from it.
   */
  old: object | null
  /** The chosen dot's centre, in px from the layer's top-left; `null` for the middle of the foot. */
  point: { x: number; y: number } | null
  /** The new colour's swatch, for the wet edge; `null` draws no edge. */
  swatch: string | null
  kind: 'full' | 'short'
  timing: DyeTiming
  /**
   * Hold the old picture over the change until this settles (the new picture decoding), then start
   * the dye's clock: a picture still on its way would otherwise be soaked onto a blank box.
   */
  after?: Promise<unknown>
  /**
   * Let the front open only to `at` (a share of the trip: the wet spot at the dot, the visitor's
   * first change) until `until` settles, at most `GATE_MS`. For a 3D garment, whose new colour is
   * applied a frame behind the dye and drawn when model-viewer says `variant-applied`: the front must
   * not sweep over cloth still in the old colour (whole-branch review, 2026-10-26).
   */
  gate?: { until: Promise<unknown>; at: number }
}

/** The mask's cell, in CSS px: 8, so a 1440px screen's garment is about 100 × 125 cells a frame. */
const CELL = 8
/** How soft the front is, as a share of the trip (`coverAt`). */
const SOFT = 0.06
/** How wide the wet edge is, as a share of the trip, and how strongly it stains. */
const WET_BAND = 0.05
const WET_ALPHA = 0.55
/** The mark a pick's first visible change leaves, which the timing test reads (≤ 100 ms). */
export const DYE_FIRST_FRAME = 'dye-first-frame'

/** The longest a gate holds the front. */
const GATE_MS = 1500

/**
 * The dye on screen on each layer: a run, or a cancelled one whose clear waits for the next frame.
 * ⚠️ A NEWER CHANGE STARTS FROM WHAT IS ON SCREEN (whole-branch review, 2026-10-26). A second pick
 * mid-dye used to clear the layer and start from the first pick's colour, so whatever was still
 * covered snapped to it in one frame, and a pointer brushing across a №02 card flashed its other
 * colour. Now a new dye on the same layer copies the layer as it stands and lays it over its own old
 * picture before anything clears; and a cancel clears on the next frame, not at once, so the owner
 * that cancels and starts again in one go never shows a cleared layer in between.
 */
const onScreen = new WeakMap<object, { capture(): object | null; release(): void }>()

/** The site's `--ease` (cubic-bezier(0.22, 1, 0.36, 1)), as the quartic ease-out it closely follows. */
const ease = (p: number) => 1 - (1 - p) ** 4

export function playDye(options: DyeOptions, env: DyeEnv = browserDyeEnv()): DyeRun {
  const { layer } = options
  let resolve = () => {}
  const finished = new Promise<void>((done) => {
    resolve = done
  })
  let drawn = () => {}
  const firstFrame = new Promise<void>((done) => {
    drawn = done
  })
  // An earlier dye still on this layer: copy what it shows before anything clears or resizes it.
  const previous = onScreen.get(layer)
  onScreen.delete(layer)
  const under = previous?.capture() ?? null
  previous?.release()
  const context = env.reducedMotion() ? null : layer.getContext('2d')
  const box = layer.getBoundingClientRect()
  const cols = Math.ceil(box.width / CELL)
  const rows = Math.ceil(box.height / CELL)
  const mask = context && cols > 0 && rows > 0 ? env.makeCanvas(cols, rows) : null
  const source = options.old ?? under
  if (!context || !mask || !source) {
    if (previous) {
      layer.getContext('2d')?.clearRect(0, 0, layer.width, layer.height)
      layer.removeAttribute('data-running')
    }
    resolve()
    drawn()
    return { finished, firstFrame, cancel: () => {} }
  }

  /*
   * At the old picture's own resolution where it has one (a 3D garment's copy is model-viewer's buffer;
   * a picture, its natural size), so the first frame IS that picture, pixel for pixel: the garment
   * pages' WebGL test compares it with model-viewer's own crop. Otherwise the screen's pixel ratio.
   */
  const own = ownSize(source)
  layer.width = own ? own.width : Math.round(box.width * env.pixelRatio())
  layer.height = own ? own.height : Math.round(box.height * env.pixelRatio())
  // What was on screen, over the new old picture: the new dye continues from what the visitor sees.
  let picture: object = source
  if (under && options.old) {
    const both = env.makeCanvas(layer.width, layer.height)
    if (both) {
      both.context.drawImage(options.old as never, 0, 0, layer.width, layer.height)
      both.context.drawImage(under as never, 0, 0, layer.width, layer.height)
      picture = both.canvas
    }
  }
  const origin = dyeOrigin(box, options.point)
  const field = arrivalField(cols, rows, origin, CELL, Math.floor(env.now()) & 0xffff)
  const duration = dyeDuration(origin.reach, options.kind, options.timing)
  const coverData = mask.context.createImageData(cols, rows)
  const wet = options.swatch ? wetShade(options.swatch) : 'transparent'
  const edge = wet === 'transparent' ? null : env.makeCanvas(cols, rows)
  const edgeData = edge?.context.createImageData(cols, rows) ?? null
  if (edgeData) {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(wet.slice(i, i + 2), 16))
    for (let i = 0; i < cols * rows; i++) {
      edgeData.data[i * 4] = r as number
      edgeData.data[i * 4 + 1] = g as number
      edgeData.data[i * 4 + 2] = b as number
    }
  }
  // The mask's cells cover whole CSS px, so the last row and column may run past the box.
  const scaledW = cols * CELL * (layer.width / box.width)
  const scaledH = rows * CELL * (layer.height / box.height)

  const draw = (t: number) => {
    for (let i = 0; i < field.length; i++) {
      const arrival = field[i] as number
      coverData.data[i * 4 + 3] = Math.round(coverAt(arrival, t, SOFT) * 255)
      if (edgeData) {
        const band = Math.max(0, 1 - Math.abs(arrival - t) / WET_BAND)
        edgeData.data[i * 4 + 3] = Math.round(band * WET_ALPHA * 255)
      }
    }
    mask.context.putImageData(coverData as never, 0, 0)
    context.globalCompositeOperation = 'source-over'
    context.clearRect(0, 0, layer.width, layer.height)
    context.imageSmoothingEnabled = true
    context.drawImage(mask.canvas as never, 0, 0, cols, rows, 0, 0, scaledW, scaledH)
    context.globalCompositeOperation = 'source-in'
    context.drawImage(picture as never, 0, 0, layer.width, layer.height)
    if (edge && edgeData) {
      edge.context.putImageData(edgeData as never, 0, 0)
      // Only on what is left of the old picture: a 3D garment's copy is see-through around it, so
      // the wet edge never stains the paper.
      context.globalCompositeOperation = 'source-atop'
      context.drawImage(edge.canvas as never, 0, 0, cols, rows, 0, 0, scaledW, scaledH)
    }
    context.globalCompositeOperation = 'source-over'
  }

  let frameId = 0
  let clearing = 0
  let marked = false
  let over = false
  let start = env.now()
  // The gate (see `DyeOptions.gate`): open without one, or once its promise settles or its cap passes.
  const gate = options.gate
  let gateOpen = !gate
  gate?.until.then(
    () => {
      gateOpen = true
    },
    () => {
      gateOpen = true
    },
  )
  let held = 0
  let heldSince = -1
  /** Stops this run's frames and settles its promises, leaving the layer as it is. */
  const stop = () => {
    over = true
    env.cancelFrame(frameId)
    stopWatching()
    drawn()
    resolve()
  }
  const clear = () => {
    context.clearRect(0, 0, layer.width, layer.height)
    layer.removeAttribute('data-running')
  }
  const entry = {
    capture: () => {
      const copy = env.makeCanvas(layer.width, layer.height)
      if (!copy) return null
      copy.context.drawImage(layer as never, 0, 0)
      return copy.canvas
    },
    release: () => {
      stop()
      env.cancelFrame(clearing)
    },
  }
  /** Done, or the tab hidden: cleared at once. */
  const end = () => {
    if (over) return
    stop()
    if (onScreen.get(layer) === entry) onScreen.delete(layer)
    clear()
  }
  /** A newer change, or the owner going: cleared on the next frame unless a new dye takes over. */
  const cancel = () => {
    if (over) return
    stop()
    clearing = env.frame(() => {
      if (onScreen.get(layer) !== entry) return
      onScreen.delete(layer)
      clear()
    })
  }
  const stopWatching = env.onHidden(end)
  const tick = () => {
    if (over) return
    const now = env.now()
    if (!gateOpen && heldSince >= 0 && now - heldSince > GATE_MS) gateOpen = true
    let progress = Math.min(1, (now - start - held) / duration)
    let t = ease(progress) * (1 + SOFT)
    if (gate && !gateOpen && t > gate.at) {
      // Held at the gate: the clock is moved on so the front resumes from here once it opens.
      if (heldSince < 0) heldSince = now
      progress = 1 - (1 - gate.at / (1 + SOFT)) ** 0.25
      held = now - start - progress * duration
      t = gate.at
    }
    if (progress >= 1) {
      end()
      return
    }
    draw(t)
    if (!marked) {
      marked = true
      env.mark(DYE_FIRST_FRAME)
      drawn()
    }
    frameId = env.frame(tick)
  }

  onScreen.set(layer, entry)
  layer.setAttribute('data-running', '')
  // The old picture covers the change from this very moment: the caller swaps the colour next.
  draw(0)
  const go = () => {
    if (over) return
    start = env.now()
    frameId = env.frame(tick)
  }
  if (options.after) options.after.then(go, go)
  else go()
  return { finished, firstFrame, cancel }
}

/** A picture's natural size, or a canvas's; `null` for anything without one. */
function ownSize(source: object): { width: number; height: number } | null {
  const s = source as {
    naturalWidth?: unknown
    naturalHeight?: unknown
    width?: unknown
    height?: unknown
  }
  const width = typeof s.naturalWidth === 'number' ? s.naturalWidth : s.width
  const height = typeof s.naturalHeight === 'number' ? s.naturalHeight : s.height
  return typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0
    ? { width, height }
    : null
}

/** A duration token as `getComputedStyle` gives it: `240ms`, or `.24s` (tokenContract.ts says why). */
export function parseDuration(text: string): number | null {
  const match = /^\s*(\d*\.?\d+)(ms|s)\s*$/.exec(text)
  if (!match) return null
  return Math.round(Number(match[1]) * (match[2] === 's' ? 1000 : 1))
}

/** The values tokens.css ships, for a token that cannot be read. */
const SHIPPED: DyeTiming = { min: 320, max: 640, short: 240 }

/** The dye's three duration tokens, read through `read` (a computed style's `getPropertyValue`). */
export function readDyeTiming(read: (name: string) => string): DyeTiming {
  return {
    min: parseDuration(read('--dye-min')) ?? SHIPPED.min,
    max: parseDuration(read('--dye-max')) ?? SHIPPED.max,
    short: parseDuration(read('--dye-short')) ?? SHIPPED.short,
  }
}

/** The browser's globals the player uses, typed here because this package has no DOM types. */
type BrowserGlobals = {
  performance: { now(): number; mark(name: string): void }
  requestAnimationFrame(callback: (time: number) => void): number
  cancelAnimationFrame(id: number): void
  matchMedia(query: string): { matches: boolean }
  devicePixelRatio: number
  document: {
    visibilityState: string
    addEventListener(type: 'visibilitychange', listener: () => void): void
    removeEventListener(type: 'visibilitychange', listener: () => void): void
    createElement(tag: 'canvas'): { width: number; height: number; getContext(id: '2d'): unknown }
  }
}

/** The real browser, read when a dye starts (never at import, so a Worker can import this file). */
export function browserDyeEnv(): DyeEnv {
  const g = globalThis as unknown as BrowserGlobals
  return {
    now: () => g.performance.now(),
    frame: (callback) => g.requestAnimationFrame(callback),
    cancelFrame: (id) => g.cancelAnimationFrame(id),
    reducedMotion: () => g.matchMedia('(prefers-reduced-motion: reduce)').matches,
    onHidden: (callback) => {
      const listener = () => {
        if (g.document.visibilityState === 'hidden') callback()
      }
      g.document.addEventListener('visibilitychange', listener)
      return () => g.document.removeEventListener('visibilitychange', listener)
    },
    mark: (name) => g.performance.mark(name),
    pixelRatio: () => g.devicePixelRatio || 1,
    makeCanvas: (w, h) => {
      const canvas = g.document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const context = canvas.getContext('2d') as DyeContext | null
      return context ? { canvas, context } : null
    },
  }
}
