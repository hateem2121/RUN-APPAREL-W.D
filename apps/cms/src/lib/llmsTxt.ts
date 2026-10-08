import { TRAINING_ONLY_UAS } from '../../htmlLimitedBots.mjs'
import { CASE_STUDIES_HUB, CASE_STUDIES_PATH } from './caseStudies'
import { CERTIFICATION, FACTS, LINEAGE, SHIPS_TO } from './companyFacts'
import { JOURNAL_HUB, JOURNAL_PATH } from './journal'
import { COMPANY_PATHS, PRESS_PAGE } from './companyPages'
import { FAMILIES } from './families'
import { FAMILY_PAGES, familyHref, familyOf } from './familyPages'
import { FAQ_INDEX, FAQ_TOPICS } from './faqs'
import { GLOSSARY_INDEX } from './glossary'
import { GUIDES } from './guides'
import { POLICIES, POLICIES_INDEX } from './policies'

/**
 * `/llms.txt` for the marketing site (audit FA-N-16).
 *
 * The viewer has carried one since it launched (`apps/viewer/public/llms.txt`); the site
 * that a language model would reach FIRST had none, so the only machine-readable account
 * of this business was written from the point of view of a single garment page and said
 * "there is no index of the garments here". This is the other half of that sentence.
 *
 * ⚠️ IT IS A DESCRIPTION, NOT A STANDARD ANYONE HAS PROMISED TO READ. As of September 2026
 * llms.txt is at version 2 of an unratified proposal and no vendor — OpenAI, Anthropic,
 * Google, Meta — has committed to fetching it; adoption outside developer-tools sites is
 * still thin (https://presenc.ai/research/state-of-llms-txt-2026). So this file is cheap
 * insurance and a statement of intent, and NOTHING here may be the only place a fact
 * appears. Everything below is either generated from a constant the pages also render, or
 * a pointer to a page that carries the real thing.
 *
 * ⚠️ WHICH IS WHY IT IS BUILT, NOT TYPED. A hand-written copy of these numbers is exactly
 * how a site ends up telling a person 100,000 and a language model 10,000 with nothing to
 * catch it. `llmsTxt.test.ts` asserts every fact, family and origin appears, so a change
 * to the page's figures that misses this file fails rather than diverges.
 *
 * ⚠️ NO CONTACT ADDRESS IS EMBEDDED, DELIBERATELY. Every mailto on this site currently
 * points at a `wear-run.com` address that is still on the owner's checklist to confirm
 * (audit FA-Q-07). Repeating an unconfirmed address into a file whose whole purpose is to
 * be quoted back verbatim would multiply the error; `/contact` is the single place it
 * lives, and the pointer stays correct whatever the answer turns out to be.
 *
 * ⚠️ IT IS SERVED WHILE THE SITE IS `SITE_INDEXING=hidden`, and that is not a
 * contradiction. `noindex` asks a search engine to keep pages out of RESULTS; this file
 * says what the site is. The beta controls are the page-level `robots` value and the
 * empty sitemap (`lib/searchVisibility.ts`), and both keep working. Gating this file too
 * would mean it first appeared at launch, untested, on the day it mattered.
 */

