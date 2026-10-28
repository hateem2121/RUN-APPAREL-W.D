'use client'

import { useLinkStatus } from 'next/link'

/**
 * Marks the header link a visitor tapped while its page is still on the way (look B, the owner's
 * yes on 27 Oct after a live demo; e2e/pressedLink.spec.ts). Next's own `useLinkStatus` (16.4.3
 * docs, use-link-status.md) is true "before history updates", and only the last of several quick
 * taps is pending, so the mark moves with the visitor's latest choice and leaves when the page
 * arrives. Empty and aria-hidden: the link's name and size stay as they were; notch.css styles the
 * link through `:has()`. The loading line (NavProgress.tsx) still waits 0.4 s before it shows.
 */
export function LinkPending() {
  const { pending } = useLinkStatus()
  return (
    <span className="link-pending" aria-hidden="true" data-pending={pending ? '' : undefined} />
  )
}
