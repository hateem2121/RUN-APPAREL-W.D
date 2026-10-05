import { FACTS } from './companyFacts'

/**
 * "How an order works" — the order steps, drawn on the home page (№04) and in the order guide
 * (owner, 2026-09-29; one list for both since polish D4, 2026-10-05).
 *
 * ⚠️ ONLY WHAT THE OWNER CONFIRMED IS TRUE FOR EVERY ORDER. They confirmed that bulk never
 * starts before the buyer signs off the sample, that the quote is free, and that the sample
 * fee is credited back against bulk. They did NOT confirm a 3D reference for every order or
 * photo updates during production, so neither appears — `orderProcess.test.ts` refuses both.
 *
 * ⚠️ THE NUMBERS ARE READ FROM `FACTS`, NEVER RETYPED. The same figures are on the home page
 * and in `/llms.txt`; a third hand-typed copy is how a site ends up promising a sample in 7
 * days in one place and 10 in another.
 *
 * WHY FOUR PHASES OF TWO STEPS, EACH MARKED "You" OR "We": a buyer scans phases, not a list
 * of eight, and knowing who acts next is what takes the uncertainty out of a first order
 * (research recorded with decision D23 in docs/DECISIONS-BETA-WEBSITE.md).
 *
 * ⚠️ EVERY STEP HAS ITS OWN PHOTO (visual audit VA-29, owner's choice 2026-10-02). There were
 * eight steps and four pictures, one per phase and in mixed shapes (wide, tall, wide, tall), so
 * the rows did not line up. Eight steps, eight photos; since polish D4 (2026-10-05) each is the
 * background of its step's card, on the home page and in the order guide (`OrderSteps.tsx`). Two steps have no
 * photo of their own subject, so the closest room was chosen and the owner approved it: the quote
 * (step 2) shows the testing lab, and the arrival (step 8) shows the tagging table. The words on
 * each picture are the ones it already carried (`lib/factoryPhotos.ts`), so the page says nothing
 * new about the factory. `orderTimelinePhotos.test.ts` pins the eight and refuses a repeat.
 */

export type OrderStep = {
  actor: 'You' | 'We'
  title: string
  body: string
  /** A slug in `FACTORY_PHOTOS` — the picture that sits beside this step, and only this step. */
  photo: string
}

export type OrderPhase = {
  name: 'Talk' | 'Develop' | 'Make' | 'Deliver'
  steps: readonly OrderStep[]
}

const fact = (prefix: string): string =>
  FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

export const ORDER_PHASES: readonly OrderPhase[] = [
  {
    name: 'Talk',
    steps: [
      {
        actor: 'You',
        title: 'Send what you have',
        photo: 'showroom',
        body: 'A sketch, a reference garment or a full tech pack. We reply within 24 hours.',
      },
      {
        actor: 'We',
        title: 'Your quote',
        photo: 'lab',
        body: `Fabric, trims, sizes and price. The quote is free and commits you to nothing. Minimum ${fact('Minimum')} pieces per style.`,
      },
    ],
  },
  {
    name: 'Develop',
    steps: [
      {
        actor: 'We',
        title: 'Your sample',
        photo: 'screen-printing',
        body: `Made in ${fact('Working days')} working days. The sample fee is credited back against your bulk order.`,
      },
      {
        actor: 'You',
        title: 'You approve',
        photo: 'inspection',
        body: 'Nothing goes into bulk until you sign off the sample.',
      },
    ],
  },
  {
    name: 'Make',
    steps: [
      {
        actor: 'We',
        title: 'Bulk production',
        photo: 'stitching',
        body: 'Cut, stitched and finished in one building in Pakistan.',
      },
      {
        actor: 'We',
        title: 'Checked',
        photo: 'final-check',
        body: 'Testing, inspection under light and a final check before packing.',
      },
    ],
  },
  {
    name: 'Deliver',
    steps: [
      {
        actor: 'We',
        title: 'Packed and shipped',
        photo: 'packing',
        body: 'Sent to you, wherever you are.',
      },
      {
        actor: 'You',
        title: 'Your order arrives',
        photo: 'tagging',
        body: 'Ready for your team, your store or your event.',
      },
    ],
  },
]
