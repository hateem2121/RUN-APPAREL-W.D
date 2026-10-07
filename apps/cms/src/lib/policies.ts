import { CERTIFICATION_LINES, CERTIFICATION_PROMISE } from './companyFacts'
import type { GuideBlock } from './guides'

/**
 * The policy pages (PLAN.md D1/D2).
 *
 * ⚠️ THE OWNER APPROVED THESE WORDS ON 2026-10-07 (drafts in
 * `~/Sites/Model-Viewer-main/.superpowers/page-creation-2026-10-06/drafts/`, answers in
 * `OWNER-FACTS.md`). Nothing here may state a fact that answer sheet does not carry. The
 * anti-harassment page is deliberately ABSENT (no "coming soon"): the owner holds it until a
 * complaints committee exists (2026-10-07).
 *
 * ⚠️ EVERY POLICY IS A PLAIN-ENGLISH SUMMARY of a policy that belongs to both RUN APPAREL and
 * DURUS INDUSTRIES (one building). A page ends on the site's "Ask us about a policy" secondary
 * link, never a new primary button. No standard's name or logo appears on a policy page; the
 * certificate wording lives on the hub, word for word from `CERTIFICATION_LINES`.
 *
 * ⚠️ A NEW POLICY MUST ALSO JOIN `POLICY_PAGE_SOURCES` in `publicViewerHeaders.mjs` and get a
 * route folder under `(frontend)/policies/`. `policies.test.ts` fails when the three differ,
 * and `siteFacts.test.ts` refuses a ruled-out claim in any string below.
 */

export type PolicyGroup = 'workplace' | 'production'

export type PolicySection = {
  /** Anchor id inside the page, lowercase and hyphens. */
  readonly id: string
  readonly heading: string
  readonly blocks: readonly GuideBlock[]
}

export type Policy = {
  readonly path: string
  /** The `<title>`; the layout adds " — RUN APPAREL". */
  readonly title: string
  /** ≤ 160 characters: the meta description. */
  readonly description: string
  /** The one `<h1>`, in two parts: plain, then the single serif accent. */
  readonly heading: string
  readonly headingAccent: string
  readonly lede: string
  /** YYYY-MM-DD — the date the owner approved this page's words. Never "today". */
  readonly lastReviewed: string
  readonly group: PolicyGroup
  readonly sections: readonly PolicySection[]
}

/** The four sections every policy page carries, in this order (PLAN.md D2). */
const SECTION_IDS = ['commit', 'day-to-day', 'concerns', 'responsible'] as const
const SECTION_HEADINGS: Record<(typeof SECTION_IDS)[number], string> = {
  commit: 'What we commit to',
  'day-to-day': 'How it works day to day',
  concerns: 'How to raise a concern',
  responsible: 'Who is responsible',
}

const section = (
  id: (typeof SECTION_IDS)[number],
  blocks: readonly GuideBlock[],
): PolicySection => ({
  id,
  heading: SECTION_HEADINGS[id],
  blocks,
})

const list = (...items: readonly string[]): GuideBlock => ({ kind: 'list', items })

/** The review date every page below was approved on (the owner, 2026-10-07). */
const APPROVED = '2026-10-07'

