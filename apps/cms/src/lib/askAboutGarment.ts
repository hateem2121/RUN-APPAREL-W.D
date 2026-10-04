import {
  askAboutGarmentMessage,
  askAboutGarmentSubject,
  askedGarment,
  buildViewerPath,
  type EnquiryContext,
  GARMENT_PATH_PREFIX,
} from '@run-apparel/shared'
import type { ProductCard } from './projectPublic'

/**
 * The garment a contact-page address asks about (polish S10, "Ask about this garment": the one
 * prompt at the end of a garment page, owner's Q42, 2026-10-04), as the form shows it.
 *
 * ⚠️ LOOKED UP, NEVER ECHOED. The address carries two slugs (packages/shared/src/contact.ts says
 * why); the names, the code and the colour the form shows come from the published garments only.
 * A slug that names no published garment, or no colour of it, leaves the form empty as it always
 * was, so an edited link can neither put its own words into the form nor name a draft.
 */
export interface AskedGarment extends EnquiryContext {
  /** The garment page in the asked colour, root-relative: the form's way back to it. */
  href: string
  /** The message the form opens with. */
  message: string
  /** The form's hidden subject, which the notification email shows after the sender. */
  subject: string
}

export function resolveAskedGarment(
  params: Record<string, string | string[] | undefined>,
  cards: readonly ProductCard[],
): AskedGarment | null {
  const asked = askedGarment(params)
  if (!asked) return null
  const card = cards.find((entry) => entry.slug === asked.productSlug)
  const colour = card?.colours.find((entry) => entry.slug === asked.colourSlug)
  if (!card || !colour) return null
  const context: EnquiryContext = {
    productName: card.productName,
    productCode: card.productCode,
    colourName: colour.name,
  }
  return {
    ...context,
    href: buildViewerPath(card.slug, colour.slug, GARMENT_PATH_PREFIX),
    message: askAboutGarmentMessage(context),
    subject: askAboutGarmentSubject(context),
  }
}
