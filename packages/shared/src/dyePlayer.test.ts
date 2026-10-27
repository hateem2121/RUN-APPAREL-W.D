import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  browserDyeEnv,
  type DyeEnv,
  type DyeLayer,
  parseDuration,
  playDye,
  readDyeTiming,
} from './dyePlayer'

/**
 * The dye player, driven frame by frame with a hand-turned clock. What would have to break for these
 * to fail: an overlay left over the garment when the change is done, cancelled or the tab hidden; a
 * reduced-motion visitor shown any motion; a front that does not open from the dot; or a
 * "first change" mark that fires before anything moved, or more than once.
 */

type Op = [string, ...unknown[]]

/** A 2D context that records what is drawn, and the masks put into it. */
function context(ops: Op[], puts: Uint8ClampedArray[]) {
  return {
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
    clearRect: (...args: unknown[]) => ops.push(['clearRect', ...args]),
    drawImage: (...args: unknown[]) => ops.push(['drawImage', ...args]),
    putImageData: (data: { data: Uint8ClampedArray }) => {
      puts.push(data.data.slice())
      ops.push(['putImageData'])
    },
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  }
}

function harness(options: { reduced?: boolean } = {}) {
  const ops: Op[] = []
  const puts: Uint8ClampedArray[] = []
  const edgePuts: Uint8ClampedArray[] = []
  const attributes = new Map<string, string>()
  const layer: DyeLayer = {
    width: 0,
    height: 0,
    getBoundingClientRect: () => ({ width: 80, height: 100 }),
    getContext: () => context(ops, puts),
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
  }
  let clock = 0
  let queued: ((time: number) => void) | null = null
  let hidden: (() => void) | null = null
  const marks: string[] = []
  let made = 0
  const env: DyeEnv = {
    now: () => clock,
    frame: (callback) => {
      queued = callback
      return 1
    },
    cancelFrame: () => {
      queued = null
    },
    reducedMotion: () => options.reduced ?? false,
    onHidden: (callback) => {
      hidden = callback
      return () => {
        hidden = null
      }
    },
    mark: (name) => marks.push(name),
    pixelRatio: () => 1,
    // The first small canvas is the cover mask, whose puts the tests read; the next is the wet
    // edge's, kept apart.
    makeCanvas: () => {
      made++
      return {
        canvas: { kind: 'mask' },
        context: context(ops, made === 1 ? puts : made === 2 ? edgePuts : []),
      }
    },
  }
  /** Moves the clock and draws one frame. */
  const step = (ms: number) => {
    clock += ms
    const run = queued
    queued = null
    run?.(clock)
  }
  return {
    layer,
    env,
    ops,
    puts,
    edgePuts,
    attributes,
    marks,
    step,
    hide: () => hidden?.(),
    pending: () => queued !== null,
  }
}

const TIMING = { min: 320, max: 640, short: 240 }
const OLD = { kind: 'old picture' }

