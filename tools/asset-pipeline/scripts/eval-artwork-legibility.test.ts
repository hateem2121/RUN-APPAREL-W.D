import { describe, expect, it } from 'vitest'
import { MAX_CHANGED_FRACTION } from './eval-artwork-legibility.mjs'

/**
 * The damage ceiling is PINNED (fix plan Rank 13, audit HE-04). Until 2026-09-03 the
 * constant in eval-artwork-legibility.mjs could be raised from 5% to 9% — past the
 * negative control's own reading — and every test stayed green. The ceiling is a
 * calibration (the table above the constant: fidelity 1.650%, balanced 3.070%, control
 * 9.370% on 2026-08-06), so the only legitimate way to move it is to re-run
 * `--calibrate`, look at the contact sheet, and change BOTH this test and the table.
 */
describe('the artwork damage ceiling', () => {
  it('is the calibrated 5%, and stays so until somebody re-calibrates with a contact sheet', () => {
    expect(MAX_CHANGED_FRACTION).toBe(0.05)
  })
})
