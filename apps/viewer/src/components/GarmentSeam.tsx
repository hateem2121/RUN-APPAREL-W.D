import { useEffect, useRef } from 'react'
import { threadFor, traceContour } from '../lib/garmentContour'

interface GarmentSeamProps {
  /** The picture whose alpha gives the outline. */
  url: string
  /** The colourway's dye, `#rrggbb`. */
  hex: string | null
  /** 0 to 1, as far as the model has downloaded. */
  fraction: number
  /** The model is in: the pattern piece lifts off in picks. */
  done: boolean
  reduceMotion: boolean
}

const PICK_MS = 220
const STAGGER_MS = 40
const ALLOWANCE = 5

/**
 * D1: the garment as a pattern piece in its own dye, with a stitch running round its real outline
 * exactly as far as the model has downloaded (owner's pick, 29 Oct 2026). Decoration over the photo:
 * the photo stays painted under it, so it remains the page's largest paint. If the picture cannot be
 * read (no CORS, no transparency, no dye) this draws nothing and the photo shows, as it did before.
 *
 * ⚠️ ITS OWN COPY OF THE PICTURE, WITH crossOrigin. Putting crossOrigin on the page's main image would
 * make the garment's first picture depend on the media host's CORS answer; this way a wrong answer
 * costs only the decoration.
 */