describe('playDye', () => {
  it('opens from the dot, marks its first change once, and leaves nothing when done', async () => {
    const h = harness()
    const run = playDye(
      {
        layer: h.layer,
        old: OLD,
        point: { x: 0, y: 100 },
        swatch: '#905260',
        kind: 'full',
        timing: TIMING,
      },
      h.env,
    )
    expect(h.attributes.has('data-running')).toBe(true)
    // The duration is the distance's: 128px of reach is 354ms.
    h.step(16)
    expect(h.marks).toEqual(['dye-first-frame'])
    for (let i = 0; i < 2; i++) h.step(16)
    // Under way (the site's ease-out has the front near half-way by 48ms): the cell under the dot
    // (bottom-left) is uncovered, the far corner still covered.
    const mask = h.puts.at(-1) as Uint8ClampedArray
    const cols = 10
    const rows = 13
    const alpha = (col: number, row: number) => mask[(row * cols + col) * 4 + 3] as number
    expect(alpha(0, rows - 1)).toBe(0)
    expect(alpha(cols - 1, 0)).toBe(255)
    for (let i = 0; i < 30; i++) h.step(16)
    await run.finished
    expect(h.marks).toEqual(['dye-first-frame'])
    expect(h.ops.at(-1)?.[0]).toBe('clearRect')
    expect(h.attributes.has('data-running')).toBe(false)
    expect(h.pending()).toBe(false)
  })

  it('draws the old picture into the dye’s mask, and the wet edge only on what is left of it', () => {
    const h = harness()
    playDye(
      {
        layer: h.layer,
        old: OLD,
        point: null,
        swatch: '#905260',
        kind: 'full',
        timing: TIMING,
      },
      h.env,
    )
    h.step(100)
    const drawn = h.ops.filter(([op]) => op === 'drawImage').map(([, source]) => source)
    expect(drawn).toContainEqual(OLD)
    expect(drawn).toContainEqual({ kind: 'mask' })
  })

  it('stains with a pale dye far more faintly than with a dark one (owner, 2026-10-26)', () => {
    /** The strongest wet-edge alpha a dye of `swatch` paints across its run. */
    const strongest = (swatch: string) => {
      const h = harness()
      playDye(
        { layer: h.layer, old: OLD, point: null, swatch, kind: 'full', timing: TIMING },
        h.env,
      )
      for (let i = 0; i < 30; i++) h.step(16)
      let most = 0
      for (const put of h.edgePuts)
        for (let i = 3; i < put.length; i += 4) most = Math.max(most, put[i] as number)
      return most
    }
    // Wine keeps the full 0.55 (140 of 255); butter is at most a fifth of that.
    expect(strongest('#825353')).toBeGreaterThanOrEqual(135)
    expect(strongest('#FDFDC8')).toBeLessThanOrEqual(29)
    expect(strongest('#FDFDC8')).toBeGreaterThan(0)
  })

  it('draws at the old picture’s own resolution, so the first frame is that picture exactly', () => {
    const h = harness()
    // A 3D garment's copy: model-viewer's buffer, 2.5 pixels per CSS px of the 80 x 100 box.
    playDye(
      {
        layer: h.layer,
        old: { width: 200, height: 251 },
        point: null,
        swatch: null,
        kind: 'full',
        timing: TIMING,
      },
      h.env,
    )
    expect([h.layer.width, h.layer.height]).toEqual([200, 251])
    // A picture: its natural size, not its drawn one.
    const p = harness()
    playDye(
      {
        layer: p.layer,
        old: { width: 80, height: 100, naturalWidth: 1200, naturalHeight: 1500 },
        point: null,
        swatch: null,
        kind: 'full',
        timing: TIMING,
      },
      p.env,
    )
    expect([p.layer.width, p.layer.height]).toEqual([1200, 1500])
  })

  it('under reduced motion draws nothing at all and is done at once', async () => {
    const h = harness({ reduced: true })
    const run = playDye(
      { layer: h.layer, old: OLD, point: null, swatch: null, kind: 'full', timing: TIMING },
      h.env,
    )
    await run.finished
    expect(h.ops.filter(([op]) => op === 'drawImage')).toEqual([])
    expect(h.attributes.has('data-running')).toBe(false)
    expect(h.marks).toEqual([])
  })

  it('the tab being hidden clears the overlay at once; a cancel by the next frame', async () => {
    for (const end of ['cancel', 'hide'] as const) {
      const h = harness()
      const run = playDye(
        { layer: h.layer, old: OLD, point: null, swatch: null, kind: 'full', timing: TIMING },
        h.env,
      )
      h.step(16)
      if (end === 'cancel') run.cancel()
      else h.hide()
      await run.finished
      // A cancel waits one frame for a newer dye to take the layer over (the takeover test).
      if (end === 'cancel') h.step(16)
      expect(h.ops.at(-1)?.[0], end).toBe('clearRect')
      expect(h.attributes.has('data-running'), end).toBe(false)
      expect(h.pending(), end).toBe(false)
    }
  })

  it('says when its first frame is drawn, so a heavy swap can wait one frame behind it', async () => {
    const h = harness()
    let drawn = false
    const run = playDye(
      { layer: h.layer, old: OLD, point: null, swatch: null, kind: 'full', timing: TIMING },
      h.env,
    )
    run.firstFrame.then(() => {
      drawn = true
    })
    await Promise.resolve()
    expect(drawn).toBe(false)
    h.step(16)
    await run.firstFrame
    expect(drawn).toBe(true)
    // With nothing to animate, there is no frame to wait for.
    const still = playDye(
      { layer: h.layer, old: OLD, point: null, swatch: null, kind: 'full', timing: TIMING },
      harness({ reduced: true }).env,
    )
    await still.firstFrame
  })

  it('holds the old picture until the new one is ready, then starts its clock', async () => {
    const h = harness()
    let ready = () => {}
    const after = new Promise<void>((done) => {
      ready = done
    })
    const run = playDye(
      { layer: h.layer, old: OLD, point: null, swatch: null, kind: 'full', timing: TIMING, after },
      h.env,
    )
    // Held: covered, running, and no first change however long the new picture takes.
    expect(h.attributes.has('data-running')).toBe(true)
    h.step(1000)
    expect(h.marks).toEqual([])
    ready()
    await after
    await Promise.resolve()
    // Its clock starts now, so the whole dye is still to come.
    h.step(16)
    expect(h.marks).toEqual(['dye-first-frame'])
    for (let i = 0; i < 40; i++) h.step(16)
    await run.finished
    expect(h.attributes.has('data-running')).toBe(false)
  })

  it('a second dye on the same layer starts from what is on screen, never from a cleared layer', async () => {
    const h = harness()
    const first = playDye(
      { layer: h.layer, old: OLD, point: null, swatch: null, kind: 'full', timing: TIMING },
      h.env,
    )
    h.step(16)
    h.step(16)
    // A newer change: its owner lets the first go, then starts the second at once.
    first.cancel()
    const before = h.ops.length
    playDye(
      {
        layer: h.layer,
        old: { kind: 'newer old' },
        point: null,
        swatch: null,
        kind: 'full',
        timing: TIMING,
      },
      h.env,
    )
    await first.finished
    const taken = h.ops.slice(before)
    // The layer as it stood was copied before anything cleared it, and the layer stayed shown.
    const firstClear = taken.findIndex(([op]) => op === 'clearRect')
    const copied = taken.findIndex(([op, source]) => op === 'drawImage' && source === h.layer)
    expect(copied, 'what was on screen was never copied').toBeGreaterThanOrEqual(0)
    expect(firstClear === -1 || copied < firstClear).toBe(true)
    expect(h.attributes.has('data-running')).toBe(true)
    // And the first run's own next-frame clear never lands over the second.
    h.step(16)
    expect(h.attributes.has('data-running')).toBe(true)
  })

  it('a cancel with nothing after it clears on the next frame', async () => {
    const h = harness()
    const run = playDye(
      { layer: h.layer, old: OLD, point: null, swatch: null, kind: 'full', timing: TIMING },
      h.env,
    )
    h.step(16)
    run.cancel()
    await run.finished
    h.step(16)
    expect(h.ops.at(-1)?.[0]).toBe('clearRect')
    expect(h.attributes.has('data-running')).toBe(false)
  })

  it('a gate holds the front at its first change until the new colour is in, then lets it run', async () => {
    const h = harness()
    let open = () => {}
    const until = new Promise<void>((done) => {
      open = done
    })
    let finished = false
    const run = playDye(
      {
        layer: h.layer,
        old: OLD,
        point: { x: 0, y: 100 },
        swatch: null,
        kind: 'full',
        timing: TIMING,
        gate: { until, at: 0.25 },
      },
      h.env,
    )
    run.finished.then(() => {
      finished = true
    })
    // Far longer than the whole dye, held: the corner by the dot opened, the far one still covered.
    for (let i = 0; i < 40; i++) h.step(16)
    await Promise.resolve()
    expect(finished).toBe(false)
    expect(h.marks).toEqual(['dye-first-frame'])
    const mask = h.puts.at(-1) as Uint8ClampedArray
    const alpha = (col: number, row: number) => mask[(row * 10 + col) * 4 + 3] as number
    expect(alpha(0, 12)).toBe(0)
    expect(alpha(9, 0)).toBe(255)
    open()
    await until
    await Promise.resolve()
    for (let i = 0; i < 40; i++) h.step(16)
    await run.finished
    expect(h.attributes.has('data-running')).toBe(false)
  })

  it('a gate that never opens lets go after its cap', async () => {
    const h = harness()
    const run = playDye(
      {
        layer: h.layer,
        old: OLD,
        point: null,
        swatch: null,
        kind: 'full',
        timing: TIMING,
        gate: { until: new Promise(() => {}), at: 0.15 },
      },
      h.env,
    )
    for (let i = 0; i < 160; i++) h.step(16)
    await run.finished
    expect(h.attributes.has('data-running')).toBe(false)
  })

  it('a hover’s short dye ends at the short token, whatever the distance', async () => {
    const h = harness()
    let done = false
    const run = playDye(
      { layer: h.layer, old: OLD, point: null, swatch: null, kind: 'short', timing: TIMING },
      h.env,
    )
    run.finished.then(() => {
      done = true
    })
    h.step(16)
    h.step(200)
    await Promise.resolve()
    expect(done).toBe(false)
    h.step(40)
    await run.finished
    expect(done).toBe(true)
  })
})

