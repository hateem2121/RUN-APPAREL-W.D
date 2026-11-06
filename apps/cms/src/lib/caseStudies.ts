/**
 * The case studies' fixed words (PLAN.md D9, E7). Each case study is a database row
 * (`collections/CaseStudies.ts`); the labels of its parts and the hub around them are here.
 *
 * ⚠️ THE HUB STAYS OUT OF SEARCH UNTIL ONE IS PUBLISHED (T5, REVIEW.md R-18): with none it
 * renders, with `noindex`, and is absent from the sitemap, llms.txt and every link list. It
 * switches on by itself with the first published case study.
 */

export const CASE_STUDIES_PATH = '/case-studies'
export const caseStudyPath = (slug: string) => `${CASE_STUDIES_PATH}/${slug}`

/** The facts at the top of a case study, each from its own field (E7). */
export const CASE_STUDY_FACTS = [
  { field: 'whatWasMade', label: 'What was made' },
  { field: 'clientDescription', label: 'For whom' },
  { field: 'quantity', label: 'How many' },
  { field: 'timeline', label: 'How long' },
] as const

/** The story, in three parts, each from its own field (E7). */
export const CASE_STUDY_STORY = [
  { field: 'challenge', label: 'The challenge' },
  { field: 'whatWeDid', label: 'What we did' },
  { field: 'result', label: 'The result' },
] as const

export const CASE_STUDIES_HUB = {
  title: 'Case studies',
  eyebrow: '[ Case studies ]',
  heading: 'Proof,',
  headingAccent: 'not promises.',
  /** What every case study will include: its own parts, in the order the page shows them. */
  includes: [
    ...CASE_STUDY_FACTS.map((fact) => fact.label),
    ...CASE_STUDY_STORY.map((part) => part.label),
    'The client’s words, with their permission',
  ],
  firstStory: 'Want to be our first story?',
  /**
   * Three questions a buyer asks before trusting a case study, each answered first (C9; the owner
   * approved every word on 2026-11-06), shown under the hero before and after the first study. Each
   * promise rests on the owner's answers of that day: the customer reads and agrees in writing, one
   * real problem per study, no incentive, ranges and months for figures, orders he chooses himself.
   */
  questions: [
    {
      id: 'who-is-the-customer',
      heading: 'Who is the customer in each case study?',
      answer:
        'A real buyer whose finished order we made. We leave out their name and any detail that could point to them, such as their logo, label, city or launch date. They read the text and agree to it in writing.',
      points: [
        'Your own order. It appears in a case study only if you read the text and say yes in writing. Our answer on NDAs is in the FAQ.',
        'Photos. A photo from our floor shows the order only with the customer’s written okay, and with no label, logo or recognizable design in the frame.',
        'Figures. Quantities are shown as a range, and dates as a month and year.',
      ],
      links: [{ phrase: 'Our answer on NDAs is in the FAQ', href: '/faq/working-with-us#nda' }],
    },
    {
      id: 'is-it-real',
      heading: 'How can I check a case study is real?',
      answer:
        'Each case study tells one finished order, written from our order records: the purchase order, approvals, inspection report and shipping papers, which we keep privately. Our merchandiser writes it from the order file, the customer signs off on the text, and M. Hateem Jamshaid reads and approves all of it.',
      points: [
        'One order, one story. A case study never joins several orders into one, and never tells an order we did not make.',
        'References. Our vetting guide explains how we give buyer references.',
      ],
      links: [{ phrase: 'Our vetting guide', href: '/guides/how-to-vet-a-clothing-manufacturer' }],
    },
    {
      id: 'your-order',
      heading: 'Will my order go the same way?',
      answer:
        'Not necessarily. Each case study is one order, chosen by M. Hateem Jamshaid from finished orders whose records we still hold. Each one names one thing that went wrong, when we found it and how we fixed it. Your quote states your price, minimum quantity and lead time.',
      points: [
        'Nothing given for agreeing. No customer has been given or offered anything for agreeing to a case study, and none will be.',
      ],
      links: [],
    },
  ],
  description:
    'Case studies from RUN APPAREL in Sialkot: what was made, for whom, how many, how long, and what we did.',
} as const
