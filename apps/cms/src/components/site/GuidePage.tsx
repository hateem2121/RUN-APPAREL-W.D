import { buildViewerPath, GARMENT_PATH_PREFIX } from '@run-apparel/shared'
import { FAQ_INDEX, faqTopicAt, faqTopicForGuide } from '../../lib/faqs'
import { GLOSSARY_INDEX } from '../../lib/glossary'
import { IntentLink as Link } from './IntentLink'
import { type CSSProperties, Fragment, type ReactNode } from 'react'
import { FACTORY_PHOTOS, factoryPhotoImage, wholePhoto } from '../../lib/factoryPhotos'
import { FAMILIES } from '../../lib/families'
import { familyPageFor } from '../../lib/familyPages'
import {
  GUIDES_INDEX,
  type Guide,
  type GuideBlock,
  type GuideGarments,
  type GuideLink,
  type GuideSource,
  guideAt,
  legalLine,
  READ_NEXT,
} from '../../lib/guides'
import { formatPostDate } from '../../lib/journal'
import type { ProductCard } from '../../lib/projectPublic'
import type { TemplateNotice } from '../../lib/templateDownload'
import { guideArticleJsonLd, guideBreadcrumbJsonLd } from '../../lib/structuredData'
import { SiteClosing } from './ArticleParts'
import { Byline } from './Byline'
import { FactoryFigure, HALF_COLUMN_SIZES } from './FactoryFigure'
import { JsonLd } from './JsonLd'
import { GuideToolBlock } from './GuideTools'
import { OrderSteps } from './OrderSteps'
import { PhotoStage } from './PhotoStage'
import { TemplateDownload } from './TemplateDownload'

/** A block's React key: its own first words, so a list of blocks keys without an index. */
export function blockKey(block: GuideBlock): string {
  if (block.kind === 'orderSteps') return 'order-steps'
  if (block.kind === 'table') return block.caption
  if (block.kind === 'list') return block.items[0] ?? 'list'
  // One legal line per section, so its date keys it within the section.
  if (block.kind === 'legal') return `legal-${block.checked}`
  if (block.kind === 'download') return `download-${block.template}`
  if (block.kind === 'tool') return `tool-${block.tool}`
  return 'title' in block ? block.title : block.text
}

/**
 * One link inside a guide's words (`GuideLink`). A garment (`/products/<slug>`) links to its default
 * colour's page, read from the live catalogue as the garment links at a guide's end are: the address
 * without a colour answers only the viewer's empty shell (measured live, 2026-11-06: no title of its
 * own, no canonical). It is a plain anchor, because the viewer Worker draws garment pages, not Next.
 * A garment the catalogue does not hold is drawn as plain words, never linked dead. Every other page
 * is a site page and gets the site's link (`IntentLink`).
 */
function GuideAnchor({ link, cards }: { link: GuideLink; cards: readonly ProductCard[] }) {
  if (link.href.startsWith(`${GARMENT_PATH_PREFIX}/`)) {
    const slug = link.href.slice(GARMENT_PATH_PREFIX.length + 1)
    const card = cards.find((entry) => entry.slug === slug)
    if (!card) return link.phrase
    return (
      <a
        className="prose__link"
        href={buildViewerPath(card.slug, card.defaultColourSlug, GARMENT_PATH_PREFIX)}
      >
        {link.phrase}
      </a>
    )
  }
  return (
    <Link className="prose__link" href={link.href}>
      {link.phrase}
    </Link>
  )
}

/**
 * Words with their links (`GuideLink`): each phrase becomes a link where it first appears, and the
 * words around it are drawn as they are. A phrase not found is drawn as plain words (`guides.test.ts`
 * fails it before it ships), and one inside an earlier link's words is left plain, so links never nest.
 */