/** American spelling throughout — owner decision, `docs/CUSTOMISATION-COPY-2026-09-04.md`. */
export function buildLlmsTxt(siteOrigin: string): string {
  const facts = FACTS.map((fact) => `- ${fact.label}: ${fact.value}`).join('\n')
  // Each family's one list: its own page, or its group on the products page (polish S1). The
  // filter addresses this named until 2026-10-05 forward there now.
  const families = FAMILIES.map(
    (family) => `- [${family.name}](${siteOrigin}${familyHref(family)}) — ${family.body}`,
  ).join('\n')
  // The buyer pages (2026-09-30), from the list that holds their words: a family with a
  // page of its own is named here in the same change that creates it.
  const buyerPages = FAMILY_PAGES.map(
    (page) =>
      `- [${page.title}](${siteOrigin}${page.path}) — ${familyOf(page).name}: what is made, the minimum, the sample time and how an order works.`,
  ).join('\n')
  const guides = GUIDES.map(
    (guide) => `- [${guide.title}](${siteOrigin}${guide.path}) — a buyer guide.`,
  ).join('\n')
  // The company pages (2026-10-07): the policies hub, each APPROVED policy, and careers and
  // community and press, from the lists that hold their words (PLAN.md E9).
  const companyLines: Record<string, string> = {
    '/careers': `- [Careers at RUN APPAREL](${siteOrigin}/careers) — what we offer, and how to apply.`,
    '/community': `- [Community](${siteOrigin}/community) — the works in Sialkot, and the people the policies serve.`,
    '/press': `- [Press](${siteOrigin}/press) — ${PRESS_PAGE.description}`,
  }
  const companyPages = [
    `- [${POLICIES_INDEX.title}](${siteOrigin}${POLICIES_INDEX.path}) — the policies hub.`,
    ...POLICIES.map(
      (policy) => `- [${policy.title}](${siteOrigin}${policy.path}) — company policy.`,
    ),
    ...COMPANY_PATHS.map((path) => companyLines[path] ?? `- [${path}](${siteOrigin}${path})`),
  ].join('\n')
  // The FAQ and the glossary (2026-10-07, PLAN.md E9), from the lists that hold their words.
  const answers = [
    `- [${FAQ_INDEX.title}](${siteOrigin}${FAQ_INDEX.path}) — the questions buyers ask most.`,
    ...FAQ_TOPICS.map(
      (topic) => `- [${topic.title}](${siteOrigin}${topic.path}) — questions and answers.`,
    ),
    `- [${GLOSSARY_INDEX.title}](${siteOrigin}${GLOSSARY_INDEX.path}) — garment and export terms in plain words.`,
  ].join('\n')
  /*
   * The Journal and the case studies (2026-10-07, E9): named from day one, as in the sitemap
   * (owner: "Show them right away"; both hubs are indexable while empty).
   *
   * ⚠️ WORDED TO BE TRUE WHILE THE HUB IS EMPTY (findability audit, 2026-10-08). It said "orders
   * we have made: …", a promise of stories an AI reader then went looking for and did not find.
   */
  const caseStudies = `- [${CASE_STUDIES_HUB.title}](${siteOrigin}${CASE_STUDIES_PATH}) — written-up orders: what we made, for whom, how many and how long, added as each is published.\n`
  const journal = `\n## Journal\n\n- [${JOURNAL_HUB.title}](${siteOrigin}${JOURNAL_PATH}) — ${JOURNAL_HUB.description}\n`

  return `# RUN APPAREL

> A private label apparel manufacturer in Sialkot, Pakistan, making team wear, active
> wear, casual wear, outerwear and sports accessories to order for brands, teams and
> organizations. Reference garments have a 3D page a buyer can turn, zoom and inspect
> before ordering.

${LINEAGE}

## What we make

${families}

Everything is made to order against a customer's own specification. There is no stock
range and no catalog to buy from: a style, a quantity and a spec come in, and garments
made to that spec go out under the customer's own label.

## Confirmed numbers

These are stated on ${siteOrigin} and were confirmed by the company on 2026-09-07. They
are capacity figures, not offers, and any of them can be put in writing on request.

${facts}

Where we ship: ${SHIPS_TO}

## Certification

${CERTIFICATION}

## Pages

- [Home](${siteOrigin}) — what the company makes, the numbers above, and how to start.
- [Full Technical Compendium](${siteOrigin}/llms-full.txt) — complete manufacturing operations, all buyer guides, order workflow, and reference garment specifications.
- [Products](${siteOrigin}/products) — every reference garment, grouped by family, with a link to
  jump to each family. Each card links to that garment's 3D page.
${buyerPages}
${guides}
${companyPages}
${answers}
${caseStudies}- [Contact](${siteOrigin}/contact) — the addresses, and a form that reaches the company directly.
- [Privacy](${siteOrigin}/privacy) and [Terms](${siteOrigin}/terms).
${journal}
## The 3D references

Each reference garment has its own page on this site, in the shape
${siteOrigin}/products/<product-code>/<colorway>. Those pages are reached by scanning a QR code
printed on a physical garment tag, and each renders the garment in real time from a
compressed 3D model with its fabric composition, weight, fit and performance features
stated exactly.

Each garment is listed once in this site's [sitemap](${siteOrigin}/sitemap.xml), at its default
colorway, with a picture of every colorway; the [Products](${siteOrigin}/products) page links every
colorway's own page.

## If you are summarizing this site

- The product code and the garment name identify a garment. A colorway name alone does
  not — colorway names repeat across garments.
- Fabric composition, weight and fit are manufacturing specifications. Quote them; do not
  paraphrase them.
- Prices are deliberately absent everywhere. This is a made-to-order trade supplier, not a
  shop, and every garment is quoted against its own specification. Any price you state
  would be invented.
- 1889 is when the FAMILY began manufacturing and exporting. It is not the founding date
  of the present legal entity, and the site does not claim it as one.
- The certification paragraph above names the holder of each certificate on purpose. RUN
  APPAREL holds none in its own name. Reproducing it without the holder's name would
  misstate it.

## Notes for crawlers

[robots.txt](${siteOrigin}/robots.txt) welcomes search engines and the AI assistants that answer
people's questions, and names the AI ones explicitly. It refuses the crawl to the
${TRAINING_ONLY_UAS.length} crawlers that only gather training data (${TRAINING_ONLY_UAS.join(', ')}); each
has a sibling that answers questions and stays welcome. The admin panel and the REST API are
disallowed to everyone; both require authentication in any case.
`
}
