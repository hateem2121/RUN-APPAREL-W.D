import type { Viewport } from 'next'

/**
 * A phone, as the status-area strip in packages/ui/src/notch.css defines one (visual audit VA-50,
 * owner decision: phones only). The same string in both places, so the strip and the browser
 * bar always agree on what a phone is.
 */
export const PHONE_QUERY = '(width < 720px) and (hover: none)'

/**
 * The colour a phone paints its browser bar, per scheme (audit CO-05), and on phones the bar's
 * own colour (VA-50).
 *
 * The viewer has declared these since 2026-08-18 (N6); the marketing site declared nothing, so
 * Safari guessed. A `<meta name="theme-color">` cannot read a CSS custom property, so these are
 * necessarily a COPY of the tokens in `packages/ui/src/tokens.css`: `--bg` for the page, and
 * `--notch-bg` — `light-dark(var(--ink), var(--raised))` — on phones. `themeColor.test.ts` pins
 * each copy to its token, the way `apps/viewer/scripts/themeColor.test.ts` does for the viewer,
 * so changing a token without changing this fails a test instead of shipping a mismatched bar.
 *
 * ⚠️ ORDER MATTERS: the FIRST tag whose media matches wins (the HTML standard, and what Chrome
 * implements), and a phone matches both its own tag and the page's. So the phone tags come
 * first. Each media value is unique, as the standard requires.
 *
 * Safari 26 and 27 ignore these tags (it samples the page instead, which is what the strip is
 * for); Chrome on Android still reads them.
 */
export const THEME_COLOR = [
  { media: `(prefers-color-scheme: light) and ${PHONE_QUERY}`, color: '#1d1f1a' },
  { media: `(prefers-color-scheme: dark) and ${PHONE_QUERY}`, color: '#363c2f' },
  { media: '(prefers-color-scheme: light)', color: '#f1efea' },
  { media: '(prefers-color-scheme: dark)', color: '#1c1f18' },
] satisfies NonNullable<Viewport['themeColor']>
