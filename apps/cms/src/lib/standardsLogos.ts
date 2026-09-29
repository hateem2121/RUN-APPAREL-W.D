/**
 * The certification bodies' logos the footer draws beside the "Standards" entries.
 * Decision record: docs/DECISIONS-BETA-WEBSITE.md D25 (owner, 2026-09-29).
 *
 * ⚠️ THIS IS AN ALLOW-LIST OF WHAT THE COMPANY MAY SHOW, NOT A LIBRARY OF EVERY MARK ON
 * DISK. RUN APPAREL holds no certification in its own name (`lib/companyFacts.ts`
 * CERTIFICATION): the parent, DURUS INDUSTRIES, is SEDEX-registered, SMETA-audited and
 * ISO 9001-certified, and the fabric and trim suppliers hold OEKO-TEX, GOTS, GRS and
 * amfori BSCI. Each record below is a body the owner has named for one of those, so a
 * mark appears only next to the entry that names it. The owner's folder also holds marks
 * the company does NOT claim (ISO 22000, Made in Green, RCS/OCS, sgi) and one it claims
 * in TEXT only — the Securities and Exchange Commission of Pakistan, a regulator, whose
 * emblem beside a supplier list would read as endorsement (owner, 2026-09-29). None of
 * them has a record, and `standardsLogos.test.ts` fails if one appears.
 *
 * ADDING ONE IS ONE TABLE ENTRY: a file in `public/standards/`, its size, and the words
 * that name it. `standardsLogos.test.ts` then checks the file exists at the recorded size.
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

interface StandardLogoEntry extends StandardLogo {
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
const word = (pattern: string) => new RegExp(`(?<![A-Za-z0-9])(?:${pattern})(?![A-Za-z0-9])`, 'i')

export const STANDARDS_LOGOS: readonly StandardLogoEntry[] = [
  {
    slug: 'sedex',
    src: '/standards/sedex.svg',
    width: 104,
    height: 28,
    alt: 'Sedex',
    source: 'Sedex Logo Vector.ai',
    words: word('SEDEX'),
  },
  {
    // SMETA is an audit method, not a certificate — which is why the footer's heading
    // stays "Standards" and the qualifier text stays beside every mark.
    slug: 'smeta',
    src: '/standards/smeta.svg',
    width: 96,
    height: 30,
    alt: 'SMETA',
    source: 'SMETA Logo Vector.ai',
    words: word('SMETA'),
  },
  {
    slug: 'oeko-tex',
    src: '/standards/oeko-tex.svg',
    width: 44,
    height: 62,
    alt: 'OEKO-TEX',
    source: 'OEKO TEX Standart 100.ai',
    words: word('OEKO[-\\s]?TEX'),
  },
  {
    slug: 'gots',
    src: '/standards/gots.svg',
    width: 56,
    height: 56,
    alt: 'GOTS',
    source: 'GOTS Global Organic Textile Standard.ai',
    words: word('GOTS'),
  },
  {
    slug: 'grs',
    src: '/standards/grs.svg',
    width: 104,
    height: 47,
    alt: 'GRS',
    source: 'Global Recycled Standard.ai',
    words: word('GRS'),
  },
  {
    // Held by the SUPPLIERS (owner, 2026-09-29). ⚠️ The owner's file is the OLD mark —
    // "Business Social Compliance Initiative" in a ring, from before the body became
    // amfori — which is why the alt names "amfori BSCI" while the picture does not.
    // "amfori BSCI" in an entry is two words and ONE logo: the match is on BSCI alone.
    slug: 'bsci',
    src: '/standards/bsci.svg',
    width: 72,
    height: 72,
    alt: 'amfori BSCI',
    source: 'BSCI - Business Social Compliance Initiative Logo Vector.ai',
    words: word('BSCI'),
  },
  {
    // ISO 9001 ONLY, held by the parent DURUS (owner, 2026-09-29). The owner's file is a
    // combined badge, ISO 9001 beside ISO 22000; the 9001 half was separated at its own
    // group (no path straddles the gap) and the 22000 half is NOT in this repo. "ISO 22000"
    // names no record, and a test pins that.
    slug: 'iso-9001',
    src: '/standards/iso-9001.svg',
    width: 72,
    height: 72,
    alt: 'ISO 9001',
    source: 'ISO 9001 - ISO 22000 Certified.ai',
    words: word('ISO[-\\s]?9001'),
  },
]

/**
 * The logos an entry's text names — each body once, in the order the entry mentions them.
 * An entry that names none returns [] and the footer draws no picture for it.
 */
export function logosFor(entry: string): StandardLogo[] {
  return STANDARDS_LOGOS.flatMap((logo) => {
    const at = entry.search(logo.words)
    return at < 0 ? [] : [{ at, logo }]
  })
    .sort((a, b) => a.at - b.at)
    .map(({ logo: { slug, src, width, height, alt } }) => ({ slug, src, width, height, alt }))
}
