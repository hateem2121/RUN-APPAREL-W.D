/**
 * The certification bodies' logos the footer draws beside the "Standards" entries.
 * Decision record: docs/DECISIONS-BETA-WEBSITE.md D25 (owner, 2026-09-29).
 *
 * ⚠️ THIS IS AN ALLOW-LIST OF WHAT THE COMPANY MAY SHOW, NOT A LIBRARY OF EVERY MARK ON
 * DISK, AND SINCE 2026-11-05 IT IS EMPTY (see `STANDARDS_LOGOS`). RUN APPAREL holds no
 * certification in its own name (`lib/companyFacts.ts` CERTIFICATION): DURUS INDUSTRIES, a
 * separate family company whose site RUN produces at, is SEDEX-registered and SMETA-audited, and
 * the fabric and trim suppliers hold ISO 9001, OEKO-TEX, GRS and amfori BSCI. A record here draws
 * a mark wherever an entry names its body.
 *
 * ⚠️ amfori BSCI IS TEXT ONLY (owner, 2026-09-29). The only file on hand was the OLD
 * pre-amfori "Member of BSCI" ring, beside text that says "amfori BSCI"; it returns when the
 * owner sends a current amfori file. The owner's folder also holds marks
 * the company does NOT claim (ISO 22000, Made in Green, RCS/OCS, sgi) and one it claims
 * in TEXT only — the Securities and Exchange Commission of Pakistan, a regulator, whose
 * emblem beside a supplier list would read as endorsement (owner, 2026-09-29). None of
 * them has a record, and `standardsLogos.test.ts` fails if one appears.
 *
 * ⚠️ NO GOTS MARK SINCE 2026-11-04 (owner's go-ahead, legal review that day). GOTS's
 * Conditions for Use of Signs v4.0, s.3.3.1 (in force 2026-08-01): "Uncertified processors,
 * manufacturers, Traders shall not use GOTS Signs or make any claims referring to GOTS", and its
 * s.1.3 counts a website as off-product use. RUN APPAREL is not GOTS-certified, so a supplier's
 * certificate does not let it show the mark. The CMS footer may still name GOTS in text; with no
 * record here it draws no picture, and a test pins that.
 *
 * ADDING ONE IS ONE TABLE ENTRY: a file in `apps/cms/public/standards/`, its size, and the
 * words that name it. `apps/cms/src/lib/standardsLogos.test.ts` then checks the file exists
 * at the recorded size — the test stays beside the files.
 *
 * In this package since 2026-10-02 (visual audit VA-31): the garment pages draw the same
 * footer, so they must choose the same marks. They are on the same address as the website
 * (wear-run.com), so the `src` paths below resolve to the website's files on both.
 *
 * The artwork is the owner's own vector files (Illustrator, in ~/Documents/Factory
 * Images), converted to plain SVG paths — no text, no fonts, no embedded rasters — and
 * trimmed to the mark. `source` names the file each one came from.
 */
export interface StandardLogo {
  slug: string
  /** Path under `apps/cms/public/`, as the browser requests it. */
  src: string
  /** The size the SVG file declares, in CSS pixels — what the <img> reserves. */
  width: number
  height: number
  /** The body's name, what a screen reader says for the picture. */
  alt: string
}

export interface StandardLogoEntry extends StandardLogo {
  /** The owner's original file this was converted from (never committed: the repo is public). */
  source: string
  /** The words in an entry that name this body. */
  words: RegExp
}

/**
 * ⚠️ WHOLE WORDS ONLY. `GRSX` is not GRS and `NONSEDEXISH` is not Sedex: a mark printed
 * beside a word that merely CONTAINS a body's name is a claim nobody made. The lookarounds
 * treat letters and digits as part of a word and let punctuation end it, so
 * "SEDEX-registered", "(GOTS)" and "ISO 9001-certified" match while "GRSX" does not.
 */
export const standardWords = (pattern: string) =>
  new RegExp(`(?<![A-Za-z0-9])(?:${pattern})(?![A-Za-z0-9])`, 'i')

/**
 * ⚠️ EMPTY SINCE 2026-11-05, ON PURPOSE: NOT ONE OF THESE MARKS IS RUN APPAREL'S TO SHOW (owner:
 * "You do everything" — check each scheme's own logo rules and remove any mark they forbid).
 * Each scheme gives the right to its mark to the organisation that holds the certificate or
 * membership, and RUN holds none in its own name; a supplier's or sister company's certificate
 * does not pass that right on. Read that night, at the source:
 *
 * - ISO 9001: iso.org/certification.html — ISO "does not permit anyone to use the ISO logo in
 *   connection with certification". The file was the ISO logo itself, ringed "Quality Management
 *   System … Certified".
 * - OEKO-TEX: oeko-tex.com Labelling Guide → Logo usage — the product-brand logo is for "OEKO-TEX®
 *   customers with valid certificate" and retailers carrying a labelled product, and "A clear
 *   distinction between certified and uncertified products and companies must be made". The file
 *   was the STANDARD 100 label.
 * - GRS: Textile Exchange TE-301 Standards Claims Policy V1.3 (2023-06-01), "Logo Use
 *   Authorization": "Unauthorized display, copy, and/or use of any Standard logo without prior
 *   authorization, is strictly prohibited"; a logo comes through a certification body's licence.
 * - Sedex: sedex.com/ambassador-toolkit — the logo and artwork are for "companies that are Sedex
 *   members", "to promote your Sedex membership". DURUS INDUSTRIES is the member, not RUN.
 * - SMETA (the least certain: no SMETA-specific rule was found): it is Sedex's own audit brand,
 *   under the same members-only terms, and Sedex says SMETA is not a certification.
 *
 * The TEXT stays (the footer's "Sister company: …" and "Suppliers: …" lines and `CERTIFICATION`
 * name each holder); only the pictures, which read as the company's own, are gone. The SME Climate
 * Hub badge stays: that commitment IS the company's own (`CLIMATE_COMMITMENT` below).
 * `standardsLogos.test.ts` fails if any of the five comes back. A mark returns only for a
 * certificate the company holds in its own name, with that scheme's licence.
 */
