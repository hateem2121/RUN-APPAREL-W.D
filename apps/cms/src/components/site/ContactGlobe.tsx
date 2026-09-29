'use client'

import type { COBEOptions, Globe } from 'cobe'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  arcsVisibleAt,
  directionsUrl,
  focusPhi,
  type LatLon,
  parseCoordinates,
  parseCssColour,
  ROUTES,
} from '../../lib/globe'

/**
 * Sialkot on a turning globe, with lines running out to cities on every continent (owner,
 * 2026-09-29: "customers can be new and from anywhere").
 *
 * ⚠️ THE SERVER MARKUP IS THE WHOLE ANSWER; THE CANVAS IS DECORATION ON TOP. The address, the
 * coordinates as text and the directions link are rendered on the server and stay when
 * scripting is off, WebGL is absent, the coordinates are blank or unreadable, or a GPU context
 * is lost. The canvas is `aria-hidden`: nothing it draws is information a screen reader lacks.
 * With no coordinates in the CMS there is no globe at all — never a Sialkot hard-coded here
 * (`lib/globe.ts`).
 *
 * ⚠️ NO CITY IS NAMED ON THE PAGE. The arcs are a picture of "wherever your team is", not a list
 * of customers, so they carry no labels.
 *
 * ⚠️ STILL UNDER REDUCED MOTION AND UNDER AUTOMATION. `prefers-reduced-motion: reduce` draws one
 * frame with every arc already in place (DESIGN.md §5: "a hard stop, not a slowdown");
 * `navigator.webdriver` does the same, as `CountUp` and the cursor do, so a test measures the
 * page and not a frame of a spin. `e2e/globe.spec.ts` lifts the flag to watch it turn. A drag
 * still turns the globe in either case: that is the visitor asking.
 *
 * ⚠️ IT ONLY WORKS WHILE SEEN. The frame loop runs only while the canvas is on screen and the tab
 * is visible, and the arcs start drawing the first time it is on screen — not at page load,
 * when nobody is looking.
 *
 * cobe 2.0.1 (pinned) draws its own dots: no map tiles, fonts, cookies or storage, so the
 * privacy notice and the CSP are untouched. It has NO frame loop or `onRender` in this version:
 * `update()` draws synchronously, so this component owns the loop. It has native arcs, so
 * nothing is projected by hand; an arc cannot be partly drawn, so "drawing in" is one arc
 * starting after another across `--showpiece`.
 */

const SPIN_PER_FRAME = 0.0035
const DRAG_PER_PIXEL = 0.006
const TILT = 0.25

type Theme = {
  dark: boolean
  colours: Pick<COBEOptions, 'baseColor' | 'glowColor' | 'markerColor' | 'arcColor'>
}

