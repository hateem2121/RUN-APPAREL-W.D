'use client'

import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { NEED_US_SOONER, RECEIVED_HEADING, SEND_ANOTHER } from '../../lib/inquiryForm'

/**
 * Where a visitor lands after Send: focus on the result, and the result's code out of the address.
 *
 * ⚠️ FOCUS, BECAUSE A MESSAGE THAT IS ALREADY ON THE PAGE WHEN IT LOADS IS NOT ANNOUNCED. Live
 * regions speak about CHANGES; after the redirect nothing changes, so the panel takes focus and a
 * screen reader reads it (visual audit VA-01). It also brings it into view on any screen.
 *
 * ⚠️ AND THE CODE LEAVES THE ADDRESS (owner, 2026-10-01: "a refresh shows the form again").
 * `?sent=1` or `?error=…` would otherwise bring the same panel back on every reload. Next's router
 * syncs with a native `history.replaceState` (Next docs, "Native History API"). Without scripting
 * the code stays and a reload shows the panel again, which the report accepted.
 *
 * ⚠️ THE ADDRESS IS TIDIED ONLY AFTER `load`. This effect runs while the streamed page is still
 * loading, and Chromium applies the address's anchor later, at DOMContentLoaded. The anchor names
 * this panel (`#inquiry-done` / `#inquiry-problem`, contact/submit/route.ts), so the browser keeps
 * focus on it; rewritten to `#inquiry` too early, the anchor named a section that cannot take focus
 * and Chromium dropped focus to <body> — every run, measured 2026-10-01. A reload of the tidied
 * address lands on the form's section.
 */
function useArrival(target: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    target.current?.focus()
    const tidy = () => window.history.replaceState(null, '', `${window.location.pathname}#inquiry`)
    if (document.readyState === 'complete') {
      tidy()
      return
    }
    window.addEventListener('load', tidy, { once: true })
    return () => window.removeEventListener('load', tidy)
  }, [target])
}

/** The form's place after a successful Send: the form is gone, this is all that shows (VA-27). */
export function InquiryReceived({
  thanks,
  email,
  whatsappHref,
  whatsappLabel,
}: {
  thanks: string
  email: string
  whatsappHref: string
  whatsappLabel: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const again = useRef<HTMLAnchorElement>(null)
  const [shown, setShown] = useState(true)
  useArrival(panel)

  /*
   * ⚠️ "SEND ANOTHER INQUIRY" IS A REAL LINK, AND THE SCRIPT ONLY SHORTENS ITS TRIP. Without
   * scripting it loads /contact, whose form is empty. With scripting the address no longer carries
   * `?sent=1`, so following the same link would only jump to the anchor and leave this panel up —
   * the click therefore shows the hidden form in place. Attached here rather than as `onClick`
   * because the element stays a link to a place, which is what it is (Biome's useValidAnchor).
   */
  useEffect(() => {
    const link = again.current
    if (!link) return
    const onClick = (event: MouseEvent) => {
      const form = document.getElementById('inquiry-form') as HTMLFormElement | null
      if (!form) return
      event.preventDefault()
      form.reset()
      form.hidden = false
      setShown(false)
      form.querySelector<HTMLElement>('input:not([type="hidden"]):not([tabindex="-1"])')?.focus()
    }
    link.addEventListener('click', onClick)
    return () => link.removeEventListener('click', onClick)
  }, [])

  if (!shown) return null
  return (
    <div
      ref={panel}
      id="inquiry-done"
      className="form-notice form-notice--ok inquiry-done"
      tabIndex={-1}
      aria-labelledby="inquiry-done-title"
      role="region"
    >
      {/*
       * The tick that draws itself (polish MO5, as the owner tried it in the report's D7 v2):
       * `pathLength="1"` lets one dash the length of the stroke run from hidden to drawn
       * (site.css), whatever the path's real length. Decoration: the heading says it in words.
       */}
      <svg className="inquiry-done__tick" viewBox="0 0 54 54" aria-hidden="true" focusable="false">
        <circle cx="27" cy="27" r="25" />
        <path d="M15 28l8 8 16-17" pathLength={1} />
      </svg>
      <h3 className="inquiry-done__title" id="inquiry-done-title">
        {RECEIVED_HEADING}
      </h3>
      <p className="inquiry-done__text">{thanks}</p>
      <p className="inquiry-done__line">
        {NEED_US_SOONER} <a href={`mailto:${email}`}>{email}</a> ·{' '}
        <a href={whatsappHref} rel="noopener">
          WhatsApp {whatsappLabel}
        </a>
      </p>
      <a ref={again} className="btn btn--ghost" href="/contact#inquiry">
        {SEND_ANOTHER}
      </a>
    </div>
  )
}

/** A refused Send: the reason, focused and announced; the form stays below it to try again. */
export function InquiryProblem({ children }: { children: ReactNode }) {
  const notice = useRef<HTMLDivElement>(null)
  useArrival(notice)
  return (
    <div
      ref={notice}
      id="inquiry-problem"
      className="form-notice form-notice--bad"
      role="alert"
      tabIndex={-1}
    >
      {children}
    </div>
  )
}
