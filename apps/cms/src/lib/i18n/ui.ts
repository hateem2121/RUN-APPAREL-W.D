import type { Locale } from '../locale'
import { UI_RU } from './ui.ru'

/**
 * THE WORDS SERVER COMPONENTS WRITE THEMSELVES, IN BOTH LANGUAGES (Russian section, 2026-11-15).
 *
 * `t(locale, 'Sources')` is the Russian on a Russian page and the SAME English string otherwise, so
 * an English page renders exactly what it rendered before this file existed. The key IS the
 * English, which keeps each component readable and makes a missing translation visible:
 * `ui.test.ts` reads every `t(…, '…')` in the source and fails on a key `UI_RU` lacks.
 *
 * Server components take `locale` from their page. CLIENT components use `uiClient.ts` instead,
 * whose table is kept small on purpose: what a client component imports ships in every page's
 * script, and this table is server-only.
 */
export function t(locale: Locale | undefined, english: string): string {
  return locale === 'ru' ? (UI_RU[english] ?? english) : english
}