/** Both WebGL generations, tried the way cobe tries them; the probe context is released at once. */
function webglAvailable(): boolean {
  try {
    const probe = document.createElement('canvas')
    const gl = (probe.getContext('webgl2') ??
      probe.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** A token, resolved by the browser to a real colour for the CURRENT theme (`light-dark()` and all). */
function tokenColour(probe: HTMLElement, token: string, fallback: [number, number, number]) {
  probe.style.color = `var(${token})`
  return parseCssColour(getComputedStyle(probe).color) ?? fallback
}

function readTheme(probe: HTMLElement): Theme {
  const bg = tokenColour(probe, '--bg', [0.95, 0.94, 0.92])
  const wash = tokenColour(probe, '--wash', [0.89, 0.88, 0.85])
  const text = tokenColour(probe, '--text', [0.11, 0.12, 0.1])
  const accent = tokenColour(probe, '--dimension', [0.37, 0.45, 0.08])
  // Dark when the page's ground is darker than its text, whichever way it was chosen.
  const dark = bg[0] + bg[1] + bg[2] < text[0] + text[1] + text[2]
  return {
    dark,
    colours: {
      baseColor: dark ? [wash[0] * 1.6, wash[1] * 1.6, wash[2] * 1.6] : wash,
      glowColor: dark ? [bg[0] * 1.4, bg[1] * 1.4, bg[2] * 1.4] : bg,
      markerColor: accent,
      arcColor: accent,
    },
  }
}

/** Draws the globe on `element` until the returned function is called. */
function startGlobe(
  createGlobe: typeof import('cobe').default,
  works: LatLon,
  element: HTMLCanvasElement,
  holder: HTMLElement,
  onLost: () => void,
): () => void {
  const still = navigator.webdriver || matchMedia('(prefers-reduced-motion: reduce)').matches
  const probe = document.createElement('span')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.display = 'none'
  holder.appendChild(probe)

  const showpiece = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--showpiece'),
  )
  const drawIn = still ? 0 : Number.isFinite(showpiece) && showpiece > 0 ? showpiece : 1400
  const arcs = ROUTES.map((route) => ({ from: works, to: route.location }))

  let theme = readTheme(probe)
  let phi = focusPhi(works[1])
  let size = Math.max(1, Math.round(holder.clientWidth))
  let shown = still ? arcs.length : 0
  let started: number | null = null
  let visible = false
  let raf = 0
  let last = 0
  let dragging = false
  let dragX = 0

  const globe: Globe = createGlobe(element, {
    width: size,
    height: size,
    devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    phi,
    theta: TILT,
    dark: theme.dark ? 1 : 0,
    diffuse: 1.2,
    mapSamples: 16000,
    mapBrightness: theme.dark ? 6 : 1.4,
    ...theme.colours,
    markers: [{ location: works, size: 0.07 }],
    markerElevation: 0.01,
    arcs: arcs.slice(0, shown),
    arcWidth: 0.6,
    arcHeight: 0.28,
  })

  const paint = (extra: Partial<COBEOptions> = {}) => globe.update({ phi, theta: TILT, ...extra })

  const frame = (now: number) => {
    raf = 0
    if (!visible || document.hidden) return
    if (started === null) started = now
    const dt = last ? Math.min(now - last, 64) : 16
    last = now
    if (!dragging) phi += SPIN_PER_FRAME * (dt / 16)
    const count = arcsVisibleAt(arcs.length, now - started, drawIn)
    const extra: Partial<COBEOptions> = {}
    if (count !== shown) {
      shown = count
      extra.arcs = arcs.slice(0, shown)
    }
    paint(extra)
    raf = requestAnimationFrame(frame)
  }
  const kick = () => {
    if (still || raf || !visible || document.hidden) return
    last = 0
    raf = requestAnimationFrame(frame)
  }

  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting)
    if (visible) kick()
  })
  observer.observe(holder)
  document.addEventListener('visibilitychange', kick)

  const retheme = () => {
    theme = readTheme(probe)
    paint({
      dark: theme.dark ? 1 : 0,
      mapBrightness: theme.dark ? 6 : 1.4,
      ...theme.colours,
    })
  }
  const themeWatch = new MutationObserver(retheme)
  themeWatch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  const scheme = matchMedia('(prefers-color-scheme: dark)')
  scheme.addEventListener('change', retheme)

  const resize = new ResizeObserver(() => {
    const next = Math.max(1, Math.round(holder.clientWidth))
    if (next === size) return
    size = next
    paint({ width: size, height: size })
  })
  resize.observe(holder)

  const down = (event: PointerEvent) => {
    dragging = true
    dragX = event.clientX
    element.setPointerCapture?.(event.pointerId)
    holder.dataset.dragging = 'true'
  }
  const move = (event: PointerEvent) => {
    if (!dragging) return
    phi += (event.clientX - dragX) * DRAG_PER_PIXEL
    dragX = event.clientX
    // Moving pictures repaint on their own; a still one is painted here, on demand.
    if (still || !raf) paint()
  }
  const up = () => {
    dragging = false
    delete holder.dataset.dragging
  }
  element.addEventListener('pointerdown', down)
  element.addEventListener('pointermove', move)
  element.addEventListener('pointerup', up)
  element.addEventListener('pointercancel', up)

  // A lost GPU context leaves a blank square; drop back to the server's text instead.
  const lost = (event: Event) => {
    event.preventDefault()
    onLost()
  }
  element.addEventListener('webglcontextlost', lost)

  if (still) paint({ arcs })
  // The first frame is on the canvas. `e2e/globe.spec.ts` waits for this before it compares
  // frames: two blank canvases are identical, and that once looked like a still globe.
  holder.dataset.globe = 'ready'

  return () => {
    if (raf) cancelAnimationFrame(raf)
    observer.disconnect()
    themeWatch.disconnect()
    resize.disconnect()
    scheme.removeEventListener('change', retheme)
    document.removeEventListener('visibilitychange', kick)
    element.removeEventListener('pointerdown', down)
    element.removeEventListener('pointermove', move)
    element.removeEventListener('pointerup', up)
    element.removeEventListener('pointercancel', up)
    element.removeEventListener('webglcontextlost', lost)
    globe.destroy()
    delete holder.dataset.globe
    probe.remove()
  }
}

export function ContactGlobe({ coordinates, address }: { coordinates: string; address: string }) {
  const works = useMemo<LatLon | null>(() => parseCoordinates(coordinates), [coordinates])
  const [live, setLive] = useState(false)
  const [near, setNear] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  // Decide once, after mount, whether the picture can exist at all.
  useEffect(() => {
    if (works && webglAvailable()) setLive(true)
  }, [works])

  /*
   * ⚠️ NOTHING IS LOADED OR BUILT UNTIL THE GLOBE IS WITHIN HALF A SCREEN (2026-09-29). Built at
   * page load, cobe's 16,000-sample sphere was one long task — 175 ms of blocked main thread,
   * worst task 225 ms, on the reference phone profile — landing while a visitor at the top of
   * /contact was typing their name (e2e/perfBudgets.spec.ts PF-04; 0 ms with the globe off). The
   * globe is the page's last section, so on arrival it is screens away.
   */
  useEffect(() => {
    if (!live || near) return
    const element = root.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        setNear(true)
      },
      { rootMargin: '50% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [live, near])

  useEffect(() => {
    if (!live || !near || !works) return
    let cancelled = false
    let teardown: (() => void) | undefined
    // Loaded now, not at page load: the library is ~5 KB and only this page's canvas wants it.
    import('cobe').then(({ default: createGlobe }) => {
      if (cancelled) return
      const element = canvas.current
      const holder = stage.current
      if (element && holder) {
        teardown = startGlobe(createGlobe, works, element, holder, () => setLive(false))
      }
    })
    return () => {
      cancelled = true
      teardown?.()
    }
  }, [live, near, works])

  return (
    <div className="contact-globe" ref={root}>
      <div className="contact-globe__copy">
        <address className="contact-globe__address">{address}</address>
        {works ? <p className="contact-globe__coords">{coordinates}</p> : null}
        <a className="contact-globe__link" href={directionsUrl(works, address)} rel="noopener">
          Get directions <span aria-hidden="true">↗</span>
        </a>
      </div>
      {live ? (
        <div className="contact-globe__stage" ref={stage}>
          {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas has no tabindex and takes no focus; the rule assumes it does because it carries pointer handlers. */}
          <canvas ref={canvas} className="contact-globe__canvas" aria-hidden="true" />
        </div>
      ) : null}
    </div>
  )
}
