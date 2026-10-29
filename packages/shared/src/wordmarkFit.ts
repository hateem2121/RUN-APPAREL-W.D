/**
 * The factor to multiply the current font-size by so the rendered text spans the
 * available width. FITTED, NOT GUESSED: two fixed sizes both ran "RUN APPAREL" off the
 * edge of the design artifact, because Archivo 900 at 122% is not a width you estimate.
 * The name comes from a CMS field, so its length is an input, not a constant.
 */
export function fitScale(available: number, needed: number, safety = 0.995): number {
  if (!Number.isFinite(available) || !Number.isFinite(needed) || available <= 0 || needed <= 0) {
    return 1
  }
  return (available / needed) * safety
}

// Narrow browser contracts: shared also runs in Workers and deliberately has no DOM types.
export interface WordmarkElement {
  readonly clientWidth: number
  style: { fontSize: string }
  querySelector(selector: string): { readonly scrollWidth: number } | null
  readonly ownerDocument: {
    readonly fonts?: {
      readonly ready: Promise<unknown>
      addEventListener(name: string, callback: () => void): void
      removeEventListener(name: string, callback: () => void): void
    }
  }
}
declare function getComputedStyle(el: WordmarkElement): { fontSize: string }
declare function requestAnimationFrame(callback: (time: number) => void): number
declare function cancelAnimationFrame(frame: number): void
declare const ResizeObserver: {
  new (
    callback: () => void,
  ): {
    observe(el: WordmarkElement): void
    disconnect(): void
  }
}

/** Fit outside ResizeObserver delivery; our own height change must not trigger another fit. */
export function watchWordmarkFit(el: WordmarkElement): () => void {
  const base = el.querySelector('.footer-mark__layer')
  if (!base) return () => {}
  let stopped = false
  let frame = 0
  let width = -1
  const fit = () => {
    frame = 0
    if (stopped || el.clientWidth <= 0) return
    width = el.clientWidth
    el.style.fontSize = ''
    const size = Number.parseFloat(getComputedStyle(el).fontSize)
    if (base.scrollWidth > 0 && Number.isFinite(size)) {
      el.style.fontSize = `${size * fitScale(width, base.scrollWidth)}px`
    }
  }
  const schedule = () => {
    if (!stopped && !frame) frame = requestAnimationFrame(fit)
  }
  // The 29 October mobile audit reproduced a loop when fitting inside the observer.
  // Only width matters: fitting changes height itself, so ignore height-only delivery.
  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (el.clientWidth !== width) schedule()
        })
  observer?.observe(el)
  const fonts = el.ownerDocument.fonts
  void (fonts?.ready ?? Promise.resolve()).then(schedule)
  fonts?.addEventListener('loadingdone', schedule)
  return () => {
    stopped = true
    cancelAnimationFrame(frame)
    observer?.disconnect()
    fonts?.removeEventListener('loadingdone', schedule)
  }
}
