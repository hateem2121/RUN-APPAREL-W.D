'use client'

import { PreviewCard } from '@base-ui/react/preview-card'
import type { ReactElement } from 'react'

/** What a link's card shows: the page's own name and description, and a garment's own picture. */
export type LinkPreviewData = {
  readonly title: string
  readonly text?: string
  readonly image?: { readonly src: string; readonly srcSet?: string }
}

/**
 * A link inside a guide's words, with a small card that says where it goes (the guides audit,
 * owner 2026-11-24: "where there are links, show what's in the link"). The card opens when a mouse
 * rests on the link or the keyboard reaches it, beside the link, and closes when either leaves.
 *
 * ⚠️ THE CARD ADDS NOTHING THE LINK'S OWN PAGE DOES NOT SAY. Its words are the linked guide's title
 * and description, or a garment's name, type and picture, all read from the same lists the pages
 * are drawn from (`guides.ts`, the live catalogue), so it can make no new claim and cannot drift.
 *
 * ⚠️ THE LINK IS STILL A PLAIN LINK. It is server-rendered as it was, works with no script, and a
 * tap on a phone follows it at once: a finger has no hover, and Base UI opens this card for a
 * mouse or the keyboard only. The card is extra, never the only way to something (web-guidance
 * "hovercard", read 2026-11-23: "only use hovercards to provide supplemental information").
 *
 * Base UI's Preview Card (`@base-ui/react` 1.9.0, docs read 2026-11-24) rather than the browser's
 * own `interestfor`: that attribute works in Chrome and Edge only, and this works in Safari and
 * Firefox too, from the library the site already uses for behaviour
 * (docs/DECISION-UI-LIBRARIES.md). The look is site.css (`.link-preview`).
 */
export function LinkPreview({ link, preview }: { link: ReactElement; preview: LinkPreviewData }) {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger render={link} />
      <PreviewCard.Portal>
        <PreviewCard.Positioner className="link-preview__place" sideOffset={8} align="start">
          <PreviewCard.Popup className="link-preview">
            {preview.image ? (
              // Decorative here: the card's title names the garment, and the picture's own page
              // carries its description. Sized by the card, so the 400px copy covers a 2x screen.
              // biome-ignore lint/performance/noImgElement: no `sharp` on Workers, so next/image cannot resize (ProductPoster.tsx measures why); Cloudflare resizes these copies, picked by srcSet.
              <img
                className="link-preview__img"
                src={preview.image.src}
                srcSet={preview.image.srcSet}
                sizes="176px"
                width={176}
                height={220}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : null}
            <p className="link-preview__title">{preview.title}</p>
            {preview.text ? <p className="link-preview__text">{preview.text}</p> : null}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}
