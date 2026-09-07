import { CERTIFICATION, FACTS, LINEAGE, SHIPS_TO } from './companyFacts'
import { FAMILIES } from './families'

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
export function buildLlmsTxt(siteOrigin: string, viewerOrigin: string): string {
  const facts = FACTS.map((fact) => `- ${fact.label}: ${fact.value}`).join('\n')
  const families = FAMILIES.map(
    (family) => `- ${family.name} — ${family.body} ${siteOrigin}/products?family=${family.slug}`,
  ).join('\n')

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

- ${siteOrigin} — what the company makes, the numbers above, and how to start.
- ${siteOrigin}/products — every reference garment, filterable by family. Each card links
  to that garment's 3D page.
- ${siteOrigin}/contact — the addresses, and a form that reaches the company directly.
- ${siteOrigin}/privacy and ${siteOrigin}/terms.

## The 3D references

Each reference garment has its own page on a separate host, ${viewerOrigin}, in the shape
${viewerOrigin}/<product-code>/<colorway>. Those pages are reached by scanning a QR code
printed on a physical garment tag, and each renders the garment in real time from a
compressed 3D model with its fabric composition, weight, fit and performance features
stated exactly.

That host carries its own llms.txt at ${viewerOrigin}/llms.txt and its own sitemap. The
two hosts are one company.

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

robots.txt at ${siteOrigin}/robots.txt allows all user agents, AI crawlers included, and
names them explicitly. The admin panel and the REST API are the only paths disallowed;
both require authentication in any case.
`
}