export function LinkedWords({
  text,
  links,
  cards = [],
}: {
  text: string
  links?: readonly GuideLink[]
  cards?: readonly ProductCard[]
}) {
  if (!links?.length) return text
  const spots = links
    .flatMap((link) => {
      const at = text.indexOf(link.phrase)
      return at < 0 ? [] : [{ at, end: at + link.phrase.length, link }]
    })
    .sort((a, b) => a.at - b.at)
  const parts: ReactNode[] = []
  let from = 0
  for (const spot of spots) {
    if (spot.at < from) continue
    parts.push(<Fragment key={`w${from}`}>{text.slice(from, spot.at)}</Fragment>)
    parts.push(<GuideAnchor key={`a${spot.at}`} link={spot.link} cards={cards} />)
    from = spot.end
  }
  parts.push(<Fragment key={`w${from}`}>{text.slice(from)}</Fragment>)
  return parts
}

/**
 * A heading with each hyphenated word kept whole (the buyer library, 2026-11-06): "What moisture-wicking
 * means" wrapped at its hyphen in the section type, which TY-12 (`e2e/composition.spec.ts`) refuses as a
 * split word. A no-wrap span changes no character, where a no-break hyphen could be missing from the
 * font. Words without a hyphen are drawn as they are.
 */
export function WholeWords({ text }: { text: string }) {
  if (!/\w-\w/.test(text)) return text
  return text.split(/(\s+)/).map((part, index) =>
    /\w-\w/.test(part) ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed heading, never reordered.
      <span className="whole-word" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  )
}

/**
 * ⚠️ A HEADLINE WITH A VERY LONG WORD SHRINKS TO FIT IT (the buyer library, 2026-11-06), the owner's
 * rule of 2026-09-11 for the home and contact headlines: a slightly smaller headline over a split
 * word. "manufacturing," (14 letters) drew 397px in a 350px column at 390px, and "moisture-wicking",
 * kept whole by `WholeWords`, 518px in a 428px half-row at 1024px (measured in Chromium that day).
 * The words keep the heading's size until the longest word would not fit its own column
 * (`100cqi`, the heading being the container), then shrink just enough. 0.9em a letter is 4% above
 * the widest long word measured (0.865em). Only headings with a word of `FIT_FROM_LETTERS` or more
 * carry it, so every other heading on the site is unchanged. TY-12 (e2e/composition.spec.ts) judges it.
 */
export const FIT_FROM_LETTERS = 11

/** The heading's longest word, as the line breaks see it (a hyphenated word is kept whole). */
export function longestWord(text: string): number {
  return Math.max(0, ...text.split(/\s+/).map((word) => word.length))
}

/**
 * ⚠️ A LETTER IS NOT A UNIT OF WIDTH (C1, 2026-11-06). "MEASUREMENTS" is 12 letters and 11.03em in the
 * section heading's face (0.919em a letter, past the 0.9 above): its two M's are 1.13em each where an
 * I is 0.37em, and TY-12 caught it splitting in three of the tech pack guide's headings. So the count
 * the CSS divides by is the word's real width: each character's advance, measured in Chromium on
 * 2026-11-06 (uppercase Archivo as the headings draw it, tracking included, in em), plus the same 4%,
 * in "0.9em letters". Never fewer than the word's letters, so no heading shrinks less than before.
 */
const ADVANCE_EM: Readonly<Record<string, number>> = {
  A: 0.914,
  B: 0.895,
  C: 0.91,
  D: 0.903,
  E: 0.833,
  F: 0.776,
  G: 0.98,
  H: 0.969,
  I: 0.372,
  J: 0.73,
  K: 0.943,
  L: 0.748,
  M: 1.13,
  N: 0.967,
  O: 0.977,
  P: 0.835,
  Q: 0.977,
  R: 0.908,
  S: 0.846,
  T: 0.836,
  U: 0.951,
  V: 0.895,
  W: 1.185,
  X: 0.92,
  Y: 0.914,
  Z: 0.84,
  '0': 0.773,
  '1': 0.702,
  '2': 0.771,
  '3': 0.775,
  '4': 0.775,
  '5': 0.775,
  '6': 0.777,
  '7': 0.713,
  '8': 0.788,
  '9': 0.777,
  '-': 0.396,
  '’': 0.302,
  "'": 0.292,
  ',': 0.353,
  '.': 0.353,
  ':': 0.347,
  ';': 0.354,
  // biome-ignore lint/suspicious/noApproximativeNumericConstant: the question mark's measured advance, not one over root two
  '?': 0.707,
  '!': 0.361,
  '(': 0.372,
  ')': 0.372,
  '&': 1.008,
  '%': 1.123,
  '/': 0.298,
}

