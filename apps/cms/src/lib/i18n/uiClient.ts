import { usePathname } from 'next/navigation'
import type { Locale } from '../locale'
import { isRussianPath } from './islandWords'
import { UI_RU_CLIENT } from './ui.ru.client'

/**
 * THE WORDS CLIENT COMPONENTS WRITE THEMSELVES (Russian section, 2026-11-15). As `ui.ts`, with a
 * SMALL table: everything here ships in every page's script (the bundle budget is
 * scripts/check-bundle-budget.mjs). `ui.test.ts` checks every `tc(…, '…')` key is in it.
 */
export function tc(locale: Locale, english: string): string {
  return locale === 'ru' ? (UI_RU_CLIENT[english] ?? english) : english
}

/** The page's language, from its address (like NavLinks): no words serialised into the HTML. */
export function useLocale(): Locale {
  return isRussianPath(usePathname()) ? 'ru' : 'en'
}
