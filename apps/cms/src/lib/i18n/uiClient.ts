import { usePathname } from 'next/navigation'
import type { Locale } from '../locale'
import { isRussianPath } from './islandWords'

/**
 * HOW A CLIENT COMPONENT KNOWS ITS LANGUAGE (Russian section, 2026-11-15). Its Russian words are the
 * `RU_*` constants in `islandWords.ts`, imported by the island that draws them, so each page's script
 * carries only its own (the bundle budget is scripts/check-bundle-budget.mjs). A shared client
 * table (`tc`) was built and never called, so it went (knip, 2026-11-15).
 *
 * The page's language, from its address (like NavLinks): no words serialised into the HTML.
 */
export function useLocale(): Locale {
  return isRussianPath(usePathname()) ? 'ru' : 'en'
}
