'use client'

import { useFormFields } from '@payloadcms/ui'
import type { UIFieldClientComponent } from 'payload'
import { collectPublishProblems, toGateColourways } from '../collections/publishGating'
import { rowsFromFormState } from './formStateRows'

/**
 * "What is still stopping this from going live?"
 *
 * The publish rules were only ever reachable by trying to publish and being
 * refused — one problem per attempt until 2026-08-10, all of them at once after
 * it, but still only *after* pressing Save. At 100+ garments that is a lot of
 * failed saves, so the same pure function now also runs continuously against the
 * form.
 *
 * Reuses `collectPublishProblems` rather than restating the rules. A second copy
 * of publish logic that drifted from the real gate would be worse than no panel:
 * it would say "ready" and then be refused.
 *
 * ONE THING IT CANNOT SEE: the artwork verdict lives on the Media document, not
 * in this form, so a damaged model is not listed here. The real gate still
 * catches it on save. The panel says so rather than implying it checked.
 *
 * ⚠️ THE COLOURS COME FROM `rowsFromFormState`, NOT from `f.colourways.value`.
 * Payload flattens an array field into one entry per row field and exposes no
 * key for the array itself, so the obvious read is silently `undefined` — which
 * made this panel report "This product has no colours yet" on a live product
 * with three complete colours, while every test, the typecheck and the build
 * stayed green. Measured in the running admin on 2026-08-11; see
 * ./formStateRows.ts for the probe output.
 */
export const ReadinessPanel: UIFieldClientComponent = () => {
  const fields = useFormFields(([f]) => ({
    status: f?.status?.value,
    variantMode: f?.variantMode?.value,
    glbAsset: f?.glbAsset?.value,
    variantsVerified: f?.variantsVerified?.value,
    colourways: rowsFromFormState(f as Record<string, { value?: unknown }>, 'colourways'),
  }))

  // Always evaluated as though the owner were publishing, whatever Status says —
  // the question "what is left?" is most useful BEFORE they switch it over.
  const problems = collectPublishProblems(
    {
      id: undefined,
      status: 'published',
      variantMode: fields.variantMode as string | undefined,
      glbAsset: fields.glbAsset,
      variantsVerified: fields.variantsVerified,
    },
    toGateColourways(fields.colourways),
  )

  if (problems.length === 0) {
    return (
      <div className="field-type" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>
          ✅ Ready to publish
          {fields.status === 'published' ? '' : ' — set Status to “Published” when you are'}.
        </p>
        <p className="field-description" style={{ marginTop: 4 }}>
          The printed artwork is checked separately when you save.
        </p>
      </div>
    )
  }

  return (
    <div className="field-type" style={{ marginBottom: 16 }}>
      <p style={{ margin: '0 0 6px', fontWeight: 600 }}>
        {problems.length} thing{problems.length === 1 ? '' : 's'} left before this can go live
      </p>
      <ul style={{ margin: '0 0 6px', paddingLeft: 20 }}>
        {problems.map((problem) => (
          <li key={problem} style={{ marginBottom: 4 }}>
            {problem}
          </li>
        ))}
      </ul>
      <p className="field-description" style={{ marginTop: 0 }}>
        This list updates as you type. You can still save a draft with things missing.
      </p>
    </div>
  )
}