/** A word's width in em, as the headings draw it; a character not measured counts as the widest, W. */
export function wordEm(word: string): number {
  let width = 0
  for (const char of word.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()) {
    width += ADVANCE_EM[char] ?? 1.185
  }
  return width
}

/** The `--fit-letters` a heading's words need: their widest, in 0.9em letters with a 4% margin. */
export function fitLetters(text: string): number {
  return Math.max(
    0,
    ...text
      .split(/\s+/)
      .map((word) => Math.max(word.length, Math.ceil(((wordEm(word) * 1.04) / 0.9) * 100) / 100)),
  )
}

/**
 * " fit-heading" for a heading with a word long enough to need it (`FitWords`), else nothing. A suffix
 * inside the heading's own template literal, so `headlineLeading.test.ts` still reads its classes.
 */
function fitSuffix(text: string): string {
  return longestWord(text) >= FIT_FROM_LETTERS ? ' fit-heading' : ''
}

/** The heading's words inside the span that shrinks them, when it needs to (`fitSuffix`). */
function FitWords({ text, children }: { text: string; children: ReactNode }) {
  if (longestWord(text) < FIT_FROM_LETTERS) return children
  return (
    <span className="fit-words" style={{ '--fit-letters': fitLetters(text) } as CSSProperties}>
      {children}
    </span>
  )
}

/** A list's links, each given only to the first item that holds its phrase. */
function linksByItem(items: readonly string[], links: readonly GuideLink[] = []) {
  const given = new Set<GuideLink>()
  return items.map((item) =>
    links.filter((link) => {
      if (given.has(link) || !item.includes(link.phrase)) return false
      given.add(link)
      return true
    }),
  )
}

/**
 * One buyer guide (2026-09-30). Every word comes from `lib/guides.ts`, which the owner
 * approved; this file only lays it out, from pieces the site already has.
 *
 * ⚠️ ONE PRIMARY BUTTON, at the end, in the buyer pages' words (`e2e/copy.spec.ts`, CT-08).
 * A guide is read top to bottom, so the way in comes after the answer, not before it.
 *
 * The closing heading and sentence are the home page's own (its closing ask under №05,
 * `FactsBento.tsx`; №06 until 2026-10-16), so the guides add no claim the site does not
 * already make.
 */
export function Block({
  block,
  cards = [],
  notice = null,
}: {
  block: GuideBlock
  /** The live catalogue, so a link to a garment finds its default colour (`GuideAnchor`). */
  cards?: readonly ProductCard[]
  /** A refused template download's message, from the page's address (the download block only). */
  notice?: TemplateNotice | null
}) {
  // The home page's eight cards, not a copy (polish D4, the owner's answer Q41).
  if (block.kind === 'orderSteps') return <OrderSteps />
  if (block.kind === 'download') return <TemplateDownload notice={notice} />
  if (block.kind === 'tool') return <GuideToolBlock tool={block.tool} />
  if (block.kind === 'table') return <GuideTable block={block} />
  if (block.kind === 'text') {
    return (
      <p>
        <LinkedWords text={block.text} links={block.links} cards={cards} />
      </p>
    )
  }
  if (block.kind === 'legal') return <p className="guide-legal">{legalLine(block.checked)}</p>
  if (block.kind === 'label') return <p className="subhead">{block.text}</p>
  if (block.kind === 'point') {
    return (
      <div>
        <h3 className="product-card__name prose__heading">{block.title}</h3>
        <p>{block.text}</p>
      </div>
    )
  }
  const List = block.ordered ? 'ol' : 'ul'
  const itemLinks = linksByItem(block.items, block.links)
  return (
    <List className="prose__list">
      {block.items.map((item, index) => (
        <li key={item}>
          <LinkedWords text={item} links={itemLinks[index]} cards={cards} />
        </li>
      ))}
    </List>
  )
}

