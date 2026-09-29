'use client'

import NumberFlow from '@number-flow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type FactPart, parseFactValue } from '../../lib/factValue'

/**
 * A figure in №05 that counts up the first time it comes into view (owner, 2026-09-29:
 * "the numbers should animate and count up to their specified values").
 *
 * ⚠️ THE FINAL NUMBER IS WHAT THE SERVER SENDS, AND WHAT STAYS WITHOUT SCRIPTING. Until this
 * element is on screen it renders the value as plain text — identical to the server's — so a
 * visitor with JavaScript off, a crawler, `/llms.txt`'s parity test and a screen reader all
 * get the real figure. The animation only starts once the number is seen, which is the only
 * moment it means anything.
 *
 * ⚠️ NEVER UNDER REDUCED MOTION, AND NEVER UNDER AUTOMATION. `prefers-reduced-motion: reduce`
 * keeps the static figure (DESIGN.md §5: "a hard stop, not a slowdown"). `navigator.webdriver`
 * does the same, as the site's cursor does, so a test measures the page rather than a frame of
 * an animation; `e2e/motion.spec.ts` lifts the flag to watch it run.
 *
 * The digits roll for `--showpiece` (1400ms, D26) on `--ease-out-expo`, both read from the
 * tokens. A screen reader is given the final figure once, in visually hidden text, while the
 * rolling digits are hidden from it — otherwise it could announce a number mid-roll.
 */
function motionTokens(): { duration: number; easing: string } {
  const root = getComputedStyle(document.documentElement)
  const ms = Number.parseFloat(root.getPropertyValue('--showpiece'))
  return {
    duration: Number.isFinite(ms) && ms > 0 ? ms : 1400,
    easing: root.getPropertyValue('--ease-out-expo').trim() || 'ease-out',
  }
}

export function CountUp({ value }: { value: string }) {
  const parts = useMemo(() => parseFactValue(value), [value])
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState<FactPart[] | null>(null)
  const [timing, setTiming] = useState({ duration: 1400, easing: 'ease-out' })

  useEffect(() => {
    const element = ref.current
    if (!element || !parts) return
    if (navigator.webdriver) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        setTiming(motionTokens())
        // Start at zero, then move to the figure on the next frame so the roll is visible.
        setShown(parts.map((part) => ('n' in part ? { n: 0 } : part)))
        requestAnimationFrame(() => setShown(parts))
      },
      { threshold: 0.6 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [parts])

  if (!parts || !shown) {
    return (
      <span className="count-up" ref={ref}>
        {value}
      </span>
    )
  }

  return (
    <span className="count-up" ref={ref}>
      <span className="visually-hidden">{value}</span>
      <span aria-hidden="true">
        {shown.map((part, index) =>
          'n' in part ? (
            <NumberFlow
              // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one figure never reorder.
              key={index}
              value={part.n}
              locales="en-US"
              format={{ useGrouping: true }}
              transformTiming={timing}
              spinTiming={timing}
            />
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: as above.
            <span key={index}>{part.sep}</span>
          ),
        )}
      </span>
    </span>
  )
}
