/**
 * `next/navigation` for the e2e harnesses, which draw the site's components outside a Next app
 * (Russian section, 2026-11-15). Client islands learn their language from `usePathname()`
 * (`lib/i18n/uiClient.ts`); the real one reads Next's router and `process.env` values only a Next
 * build defines, so in a harness bundle it threw `process is not defined` and the island drew
 * nothing (CI, PR #398: 0 of 41 gallery cards, no globe). Outside the app the page's own address is
 * the path, as Next's would be. Only what the islands import is here.
 */
export function usePathname(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname
}
