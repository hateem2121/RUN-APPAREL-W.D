import type { Viewport } from 'next'

/**
 * The colour a phone paints its browser bar, one per scheme (audit CO-05).
 *
 * The viewer has declared these since 2026-08-18 (N6); the marketing site declared nothing, so
 * Safari guessed. A `<meta name="theme-color">` cannot read a CSS custom property, so these are
 * necessarily a COPY of `--bg` in `packages/ui/src/tokens.css`. `themeColor.test.ts` pins the
 * copy to the token, the way `apps/viewer/scripts/themeColor.test.ts` does for the viewer, so
 * changing `--bg` without changing this fails a test instead of shipping a mismatched bar.
 */
export const THEME_COLOR = [
  { media: '(prefers-color-scheme: light)', color: '#f1efea' },
  { media: '(prefers-color-scheme: dark)', color: '#1c1f18' },
] satisfies NonNullable<Viewport['themeColor']>