export function GarmentSeam({ url, hex, fraction, done, reduceMotion }: GarmentSeamProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const latest = useRef(fraction)
  const draw = useRef<(() => void) | null>(null)

  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !hex || !/^#[0-9a-f]{6}$/i.test(hex)) return
    const rgb: [number, number, number] = [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ]
    const thread = threadFor(rgb).join(',')
    const picture = new Image()
    picture.crossOrigin = 'anonymous'
    let cancelled = false
    let observer: ResizeObserver | null = null

    picture.onload = () => {
      if (cancelled || !picture.naturalWidth) return
      let contour: Array<[number, number]>
      const scale = 240 / Math.max(picture.naturalWidth, picture.naturalHeight)
      const mapW = Math.round(picture.naturalWidth * scale)
      const mapH = Math.round(picture.naturalHeight * scale)
      try {
        const reader = document.createElement('canvas')
        reader.width = mapW
        reader.height = mapH
        const readerContext = reader.getContext('2d', { willReadFrequently: true })
        if (!readerContext) return
        readerContext.drawImage(picture, 0, 0, mapW, mapH)
        const rgba = readerContext.getImageData(0, 0, mapW, mapH).data
        const alpha = new Uint8Array(mapW * mapH)
        for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3] ?? 0
        contour = traceContour(alpha, mapW, mapH)
      } catch {
        return
      }
      if (contour.length < 24) return

      let poly: Path2D | null = null
      let stitch: Array<[number, number]> = []
      let lengths: number[] = []
      let total = 0
      let weave: CanvasPattern | null = null
      let cssW = 0
      let cssH = 0

      const layOut = () => {
        const box = canvas.getBoundingClientRect()
        cssW = box.width
        cssH = box.height
        if (!cssW || !cssH) return
        const k = Math.min(2, window.devicePixelRatio || 1)
        canvas.width = Math.round(cssW * k)
        canvas.height = Math.round(cssH * k)
        context.setTransform(k, 0, 0, k, 0, 0)
        // object-fit: contain, as `.stage__placeholder` draws it.
        const s = Math.min(cssW / mapW, cssH / mapH)
        const ox = (cssW - mapW * s) / 2
        const oy = (cssH - mapH * s) / 2
        const raw = contour.map(([x, y]): [number, number] => [ox + x * s, oy + y * s])
        const n = raw.length
        const edge = raw.map((_, i): [number, number] => {
          let sx = 0
          let sy = 0
          for (let o = -3; o <= 3; o++) {
            const p = raw[(i + o + n) % n] as [number, number]
            sx += p[0]
            sy += p[1]
          }
          return [sx / 7, sy / 7]
        })
        poly = new Path2D()
        edge.forEach(([x, y], i) => {
          if (i === 0) poly?.moveTo(x, y)
          else poly?.lineTo(x, y)
        })
        poly.closePath()
        // The stitch runs inside the edge, as real stitching does: on the edge, half a dark stitch
        // vanished into the dark page on a phone (filmed 30 Oct).
        const normals = edge.map((_, i): [number, number] => {
          const a = edge[(i - 2 + n) % n] as [number, number]
          const b = edge[(i + 2) % n] as [number, number]
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
          return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]
        })
        const [e0, e1] = edge[0] as [number, number]
        const [n0, n1] = normals[Math.floor(n / 4)] as [number, number]
        const [q0, q1] = edge[Math.floor(n / 4)] as [number, number]
        const sign = context.isPointInPath(poly, q0 + n0 * ALLOWANCE, q1 + n1 * ALLOWANCE) ? 1 : -1
        stitch = edge.map(([x, y], i) => {
          const [a, b] = normals[i] as [number, number]
          return [x + sign * a * ALLOWANCE, y + sign * b * ALLOWANCE]
        })
        stitch.push([
          e0 + sign * (normals[0]?.[0] ?? 0) * ALLOWANCE,
          e1 + sign * (normals[0]?.[1] ?? 0) * ALLOWANCE,
        ])
        lengths = []
        total = 0
        for (let i = 1; i < stitch.length; i++) {
          const a = stitch[i - 1] as [number, number]
          const b = stitch[i] as [number, number]
          const l = Math.hypot(b[0] - a[0], b[1] - a[1])
          lengths.push(l)
          total += l
        }
        const tile = document.createElement('canvas')
        tile.width = tile.height = 12
        const tileContext = tile.getContext('2d')
        if (tileContext) {
          tileContext.fillStyle = hex
          tileContext.fillRect(0, 0, 12, 12)
          tileContext.fillStyle = 'rgba(255,255,255,.16)'
          tileContext.fillRect(1.2, 0, 3.6, 6)
          tileContext.fillRect(7.2, 6, 3.6, 6)
          weave = context.createPattern(tile, 'repeat')
        }
        draw.current?.()
      }

      draw.current = () => {
        if (!poly || !weave) return
        context.clearRect(0, 0, cssW, cssH)
        context.fillStyle = weave
        context.fill(poly)
        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.setLineDash([2, 6])
        context.lineWidth = 1.5
        context.strokeStyle = `rgba(${thread},.32)`
        context.stroke(poly)
        context.setLineDash([7, 5])
        context.lineWidth = 2.4
        context.strokeStyle = `rgb(${thread})`
        context.beginPath()
        const first = stitch[0] as [number, number]
        context.moveTo(first[0], first[1])
        const want = latest.current * total
        let run = 0
        let end = first
        for (let i = 1; i < stitch.length; i++) {
          const a = stitch[i - 1] as [number, number]
          const b = stitch[i] as [number, number]
          const l = lengths[i - 1] ?? 0
          if (run + l >= want) {
            const r = l ? (want - run) / l : 0
            end = [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]
            context.lineTo(end[0], end[1])
            break
          }
          context.lineTo(b[0], b[1])
          run += l
          end = b
        }
        context.stroke()
        context.setLineDash([])
        if (!reduceMotion && latest.current < 1) {
          context.fillStyle = `rgb(${thread})`
          context.beginPath()
          context.arc(end[0], end[1], 3.5, 0, Math.PI * 2)
          context.fill()
        }
      }
      layOut()
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(layOut)
        observer.observe(canvas)
      }
    }
    picture.src = url
    return () => {
      cancelled = true
      observer?.disconnect()
      draw.current = null
    }
  }, [url, hex, reduceMotion])

  useEffect(() => {
    latest.current = fraction
    if (!done) draw.current?.()
  }, [fraction, done])

  // The pattern piece lifts in picks, from alternating sides; nothing fades.
  useEffect(() => {
    if (!done) return
    draw.current = null
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    if (reduceMotion) {
      context.clearRect(0, 0, canvas.width, canvas.height)
      return
    }
    const box = canvas.getBoundingClientRect()
    const picks = Math.max(3, Math.round(box.height / 24))
    const gap = Math.min(STAGGER_MS, PICK_MS / (picks - 1))
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      let open = false
      for (let p = 0; p < picks; p++) {
        const e = Math.min(1, Math.max(0, (now - start - p * gap) / PICK_MS))
        if (e < 1) open = true
        const eased = 1 - (1 - e) ** 3
        const w = box.width * eased
        context.clearRect(
          p % 2 ? box.width - w : 0,
          (p * box.height) / picks - 1,
          w,
          box.height / picks + 2,
        )
      }
      if (open) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [done, reduceMotion])

  // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas has no tabindex and takes no focus.
  return <canvas ref={ref} className="stage__seam" aria-hidden="true" />
}
