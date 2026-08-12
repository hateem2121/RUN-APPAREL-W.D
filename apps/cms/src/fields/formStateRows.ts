/**
 * Rebuild an array field's rows from Payload's admin form state.
 *
 * WHY THIS EXISTS, measured in the running admin on 2026-08-11.
 *
 * `useFormFields` does NOT expose an array field as one entry holding its rows.
 * It flattens every row into its own path, and there is no `colourways` key at
 * all. Probing a real product with three colours returned exactly this:
 *
 *   colourways.0.id            colourways.0.displayName   colourways.0.slug
 *   colourways.0.variantId     colourways.0.posterPreview colourways.0.altText
 *   colourways.0.hexSwatch     colourways.0.glbAsset      colourways.0.active
 *   colourways.0.note          colourways.1.id            colourways.1.displayName …
 *
 * So `fields.colourways?.value` is `undefined`. ReadinessPanel read exactly that,
 * handed it to `toGateColourways`, which defensively returns `[]` for a
 * non-array — and the panel therefore told the owner "This product has no
 * colours yet" on a LIVE product with three colours, all of them complete.
 *
 * Nothing could catch it short of opening the page: the value is typed
 * `unknown`, so TypeScript is satisfied; `toGateColourways`'s defensive branch
 * is correct in isolation and unit-tested; the build passes; and the server-side
 * gate reads the document rather than form state, so publishing kept working.
 * The panel was confidently wrong and everything around it was green — which is
 * this repo's documented failure shape: the tests could not exhibit the failure.
 */

/** One entry of Payload's form state, reduced to the part that matters here. */
interface FormField {
  value?: unknown
}

/**
 * Collect `<name>.<index>.<prop>` entries back into row objects, ordered by
 * index.
 *
 * Only direct scalar properties of a row are taken. A deeper path
 * (`colourways.0.something.else`) belongs to a nested field and is skipped
 * rather than flattened into the row under a dotted key, which would make a row
 * look like it had a property it does not.
 */
export function rowsFromFormState(
  fields: Record<string, FormField | undefined> | undefined,
  name: string,
): Record<string, unknown>[] {
  if (!fields) return []
  const prefix = `${name}.`
  const byIndex = new Map<number, Record<string, unknown>>()

  for (const key of Object.keys(fields)) {
    if (!key.startsWith(prefix)) continue
    const rest = key.slice(prefix.length)
    const dot = rest.indexOf('.')
    if (dot <= 0) continue
    const index = Number(rest.slice(0, dot))
    if (!Number.isInteger(index) || index < 0) continue
    const prop = rest.slice(dot + 1)
    // Nested field, not a row scalar — see the note above.
    if (prop === '' || prop.includes('.')) continue

    let row = byIndex.get(index)
    if (!row) {
      row = {}
      byIndex.set(index, row)
    }
    row[prop] = fields[key]?.value
  }

  return [...byIndex.entries()].sort(([a], [b]) => a - b).map(([, row]) => row)
}
