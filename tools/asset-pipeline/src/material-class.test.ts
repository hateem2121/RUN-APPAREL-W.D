import { describe, expect, it } from 'vitest'
import { classifyMaterialName } from './material-class'

describe('classifyMaterialName', () => {
  // The 440 materials that are legitimately metal and must never be rewritten.
  // Names taken verbatim from the 28 raw CLO exports, 2026-08-26.
  it.each([
    'Zipper 1_Slider_3582',
    'Zipper_Slider',
    'Puller_1204',
    'TopStopper_88',
    'Button_0021',
    'люверсы_4410', // eyelets; CLO passes through the designer's own language
    'Metal_Rivet_7',
    'Buckle_2',
  ])('classifies %s as hardware', (name) => {
    expect(classifyMaterialName(name)).toBe('hardware')
  })

  // The 35 measured offenders and their family.
  it.each([
    'Nylon_Canvas Copy 1_5511',
    'FABRIC 2_3169',
    'Fleece_Terry_9001',
    'Cotton_Canvas_2961',
    'Cloth_mesh_1',
    'Polyester_Jersey_44',
    'Textile_Cotton', // MUST be fabric — ARTWORK_NAME would call this artwork
    'Polyester_Textured_9',
    'RUN LOGO_3183',
    'Teamwear Logo_3139',
    'White Black Bold Minimalist Clothing Label_9946645',
  ])('classifies %s as fabric', (name) => {
    expect(classifyMaterialName(name)).toBe('fabric')
  })

  // Owner decision 2026-08-26: Trim is reported, never rewritten.
  it.each([
    'Trim_0091',
    'Trim 2_4418',
    'Zipper 1_TapeFabric_3583', // trim-adjacent AND fabric-adjacent — must not guess
    '',
    'Material.001',
    'Untitled_7',
  ])('classifies %s as unclassified', (name) => {
    expect(classifyMaterialName(name)).toBe('unclassified')
  })

  it('is case-insensitive', () => {
    expect(classifyMaterialName('zipper_slider')).toBe('hardware')
    expect(classifyMaterialName('COTTON_CANVAS_1')).toBe('fabric')
  })

  it('requires a token boundary, so a substring alone is not a match', () => {
    // "Buttonhole" is a fabric feature, not a button. "Cottontail" is not cotton.
    expect(classifyMaterialName('Buttonhole_Reinforcement_3')).not.toBe('hardware')
    expect(classifyMaterialName('Cottontail_Motif_9')).not.toBe('fabric')
  })

  it('refuses to guess when a name carries BOTH a hardware and a fabric word', () => {
    // `Zipper 1_TapeFabric_*` is real, and it is the woven tape a zipper's teeth
    // are sewn onto — fabric, not metal — even though "Zipper" leads the name.
    // An earlier draft of this classifier said "hardware wins ties", which would
    // have forced that tape to stay metallic. Ambiguity is REPORTED, never
    // resolved by ordering: the same rule the owner set for Trim_* on 2026-08-26.
    expect(classifyMaterialName('Zipper_Slider_TapeFabric_1')).toBe('unclassified')
    expect(classifyMaterialName('Zipper 1_TapeFabric_3583')).toBe('unclassified')
  })

  it('sees a word glued on in CamelCase, which is how CLO writes compounds', () => {
    // Without CamelCase splitting, `fabric` in `TapeFabric` is preceded by the `e`
    // of "Tape", the token-boundary rule rejects it, and the material reads as pure
    // hardware — so the zipper's woven tape gets pinned at metallic 1.0 by the very
    // function written to prevent that. Found by running the regex, not reading it.
    expect(classifyMaterialName('TapeFabric_1')).toBe('fabric')
    expect(classifyMaterialName('MeshPanel_4')).toBe('fabric')
    expect(classifyMaterialName('TopStopper_88')).toBe('hardware')
  })

  it('does NOT split an all-lowercase compound, so the boundary rule still holds', () => {
    // These are what the boundary rule exists to reject, and CamelCase splitting
    // must not weaken it: there is no case transition inside either word.
    expect(classifyMaterialName('Buttonhole_Reinforcement_3')).toBe('unclassified')
    expect(classifyMaterialName('Cottontail_Motif_9')).toBe('unclassified')
  })

  it('still classifies an unambiguous hardware name as hardware', () => {
    // The guard above must not swallow the 440 materials that ARE metal.
    expect(classifyMaterialName('Zipper 1_Slider_3582')).toBe('hardware')
    expect(classifyMaterialName('Zipper_TopStopper_9')).toBe('hardware')
  })
})
