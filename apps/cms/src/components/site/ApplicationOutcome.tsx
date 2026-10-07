'use client'

import { type TrackerWindow, trackerEvent } from '@run-apparel/shared'
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { SEND_ANOTHER_APPLICATION } from '../../lib/careersForm'
import { RECEIVED_HEADING } from '../../lib/inquiryForm'

/**
 * The careers form's two results, copied from `InquiryOutcome.tsx` (whose comments carry the
 * reasons, the key event's included) with the careers ids and words (owner-approved 2026-10-07).
 * Both take focus on arrival — the route sends the browser to `#application-done` /
 * `#application-problem` (VA-01) — and then clear the code from the address, so a refresh or a
 * shared link does not repeat it. A received application is the key event `job_application_sent`.
 */
function useArrival(target: RefObject<HTMLDivElement | null>, keyEvent?: string) {
  useEffect(() => {
    target.current?.focus()
    const tidy = () => {
      if (keyEvent) trackerEvent(window as unknown as TrackerWindow, keyEvent)
      window.history.replaceState(null, '', `${window.location.pathname}#apply`)
    }
    if (document.readyState === 'complete') {
      tidy()
      return
    }
    window.addEventListener('load', tidy, { once: true })
    return () => window.removeEventListener('load', tidy)
  }, [target, keyEvent])
}

/** A received application: replaces the form; "Send another application" brings it back. */
export function ApplicationReceived({ thanks }: { thanks: string }) {
  const panel = useRef<HTMLDivElement>(null)
  const again = useRef<HTMLAnchorElement>(null)
  const [shown, setShown] = useState(true)
  useArrival(panel, 'job_application_sent')

  useEffect(() => {
    const link = again.current
    if (!link) return
    const onClick = (event: MouseEvent) => {
      const form = document.getElementById('application-form') as HTMLFormElement | null
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
      id="application-done"
      className="form-notice form-notice--ok inquiry-done"
      tabIndex={-1}
      aria-labelledby="application-done-title"
      role="region"
    >
      <svg className="inquiry-done__tick" viewBox="0 0 54 54" aria-hidden="true" focusable="false">
        <circle cx="27" cy="27" r="25" />
        <path d="M15 28l8 8 16-17" pathLength={1} />
      </svg>
      <h3 className="inquiry-done__title" id="application-done-title">
        {RECEIVED_HEADING}
      </h3>
      <p className="inquiry-done__text">{thanks}</p>
      <a ref={again} className="btn btn--ghost" href="/careers#apply">
        {SEND_ANOTHER_APPLICATION}
      </a>
    </div>
  )
}

/** A refused Send: the reason, focused and announced; the form stays below it to try again. */
export function ApplicationProblem({ children }: { children: ReactNode }) {
  const notice = useRef<HTMLDivElement>(null)
  useArrival(notice)
  return (
    <div
      ref={notice}
      id="application-problem"
      className="form-notice form-notice--bad"
      role="alert"
      tabIndex={-1}
    >
      {children}
    </div>
  )
}