describe('parseDuration', () => {
  it('reads a token in ms or in s, as engines serialise it either way', () => {
    expect(parseDuration('240ms')).toBe(240)
    expect(parseDuration(' .2s')).toBe(200)
    expect(parseDuration('0.64s')).toBe(640)
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('fast')).toBeNull()
  })

  it('refuses a long run of digits with no unit at once, not after trying every split (CodeQL #93)', () => {
    // A computed style is the page's own CSS, but the pattern must not depend on that: an
    // ambiguous `\d*\.?\d+` took time growing with the square of the run.
    const start = Date.now()
    expect(parseDuration(`${'0'.repeat(50_000)}x`)).toBeNull()
    expect(Date.now() - start).toBeLessThan(100)
  })
})

describe('browserDyeEnv', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reaches the browser only through its own globals, and stops listening when asked', () => {
    const listeners = new Set<() => void>()
    const page = { visibilityState: 'visible' }
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback()
      return 7
    })
    const cancelled: number[] = []
    vi.stubGlobal('cancelAnimationFrame', (id: number) => cancelled.push(id))
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }))
    vi.stubGlobal('devicePixelRatio', 2)
    vi.stubGlobal('document', {
      get visibilityState() {
        return page.visibilityState
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      createElement: () => ({ width: 0, height: 0, getContext: () => ({ kind: '2d' }) }),
    })
    const env = browserDyeEnv()
    let framed = false
    expect(
      env.frame(() => {
        framed = true
      }),
    ).toBe(7)
    expect(framed).toBe(true)
    env.cancelFrame(7)
    expect(cancelled).toEqual([7])
    expect(env.reducedMotion()).toBe(true)
    expect(env.pixelRatio()).toBe(2)
    expect(env.now()).toBeGreaterThan(0)
    env.mark('dye-test')
    const marks = (
      globalThis as unknown as { performance: { getEntriesByName(name: string): unknown[] } }
    ).performance
    expect(marks.getEntriesByName('dye-test')).toHaveLength(1)
    const made = env.makeCanvas(10, 13)
    expect(made?.canvas).toMatchObject({ width: 10, height: 13 })
    // Hidden calls back; visible does not; unsubscribing removes the listener.
    let hidden = 0
    const stop = env.onHidden(() => hidden++)
    for (const listener of listeners) listener()
    page.visibilityState = 'hidden'
    for (const listener of listeners) listener()
    expect(hidden).toBe(1)
    stop()
    expect(listeners.size).toBe(0)
  })
})

describe('readDyeTiming', () => {
  it('reads the three tokens, and falls back to the shipped values where one is missing', () => {
    const values: Record<string, string> = { '--dye-min': '.3s', '--dye-max': '700ms' }
    expect(readDyeTiming((name) => values[name] ?? '')).toEqual({ min: 300, max: 700, short: 240 })
  })
})
