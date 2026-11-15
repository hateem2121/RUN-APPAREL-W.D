'use client'

import { usePathname } from 'next/navigation'
import { enPathOf, hasRussianTwin, type Locale, ruPath } from '../../lib/locale'

/**
 * The same page in the other language (Russian section, 2026-11-15), in the phone menu and the
 * footer's bottom row: "Русский" on an English page, "English" on a Russian one.
 *
 * ⚠️ A PLAIN `<a>`, NOT `IntentLink`. The two languages have different root layouts
 * (`<html lang>`), so the browser loads the other page whole either way; the router would only
 * prefetch a page the visitor has not asked for in a language they may not read.
 *
 * ⚠️ NOT IN THE WIDE BAR. Its one-row fit was measured for two links (docs/DESIGN.md, "The menu
 * bar"); `nav-link--menu` keeps this one to the open phone menu, like Guides.
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

export function LanguageLink({ lang, menu = false }: { lang: Locale; menu?: boolean }) {
  const pathname = usePathname() || '/'
  const other: Locale = lang === 'ru' ? 'en' : 'ru'
  return (
    <a
      className={menu ? 'nav-link nav-link--menu' : 'nav-link'}
      href={twinOf(pathname, lang)}
      hrefLang={other}
      lang={other}
    >
      {other === 'ru' ? 'Русский' : 'English'}
    </a>
  )
}
