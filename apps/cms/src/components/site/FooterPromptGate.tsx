'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * The footer's question, tab and clock — every page's last ask — except on the home page
 * (owner, 2026-10-16). The home page merged its №05 and №06 into one closing section that is
 * already the page's last ask, "Start a conversation" with the works' live clock beside it, so the
 * footer's own question would ask again a screen later; the garment pages leave it out for the
 * same reason (polish Q42, `.site-footer--no-prompt`). The footer below keeps everything else.
 *
 * ⚠️ THE FOOTER IS DRAWN BY THE SHARED LAYOUT, WHICH CANNOT KNOW THE PAGE. A Server Component is
 * not given the address (Next.js, usePathname, read 2026-10-16: "Reading the current URL from a
 * Server Component is not supported"), so these two small client pieces read it. `usePathname`
 * is rendered into the first HTML, so the home page arrives without the question rather than
 * hiding it after load. Its one hazard is a rewrite whose address differs in the browser; on this
 * site only `/admin` and `/api` are rewritten (`siteHostRules.mjs`), and neither is `/`.
 */
const HOME = '/'

/** The footer element, with the garment pages' no-prompt shape on the home page. */
export function FooterShell({ children }: { children: ReactNode }) {
  const onHome = usePathname() === HOME
  return (
    <footer className={onHome ? 'site-footer site-footer--no-prompt' : 'site-footer'}>
      {children}
    </footer>
  )
}

/** What only the pages with the footer's question draw: its tab, the question, its spacer. */
export function FooterPrompt({ children }: { children: ReactNode }) {
  return usePathname() === HOME ? null : children
}