export const STANDARDS_LOGOS: readonly StandardLogoEntry[] = []

/**
 * The logos an entry's text names — each body once, in the order the entry mentions them.
 * An entry that names none returns [] and the footer draws no picture for it. `table` is the
 * live allow-list unless a test passes its own.
 */
export function logosFor(
  entry: string,
  table: readonly StandardLogoEntry[] = STANDARDS_LOGOS,
): StandardLogo[] {
  return table
    .flatMap((logo) => {
      const at = entry.search(logo.words)
      return at < 0 ? [] : [{ at, logo }]
    })
    .sort((a, b) => a.at - b.at)
    .map(({ logo: { slug, src, width, height, alt } }) => ({ slug, src, width, height, alt }))
}

/**
 * The area every mark is drawn at in the footer's row: that of a 36px square (polish X23).
 *
 * ⚠️ THE SAME AREA, NOT THE SAME HEIGHT. At one height of 32px the wide wordmarks ran long (Sedex
 * 119px, SMETA 102px) and the badges stayed small (OEKO-TEX 23px wide, GOTS and ISO 32px): the audit
 * of 3 October read them as two sizes of mark. Kept to one area, a wide mark is drawn shorter and a
 * tall one taller, and each takes about the same room on the row.
 */
export const MARK_AREA = 36 * 36

/**
 * The size a mark is drawn at: its own proportions, at `area` (the footer's `MARK_AREA` unless
 * told otherwise; the home page's certification panel draws them larger, polish X7), in whole
 * pixels.
 */
export function markBox(
  { width, height }: { width: number; height: number },
  area: number = MARK_AREA,
): {
  width: number
  height: number
} {
  const ratio = width / height
  const drawn = Math.sqrt(area / ratio)
  return { width: Math.round(drawn * ratio), height: Math.round(drawn) }
}

/**
 * Every mark the entries name, each body once, in the order the entries name them — the
 * footer's ONE row of marks under the facts (owner, 2026-09-29). Marks under each entry
 * grew the footer from one screen (900 px) to 1,173 px at 768 px wide with the production
 * entries, so the entries keep their text lines and the marks share a single row.
 */
export function marksFor(
  entries: readonly string[],
  table: readonly StandardLogoEntry[] = STANDARDS_LOGOS,
): StandardLogo[] {
  const bySlug = new Map<string, StandardLogo>()
  for (const logo of entries.flatMap((entry) => logosFor(entry, table))) {
    if (!bySlug.has(logo.slug)) bySlug.set(logo.slug, logo)
  }
  return [...bySlug.values()]
}

/**
 * ⚠️ RUN APPAREL'S OWN CLIMATE COMMITMENT, NOT A CERTIFICATE, AND NOT AN ENTRY FROM THE CMS (owner,
 * 2026-10-17). The company made the SME Climate Hub's commitment (net zero before 2050, signed
 * 12 October 2026; the Hub's public list shows it), and the Hub's own dashboard names the website
 * footer as a place to show it. Every other mark is a parent's or a supplier's and is drawn only when
 * a CMS entry names it; this one is the company's own, so both footers always draw it: its line
 * last in "Standards", and its badge last in the row of marks, a link to the company's row in the
 * Hub's public list, where a buyer can check it. Drawn at its own size, 107 × 44, not the marks'
 * one area (`markBox`): there it came out 56 × 23, its words unreadable and, as a link, under the
 * 44px a control here must be.
 *
 * ⚠️ "COMMITTED", NEVER "CERTIFIED" (owner, 2026-10-17): a commitment is a promise to act, and the
 * Hub reviews no one. ⚠️ THE BADGE IS FOR ONE YEAR ("Committed 2026"). The Hub keeps a company
 * committed only while it reports each year; the 2027 badge replaces this file and its year.
 */
export const CLIMATE_COMMITMENT = {
  line: 'SME Climate Hub: Committed',
  href: 'https://smeclimatehub.org/our-smes/?search=RUN+APPAREL',
  logo: {
    slug: 'sme-climate-hub',
    src: '/standards/sme-climate-hub-committed-2026.svg',
    width: 107,
    height: 44,
    alt: 'SME Climate Hub Committed 2026',
  },
} as const satisfies { line: string; href: string; logo: StandardLogo }
