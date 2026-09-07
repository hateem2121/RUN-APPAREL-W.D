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
  { value: '21–45', label: 'Days, approved sample to shipment' },
  { value: '200', label: 'People at the works' },
  { value: '193,000', label: 'Sq ft under roof' },
]

/** Owner's answer, 2026-09-07. Named regions, not "worldwide". */
export const SHIPS_TO = 'Europe, North and South America, and Oceania.'

/**
 * ⚠️ THE CERTIFICATE HOLDER IS NAMED, DELIBERATELY. RUN APPAREL holds none in its own
 * name; SEDEX and SMETA are DURUS INDUSTRIES', and OEKO-TEX, GOTS and GRS are the
 * suppliers'. A buyer's compliance team checks the holder's name first, so implying
 * otherwise would fail at exactly the moment it mattered. Wording approved by the owner
 * 2026-09-07. SMETA is an AUDIT that was carried out, not a certificate that is held —
 * "SMETA-audited", never "SMETA-certified".
 */
export const CERTIFICATION =
  'RUN APPAREL does not hold certification in its own name. Our parent company, DURUS ' +
  'INDUSTRIES, is SEDEX-registered and SMETA-audited, and we operate within the same ' +
  'facility. Our fabric and trim suppliers hold OEKO-TEX, GOTS and GRS certification. ' +
  'Where a program requires certification in our own name, we will pursue it with you.'

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
