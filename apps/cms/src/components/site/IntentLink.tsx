'use client'

import Link from 'next/link'
import { type ComponentProps, type SyntheticEvent, useState } from 'react'
import { shouldPrefetchOnIntent } from '../../lib/intentPrefetch'

type LinkProps = ComponentProps<typeof Link>

/**
 * `next/link`, fetching its whole page ahead once a visitor shows intent (faster-taps spec,
 * Part 2): the mouse entering it, keyboard focus, or the start of a touch. Before that it
 * prefetches exactly as Next does by default (a page drawn per request: the shared layout only).
 *
 * WHY. On 26 Oct a first tap waited 2.85–3.75 s while the page was drawn; Next's default had
 * fetched 2 KB ahead. `prefetch={true}` fetches the whole page (Next 16.4.3 docs, link.md), and
 * on intent only, as Next's own guide shows ("Hover-triggered prefetch") and Vercel's v0 found
 * necessary: prefetching every visible card multiplied requests 2.9× (nextjs.org/blog, 16 Oct 2026).
 * lib/intentPrefetch.ts decides which links may (never Save-Data, never the viewer's pages).
 */
export function IntentLink({
  prefetch,
  onPointerEnter,
  onFocus,
  onTouchStart,
  ...props
}: LinkProps) {
  const [intent, setIntent] = useState(false)

  const shown = (event: SyntheticEvent<HTMLAnchorElement>) => {
    if (intent) return
    const link = event.currentTarget
    const saveData = Boolean(
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
    )
    const allowed = shouldPrefetchOnIntent({
      href: link.href,
      here: new URL(window.location.href),
      saveData,
      download: link.hasAttribute('download'),
      target: link.getAttribute('target'),
    })
    if (allowed) setIntent(true)
  }

  return (
    <Link
      {...props}
      prefetch={intent ? true : prefetch}
      onPointerEnter={(event) => {
        onPointerEnter?.(event)
        if (event.pointerType === 'mouse') shown(event)
      }}
      onFocus={(event) => {
        onFocus?.(event)
        shown(event)
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event)
        shown(event)
      }}
    />
  )
}
