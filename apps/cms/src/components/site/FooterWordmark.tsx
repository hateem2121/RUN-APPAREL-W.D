'use client'

import { watchWordmarkFit } from '@run-apparel/shared'
import { useEffect, useRef } from 'react'

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
    if (!el || !text) return
    return watchWordmarkFit(el)
  }, [text])

  return (
    <div className="footer-mark" ref={wrap} data-lit="false" translate="no">
      <div className="footer-mark__layer" aria-hidden="true">
        {text}
      </div>
      <div className="footer-mark__layer footer-mark__layer--lit" aria-hidden="true">
        {text}
      </div>
    </div>
  )
}
