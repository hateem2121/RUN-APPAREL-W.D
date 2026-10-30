import { type TrackerWindow, trackerEvent } from './consent.ts'

/**
 * How a buyer reached out without the form: a tap on the WhatsApp, phone or email link.
 *
 * Checked 2026-10-29: Google Analytics counted the form's `inquiry_sent` but recorded no tap on
 * WhatsApp, the phone number or the mailbox, so nobody could tell how a visitor who skipped the
 * form reached out, or from which channel. Those links are on every page (footer), on the buyer
 * pages, on /contact and on the garment pages.
 *
 * ⚠️ NOT THE SAME COUNT AS THE GARMENT PAGES' `email_clicked` AND `whatsapp_clicked`
 * (`VIEWER_ANALYTICS_EVENTS`, sent by the viewer's footer to the site's own store with
 * `sendBeacon`, no consent needed because no third party is involved). Those cover the garment
 * pages only, never the phone number, and carry no Google traffic source. This one goes to Google
 * Analytics, so a tap can be laid beside the visit's channel, on every page, once the visitor
 * accepted.
 */
export const CONTACT_CLICK_EVENT = 'contact_click'

export type ContactMethod = 'whatsapp' | 'phone' | 'email'

/**
 * Which kind of contact a link is, or null when it is not one.
 *
 * ⚠️ ONLY THE BUYERS' MAILBOX COUNTS. The site also links the jobs (hr@) and press mailboxes, and a
 * tap on those is not a buyer reaching out. The address is passed in (the site settings hold it,
 * and the owner can change it in the CMS) rather than written here.
 *
 * ⚠️ WHATSAPP IS MATCHED BY THE EXACT HOST, NOT BY "CONTAINS wa.me": `wa.me.example.com` and
 * `notwa.me` must not count.
 */
export function contactMethod(href: string, inquiryEmail: string): ContactMethod | null {
  const value = href.trim()
  const lower = value.toLowerCase()
  if (lower.startsWith('tel:')) return 'phone'
  if (lower.startsWith('mailto:')) {
    try {
      const address = decodeURIComponent(lower.slice('mailto:'.length).split('?')[0] ?? '')
      return address.trim() === inquiryEmail.trim().toLowerCase() ? 'email' : null
    } catch {
      return null
    }
  }
  // The host must END at `wa.me`: the next character is a path, query or fragment, or nothing.
  // (This package has no `URL` type, and a pattern this small needs none.)
  return WHATSAPP_LINK.test(value) ? 'whatsapp' : null
}

const WHATSAPP_LINK = /^https?:\/\/wa\.me(?=[/?#]|$)/i

/** The part of `window` a click listener needs, on top of what the trackers touch. */
export interface ClickWindow extends TrackerWindow {
  document: TrackerWindow['document'] & {
    addEventListener(
      type: 'click',
      listener: (event: { target: unknown }) => void,
      capture?: boolean,
    ): void
    removeEventListener(
      type: 'click',
      listener: (event: { target: unknown }) => void,
      capture?: boolean,
    ): void
  }
}

/**
 * Send one `contact_click` to Google Analytics for each tap on a contact link. Returns the call
 * that stops listening.
 *
 * ⚠️ IT LISTENS FROM THE START, NOT FROM `startTrackers`. `trackerEvent` checks, at the moment of
 * the tap, whether the visitor accepted, so a tap before Accept or after Decline queues nothing
 * and an Accept given later on the same page starts counting without a reload. Listening
 * unconditionally also keeps the browser tests honest: they run under webdriver, where the
 * banner starts nothing, and mark the trackers started themselves (`e2e/keyEvents.spec.ts`).
 *
 * ⚠️ CAPTURE PHASE, so a link whose own handler stops the click still counts.
 *
 * ⚠️ THE EVENT CARRIES THE METHOD AND NOTHING ELSE. Never the number or the address: Analytics
 * already records the page, and a contact detail is not something to send to a third party.
 */
export function watchContactClicks(win: ClickWindow, inquiryEmail: string): () => void {
  const onClick = (event: { target: unknown }) => {
    const target = event.target as {
      closest?: (selector: string) => { getAttribute(name: string): string | null } | null
    } | null
    if (!target || typeof target.closest !== 'function') return
    const href = target.closest('a[href]')?.getAttribute('href')
    if (!href) return
    const method = contactMethod(href, inquiryEmail)
    if (method) trackerEvent(win, CONTACT_CLICK_EVENT, { method })
  }
  win.document.addEventListener('click', onClick, true)
  return () => win.document.removeEventListener('click', onClick, true)
}
