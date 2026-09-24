import { THEME_BOOT_SCRIPT } from '../../lib/themeBoot'

/** Applies a returning visitor's theme before the first paint — see lib/themeBoot.ts. */
export function ThemeBoot() {
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant built in lib/themeBoot.ts from one literal key; nothing a visitor or the CMS sends reaches it.
      dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
    />
  )
}
