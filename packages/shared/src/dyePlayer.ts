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

export type DyeRun = { finished: Promise<void>; cancel(): void }

export type DyeOptions = {
  layer: DyeLayer
  /** The old colour's picture, the same shape as the layer's box. */
  old: object
  /** The chosen dot's centre, in px from the layer's top-left; `null` for the middle of the foot. */
  point: { x: number; y: number } | null
  /** The new colour's swatch, for the wet edge; `null` draws no edge. */
  swatch: string | null
  kind: 'full' | 'short'
  timing: DyeTiming
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

/** The site's `--ease` (cubic-bezier(0.22, 1, 0.36, 1)), as the quartic ease-out it closely follows. */
const ease = (p: number) => 1 - (1 - p) ** 4

export function playDye(options: DyeOptions, env: DyeEnv = browserDyeEnv()): DyeRun {
  const { layer } = options
  let resolve = () => {}
  const finished = new Promise<void>((done) => {
    resolve = done
  })
  const context = env.reducedMotion() ? null : layer.getContext('2d')
  const box = layer.getBoundingClientRect()
  const cols = Math.ceil(box.width / CELL)
  const rows = Math.ceil(box.height / CELL)
  const mask = context && cols > 0 && rows > 0 ? env.makeCanvas(cols, rows) : null
  if (!context || !mask) {
    resolve()
    return { finished, cancel: () => {} }
  }

  const ratio = env.pixelRatio()
  layer.width = Math.round(box.width * ratio)
  layer.height = Math.round(box.height * ratio)
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
  const scaledW = cols * CELL * ratio
  const scaledH = rows * CELL * ratio

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
    context.drawImage(options.old as never, 0, 0, layer.width, layer.height)
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
  let marked = false
  let over = false
  const start = env.now()
  const end = () => {
    if (over) return
    over = true
    env.cancelFrame(frameId)
    stopWatching()
    context.clearRect(0, 0, layer.width, layer.height)
    layer.removeAttribute('data-running')
    resolve()
  }
  const stopWatching = env.onHidden(end)
  const tick = () => {
    if (over) return
    const progress = Math.min(1, (env.now() - start) / duration)
    if (progress >= 1) {
      end()
      return
    }
    draw(ease(progress) * (1 + SOFT))
    if (!marked) {
      marked = true
      env.mark(DYE_FIRST_FRAME)
    }
    frameId = env.frame(tick)
  }

  layer.setAttribute('data-running', '')
  // The old picture covers the change from this very moment: the caller swaps the colour next.
  draw(0)
  frameId = env.frame(tick)
  return { finished, cancel: end }
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
