import { type SpecItem, specGroups, type ViewerProduct } from '@run-apparel/shared'

/**
 * THE GARMENT'S FACTS AS FOUR MATCHING GROUPS OF BULLETS (polish D10, owner-approved 2026-10-03).
 *
 * Fabric, Weight, Fit and Performance, each a list, each bullet the same lime ring (Q5). A bullet
 * with a note from the glossary opens to show it: "things that look alike are read as belonging
 * together" (NN/g, "Similarity Principle in Visual Design", 6 Sep 2020), so four alike corners
 * read as one set of facts instead of four kinds of label.
 *
 * Drawn in ONE of two places, never both (App.tsx decides, `specsInCorners`):
 *   - `corners`: over the 3D window on every computer, Fabric top-left, Weight top-right, Fit
 *     bottom-left, Performance bottom-right, with no box behind them (page.css).
 *   - `list`: under the description everywhere else, in two columns that mirror the corners.
 * They replace the four `.callout`s over the garment and the `.spec-list` under it, which said
 * the same facts by two CSS breakpoints that had to be kept equal by a test.
 *
 * ⚠️ NATIVE `<details name>`, NOT A BUTTON THAT TOGGLES A PARAGRAPH. Content hidden with
 * `display: none` is out of reach of Find in page and of screen readers; a closed `<details>`
 * keeps its note "searchable and accessible ... by default", which is why the guide prefers it to
 * `hidden="until-found"` (not in Safari) for exactly this (modern-web-guidance
 * "search-hidden-content", read 2026-10-04). Its exclusive-accordion pattern is one shared `name`:
 * opening one note closes the open one, as the approved mockup did. A browser without `name`
 * lets two stay open, which only costs some room.
 */

/** One name for every note on the page: opening one closes the others. */
export const SPEC_NOTES_NAME = 'spec-notes'

interface SpecGroupsProps {
  product: ViewerProduct
  placement: 'corners' | 'list'
}

/**
 * A key for each bullet that stays distinct when the same words are typed twice: the CMS holds
 * features as free text, so two rows can read alike (`['a', 'a', 'b']` gives `a#1`, `a#2`,
 * `b#1`). The order is the CMS's and never changes between renders.
 */
function withKeys(items: SpecItem[]): { item: SpecItem; key: string }[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const occurrence = (seen.get(item.text) ?? 0) + 1
    seen.set(item.text, occurrence)
    return { item, key: `${item.text}#${occurrence}` }
  })
}

function Bullet({ item }: { item: SpecItem }) {
  const row = (
    <>
      <span className="spec-item__bullet" aria-hidden="true" />
      <span className="spec-item__text">{item.text}</span>
    </>
  )
  if (!item.note) return <span className="spec-item__row">{row}</span>
  return (
    <details className="spec-item" name={SPEC_NOTES_NAME}>
      <summary className="spec-item__row">{row}</summary>
      <p className="spec-item__note">{item.note}</p>
    </details>
  )
}

export function SpecGroups({ product, placement }: SpecGroupsProps) {
  // `specs` is the CMS's, with the notes. An answer cached before the field existed has none:
  // the same groups are built here from the plain fields, with no notes, so nothing is lost.
  const groups = product.specs ?? specGroups(product)
  if (groups.length === 0) return null
  const list = (
    <dl className={`spec-groups spec-groups--${placement}`}>
      {groups.map((group) => (
        <div key={group.key} className={`spec-group spec-group--${group.key}`}>
          <dt className="spec-group__heading">{group.heading}</dt>
          <dd className="spec-group__body">
            {/*
              `role="list"` because `list-style: none` makes Safari drop a list's semantics unless
              the role is written out (visual audit VA-59; the Chrome team's guidance says the same).
            */}
            {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics under list-style: none unless the role is written out */}
            <ul className="spec-group__items" role="list">
              {withKeys(group.items).map(({ item, key }) => (
                <li key={key}>
                  <Bullet item={item} />
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  )
  // Under the description the list sits in a frame whose width decides two columns or one
  // (`.spec-groups-frame`, page.css): a container cannot restyle its own grid, only its children.
  return placement === 'list' ? <div className="spec-groups-frame">{list}</div> : list
}
