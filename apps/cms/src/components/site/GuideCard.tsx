import Link from 'next/link'
import type { Guide } from '../../lib/guides'

/**
 * One guide on the guides index: a card that is ONE link, named by the guide's title (visual
 * audit VA-47, 2026-10-02).
 *
 * ⚠️ THE INDEX LISTED EVERY GUIDE TWICE: a card with its own "Read this guide" button, then a chip
 * for the same guide in the list at the foot of the same page. That was 14 links to 7 pages, seven of
 * them all named "Read this guide" and told apart only by the heading before each. Now each guide
 * is one link, on its heading, so a list of the page's links reads as the seven titles.
 *
 * ⚠️ THE WHOLE CARD IS THE TARGET, AND THE LINK IS STILL JUST THE TITLE (Inclusive Components,
 * "Cards", read 2026-10-02): `site.css` stretches the link's `::after` over the card, so a click or
 * tap anywhere on it opens the guide, while the link's accessible name stays the title alone. The
 * description is plain text beside it, never inside the link, so it is not read as part of the name
 * (the family cards make the whole card the `<a>`, so their name is everything inside it).
 * Nothing interactive sits inside another: there is no button, and only one anchor per card.
 *
 * The three words at the foot are the button's own, kept as a quiet cue that the card opens; they are
 * `aria-hidden` because the link already says where it goes, and a second spoken "Read this guide"
 * is exactly the repetition this card removes. No word here is new.
 */
export function GuideCard({ guide }: { guide: Guide }) {
  return (
    <li className="panel guide-card">
      <h2 className="product-card__name">
        <Link className="guide-card__link" href={guide.path}>
          {guide.title}
        </Link>
      </h2>
      <p className="product-card__desc">{guide.description}</p>
      <span className="guide-card__cue" aria-hidden="true">
        Read this guide <b>→</b>
      </span>
    </li>
  )
}
