'use client'

import { type ClickWindow, watchContactClicks } from '@run-apparel/shared'
import { useEffect } from 'react'

/**
 * Counts a tap on the WhatsApp, phone or inquiry-email link for Google Analytics, for a visitor
 * who accepted the cookie question. Draws nothing. The rules, and why it listens from the start,
 * are in `packages/shared/src/contactClicks.ts`; the viewer mounts the same call.
 */
export function ContactClicks({ email }: { email: string }) {
  useEffect(() => watchContactClicks(window as unknown as ClickWindow, email), [email])
  return null
}
