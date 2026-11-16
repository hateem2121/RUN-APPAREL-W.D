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
import { useEffect, useRef, useState } from 'react'
import { track } from '../lib/analytics'
import { garmentTwinPath, pageLocale } from '../lib/locale'
import { SITE_ORIGIN } from '../lib/siteLinks'

const storage = () => safeStorage(() => window.localStorage)
const trackerWindow = () => window as unknown as TrackerWindow

interface LanguageNoteProps {
  /** The opening screen has gone (App.tsx, `preloaderGone`): the note never shows over it. */
  ready: boolean
  /** The garment, for the site's own telemetry. */
  product: string
}

/**
 * The language note on a garment page (owner's design, 2026-11-16): the website's note, drawn
 * here. The rule, the words and the reasons are `packages/shared/src/languageNote.ts`; the look is
 * `packages/ui/src/notch.css`; the website's copy, with the full account of what it guarantees, is
 * `apps/cms/src/components/site/LanguageNote.tsx`. `e2e/languageNote.spec.ts` checks this one.
 *
 * Every garment page has a twin (`garmentTwinPath`), so there is no page here without one. App.tsx
 * mounts this only on a garment that loaded: a reference that is no longer live offers nothing.
 *
 * ⚠️ ABSENT UNDER `navigator.webdriver`, like the cookie card. Its own suite lifts the flag.
 *
 * COUNTED TWICE, BY THE OWNER'S CHOICE (2026-11-16):
 *   - `trackerEvent`: Google Analytics, only after the visitor accepted cookies;
 *   - `track`: the site's own telemetry (`lib/telemetry.ts`), which every event of this page
 *     uses: no cookie, no personal data, Do-Not-Track honoured, but NOT tied to the cookie choice.
 */
export function LanguageNote({ ready, product }: LanguageNoteProps) {
  const page = pageLocale()
  const [person, setPerson] = useState(false)
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

  const offer = person ? offeredLanguage(page, navigator.languages, navigator.language) : null
  const shown = offer !== null && ready && !closed

  useEffect(() => {
    if (!shown || !offer || counted.current) return
    counted.current = true
    track(LANGUAGE_NOTE_EVENTS.shown, { product })
    trackerEvent(trackerWindow(), LANGUAGE_NOTE_EVENTS.shown, {
      page_language: page,
      offered: offer,
    })
  }, [shown, offer, page, product])

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
    track(LANGUAGE_NOTE_EVENTS.closed, { product })
    trackerEvent(trackerWindow(), LANGUAGE_NOTE_EVENTS.closed, count)
    // The button is about to go: a keyboard user is handed to the page, not dropped on <body>.
    if (card.current?.contains(document.activeElement)) {
      document.getElementById('main-content')?.focus({ preventScroll: true })
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
        {/* The same address the bar's language link uses (Header.tsx). */}
        <a
          className="btn btn--ghost language-note__action"
          href={`${SITE_ORIGIN}${garmentTwinPath(window.location.pathname)}`}
          hrefLang={words.lang}
          onClick={() => {
            rememberLanguageChoice(storage())
            track(LANGUAGE_NOTE_EVENTS.used, { product })
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
