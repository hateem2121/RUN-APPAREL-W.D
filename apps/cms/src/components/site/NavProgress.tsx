'use client'

import { LOOM_MARK_BANDS, LOOM_MARK_PATHS, LOOM_MARK_VIEWBOX } from '@run-apparel/shared'
import { useEffect, useRef, useState } from 'react'
import {
  arrived,
  clientNavigationTarget,
  NAV_PROGRESS_DELAY_MS,
  NAV_PROGRESS_GIVE_UP_MS,
  satinOrder,
  weavePicks,
  weaveSpread,
} from '../../lib/navProgress'

/**
 * A thin line at the top of the screen from a tap on a link inside the site until the next page
 * has arrived (site check-up #3, 2026-10-22: in-site taps waited 2.3–2.8 s with nothing moving).
 * lib/navProgress.ts has which taps count and why this is not loading.js.
 *
 * Decoration for the eye: hidden from screen readers, which Next's route announcer already tells
 * when the page changes. `data-state` drives site.css: absent (nothing), `loading`, `done`.
 *
 * T7, the woven tap (owner's pick, 29-30 Oct 2026; D51): with motion allowed, threads of the paper are
 * laid over the old page under the header, hold while the next page is on its way (S4 and words
 * after 1 s), and pass on through to show it. It replaces the line there; under reduced motion the
 * line stays, because nothing may move (D8). A tap on a garment is a full page load, which never
 * reaches this, so a card's picture still grows into its page (MO3, owner, 31 Oct).
 */
export function NavProgress() {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const timers = useRef<number[]>([])
  const weave = useRef<HTMLDivElement>(null)
  const [words, setWords] = useState('')

  useEffect(() => {
    let frame = 0
    const clear = () => {
      for (const id of timers.current) window.clearTimeout(id)
      timers.current = []
      cancelAnimationFrame(frame)
    }
    let laidAt = 0
    let ending = 0
    const layWeave = (to: URL) => {
      const el = weave.current
      if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
      window.clearTimeout(ending)
      const picks = weavePicks(window.innerHeight)
      const { gap, total } = weaveSpread(picks)
      const rank = satinOrder(picks)
      const host = el.querySelector('.nav-weave__picks') as HTMLElement
      host.replaceChildren(
        ...Array.from({ length: picks }, (_, k) => {
          const pick = document.createElement('i')
          pick.className = k % 2 ? 'from-right' : 'from-left'
          pick.style.top = `${(k * 100) / picks}%`
          pick.style.height = `calc(${100 / picks}% + 2px)`
          pick.style.setProperty('--lay', `${Math.round((rank[k] ?? 0) * gap)}ms`)
          pick.style.setProperty('--lift', `${Math.round(k * gap)}ms`)
          return pick
        }),
      )
      setWords(to.pathname === '/' ? 'Loading Home…' : `Loading ${titleOf(to.pathname)}…`)
      el.removeAttribute('data-weave')
      void el.offsetWidth
      el.dataset.weave = 'cover'
      laidAt = performance.now() + total
      timers.current.push(
        window.setTimeout(() => {
          el.dataset.weave = 'hold'
        }, 1000),
      )
    }
    const liftWeave = () => {
      const el = weave.current
      if (!el?.dataset.weave) return
      const { total } = weaveSpread(el.querySelector('.nav-weave__picks')?.children.length ?? 1)
      ending = window.setTimeout(
        () => {
          el.dataset.weave = 'lift'
          ending = window.setTimeout(() => el.removeAttribute('data-weave'), total + 20)
        },
        Math.max(0, laidAt - performance.now()),
      )
    }
    const finish = () => {
      clear()
      liftWeave()
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
      layWeave(to)
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
    <>
      <div
        className="nav-progress"
        aria-hidden="true"
        data-state={state === 'idle' ? undefined : state}
      />
      <div className="nav-weave" aria-hidden="true" ref={weave}>
        <div className="nav-weave__picks" />
        <div className="nav-weave__wait">
          <LoomMark />
          <span className="mono">{words}</span>
        </div>
      </div>
    </>
  )
}

/** The last part of an address, as a word: /inside-the-factory is "Inside the factory". */
function titleOf(pathname: string) {
  const word = (pathname.split('/').filter(Boolean).pop() ?? '').replaceAll('-', ' ')
  return word ? word[0]?.toUpperCase() + word.slice(1) : 'the page'
}

/** S4, as the garment pages draw it (apps/viewer WorkingBlock.tsx). */
function LoomMark() {
  return (
    <svg className="loom-mark" viewBox={LOOM_MARK_VIEWBOX} aria-hidden="true">
      <defs>
        <g id="nav-loom-m">
          {LOOM_MARK_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        {LOOM_MARK_BANDS.map(([y, h], i) => (
          <clipPath id={`nav-loom-${i}`} key={y}>
            <rect
              className={`loom-mark__pick loom-mark__pick--${i}`}
              x="0"
              y={y}
              width="8000"
              height={h + 40}
            />
          </clipPath>
        ))}
      </defs>
      <use className="loom-mark__bed" href="#nav-loom-m" />
      {LOOM_MARK_BANDS.map(([y], i) => (
        <g clipPath={`url(#nav-loom-${i})`} key={y}>
          <use href="#nav-loom-m" />
        </g>
      ))}
    </svg>
  )
}
