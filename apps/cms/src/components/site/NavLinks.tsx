'use client'

import { SITE_MENU_ID, SITE_NAV_LINKS } from '@run-apparel/shared'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * The bar's links, with the current one marked — plus two courtesies for the phone menu.
 *
 * ⚠️ THIS IS A CLIENT COMPONENT AND NAVIGATION STILL DOES NOT DEPEND ON JAVASCRIPT.
 * `usePathname` is a client hook, but a client component is still RENDERED ON THE SERVER for
 * the initial response — and these pages are dynamically rendered, so the server knows the
 * path. `aria-current` is therefore in the delivered HTML before any script runs (verified
 * with curl). The links are ordinary `<a href>` elements either way, and the menu that holds
 * them is the browser's own popover (SiteHeader.tsx), so nothing here hides anything.
 *
 * The two effects below only CLOSE the menu. If they never run, it stays open; nothing
 * becomes unreachable.
 *
 * ⚠️ DO NOT MOVE THIS BACK INTO SiteHeader. The header would become a client component, and
 * Next serialises every prop of one into the HTML — which is how the entire `settings`
 * global, `catalogueUrl` included, ended up in the page source on 2026-09-05.
 *
 * WHY NOT MIDDLEWARE, the other server-side route to a pathname: it would run on every
 * request to this Worker, including `/admin` and `/api/*`, to decorate two links.
 */
export function NavLinks() {
  const pathname = usePathname()

  /*
   * ⚠️ A NEXT LINK DOES NOT CLOSE THE MENU. The header lives in the layout, which Next keeps
   * mounted across a navigation, and a tap INSIDE a popover is not a tap outside it — so the
   * menu stayed open over the next page. Close it whenever the path changes. Without script
   * the link is a full page load and the menu is gone anyway.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger — the effect must run after every navigation.
  useEffect(() => {
    const menu = document.getElementById(SITE_MENU_ID)
    if (menu && typeof menu.hidePopover === 'function' && menu.matches(':popover-open')) {
      menu.hidePopover()
    }
  }, [pathname])

  /*
   * ⚠️ A MENU LEFT OPEN WHILE THE SCREEN WIDENS DRAWS AT THE TOP-LEFT CORNER. Measured
   * 2026-09-23 in Chromium, WebKit and Firefox: opened at 390px and widened to 1280px, the
   * popover — which notch.css now lays inline — stays in the top layer at x=0 with its
   * position computed `absolute`. When the button stops being displayed the phone layout has
   * ended (rotation, a resized window, larger text), so close it then.
   */
  useEffect(() => {
    const menu = document.getElementById(SITE_MENU_ID)
    const button = document.querySelector<HTMLElement>(`[popovertarget="${SITE_MENU_ID}"]`)
    if (!menu || !button || typeof menu.hidePopover !== 'function') return
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (button.getClientRects().length === 0 && menu.matches(':popover-open')) {
        menu.hidePopover()
      }
    })
    observer.observe(button)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      {SITE_NAV_LINKS.map(({ href, label }) => (
        <Link
          className="nav-link"
          key={href}
          href={href}
          // `page`, not `true` — the value names WHAT is current, and assistive
          // technology announces "current page" for it. `true` is the generic fallback
          // and reads as "current item" with no context.
          aria-current={pathname === href ? 'page' : undefined}
        >
          {label}
        </Link>
      ))}
    </>
  )
}