/**
 * A table of the guide's own words (polish X22): a caption, a header per column (`scope="col"`)
 * and each row's first cell as its header (`scope="row"`), the markup of W3C WAI's "Tables with
 * two headers" (read 2026-10-05), so a screen reader names the method with every cell.
 *
 * ⚠️ TWO COLUMNS OF SHORT WORDS, SO IT STAYS A TABLE ON A 320px PHONE. No `display` is changed on
 * any table part, which is what has stripped a table's meaning in browsers (Safari until 17, per
 * Adrian Roselli's "Tables, CSS Display Properties, and ARIA", updated 7 Oct 2023), and nothing
 * scrolls sideways. A wider table would need the stacked layout instead (web-guidance
 * "responsive-table", index of 4 September 2026).
 */
function GuideTable({ block }: { block: Extract<GuideBlock, { kind: 'table' }> }) {
  const stack = isWideTable(block)
  const table = (
    <table className={stack ? 'guide-table guide-table--stack' : 'guide-table'}>
      <caption className="product-card__name">{block.caption}</caption>
      <thead>
        <tr>
          {block.columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map(([head, ...cells]) => (
          <tr key={head}>
            <th scope="row">{head}</th>
            {cells.map((cell, index) => (
              // In the stacked layout each cell names its column (the header row is hidden there).
              <td key={cell} data-label={stack ? block.columns[index + 1] : undefined}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
  // The stacked layout answers to the table's own width (a container query), not the screen's.
  return stack ? <div className="guide-table-wrap">{table}</div> : table
}

/**
 * ⚠️ A WIDE TABLE IS STACKED (the buyer library, 2026-11-06): three or more columns with a sentence in
 * a cell. Seven such tables ran past a 320px phone, and squeezing them broke words letter by letter
 * (seen in screenshots that day). In a narrow column each row becomes one block: its heading, then
 * each cell under its column's name, the header row hidden, as web-guidance's "responsive-table"
 * lays it out (retrieved 2026-11-06). Every other table stays a table at every width.
 */
export const STACK_FROM_CHARACTERS = 40
/**
 * Or a word this long: a third of a 280px column holds about nine letters, and WebKit would not break
 * "Polypropylene" in the fibers guide's three-column table of names (a cell cut at 320px, 2026-11-06).
 * The other three-column tables' longest words are 10 letters, and they fit in all three engines.
 */
export const STACK_FROM_LETTERS = 12

export function isWideTable(block: Extract<GuideBlock, { kind: 'table' }>): boolean {
  return (
    block.columns.length >= 3 &&
    block.rows.some((row) =>
      row.some(
        (cell) =>
          cell.length > STACK_FROM_CHARACTERS ||
          cell.split(/\s+/).some((word) => word.length >= STACK_FROM_LETTERS),
      ),
    )
  )
}

/**
 * One of the owner's factory photos under a section's heading (polish X22), in the heading's half
 * of the `.spread` from 900px, which was empty beside the words. That half is `.about`'s half (the
 * same grid and gap, site.css), so the photo asks for `HALF_COLUMN_SIZES`; the files and their
 * widths are `factoryPhotos.ts`'s (`factoryPhotoImage`), as `OrderSteps.tsx` reads them.
 *
 * `priority` is true for ONE figure per page: the photo of the guide's FIRST section, the first
 * spread under the hero (see `GuidePage`). It loads eager at high priority (`FactoryFigure.tsx`
 * says why); every later section's photo stays lazy.
 */
function SectionPhoto({ slug, priority }: { slug: string; priority: boolean }) {
  const photo = FACTORY_PHOTOS.find((entry) => entry.slug === slug)
  // `guides.test.ts` fails a slug with no photo; drawing nothing is the safe miss in production.
  if (!photo) return null
  // Every width the photo has (polish X16 added larger ones for sharp screens), as №01 asks.
  return (
    <FactoryFigure
      photo={photo}
      {...factoryPhotoImage(photo)}
      sizes={HALF_COLUMN_SIZES}
      priority={priority}
    />
  )
}

/** One group of links at the end of a page, under its own heading; `why` is drawn under a link. */
function LinkGroup({
  id,
  title,
  level,
  links,
}: {
  id: string
  title: string
  level: 'h2' | 'h3'
  links: readonly { href: string; name: string; why?: string }[]
}) {
  const Heading = level
  return (
    <div className="see-also__group">
      <Heading className="product-card__name" id={id}>
        {title}
      </Heading>
      <ul className="see-also__list">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.name}</Link>
            {link.why ? <p className="see-also__why">{link.why}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The reference garments that show this guide's subject (`GuideGarments`, guides.ts; the owner's
 * picks, 2026-10-08): each garment's name linked to its default colour, and under it its type and
 * what its page names. Drawn as the end links are (`.see-also__list`, 44px rows). Plain anchors:
 * the viewer Worker draws garment pages, not Next (`LinkList` in ArticleParts.tsx says why). A
 * garment the catalogue no longer holds is left out; with none left, nothing is drawn.
 */
function GuideGarmentsSection({
  garments,
  cards,
}: {
  garments: GuideGarments
  cards: readonly ProductCard[]
}) {
  const links = garments.picks.flatMap((pick) => {
    const card = cards.find((entry) => entry.slug === pick.slug)
    if (!card?.defaultColourSlug) return []
    return [
      {
        href: buildViewerPath(card.slug, card.defaultColourSlug, GARMENT_PATH_PREFIX),
        name: card.productName,
        detail: [card.garmentType, pick.shows].filter(Boolean).join(' · '),
      },
    ]
  })
  if (links.length === 0) return null
  return (
    <section className="site-section" data-site-reveal>
      <div className="site-container prose prose--guide spread">
        <h2 className="display display--section">{garments.heading}</h2>
        <div className="spread__body">
          <ul className="see-also__list">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.name}</a>
                {link.detail ? <p className="see-also__why">{link.detail}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/**
 * The other guides and the buyer pages, in two groups, each under its own heading (polish X22).
 *
 * ⚠️ NOT ONE CLOUD OF CHIPS. The audit of 3 October 2026: "links to other guides and to product
 * families sit together in one cloud of 12 small 'filter' chips under the quote button". The chips
 * were `/products`' filter chips, so they also looked like filters. Now each group is a list of
 * plain links, drawn as "On this page" draws its links on the legal pages (44px rows), side by
 * side from 900px. The headings are words the site already uses for the same pages: "Buyer guides"
 * (the guides' own index) and "What we make" (the home page's №02, and the footer's group of the
 * same four pages). Every link that was a chip is still here.
 *
 * ⚠️ STILL A GROUP OF ITS OWN UNDER "More to read" (polish X2, 2026-10-04). Measured 0px between
 * "Get a free quote" and the first chip, on a phone and a computer, and the two rows read as one.
 * The visible title is also the navigation's name (`e2e/composition.spec.ts` reads it).
 *
 * `guides={false}` leaves the guides out: the index shows every guide as a card already, so the
 * same seven as links was the repetition VA-47 removed (2026-10-02). There the one group left is
 * the navigation itself, named by its own `h2` (the cards above it are `h2`s), with no "More to
 * read" over it: four buyer pages are not reading.
 */
/** How a source's date reads under it: "Read October 8, 2026", "Published August 11, 2026". */
const SOURCE_DATE = { read: 'Read', published: 'Published', updated: 'Updated' } as const

/**
 * The official pages a guide quotes (2026-10-08, the country comparison), each a plain link out
 * with its date under it, so a reader and an AI tool can check every claim. Drawn as the end links
 * are (`.see-also__list`, 44px rows).
 */
function GuideSources({ sources }: { sources: readonly GuideSource[] }) {
  return (
    <section className="site-section" data-site-reveal>
      <div className="site-container prose prose--guide spread">
        <h2 className="display display--section">Sources</h2>
        <div className="spread__body">
          <ol className="see-also__list guide-sources">
            {sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} rel="noopener">
                  {source.name}
                </a>
                <p className="see-also__why">
                  {SOURCE_DATE[source.kind]}{' '}
                  <time dateTime={source.date}>{formatPostDate(source.date)}</time>
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

export function GuideLinks({ current, guides = true }: { current: string; guides?: boolean }) {
  const buyerPages = FAMILIES.flatMap((family) => {
    const page = familyPageFor(family)
    return page ? [{ href: page.path, name: family.name }] : []
  })
  if (!guides) {
    return (
      <nav className="see-also" aria-labelledby="what-we-make">
        <LinkGroup id="what-we-make" title="What we make" level="h2" links={buyerPages} />
      </nav>
    )
  }
  // The guide's FAQ topic and the glossary (PLAN.md Task 3.4, shown to the owner 2026-10-07).
  const topic = faqTopicForGuide(current)
  const answers = [
    ...(topic ? [{ href: topic, name: faqTopicAt(topic).title }] : []),
    { href: FAQ_INDEX.path, name: 'All questions' },
    { href: GLOSSARY_INDEX.path, name: GLOSSARY_INDEX.title },
  ]
  /*
   * 2–3 guides to read next, each with its own approved description as the reason (owner,
   * 2026-10-08), where every other guide used to be listed with none. `READ_NEXT` says which.
   */
  const readNext = [
    ...(READ_NEXT[current] ?? []).map((path) => {
      const next = guideAt(path)
      return { href: next.path, name: next.title, why: next.description }
    }),
    { href: GUIDES_INDEX.path, name: 'All guides' },
  ]
  return (
    <nav className="see-also" aria-labelledby="more-to-read">
      <p className="subhead" id="more-to-read">
        More to read
      </p>
      <div className="see-also__groups">
        <LinkGroup id="read-next" title="Read next" level="h3" links={readNext} />
        <LinkGroup id="more-families" title="What we make" level="h3" links={buyerPages} />
        <LinkGroup id="more-answers" title="Answers" level="h3" links={answers} />
      </div>
    </nav>
  )
}

/**
 * `cards` is the live catalogue, for the guides that link reference garments (the 3D, printing
 * and fabrics guides' routes read it); without it those links are simply not drawn.
 */
export function GuidePage({
  guide,
  cards = [],
  notice = null,
}: {
  guide: Guide
  cards?: readonly ProductCard[]
  /** A refused template download's message (`templateNotice`), for the tech-pack guide's form. */
  notice?: TemplateNotice | null
}) {
  // A headline with a very long word shrinks to fit it (`FitWords`); read before the markup so the
  // className stays one template literal (`headlineLeading.test.ts` reads it).
  const heroFit = fitSuffix(`${guide.heading} ${guide.headingAccent}`)
  return (
    <>
      <JsonLd data={guideBreadcrumbJsonLd(guide)} />
      {/* Who wrote it and when its words last changed, as Article data (findability audit,
          2026-10-08); the same facts as the byline under the lede, from `bylines.ts`. */}
      <JsonLd data={guideArticleJsonLd(guide)} />

      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">[ Buyer guide ]</p>
          {/* `hero-guide`: this headline never swaps fonts mid-visit (site.css, 2026-10-01).
              `display--long`: 36-46 characters, so a phone sets it with more air (base.css, VA-45). */}
          <h1 className={`display display--hero display--long hero-guide${heroFit}`}>
            <FitWords text={`${guide.heading} ${guide.headingAccent}`}>
              {guide.heading} <span className="serif-accent">{guide.headingAccent}</span>
            </FitWords>
          </h1>
          <p className="site-lede site-lede--guide">{guide.lede}</p>
          <Byline path={guide.path} reviewed={guide.reviewed} />
        </div>
      </section>

      {/* Each section's heading on the left and its words on the right from 900px (`.spread`,
          polish D1): the words keep their 50ch measure, and the heading fills the half beside them.
          A section with a photo puts it under its heading, in that half (polish X22); on a phone
          it comes between the heading and the words, as the markup has it. */}
      {guide.sections.map((section, index) => {
        const heading = (
          <h2 className={`display display--section${fitSuffix(section.heading)}`}>
            <FitWords text={section.heading}>
              <WholeWords text={section.heading} />
            </FitWords>
          </h2>
        )
        const garments =
          guide.garments?.after === section.heading ? (
            <GuideGarmentsSection garments={guide.garments} cards={cards} />
          ) : null
        /*
         * A section with a whole photo (the owner's rule of 2026-11-05: a new picture is never cut and
         * is the whole background of its screen): the photo fills the stage and the section's heading
         * and words sit on its ink panel, as the buyer pages draw their order block (`PhotoStage`).
         */
        if (section.stage) {
          return (
            <Fragment key={section.heading}>
              <PhotoStage photo={wholePhoto(section.stage)}>
                {heading}
                {section.blocks.map((block) => (
                  <Block key={blockKey(block)} block={block} cards={cards} notice={notice} />
                ))}
              </PhotoStage>
              {garments}
            </Fragment>
          )
        }
        // The order steps are four full-screen cards (D42; the owner chose the guide's to match the
        // home page's, 2026-10-16): the heading in the column, the cards the screen's width under
        // it, as №04 draws them. `guides.test.ts` holds the steps alone in their section.
        if (section.blocks.length === 1 && section.blocks[0]?.kind === 'orderSteps') {
          return (
            <Fragment key={section.heading}>
              {/* The heading rises in, not the section: a stopped card moves with a moved
                  ancestor, so the whole section rising made the first stopped card drift (home
                  page audit, 2026-10-17; as №04's, OrderTimeline.tsx). */}
              <section className="site-section order-section">
                <div className="site-container prose prose--guide" data-site-reveal>
                  {heading}
                </div>
                <OrderSteps />
              </section>
              {garments}
            </Fragment>
          )
        }
        return (
          <Fragment key={section.heading}>
            <section className="site-section" data-site-reveal>
              <div className="site-container prose prose--guide spread">
                {section.photo ? (
                  <div className="spread__head">
                    {heading}
                    {/* Only the first section is the first spread under the hero, so only its
                        photo is fetched early: the rest are further down, where lazy is right.
                        Of the five guides with photos, the minimum-order and printing guides
                        start with one (guides.ts); the other three have theirs later. */}
                    <SectionPhoto slug={section.photo} priority={index === 0} />
                  </div>
                ) : (
                  heading
                )}
                <div className="spread__body">
                  {section.blocks.map((block) => (
                    <Block key={blockKey(block)} block={block} cards={cards} notice={notice} />
                  ))}
                </div>
              </div>
            </section>
            {garments}
          </Fragment>
        )
      })}

      {guide.sources ? <GuideSources sources={guide.sources} /> : null}

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <SiteClosing />
          <GuideLinks current={guide.path} />
        </div>
      </section>
    </>
  )
}
