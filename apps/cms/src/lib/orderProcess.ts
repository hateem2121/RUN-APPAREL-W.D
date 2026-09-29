import { FACTS } from './companyFacts'

/**
 * "How an order works" — the home page timeline (owner, 2026-09-29).
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
 */

export type OrderStep = { actor: 'You' | 'We'; title: string; body: string }

export type OrderPhase = {
  name: 'Talk' | 'Develop' | 'Make' | 'Deliver'
  /** A slug in `FACTORY_PHOTOS` — the picture that sits beside this phase. */
  photo: string
  steps: readonly OrderStep[]
}

const fact = (prefix: string): string =>
  FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

export const ORDER_PHASES: readonly OrderPhase[] = [
  {
    name: 'Talk',
    photo: 'showroom',
    steps: [
      {
        actor: 'You',
        title: 'Send what you have',
        body: 'A sketch, a reference garment or a full tech pack. We reply within 24 hours.',
      },
      {
        actor: 'We',
        title: 'Your quote',
        body: `Fabric, trims, sizes and price. The quote is free and commits you to nothing. Minimum ${fact('Minimum')} pieces per style.`,
      },
    ],
  },
  {
    name: 'Develop',
    photo: 'screen-printing',
    steps: [
      {
        actor: 'We',
        title: 'Your sample',
        body: `Made in ${fact('Working days')} working days. The sample fee is credited back against your bulk order.`,
      },
      {
        actor: 'You',
        title: 'You approve',
        body: 'Nothing goes into bulk until you sign off the sample.',
      },
    ],
  },
  {
    name: 'Make',
    photo: 'stitching',
    steps: [
      {
        actor: 'We',
        title: 'Bulk production',
        body: 'Cut, stitched and finished in one building in Pakistan.',
      },
      {
        actor: 'We',
        title: 'Checked',
        body: 'Testing, inspection under light and a final check before packing.',
      },
    ],
  },
  {
    name: 'Deliver',
    photo: 'packing',
    steps: [
      {
        actor: 'We',
        title: 'Packed and shipped',
        body: 'Sent to you, wherever you are.',
      },
      {
        actor: 'You',
        title: 'Your order arrives',
        body: 'Ready for your team, your store or your event.',
      },
    ],
  },
]
