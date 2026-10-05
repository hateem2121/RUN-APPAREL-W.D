/**
 * The one name a product card's picture and the garment page's loading screen share, so the
 * browser grows one into the other (polish MO3, 2026-10-05; `components/site/CardOpening.tsx`).
 * The garment page writes it in CSS (apps/viewer page.css, `.preloader`), where nothing can be
 * imported, so `cardOpening.test.ts` reads that file and holds the two to this one value.
 */
export const CARD_OPENING_NAME = 'garment-opening'
