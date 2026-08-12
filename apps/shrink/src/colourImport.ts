import { type FileColour, type ImportedRow, buildImportedRow } from '@run-apparel/shared'

/**
 * Should this run add the file's own colours to the product, and if not, what
 * does the owner need to be told?
 *
 * Modelled directly on `planModelAttach` in ./attach.ts — same shape, same
 * reporting-rather-than-throwing behaviour, and the same kind of two refusals
 * that are the whole safety argument, not caution. Read that file's header
 * first; this one only restates what is specific to colours.
 *
 * WHY IMPORT AT ALL. The owner used to have to open the Colours tab and press
 * "Add the ticked colours" by hand for every garment the robot finished — a
 * button they had to know to look for. On 2026-08-03 N001's file held five
 * colourways and the CMS had three rows; the other two were invisible to every
 * buyer, and the only way to discover them was to open the GLB. At 100+
 * garments that is 100 opportunities to not find the button.
 *
 * THE TWO REFUSALS BELOW ARE THE WHOLE SAFETY ARGUMENT, not caution:
 *
 *   - `published`. `colourways` is in the CMS's GATED_FIELDS, so writing it
 *     re-runs the publish gate. On a draft `assertPublishable` returns on its
 *     first line, so the write cannot throw. On a LIVE product it can — and a
 *     gate rejecting the robot's own write is exactly the 2026-07-29 bug that
 *     GATED_FIELDS exists to prevent. Never write to a published one.
 *   - already has at least one colour row. Appending to a product the owner has
 *     already set up is a surprise, not a convenience — this only ever touches
 *     a product nobody has configured yet. The "Add the ticked colours" button
 *     stays for every other case and must keep working unchanged.
 *
 * Every returned row arrives `active: false` and a low-confidence match arrives
 * with no name — both are `buildImportedRow`'s rules, reused rather than
 * re-implemented, so this can never drift from what the button does by hand.
 */

/** What the target product looks like right now, or null if it cannot be read. */
export interface ProductState {
  status: string | null
  colourwayCount: number
}

export function planColourImport(
  product: ProductState | null,
  fileColours: FileColour[],
): { rows: ImportedRow[]; note?: string } | { rows: null; note: string } {
  // Nothing in the file to import. This is the ordinary case for a container
  // built before per-variant colour detail existed, or a file with no readable
  // colour metadata — not a decision the owner needs told about, so silence
  // rather than a note that would say nothing actionable.
  if (fileColours.length === 0) return { rows: null, note: '' }

  // The product could not be verified, so neither refusal below can be checked
  // safely — refuse rather than guess. Silent rather than "could not check the
  // product": `product` being null here conflates a genuine read failure with
  // "no target product on this upload at all" (readable only on a row created
  // before that field was required, same as planModelAttach's `targetProductId
  // == null` case), and the attach write right after this one already reports
  // a read failure for the SAME job. A second, near-identical note for the
  // same cause is the noise the empty-file case above exists to avoid; a wrong
  // one (for the "no target at all" case) is worse than none.
  if (!product) return { rows: null, note: '' }

  if (product.status === 'published') {
    return {
      rows: null,
      note:
        '\n\nThis product is already live, so the colours found in your file were NOT added ' +
        'automatically — adding rows to a published page is your decision, not the robot’s. ' +
        'Open the product’s Colours tab and press “Add the ticked colours” when you are ready.',
    }
  }

  if (product.colourwayCount > 0) {
    return {
      rows: null,
      note:
        '\n\nThis product already has colours set up, so the ones found in your file were NOT added ' +
        'automatically — appending to colours you have already configured would be a surprise, not a ' +
        'convenience. Open the product’s Colours tab and press “Add the ticked colours” if you want more.',
    }
  }

  // Re-read the growing list on every row, exactly as ImportColoursFromFile's
  // own "Add the ticked colours" button does (apps/cms/src/fields/
  // ImportColoursFromFile.tsx) — two file colours that resolve to the same slug
  // must not collide with EACH OTHER. There are no pre-existing rows to collide
  // with here: colourwayCount === 0, refused above otherwise.
  const rows: ImportedRow[] = []
  for (const colour of fileColours) {
    rows.push(buildImportedRow(colour, rows))
  }

  return {
    rows,
    note:
      `\n\nAdded ${rows.length} colour${rows.length === 1 ? '' : 's'} found in your file to the ` +
      'Colours tab, switched off. Nothing has changed for buyers — open the tab to name any that ' +
      'need one and switch on the ones you want to sell.',
  }
}
