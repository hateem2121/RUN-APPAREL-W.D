import type { ConsentStorage } from './consent.ts'
import { SITE_OTHER_LANGUAGE_EN } from './siteBar.ts'
import type { Locale } from './siteChrome.ts'

/**
 * THE LANGUAGE NOTE (owner's design, 2026-11-16): a slim, dismissible note under the menu bar that
 * tells a visitor the same page exists in their language. The site NEVER switches language by
 * itself. Google ("Managing multi-regional and multilingual sites": "Avoid automatically
 * redirecting users from one language version of a site to a different language version") and
 * Yandex both advise against it, and the W3C ("When to use language negotiation") says browser
 * language settings are often wrong, so a guess must be easy to refuse and the refusal remembered.
 *
 * The rule and the words are here so the website (`apps/cms`, LanguageNote.tsx) and the 3D garment
 * pages (`apps/viewer`, LanguageNote.tsx) cannot disagree; the look is `packages/ui/src/notch.css`.
 *
 * WHO SEES IT, all of these at once:
 *   - the browser's languages point the other way (`offeredLanguage`);
 *   - the page has a true twin in that language (each app answers that for its own pages);
 *   - the visitor has made no choice yet (`hasLanguageChoice`);
 *   - a person has touched the page (`watchForPerson`), and the opening screen has gone;
 *   - the browser is not an automated one (`navigator.webdriver`), unless a test lifts the flag.
 */

/** Where the choice is remembered: the browser's own storage, never a cookie. */
export const LANGUAGE_NOTE_STORAGE_KEY = 'run-language-note'

/** The one value stored: the visitor has answered, by any of the three ways. */
const CHOSEN = 'chosen'

/** `ru-RU` → `ru`, `EN_us` → `en`. An entry that is not text reads as no language. */
function primarySubtag(tag: unknown): string {
  return typeof tag === 'string' ? (tag.trim().toLowerCase().split(/[-_]/)[0] ?? '') : ''
}

/**
 * The language to offer on this page, or null for none.
 *
 *   - On an ENGLISH page: Russian, only when Russian is the browser's FIRST language.
 *   - On a RUSSIAN page: English, only when the browser lists NO Russian at all.
 *
 * ⚠️ IT STILL WORKS IF A BROWSER GIVES ONE LANGUAGE ONLY. Chrome already sends one language in the
 * Accept-Language header, and its explainer (github.com/explainers-by-googlers/reduce-accept-language,
 * read 2026-11-16) says `navigator.languages` "could" be cut to one entry too. The English rule
 * reads only the first entry, so nothing changes. The Russian rule then sees `['en-US']` from a
 * visitor whose real list is English then Russian, and offers English: a small note they close
 * once. It never errs the other way (hiding the Russian offer from a Russian-first browser).
 *
 * `language` (`navigator.language`) stands in when the list is missing or empty. With neither,
 * nothing is offered: no guess is better than a wrong one.
 */
export function offeredLanguage(
  page: Locale,
  languages: readonly unknown[] | null | undefined,
  language?: unknown,
): Locale | null {
  const listed = (languages ?? []).map(primarySubtag).filter(Boolean)
  const list = listed.length > 0 ? listed : [primarySubtag(language)].filter(Boolean)
  if (list.length === 0) return null
  if (page === 'en') return list[0] === 'ru' ? 'ru' : null
  return list.includes('ru') ? null : 'en'
}

/**
 * The note's words. Keyed by the language OFFERED, which is the language they are written in:
 * a Russian reader on an English page is told in Russian, and the note carries `lang` to say so
 * (WCAG 2.2 SC 3.1.2, Language of Parts).
 *
 * «Читать по-русски» is the bar's own name for the Russian link (`SITE_OTHER_LANGUAGE_EN.name`),
 * and `READ_IN_ENGLISH` is used by `siteChrome.ru.ts` for the English one, so the note and the bar
 * say the same thing. ⚠️ This file must not import `siteChrome.ru.ts`: the English garment page's
 * script would then carry the whole Russian chrome table (`apps/viewer/src/lib/locale.ts`).
 */
export const READ_IN_ENGLISH = 'Read in English'

export interface LanguageNoteWords {
  /** The language of these words, for the note's `lang`. */
  readonly lang: Locale
  /** The region's accessible name. */
  readonly label: string
  readonly text: string
  /** The link to the twin page. */
  readonly action: string
  /** The × button's accessible name. */
  readonly close: string
}

export const LANGUAGE_NOTE_WORDS: Readonly<Record<Locale, LanguageNoteWords>> = {
  ru: {
    lang: 'ru',
    label: 'Язык страницы',
    text: 'Эта страница есть на русском.',
    action: SITE_OTHER_LANGUAGE_EN.name,
    close: 'Закрыть',
  },
  en: {
    lang: 'en',
    label: 'Page language',
    text: 'This page is also in English.',
    action: READ_IN_ENGLISH,
    close: 'Close',
  },
}

/** Has the visitor already answered? A storage that throws reads as "not yet". */
export function hasLanguageChoice(storage: ConsentStorage): boolean {
  try {
    return storage.getItem(LANGUAGE_NOTE_STORAGE_KEY) === CHOSEN
  } catch {
    return false
  }
}

/**
 * Remember that the visitor answered: the ×, the note's link, or the bar's or footer's own
 * language link. ⚠️ Written ONLY then, never when the note is merely shown: the privacy notice
 * says the browser keeps this "only after you make" the choice, and it must stay true.
 */
