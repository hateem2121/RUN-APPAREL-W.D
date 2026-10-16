import { FACTS, LEAD_TIME } from './companyFacts'

/**
 * "How an order works" — the order steps, drawn on the home page (№04) and in the order guide
 * (owner, 2026-09-29; one list for both since polish D4, 2026-10-05).
 *
 * ⚠️ ONLY WHAT THE OWNER CONFIRMED IS TRUE FOR EVERY ORDER. They confirmed that bulk never
 * starts before the buyer signs off the sample, that the quote is free, and that the sample
 * fee is credited back against bulk. They did NOT confirm a 3D reference for every order or
 * photo updates during production, so neither appears — `orderProcess.test.ts` refuses both.
 *
 * ⚠️ THE NUMBERS ARE READ FROM `FACTS` AND `LEAD_TIME`, NEVER RETYPED. The same figures are on the
 * home page and in `/llms.txt`; a third hand-typed copy is how a site ends up promising a sample in
 * 7 days in one place and 10 in another.
 *
 * WHY FOUR PHASES OF TWO STEPS, EACH MARKED "You" OR "We": a buyer scans phases, not a list
 * of eight, and knowing who acts next is what takes the uncertainty out of a first order
 * (research recorded with decision D23 in docs/DECISIONS-BETA-WEBSITE.md). Since D42 (owner,
 * option A3, 2026-10-15) each phase is one card, its two steps side by side.
 *
 * ⚠️ EVERY STEP HAS ITS OWN PHOTO (visual audit VA-29, owner's choice 2026-10-02). There were
 * eight steps and four pictures, one per phase and in mixed shapes (wide, tall, wide, tall), so
 * the rows did not line up. Eight steps, eight photos, each the background of its step's half of a
 * card, on the home page and in the order guide (`OrderSteps.tsx`). Two steps have no
 * photo of their own subject, so the closest room was chosen and the owner approved it: the quote
 * (step 2) shows the testing lab, and the arrival (step 8) shows the tagging table.
 * `orderTimelinePhotos.test.ts` pins the eight and refuses a repeat.
 *
 * ⚠️ EACH STEP HAS A SECOND LINE, `detail` (owner, A3, 2026-10-15: "a bit more content"), and every
 * one is already the site's: an FAQ answer (`faqs.ts`), the factory page's inspection line
 * (`aboutPages.ts`) or the packaging guide (`guides.ts`), approved word for word on the options page.
 * None repeats a line on the home page or in the order guide (checked when they were chosen). Two keep
 * their source's own hedge (owner, 2026-10-16): the size split is "typically", as the FAQ says, and
 * custom packaging has "no set minimum", as the FAQ and the packaging guide say. The minimum left
 * step 2's words the same day: the hero states it, and the home page says nothing twice.
 */

export type OrderStep = {
  actor: 'You' | 'We'
  title: string
  body: string
  /** The step's second, smaller line (A3, D42): one fact the site already states elsewhere. */
  detail: string
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
        detail:
          'Only the team on your order sees your files, and your patterns are never made for anyone else.',
      },
      {
        actor: 'We',
        title: 'Your quote',
        photo: 'lab',
        body: 'Fabric, trims, sizes and price. The quote is free and commits you to nothing.',
        detail:
          'You can typically split a style’s minimum across sizes; color splits depend on the fabric and print method.',
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
        detail: 'Matching a Pantone color? You approve a lab dip or a strike-off before bulk.',
      },
      {
        actor: 'You',
        // "Approval" since 2026-10-15 (owner): "You approve" until then. "Sign-off" was refused
        // because it repeats the words' own "sign off".
        title: 'Approval',
        photo: 'inspection',
        body: 'Nothing goes into bulk until you sign off the sample.',
        detail: 'We keep your patterns and samples for your next order.',
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
        body: LEAD_TIME,
        detail: 'Seven printing methods in-house, from screen print and sublimation to embroidery.',
      },
      {
        actor: 'We',
        title: 'Checked',
        photo: 'final-check',
        body: 'Every batch is inspected in line and again at AQL final inspection.',
        detail: 'Seams, measurements, print and color are all checked before packing.',
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
        body: 'Shipped on the terms you choose: EXW, FOB, CFR, CIF or DDP, up to your door with duty paid.',
        detail:
          'Packed your way: neck and care labels, hang tags, bags and cartons, with no set minimum for custom packaging.',
      },
      {
        actor: 'You',
        title: 'Your order arrives',
        photo: 'tagging',
        body: 'Ready for your team, your store or your event.',
        detail:
          'With a commercial invoice, packing list, certificate of origin and the air waybill or bill of lading.',
      },
    ],
  },
]
