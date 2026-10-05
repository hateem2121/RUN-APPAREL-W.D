'use client'

import { useEffect } from 'react'

/**
 * Escape closes an open ticket: a home family ticket (polish D3) or a product ticket (D3b); the
 * owner's version 2 promised it, after W3C "Understanding 1.4.13 Content on Hover or Focus". A ticket
 * opens on hover and on keyboard focus in CSS alone, so without this script everything but Escape
 * still works. The open one is marked `data-dismissed`, which site.css reads, until the pointer
 * leaves it or focus moves on (within a product ticket too: from its picture to its name is a new
 * focus): then it may open again. Rendered once on each page that draws tickets.
 */
export function TicketDismiss() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const open = document.querySelector<HTMLElement>(
        ':is(.family-card, .product-card):is(:hover, :focus-within):not([data-dismissed])',
      )
      if (!open) return
      open.setAttribute('data-dismissed', '')
      const done = new AbortController()
      const clear = () => {
        open.removeAttribute('data-dismissed')
        done.abort()
      }
      open.addEventListener('pointerleave', clear, { signal: done.signal })
      open.addEventListener('focusout', clear, { signal: done.signal })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return null
}
