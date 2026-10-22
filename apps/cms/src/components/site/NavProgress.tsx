'use client'

import { useEffect, useRef, useState } from 'react'
import {
  arrived,
  clientNavigationTarget,
  NAV_PROGRESS_DELAY_MS,
  NAV_PROGRESS_GIVE_UP_MS,
} from '../../lib/navProgress'

/**
 * A thin line at the top of the screen from a tap on a link inside the site until the next page
 * has arrived (site check-up #3, 2026-10-22: in-site taps waited 2.3–2.8 s with nothing moving).
 * lib/navProgress.ts has which taps count and why this is not loading.js.
 *
 * Decoration for the eye: hidden from screen readers, which Next's route announcer already tells
 * when the page changes. `data-state` drives site.css: absent (nothing), `loading`, `done`.
 */
export function NavProgress() {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const timers = useRef<number[]>([])

  useEffect(() => {
    let frame = 0
    const clear = () => {
      for (const id of timers.current) window.clearTimeout(id)
      timers.current = []
      cancelAnimationFrame(frame)
    }
    const finish = () => {
      clear()
      setState((now) => (now === 'loading' ? 'done' : 'idle'))
      timers.current.push(window.setTimeout(() => setState('idle'), 400))
    }
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a') : null
      const to = clientNavigationTarget(
        {
          defaultPrevented: event.defaultPrevented,
          button: event.button,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          anchor: anchor
            ? {
                href: anchor.href,
                target: anchor.target,
                hasDownload: anchor.hasAttribute('download'),
              }
            : null,
        },
        new URL(window.location.href),
      )
      if (!to) return
      clear()
      timers.current.push(
        window.setTimeout(() => setState('loading'), NAV_PROGRESS_DELAY_MS),
        window.setTimeout(finish, NAV_PROGRESS_GIVE_UP_MS),
      )
      // The address changes when Next commits the new page; watch for it once a frame.
      const watch = () => {
        if (arrived(to, new URL(window.location.href))) finish()
        else frame = requestAnimationFrame(watch)
      }
      frame = requestAnimationFrame(watch)
    }
    // Bubbling, not capture: by then `<Link>` has said whether it took the click.
    document.addEventListener('click', onClick)
    // Back and Forward finish whatever was running.
    window.addEventListener('popstate', finish)
    return () => {
      clear()
      document.removeEventListener('click', onClick)
      window.removeEventListener('popstate', finish)
    }
  }, [])

  return (
    <div
      className="nav-progress"
      aria-hidden="true"
      data-state={state === 'idle' ? undefined : state}
    />
  )
}
