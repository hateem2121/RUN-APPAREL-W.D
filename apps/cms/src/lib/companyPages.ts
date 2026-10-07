import { LINEAGE } from './companyFacts'
import type { GuideBlock } from './guides'

/**
 * The company pages (PLAN.md D3/D4): careers and community.
 *
 * ⚠️ THE OWNER APPROVED THESE WORDS ON 2026-10-07, page by page, from drafts built on the
 * owner's own answers (docs/DECISIONS-BETA-WEBSITE.md D30). Nothing here may state a fact the
 * owner has not given.
 *
 * ⚠️ THE BENEFITS ARE ONE LIST, shared by both pages, so they cannot disagree (PLAN.md D4).
 * The "How to apply" email is read from `SiteSettings` at render time and is NEVER typed
 * here — `companyPages.test.ts` refuses an `@` in this file's source. The photos are the
 * owner's factory photos, used only where the section's own words name what they show
 * (`guides.test.ts`'s rule): only the floor and the building exist (C-8, 2026-10-07).
 */

/** One section of a company page, drawn like a guide's. */
export type CompanySection = {
  /** Anchor id inside the page, lowercase and hyphens (`#what-we-offer`, `#training`, `#apply` are load-bearing: LinkedIn points at them). */
  readonly id: string
  readonly heading: string
  /** One of the owner's factory photos (`FACTORY_PHOTOS`), only where the words name it. */
  readonly photo?: string
  readonly blocks: readonly GuideBlock[]
}

export type CompanyPage = {
  readonly path: string
  /** The `<title>`; the layout adds " — RUN APPAREL". */
  readonly title: string
  /** ≤ 160 characters: the meta description. */
  readonly description: string
  /** The page's mono label, brackets included. */
  readonly eyebrow: string
  /** The one `<h1>`, in two parts: plain, then the single serif accent. */
  readonly heading: string
  readonly headingAccent: string
  readonly lede: string
  readonly sections: readonly CompanySection[]
  /** The links at the foot of the page, in the owner's approved set. */
  readonly links: readonly { readonly href: string; readonly name: string }[]
}

/**
 * The benefits everyone who works here gets (owner C-2, corrected 2026-10-07: PAID EMERGENCY
 * leave, not annual leave) — shared by Careers and Community.
 */
export const WORK_HERE: readonly string[] = [
  'A written contract',
  'Paid emergency leave',
  'A festival bonus at Eid and other celebrations',
  'Medical coverage for the worker and their family',
  'Transport support to and from the works',
  'Training and promotion from within',
]

export const CAREERS_PAGE: CompanyPage = {
  path: '/careers',
  title: 'Careers',
  description:
    'Join a family of makers in Sialkot. A written contract, paid emergency leave, a festival bonus, medical coverage, transport, and training from within.',
  eyebrow: '[ Careers ]',
  heading: 'Join a family,',
  headingAccent: 'of makers.',
  lede: `${LINEAGE} If you take pride in craft, there may be a place for you here.`,
  sections: [
    {
      id: 'what-we-offer',
      heading: 'What we offer',
      blocks: [{ kind: 'list', items: WORK_HERE }],
    },
    {
      id: 'training',
      heading: 'Training and promotion',
      blocks: [
        {
          kind: 'text',
          text: 'Training happens on the job. Many of our senior team started as trainees.',
        },
        {
          kind: 'text',
          text: 'One real example, no name: one person on our team started as a helper, became a stitcher, and is now a line supervisor.',
        },
      ],
    },
    {
      id: 'roles',
      heading: 'Who we’re always looking for',
      blocks: [
        {
          kind: 'list',
          items: [
            'Stitchers and machinists',
            'Cutters and printers',
            'Quality checkers',
            'Merchandisers and coordinators',
            'Pattern makers and designers',
            'Administrators',
          ],
        },
        {
          kind: 'text',
          text: 'Everyone is welcome to apply. We keep good candidates on file for future openings.',
        },
      ],
    },
    {
      id: 'apply',
      heading: 'How to apply',
      blocks: [
        // The email line above this text is rendered from `SiteSettings` by `CompanyPage`.
        { kind: 'text', text: 'Tell us what you do and how to reach you.' },
        {
          kind: 'text',
          text: 'Applying for an office role — merchandising and coordination, pattern making and design, or administration — includes your CV. Floor roles do not need one.',
        },
      ],
    },
    {
      id: 'life',
      heading: 'Life at RUN APPAREL',
      // C-8 (2026-10-07): only floor and building photos exist. The words name the floor.
      photo: 'stitching',
      blocks: [
        {
          kind: 'text',
          text: 'The factory floor is where the work in the policies happens: cutting, printing, sewing, checking and packing, in one building.',
        },
      ],
    },
  ],
  links: [
    { href: '/community', name: 'Community' },
    { href: '/policies', name: 'Policies' },
    { href: '/policies/equal-opportunity', name: 'Equal opportunity' },
    { href: '/contact', name: 'Contact' },
  ],
}

export const COMMUNITY_PAGE: CompanyPage = {
  path: '/community',
  title: 'Community',
  description:
    'Steady, dignified work is the most important thing RUN APPAREL does for Sialkot — the people, the training and the help in hard times, in one building.',
  eyebrow: '[ Community ]',
  heading: 'Steady work, honest craft,',
  headingAccent: 'since 1889.',
  // "is a" is tied with a non-breaking space (the owner's words unchanged): untied, "is" ended a
  // 76-character line at the site measure, one over FA-C-52's 75 (apps/cms/e2e/legibility.spec.ts,
  // 2026-10-07); tied, the longest line is 73 at 768, 1180 and 1440px.
  lede: `Our building sits among the people of Sialkot. Steady, dignified work is the most important thing we do for Sialkot. Their children see that craft is\u00a0a career, not a last resort. ${LINEAGE}`,
  sections: [
    {
      id: 'work',
      heading: 'What work here means',
      blocks: [
        { kind: 'list', items: WORK_HERE },
        {
          kind: 'text',
          text: 'About 10–15% of the people who work here are women, and every role is open to them.',
        },
        {
          kind: 'text',
          text: 'Senior stitchers and cutters train the next generation; many experienced people here started as trainees.',
        },
      ],
    },
    {
      id: 'hard-times',
      heading: 'Help in hard times',
      blocks: [
        {
          kind: 'text',
          text: 'We help when the community faces hardship — in floods, emergencies and personal crises.',
        },
      ],
    },
    {
      id: 'buyers',
      heading: 'Why this matters to buyers',
      blocks: [
        {
          kind: 'text',
          text: 'Every order is made by the people on this page. Our policies, in writing, are how that work stays steady.',
        },
      ],
    },
    {
      id: 'the-works',
      heading: 'The works, in pictures',
      // C-8 (2026-10-07): only floor and building photos exist. The words name the building.
      photo: 'exterior',
      blocks: [
        {
          kind: 'text',
          text: 'Our building in Sialkot — the works the policies above are practiced in.',
        },
      ],
    },
  ],
  links: [
    { href: '/careers', name: 'Careers' },
    { href: '/policies', name: 'Policies' },
    { href: '/', name: 'Who we are' },
  ],
}

/** Every company address, hub-free and in wiring order (Phase 5 adds `/press`). */
export const COMPANY_PATHS: readonly string[] = [CAREERS_PAGE.path, COMMUNITY_PAGE.path]
