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
  description:
    'Case studies from RUN APPAREL in Sialkot: what was made, for whom, how many, how long, and what we did.',
} as const
