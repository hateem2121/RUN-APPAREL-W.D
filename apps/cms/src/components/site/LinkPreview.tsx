'use client'

import { type ReactElement, useEffect, useSyncExternalStore } from 'react'
import type { LinkPreviewCard } from './LinkPreviewCard'

/** What a link's card shows: the page's own name and description, and a garment's own picture. */
export type LinkPreviewData = {
  readonly title: string
  readonly text?: string
  readonly image?: { readonly src: string; readonly srcSet?: string }
}

/*
 * ⚠️ THE CARD'S CODE IS FETCHED ONLY WHERE A CARD CAN OPEN, AND AFTER THE PAGE IS IDLE. Imported
 * directly, the card put two more script files on every guide: 668,811 bytes (213,909 gzip)
 * against the live page's 570,090 (178,158), measured 24 Nov 2026 on /guides/sportswear-fibers.
 * A phone paid that for a card a finger can never open. So the link is drawn alone, exactly as the
 * server sent it, and the card's code is asked for once: when the device has a mouse or trackpad,
 * or at the first Tab key. Until it arrives, and for ever on a touch-only phone, the link is a
 * plain link, which it always was.
 */
type Card = typeof LinkPreviewCard
let card: Card | null = null
let asked = false
const waiting = new Set<() => void>()

/** A link that holds the keyboard is not rebuilt under it: the card joins when focus moves on. */
function whenNoLinkIsFocused(then: () => void) {
  const held = document.activeElement?.closest('main a')
  if (!held) return then()
  held.addEventListener('blur', () => whenNoLinkIsFocused(then), { once: true })
}

function ask() {
  if (asked) return
  asked = true
  const load = () =>
    import('./LinkPreviewCard')
      .then((loaded) =>
        whenNoLinkIsFocused(() => {
          card = loaded.LinkPreviewCard
          // For the browser tests, which must not hover or focus a link before its card can open.
          document.documentElement.dataset.linkCards = 'ready'
          for (const tell of waiting) tell()
        }),
      )
      // A failed fetch leaves plain links, and the next page view asks again.
      .catch(() => {
        asked = false
      })
  // Safari has no requestIdleCallback (MDN compatibility data): a timer after the load does there.
  if ('requestIdleCallback' in window) window.requestIdleCallback(load)
  else setTimeout(load, 200)
}

const subscribe = (tell: () => void) => {
  waiting.add(tell)
  return () => {
    waiting.delete(tell)
  }
}

/**
 * A link inside a guide's words that can show a small card saying where it goes (the guides audit,
 * owner 2026-11-24: "where there are links, show what's in the link"). The card itself, its rules
 * and its library are `LinkPreviewCard.tsx`.
 */
export function LinkPreview({ link, preview }: { link: ReactElement; preview: LinkPreviewData }) {
  const Loaded = useSyncExternalStore(
    subscribe,
    () => card,
    () => null,
  )
  useEffect(() => {
    if (window.matchMedia('(any-hover: hover), (any-pointer: fine)').matches) return ask()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') ask()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return Loaded ? <Loaded link={link} preview={preview} /> : link
}
