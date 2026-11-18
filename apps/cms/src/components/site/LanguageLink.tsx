'use client'

import { usePathname } from 'next/navigation'
import { isRussianPath } from '../../lib/i18n/islandWords'
import { enPathOf, hasRussianTwin, type Locale, ruPath } from '../../lib/locale'

/**
 * The same page in the other language (Russian section, 2026-11-15), in the phone menu: "Русский" on
 * an English page, "English" on a Russian one. The footer's «English» (Russian pages only, owner
 * 2026-11-15) is SiteFooter.tsx's own; the English footer has no language link.
 *
 * ⚠️ A PLAIN `<a>`, NOT `IntentLink`. The two languages have different root layouts
 * (`<html lang>`), so the browser loads the other page whole either way; the router would only
 * prefetch a page the visitor has not asked for in a language they may not read.
 *
 * ⚠️ NOT IN THE WIDE BAR (owner, 2026-11-18). From 2026-11-15 site.css showed it inline where it
 * fitted, after the language audit (W3C asks for the switch "at or near the top of the page").
 * The owner took it out: `nav-link--menu` keeps it to the open phone menu, the Russian footer
 * keeps its «English» (SiteFooter.tsx; the English footer has no room for one, site.css), and the
 * language note offers this page's twin to a browser set to the other language (LanguageNote.tsx). `nav-link--language` is now only a
 * name the tests and the note's choice rule find it by.
 *
 * `usePathname` answers during the server render too, so the link is right with scripting off. An
 * English page with no Russian twin (a single journal post) links to the Russian home instead.
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

export function LanguageLink({ menu = false }: { menu?: boolean }) {
  const pathname = usePathname() || '/'
  // The page's own language, from its address, like NavLinks: nothing to serialise but a flag.
  const lang: Locale = isRussianPath(pathname) ? 'ru' : 'en'
  const other: Locale = lang === 'ru' ? 'en' : 'ru'
  return (
    <a
      className={menu ? 'nav-link nav-link--menu nav-link--language' : 'nav-link'}
      href={twinOf(pathname, lang)}
      hrefLang={other}
      lang={other}
    >
      {other === 'ru' ? 'Русский' : 'English'}
    </a>
  )
}
