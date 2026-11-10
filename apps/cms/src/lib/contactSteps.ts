import { FACTS } from './companyFacts'

/**
 * "What happens next", beside the contact form (owner, 2026-11-11: "look into all the content that
 * guides potential customers"). A buyer deciding whether to write wants to know who reads it, how
 * the answer comes and what the first real step is. The real inquiries of autumn 2026 asked exactly
 * that: minimums, sample time, and whether a sample comes before bulk.
 *
 * ⚠️ EVERY FACT HERE IS ALREADY THE SITE'S OWN. The numbers come from `FACTS` (companyFacts.ts), as
 * the order process and the buyer guides take them, so a change there moves this list too. "We
 * reply within 24 hours" is NOT repeated: the hero above says it, and the owner's rule is no
 * duplication on a page. The buyer's receipt email tells the same three steps after they send.
 */

const fact = (prefix: string): string =>
  FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

const MINIMUM = fact('Minimum')
const SAMPLE_DAYS = fact('Working days')

export type ContactStep = { number: string; title: string; body: string }

export const CONTACT_STEPS_HEADING = 'What happens next'

export const CONTACT_STEPS: readonly ContactStep[] = [
  {
    number: '№01',
    title: 'A person reads it',
    body: 'Someone on our team in Sialkot reads every inquiry, and every file you attach.',
  },
  {
    number: '№02',
    title: 'We answer your way',
    body: 'By email, or by a call or WhatsApp to the number you give us.',
  },
  {
    number: '№03',
    title: 'A sample comes first',
    body: `A sample usually takes ${SAMPLE_DAYS} working days. Nothing goes into bulk until you sign it off, from ${MINIMUM} pieces per style.`,
  },
]
