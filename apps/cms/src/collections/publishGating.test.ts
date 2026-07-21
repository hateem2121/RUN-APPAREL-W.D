import { describe, expect, it } from 'vitest'
import { type GateColourway, type PublishGateInput, assertPublishable } from './publishGating'

const input = (o: Partial<PublishGateInput> = {}): PublishGateInput => ({
  id: 1,
  status: 'published',
  productCode: 'N001',
  variantMode: 'single-glb-variants',
  glbAsset: 10,
  variantsVerified: true,
  defaultColourway: 5,
  ...o,
})

const cw = (o: Partial<GateColourway> = {}): GateColourway => ({
  id: 5,
  variantId: 'N001-NAVY',
  active: true,
  isDefault: true,
  glbAsset: null,
  ...o,
})

describe('assertPublishable', () => {
  it('is a no-op for non-published saves', () => {
    expect(() => assertPublishable(input({ status: 'draft' }), [])).not.toThrow()
  })

  it('blocks publishing on create (no id)', () => {
    expect(() => assertPublishable(input({ id: undefined }), [])).toThrow(/draft first/)
  })

  it('requires a default colourway', () => {
    expect(() => assertPublishable(input({ defaultColourway: null }), [cw()])).toThrow(
      /default colourway/,
    )
  })

  it('single-glb requires a merged production GLB', () => {
    expect(() => assertPublishable(input({ glbAsset: null }), [cw()])).toThrow(/merged production GLB/)
  })

  it('single-glb requires "Variants verified"', () => {
    expect(() => assertPublishable(input({ variantsVerified: false }), [cw()])).toThrow(
      /Variants verified/,
    )
  })

  it('requires at least one active colourway', () => {
    expect(() => assertPublishable(input(), [cw({ active: false })])).toThrow(/at least one active/)
  })

  it('requires exactly one active default', () => {
    expect(() =>
      assertPublishable(input(), [
        cw({ id: 5 }),
        cw({ id: 6, variantId: 'N001-BLACK', isDefault: true }),
      ]),
    ).toThrow(/exactly one default/)
  })

  it('requires the product default to be the marked active default', () => {
    expect(() => assertPublishable(input({ defaultColourway: 999 }), [cw()])).toThrow(
      /default colourway/,
    )
  })

  it('separate-glb requires a GLB on every active colourway', () => {
    expect(() =>
      assertPublishable(input({ variantMode: 'separate-glb-per-colour', glbAsset: null }), [
        cw({ glbAsset: null }),
      ]),
    ).toThrow(/every active colourway needs its own GLB/)
  })

  it('enforces the product-code prefix on every colourway variantId', () => {
    expect(() =>
      assertPublishable(input(), [cw(), cw({ id: 6, variantId: 'X002-RED', isDefault: false })]),
    ).toThrow(/does not start with the product code/)
  })

  it('accepts a valid single-glb product', () => {
    expect(() => assertPublishable(input(), [cw()])).not.toThrow()
  })

  it('accepts a valid separate-glb product', () => {
    expect(() =>
      assertPublishable(
        input({ variantMode: 'separate-glb-per-colour', glbAsset: null, variantsVerified: false }),
        [cw({ glbAsset: 42 })],
      ),
    ).not.toThrow()
  })
})
