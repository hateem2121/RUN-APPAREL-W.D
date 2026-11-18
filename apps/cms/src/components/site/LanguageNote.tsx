'use client'

import {
  hasLanguageChoice,
  LANGUAGE_NOTE_EVENTS,
  LANGUAGE_NOTE_STORAGE_KEY,
  LANGUAGE_NOTE_WORDS,
  liftClearOfNote,
  offeredLanguage,
  rememberLanguageChoice,
  safeStorage,
  startLanguageNote,
  type TrackerWindow,
  trackerEvent,
} from '@run-apparel/shared'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { isRussianPath } from '../../lib/i18n/islandWords'
import { hasRussianTwin, type Locale } from '../../lib/locale'
import { twinOf } from './LanguageLink'

const storage = () => safeStorage(() => window.localStorage)
const trackerWindow = () => window as unknown as TrackerWindow

/** The first-arrival curtain is up while <html> carries `data-preload` (lib/preloader.ts). */
const curtainUp = () => document.documentElement.hasAttribute('data-preload')

/**
 * The language note (owner's design, 2026-11-16): "this page is also in your language", a slim
 * card just under the menu bar. The rule, the words and the reasons are
 * `packages/shared/src/languageNote.ts`; the look is `packages/ui/src/notch.css`; the 3D garment
 * pages draw the same note from `apps/viewer/src/components/LanguageNote.tsx`.
 *
 * What this component guarantees, and `e2e/languageNote.spec.ts` checks in a real browser:
 *   - it is a SUGGESTION: a link to the twin page, never a redirect;
 *   - NOTHING is in the server's HTML, and nothing is drawn until a person touches the page and
 *     the first-arrival curtain has gone, so a crawler's renderer never reads the note as part of
 *     the page (Google judges a page's language from its visible text);
 *   - only where the page has a true twin: an English journal post or case study has none
 *     (`hasRussianTwin`), and the 404 page does not mount this at all (owner, 2026-11-16);
 *   - the ×, the note's link and the bar's or footer's own language link are each a choice, and
 *     after one the note never returns (the browser's storage, no cookie);
 *   - it never takes focus and announces nothing; closing it from the keyboard hands focus to the
 *     page, and a focus that lands under it is lifted clear (WCAG 2.2 SC 2.4.11);
 *   - `data-nosnippet` keeps it out of a search result's text, and `translate="no"` stops a
 *     browser's Translate from rewording a note that is already in the reader's language.
 *
 * ⚠️ ABSENT UNDER `navigator.webdriver`, like the cookie card, so the other browser suites see the
 * pages as before. Its own suite lifts the flag.
 *
 * Counted for Google Analytics only after the visitor accepted cookies (`trackerEvent` sends
 * nothing otherwise): shown, link used, closed.
 */
export function LanguageNote() {
  const pathname = usePathname() || '/'
  const page: Locale = isRussianPath(pathname) ? 'ru' : 'en'
  const [person, setPerson] = useState(false)
  const [curtainGone, setCurtainGone] = useState(false)
  const [closed, setClosed] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const counted = useRef(false)

  useEffect(
    () =>
      startLanguageNote({
        webdriver: navigator.webdriver,
        storage,
        win: window,
        doc: document,
        onPerson: () => setPerson(true),
        onChoice: () => setClosed(true),
      }),
    [],
  )

  // The curtain: wait for it to lift, however long the page takes (lib/preloader.ts ends it).
  useEffect(() => {
    if (!curtainUp()) {
      setCurtainGone(true)
      return
    }
    const observer = new MutationObserver(() => {
      if (curtainUp()) return
      observer.disconnect()
      setCurtainGone(true)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-preload'],
    })
    return () => observer.disconnect()
  }, [])

  // Answered in another tab, or on another page before Back brought this one back as it was.
  useEffect(() => {
    const elsewhere = (event: StorageEvent) => {
      if (event.key === LANGUAGE_NOTE_STORAGE_KEY && hasLanguageChoice(storage())) setClosed(true)
    }
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted && hasLanguageChoice(storage())) setClosed(true)
    }
    window.addEventListener('storage', elsewhere)
    window.addEventListener('pageshow', restored)
    return () => {
      window.removeEventListener('storage', elsewhere)
      window.removeEventListener('pageshow', restored)
    }
  }, [])

  // `navigator` is read only once a person is here, which is never during the server's render.
  const offer = person ? offeredLanguage(page, navigator.languages, navigator.language) : null
  const hasTwin = page === 'ru' || hasRussianTwin(pathname)
  const shown = offer !== null && hasTwin && curtainGone && !closed

  useEffect(() => {
    if (!shown || !offer || counted.current) return
    counted.current = true
    trackerEvent(trackerWindow(), LANGUAGE_NOTE_EVENTS.shown, {
      page_language: page,
      offered: offer,
    })
  }, [shown, offer, page])

  // A focus that lands under the note is lifted clear of it (`liftClearOfNote` says why).
  useEffect(() => {
    if (!shown) return
    const keepClear = (event: FocusEvent) => {
      const note = card.current
      if (!note || !(event.target instanceof Element) || note.contains(event.target)) return
      if (event.target.closest('.notch-shell')) return
      const lift = liftClearOfNote(
        note.getBoundingClientRect(),
        event.target.getBoundingClientRect(),
        window.innerHeight,
      )
      if (lift !== 0) window.scrollBy({ top: lift, behavior: 'instant' })
    }
    document.addEventListener('focusin', keepClear)
    return () => document.removeEventListener('focusin', keepClear)
  }, [shown])

  if (!shown || !offer) return null
  const words = LANGUAGE_NOTE_WORDS[offer]
  const count = { page_language: page, offered: offer }

  const close = () => {
    rememberLanguageChoice(storage())
    trackerEvent(trackerWindow(), LANGUAGE_NOTE_EVENTS.closed, count)
    // The button is about to go: a keyboard user is handed to the page, not dropped on <body>.
    if (card.current?.contains(document.activeElement)) {
      document.getElementById('main')?.focus({ preventScroll: true })
    }
    setClosed(true)
  }

  return (
    <section
      className="language-note"
      aria-label={words.label}
      lang={words.lang}
      translate="no"
      data-nosnippet=""
    >
      <div className="language-note__card" ref={card}>
        <p className="language-note__text">{words.text}</p>
        {/* A plain link (LanguageLink.tsx says why): the other language is another
            document, so the browser loads it whole. */}
        <a
          className="btn btn--ghost language-note__action"
          href={twinOf(pathname, page)}
          hrefLang={words.lang}
          onClick={() => {
            rememberLanguageChoice(storage())
            trackerEvent(trackerWindow(), LANGUAGE_NOTE_EVENTS.used, count)
          }}
        >
          {words.action}
        </a>
        <button
          type="button"
          className="language-note__close"
          aria-label={words.close}
          onClick={close}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>
    </section>
  )
}
