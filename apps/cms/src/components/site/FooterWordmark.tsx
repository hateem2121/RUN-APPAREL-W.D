'use client'

import { useEffect, useRef } from 'react'
import { fitScale } from '../../lib/wordmarkFit'

/**
 * The company's name at the width of the slab, cropped by its bottom edge. Two
 * identical layers: the base outline is always there; the lit layer is masked to a
 * point and fades out. THIS ISLAND ONLY FITS THE TEXT — the spotlight's position and
 * `data-lit` are driven by FooterGlow's light controller, so the wordmark, the halo
 * and the grid are lit from ONE point, the cursor ring's. Two lights of different
 * radii wandering over the same letters was the first draft's tell.
 *
 * FIT AFTER FONTS: Archivo's metrics differ from the fallback, so measuring before
 * `document.fonts.ready` fits the wrong face. Re-fit on resize.
 */
export function FooterWordmark({ text }: { text: string }) {
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const base = el.querySelector<HTMLElement>('.footer-mark__layer')
    if (!base) return

    const fit = () => {
      el.style.fontSize = ''
      const scale = fitScale(el.clientWidth, base.scrollWidth)
      el.style.fontSize = `${Number.parseFloat(getComputedStyle(el).fontSize) * scale}px`
    }
    const ready = document.fonts?.ready ?? Promise.resolve()
    void ready.then(fit)
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="footer-mark" ref={wrap} data-lit="false">
      <div className="footer-mark__layer" aria-hidden="true">
        {text}
      </div>
      <div className="footer-mark__layer footer-mark__layer--lit" aria-hidden="true">
        {text}
      </div>
    </div>
  )
}
