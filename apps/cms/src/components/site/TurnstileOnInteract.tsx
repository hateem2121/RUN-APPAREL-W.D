'use client'

import { useEffect, useRef } from 'react'
import { TURNSTILE_FIELD, TURNSTILE_SCRIPT, TURNSTILE_SITEKEY } from '../../lib/turnstile'

/**
 * Cloudflare Turnstile for the contact form, loaded only once the visitor starts filling it in
 * (owner, 11 Nov 2026; why at all: `lib/turnstile.ts`).
 *
 * ⚠️ NOTHING LOADS ON A PLAIN VISIT. The privacy notice promises that a visit contacts nobody and
 * stores nothing unless the visitor chooses, and `e2e/consent.spec.ts` checks every page, /contact
 * included. So the script is added on the form's first `focusin`, when a person is writing to us.
 *
 * ⚠️ A FAST SEND WAITS FOR THE TOKEN, BRIEFLY. Pressing Send focuses the button, which loads
 * Turnstile, so the token may not exist yet. The first submit then waits up to `WAIT_MS` and sends
 * again; past that it sends without one (held as spam, never lost: `contact/submit/route.ts`).
 *
 * Under `navigator.webdriver` it does nothing unless a test lifts the flag, like the site's other
 * scripted pieces, so automated runs post exactly as before.
 */

const WAIT_MS = 4000

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string | undefined
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/** Add the script once, resolving when `window.turnstile` is ready. */
function loadScript(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile)
    let script = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT}"]`)
    if (!script) {
      script = document.createElement('script')
      script.src = TURNSTILE_SCRIPT
      script.async = true
      document.head.appendChild(script)
    }
    script.addEventListener('load', () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')),
    )
    script.addEventListener('error', () => reject(new Error('turnstile did not load')))
  })
}

export function TurnstileOnInteract() {
  const slot = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = slot.current
    const form = el?.closest('form')
    if (!el || !form || navigator.webdriver) return

    let started = false
    let token = ''
    let waiting: (() => void) | null = null

    const start = () => {
      if (started) return
      started = true
      loadScript()
        .then((api) =>
          api.render(el, {
            sitekey: TURNSTILE_SITEKEY,
            'response-field-name': TURNSTILE_FIELD,
            callback: (value: string) => {
              token = value
              waiting?.()
            },
            'expired-callback': () => {
              token = ''
            },
          }),
        )
        .catch(() => {
          // Blocked or down: the form still sends, and the server holds a token-less post as spam.
          waiting?.()
        })
    }

    // Once one wait has ended, the next submit goes straight through: never wait twice (no loop).
    let released = false
    const onSubmit = (event: SubmitEvent) => {
      if (token || !started || released) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (waiting) return
      const send = () => {
        waiting = null
        released = true
        window.clearTimeout(timer)
        form.requestSubmit(event.submitter as HTMLElement | null)
      }
      const timer = window.setTimeout(send, WAIT_MS)
      waiting = send
    }

    form.addEventListener('focusin', start)
    form.addEventListener('submit', onSubmit, true)
    return () => {
      form.removeEventListener('focusin', start)
      form.removeEventListener('submit', onSubmit, true)
    }
  }, [])

  return <div ref={slot} className="turnstile-slot" />
}
