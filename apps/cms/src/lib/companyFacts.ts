/**
 * The checkable facts about the company, in ONE place.
 *
 * ⚠️ EVERY NUMBER HERE WAS CONFIRMED BY THE OWNER ON 2026-09-07 AND NOTHING ELSE GOES ON
 * THE PAGE. The audit found the whole marketing site contained exactly two checkable
 * numbers (FA-I-10, FA-I-09, FA-I-05): no capacity, no minimum, no lead time, no
 * certification — while the 3D pages already answered a buyer's first question. A
 * manufacturing buyer decides whether to inquire by looking for specifics, and adjectives
 * do not answer that.
 *
 * They are constants rather than CMS fields because this page's copy is code, and
 * splitting half of it into the CMS would create two places for one claim to live. The
 * footer's `capacity` fields are the CMS half of this and are the owner's to fill; if
 * these ever disagree, the footer is a claim the owner edited and this is a claim a
 * developer shipped, so the footer wins.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE THERE ARE NOW TWO READERS. The numbers were declared inside
 * `(frontend)/page.tsx` until 2026-09-07, when `/llms.txt` began stating the same figures
 * to AI crawlers. A second hand-typed copy is how a site ends up telling a person 100,000
 * and a language model 10,000, with nothing to catch it — `lib/llmsTxt.test.ts` asserts
 * every value below appears in the served text, so the two cannot disagree.
 */

export type CompanyFact = { value: string; label: string }

export const FACTS: CompanyFact[] = [
  { value: '100,000', label: 'Pieces per month' },
  { value: '50', label: 'Minimum order, per style' },
  { value: '7', label: 'Working days to a sample' },
  { value: '200', label: 'People at the works' },
  { value: '193,000', label: 'Sq ft under roof' },
]
/*
 * ⚠️ "21–45 days, approved sample to shipment" WAS HERE UNTIL 2026-09-29, and was removed by
 * the owner: "days may vary order to order". A fixed window is a promise every order has to
 * keep; the quote states the real one. `companyFacts.test.ts` refuses it coming back.
 */

/**
 * Where we ship. Owner, 2026-09-29, replacing the named regions of 2026-09-07 ("Europe, North
 * and South America, and Oceania"): "customers can be new and from anywhere", so a list of
 * regions told a buyer outside it that they were not served.
 */
export const SHIPS_TO = 'Worldwide — wherever your team is.'

/**
 * ⚠️ THE CERTIFICATE HOLDER IS NAMED, DELIBERATELY. RUN APPAREL holds none in its own
 * name; SEDEX and SMETA are DURUS INDUSTRIES', and OEKO-TEX, GOTS and GRS are the
 * suppliers'. A buyer's compliance team checks the holder's name first, so implying
 * otherwise would fail at exactly the moment it mattered. Wording approved by the owner
 * 2026-09-07. SMETA is an AUDIT that was carried out, not a certificate that is held —
 * "SMETA-audited", never "SMETA-certified".
 *
 * REWORDED BY THE OWNER 2026-09-29, verbatim below. Their sentence drops "does not hold
 * certification in its own name" but keeps every holder named — the parent for SEDEX and
 * SMETA, the suppliers for OEKO-TEX, GOTS and GRS — which is the part the compliance check
 * above depends on. `llmsTxt.test.ts` pins both halves.
 *
 * CORRECTED BY THE OWNER THAT EVENING: ISO 9001 is the SUPPLIERS', not DURUS's. First recorded
 * as DURUS's (only 9001 — the badge file also
 * says ISO 22000, a food-safety standard that is not held), amfori BSCI audits are the
 * SUPPLIERS', and BOTH companies are registered with the SECP. The owner left the sentence to
 * us; the ruling kept every holder named and put the SECP in a sentence of its own, because a
 * regulator's registration is a legal fact about the companies, not a standard they meet —
 * which is also why the footer shows it as text and never as a logo.
 */
export const CERTIFICATION =
  'RUN APPAREL operates under our parent company, DURUS INDUSTRIES, which is SEDEX-registered ' +
  'and SMETA-audited. We operate within the same facility, and our fabric and trim suppliers ' +
  'hold ISO 9001, OEKO-TEX, GOTS, and GRS certifications, as well as amfori BSCI audits. Both companies are registered with the Securities and Exchange Commission of ' +
  'Pakistan (SECP). We are fully prepared to pursue any program-specific certifications ' +
  'required for your needs.'

/**
 * ⚠️ 1889 IS A FAMILY TRADE, NOT A COMPANY FOUNDING DATE — which is why no `foundingDate`
 * appears in the structured data either. The page said "EST. LINEAGE 1889", which a buyer
 * could read either way and which understated the actual claim (FA-I-12). The owner's
 * words, 2026-09-07: the family began manufacturing and exporting in 1889 and has done so
 * since; company names have changed over that time and the roots have not.
 */
export const LINEAGE =
  'The family began manufacturing and exporting in 1889 and has done so since. Company ' +
  'names have changed over that time; the roots have not.'