export function rememberLanguageChoice(storage: ConsentStorage): void {
  try {
    storage.setItem(LANGUAGE_NOTE_STORAGE_KEY, CHOSEN)
  } catch {
    /* storage unavailable: the note is closed for this page view and asks again on the next */
  }
}

/**
 * What only a person does. ⚠️ NOT `scroll`: a link to `#part`, the browser restoring a scroll
 * position and the site's own smooth scroll all fire it with nobody there, and the whole point of
 * waiting is that a crawler's renderer must never draw the note (Google runs the page's scripts
 * and reads a page's language from its visible text, so an English note drawn on load could be
 * indexed as part of a Russian page). A wheel, a touch or a key is how a real scroll begins.
 */
export const PERSON_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']

/** The part of a DOM event this file reads. This package has no DOM types (Worker code uses it too). */
interface PageEvent {
  readonly isTrusted: boolean
  readonly target?: unknown
}

interface PersonTarget {
  addEventListener(type: string, listener: (event: PageEvent) => void, options?: object): void
  removeEventListener(type: string, listener: (event: PageEvent) => void, options?: object): void
}

/**
 * Call `onPerson` once, on the first trusted interaction, then stop listening. Returns the stop.
 * `isTrusted` is false for an event a script made (`dispatchEvent`), so a page script or an
 * extension that fakes a click does not count.
 */
export function watchForPerson(target: PersonTarget, onPerson: () => void): () => void {
  const options = { capture: true, passive: true }
  let done = false
  const stop = () => {
    done = true
    for (const type of PERSON_EVENTS) target.removeEventListener(type, seen, options)
  }
  const seen = (event: PageEvent) => {
    if (done || !event.isTrusted) return
    stop()
    onPerson()
  }
  for (const type of PERSON_EVENTS) target.addEventListener(type, seen, options)
  return stop
}

/**
 * Is this click on one of the site's own language links (today only the Russian footer's
 * «English»; the bar and phone menu had one until 2026-11-18 and are still covered)? Using one is a choice, so the note never comes back after it.
 * Scoped to the bar and the footer: a Russian hub's links to English posts carry `hreflang` too,
 * and reading a post is not a choice of language.
 */
export const LANGUAGE_LINK_SELECTOR = '.notch-shell a[hreflang], .site-footer a[hreflang]'

/** The three counts (owner-approved, 2026-11-16). GA4 naming rules: a letter, then `[a-z0-9_]`. */
export const LANGUAGE_NOTE_EVENTS = {
  shown: 'note_shown',
  used: 'note_used',
  closed: 'note_closed',
} as const

interface Box {
  readonly top: number
  readonly bottom: number
  readonly left: number
  readonly right: number
}

/**
 * How far to scroll (a negative number: up) so a newly focused element is not under the note, or 0.
 *
 * WCAG 2.2 SC 2.4.11 (Focus Not Obscured, AA): a focused component must not be "entirely hidden
 * due to author-created content". `scroll-padding` (notch.css) covers the scroll a browser makes
 * by itself, and W3C's Understanding page names it as a way to pass. ⚠️ But WebKit does not scroll
 * for an element already inside the viewport (measured for the cookie card, 2026-10-01,
 * `apps/cms/src/components/site/ConsentBanner.tsx`), so a focus that lands under the note is
 * lifted clear by exactly the overlap plus `gap`.
 *
 * Nothing moves when the element does not overlap the note, sits beside it, or is taller than the
 * room below the note (no scroll could clear it, and one that tall is never entirely hidden).
 */
export function liftClearOfNote(note: Box, target: Box, viewportHeight: number, gap = 8): number {
  const overlapsDown = target.top < note.bottom && target.bottom > note.top
  const overlapsAcross = target.left < note.right && target.right > note.left
  if (!overlapsDown || !overlapsAcross) return 0
  if (target.bottom - target.top > viewportHeight - note.bottom) return 0
  return -(note.bottom - target.top + gap)
}

export interface LanguageNoteStart {
  /** `navigator.webdriver`: an automated browser gets no note, unless a test lifts the flag. */
  readonly webdriver: boolean
  /** The browser's storage, reached through `safeStorage` each time. */
  readonly storage: () => ConsentStorage
  /** `window`: where a person's first touch is listened for. */
  readonly win: PersonTarget
  /** `document`: where a click on the bar's or footer's language link is caught. */
  readonly doc: PersonTarget
  /** A person has touched the page, and no choice was stored when it loaded. */
  readonly onPerson: () => void
  /** The visitor used the bar's or footer's own language link: remembered already, close the note. */
  readonly onChoice: () => void
}

/**
 * The part of the note both apps share, with no React in it. Returns the stop.
 *
 *   - Under automation, or once a choice is stored: nothing at all, not even a listener. The
 *     other browser suites therefore see the pages exactly as before, and nothing is stored for
 *     a robot.
 *   - Otherwise it waits for a person, and meanwhile counts a click on the site's own language
 *     link as the answer, whether the note has been drawn yet or not.
 */
export function startLanguageNote(start: LanguageNoteStart): () => void {
  if (start.webdriver || hasLanguageChoice(start.storage())) return () => {}
  const stopWatching = watchForPerson(start.win, start.onPerson)
  const clicked = (event: PageEvent) => {
    const target = event.target as { closest?: (selector: string) => unknown } | null
    if (!target?.closest?.(LANGUAGE_LINK_SELECTOR)) return
    rememberLanguageChoice(start.storage())
    start.onChoice()
  }
  const options = { capture: true }
  start.doc.addEventListener('click', clicked, options)
  return () => {
    stopWatching()
    start.doc.removeEventListener('click', clicked, options)
  }
}
