import { enPathOf, hasRussianTwin, type Locale, ruPath } from '../../lib/locale'

/**
 * Where the same page lives in the other language (Russian section, 2026-11-15). The language note
 * links there (LanguageNote.tsx). An English page with no Russian twin (a single journal post)
 * goes to the Russian home instead.
 *
 * ⚠️ THE BAR AND THE PHONE MENU NO LONGER DRAW A LANGUAGE LINK (owner, 2026-11-18). From
 * 2026-11-15 a `LanguageLink` component here drew «Русский» / «English» in the phone menu, and
 * inline in the wide bar where it fitted. The owner took it out of the bar, then out of the menu
 * the same day. What is left: the note, for a browser set to the other language; «English» in the
 * Russian footer (SiteFooter.tsx); and the `hreflang` lines in each page's head for search engines.
 * ⚠️ Known cost, told to the owner that day: an English page has no permanent link to Russian.
 *
 * Whoever links to a twin uses a plain `<a>`, not `IntentLink`: the two languages have different
 * root layouts (`<html lang>`), so the browser loads the other page whole either way.
 */
export function twinOf(pathname: string, lang: Locale): string {
  if (lang === 'ru') {
    try {
      return enPathOf(pathname)
    } catch {
      return '/'
    }
  }
  return hasRussianTwin(pathname) ? ruPath(pathname) : ruPath('/')
}
