'use client'

import { watchFooterInView } from '@run-apparel/shared'
import { useEffect } from 'react'

/**
 * Marks the page while the footer is on screen, so a phone's colour beyond the page is the
 * footer's only then (home page audit, 2026-10-17: iPhone Safari drew a dark band under its bar on
 * a pale page). The why is in packages/ui/src/footer.css and packages/shared/src/footerInView.ts;
 * the garment pages' Footer.tsx does the same.
 */
export function FooterInView() {
  useEffect(() => watchFooterInView(document), [])
  return null
}