export const POLICIES: readonly Policy[] = [
  {
    path: '/policies/workplace-conduct',
    title: 'Workplace Conduct',
    description:
      'How we treat each other at work: the rules of the floor, what happens when one is broken, and how a concern reaches the HR office.',
    heading: 'How we treat each other,',
    headingAccent: 'on the floor.',
    lede: 'This policy covers how we treat each other at work, and it applies to everyone in our building.',
    lastReviewed: APPROVED,
    group: 'workplace',
    sections: [
      section('commit', [
        list(
          'We treat everyone with respect. There is no abuse and no fighting.',
          'Everyone wears the safety gear their job needs, and machine guards stay in place.',
          'We start on time. Attendance is recorded every day.',
          'We look after the materials in our care.',
        ),
      ]),
      section('day-to-day', [
        { kind: 'text', text: 'Attendance is recorded every day, so hours and pay are on record.' },
        {
          kind: 'text',
          text: 'When a rule is broken, it is handled in steps: a verbal warning first, then a written warning, then dismissal.',
        },
      ]),
      section('concerns', [
        list('Everyday problems go to the HR office.', 'A concern is handled without retaliation.'),
      ]),
      section('responsible', [{ kind: 'text', text: 'The HR office runs this policy.' }]),
    ],
  },
  {
    path: '/policies/health-and-safety',
    title: 'Health and Safety',
    description:
      'Safety gear where the work needs it, safety training and fire drills every 6 months, marked fire exits, and every accident on record.',
    heading: 'Safe work,',
    headingAccent: 'every day.',
    lede: 'This policy covers how we keep the works safe, and it applies to everyone in the building.',
    lastReviewed: APPROVED,
    group: 'workplace',
    sections: [
      section('commit', [
        list(
          'Everyone gets the safety gear where the work needs it, and machine guards stay in place.',
          'Safety training happens every 6 months.',
          'Fire drills and fire-safety training happen every 6 months.',
          'Fire exits are marked and kept clear on every floor.',
          'Every accident is written in the accident register.',
        ),
      ]),
      section('day-to-day', [
        {
          kind: 'text',
          text: 'An accident is reported to a supervisor, who writes it in the accident register.',
        },
        {
          kind: 'text',
          text: 'Twice a year, the whole works trains for safety and practices a fire drill.',
        },
      ]),
      section('concerns', [
        list(
          'An accident goes to your supervisor.',
          'Anything else about safety goes to the HR office.',
          'A concern is handled without retaliation.',
        ),
      ]),
      section('responsible', [
        {
          kind: 'text',
          text: 'The HR / compliance officer is responsible for safety at the works.',
        },
      ]),
    ],
  },
  {
    path: '/policies/health-and-vaccination',
    title: 'Health and Vaccination',
    description:
      'A first-aid room, family medical coverage, voluntary and free vaccination drives, and no vaccination requirement for employment at RUN APPAREL.',
    heading: 'Good health,',
    headingAccent: 'for everyone here.',
    lede: 'This policy covers everyday health care and vaccination at the works, and it applies to everyone who works here.',
    lastReviewed: APPROVED,
    group: 'workplace',
    sections: [
      section('commit', [
        list(
          'There is a first-aid room, and medical help is on site.',
          'Our medical coverage covers the worker and their family.',
          'Vaccination drives at the factory are voluntary and free.',
          'We follow Pakistan’s national health guidance for workplace health and vaccination.',
          'We do not require vaccination as a condition of employment; we make it available and encourage informed choice.',
        ),
      ]),
      section('day-to-day', [
        { kind: 'text', text: 'The first-aid room handles everyday health needs at work.' },
        {
          kind: 'text',
          text: 'When a vaccination drive runs, it is free and voluntary. We recommend vaccination, and the choice is each person’s.',
        },
        {
          kind: 'text',
          text: 'Everyone gets the safety gear their job needs: masks, machine guards, and ear protection where the work needs it.',
        },
        { kind: 'text', text: 'Fire drills and fire-safety training happen every 6 months.' },
        { kind: 'text', text: 'There is clean drinking water, ventilation and rest breaks.' },
      ]),
      section('concerns', [
        list('Health questions go to the HR office.', 'A concern is handled without retaliation.'),
      ]),
      section('responsible', [{ kind: 'text', text: 'The HR office.' }]),
    ],
  },
  {
    path: '/policies/equal-opportunity',
    title: 'Equal Opportunity',
    description:
      'How RUN APPAREL hires and promotes: a skills trial, performance, equal pay for equal work, and women and men hired for every role.',
    heading: 'Fair chances,',
    headingAccent: 'for every role.',
    lede: 'This policy covers how we hire and how we promote, and it applies to every applicant and every worker.',
    lastReviewed: APPROVED,
    group: 'workplace',
    sections: [
      section('commit', [
        list(
          'Women and men are hired for every role.',
          'Hiring is based on a skills trial.',
          'Promotion is based on performance.',
          'Equal pay for equal work.',
        ),
      ]),
      section('day-to-day', [
        {
          kind: 'text',
          text: 'A hiring decision is made on what a candidate shows in a skills trial.',
        },
        { kind: 'text', text: 'A promotion is made on how a person performs in their job.' },
        { kind: 'text', text: 'People in the same role, doing the same work, are paid the same.' },
      ]),
      section('concerns', [
        list(
          'A concern about fair treatment goes to the HR office.',
          'A concern is handled without retaliation.',
        ),
      ]),
      section('responsible', [{ kind: 'text', text: 'The HR office.' }]),
    ],
  },
  {
    path: '/policies/labor-rights',
    title: 'Labor Rights and No Child Labor',
    description:
      'Hiring age 18 checked by ID card, Monday-to-Saturday hours, voluntary paid overtime, at least the legal minimum wage, and no fees or held ID documents.',
    heading: 'Your rights at work,',
    headingAccent: 'in writing.',
    lede: 'This policy covers hiring age, hours, pay and your rights at work, and it applies to everyone who works here.',
    lastReviewed: APPROVED,
    group: 'workplace',
    sections: [
      section('commit', [
        list(
          'No one under 18 works here. We check every new hire’s national ID card.',
          // The owner approved this sentence on 2026-10-07; the live settings' hours box
          // carries the same Monday-to-Saturday week. The FAQ's hours answer (Phase 3) is
          // the one read from `SiteSettings` at render time.
          'Normal hours are Monday to Saturday, 08:00 to 17:00.',
          'Overtime is voluntary and paid extra.',
          'Pay is at least the legal minimum.',
          'We never charge a fee or a deposit to get a job, and we never hold anyone’s identity documents.',
          'Workers are free to join a union or committee. None exists today.',
        ),
      ]),
      section('day-to-day', [
        { kind: 'text', text: 'The age check happens at hiring, with the national ID card.' },
        { kind: 'text', text: 'Overtime is always a choice, and extra hours are paid extra.' },
      ]),
      section('concerns', [
        list(
          'A concern about hours, pay or treatment goes to the HR office.',
          'A concern is handled without retaliation.',
        ),
      ]),
      section('responsible', [{ kind: 'text', text: 'The HR office.' }]),
    ],
  },
  {
    path: '/policies/quality',
    title: 'Quality',
    description:
      'The checks every RUN APPAREL order passes: fabric on arrival, work in sewing, measurements, and a final inspection signed off before packing.',
    heading: 'Checked,',
    headingAccent: 'at every step.',
    lede: 'This policy covers how an order is checked, from the fabric’s arrival to the packed carton.',
    lastReviewed: APPROVED,
    group: 'production',
    sections: [
      section('commit', [
        list(
          'Fabric is checked when it arrives.',
          'Work is checked during sewing.',
          'Measurements are checked.',
          'There is a final inspection before anything is packed.',
        ),
      ]),
      section('day-to-day', [
        {
          kind: 'text',
          text: 'The checks run in order: fabric on arrival, work during sewing, measurements, then a final inspection before packing.',
        },
        {
          kind: 'text',
          text: 'Before packing, the QC manager and the merchandiser sign off together.',
        },
      ]),
      section('concerns', [
        {
          kind: 'text',
          text: 'A buyer who finds a problem with an order can write to us. We reply within 24 hours.',
        },
      ]),
      section('responsible', [
        {
          kind: 'text',
          text: 'The QC manager, together with the merchandiser, signs off every order before it is packed.',
        },
      ]),
    ],
  },
  {
    path: '/policies/environmental',
    title: 'Environmental',
    description:
      'Solar power for about 80% of the factory’s electricity, scraps recycled or reused, and few chemicals and little waste water in our building.',
    heading: 'What we use,',
    headingAccent: 'and what we save.',
    lede: 'This policy covers how we use energy and materials at the works.',
    lastReviewed: APPROVED,
    group: 'production',
    sections: [
      section('commit', [
        list(
          'Solar panels on the roof give about 80% of the factory’s electricity.',
          'Fabric scraps are sold to recyclers, or reused for small items and padding.',
          'Very few chemicals are used in our building, because dyeing and finishing are done by our fabric suppliers.',
          'There is little waste water, because there is no dyeing on site.',
        ),
      ]),
      section('day-to-day', [
        {
          kind: 'text',
          text: 'Scraps from cutting are collected, then sold to recyclers or reused for small items and padding.',
        },
        {
          kind: 'text',
          text: 'Dyeing and finishing happen at our fabric suppliers, so our building uses very few chemicals and produces little waste water.',
        },
      ]),
      section('concerns', [
        {
          kind: 'text',
          text: 'A buyer who wants to know more about our materials can write to us. We reply within 24 hours.',
        },
      ]),
      section('responsible', [
        { kind: 'text', text: 'The director is responsible for this policy.' },
      ]),
    ],
  },
]

/** The policies hub (PLAN.md D1): the approved policies only, in the owner's groups. */
export const POLICIES_INDEX = {
  path: '/policies',
  title: 'Policies',
  description:
    'The policies that govern how RUN APPAREL treats its people, makes garments and runs the business, practiced daily in our building in Sialkot.',
  heading: 'How we work,',
  headingAccent: 'in writing.',
  lede: 'A factory should be able to show its rules, not just claim them. These policies govern how we treat our people, make our garments and run our business. Each one is practiced daily in our building in Sialkot.',
  /** The owner's certificate lines, word for word, and no logos (PLAN.md D1). */
  standards: CERTIFICATION_LINES,
  standardsPromise: CERTIFICATION_PROMISE,
  /** The site's own pages, listed under "This website". */
  websiteLinks: [
    { href: '/privacy', name: 'Privacy' },
    { href: '/terms', name: 'Terms' },
  ],
} as const

/** Every policy address, hub first — the same list, in the same order, as `POLICY_PAGE_SOURCES`. */
export const POLICY_PATHS: readonly string[] = [
  POLICIES_INDEX.path,
  ...POLICIES.map((policy) => policy.path),
]

/** The closing line of every policy page — the owner's own words, approved 2026-10-07 (F20-12a). */
export const POLICY_CLOSING =
  'This page is a plain-English summary of our policy. A buyer or auditor who needs the full document can ask us for it.'

/** The closing action on every policies page: a secondary link, never a new primary button (PLAN.md Part D). */
export const POLICY_ACTION = 'Ask us about a policy'

export function policyAt(path: string): Policy {
  const policy = POLICIES.find((entry) => entry.path === path)
  if (!policy) throw new Error(`No policy at ${path}`)
  return policy
}
