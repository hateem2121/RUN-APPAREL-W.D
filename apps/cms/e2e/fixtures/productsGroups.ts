import { LIVE_TEAMWEAR } from './teamwear'

/**
 * /products' families in the page's order, each with the garments it held live on 11 Oct 2026, read
 * from wear-run.com/products (the chips' counts and the cards' names, which are public).
 *
 * ⚠️ THE COUNTS ARE THE POINT. A group's height comes from its garments, and the defect was a
 * group taller than the 1,200px it was stood in at: Teamwear, 19 garments, 3,446px on a phone.
 * Re-read these when the catalogue changes shape.
 */
export const LIVE_GROUPS: readonly (readonly [slug: string, names: readonly string[]])[] = [
  [
    'sportswear',
    [
      'ARISAN SPORTS BRA',
      'WOMEN ZIP-UP VEST',
      'ENDURA CROP TOP',
      'WORKOUT CROPPED TOP',
      'APEX FLEX PULLOVER',
      'HYDRA-FIT JERSEY',
      'INDIGO FLOW SWEATSHIRT',
      'PACEZIP RUNNING SHIRT',
      'CORE ALIGN TIGHTS',
      'ZENMOVE TIGHTS',
    ],
  ],
  ['teamwear-uniforms', LIVE_TEAMWEAR.map(([name]) => name)],
  [
    'casual-wear',
    [
      'TERRA ACTIVE ZIP',
      'CRIMSON STRIDE PULLOVER',
      'CAPSULE CORE HOODIE',
      'ENDURANCE TRACKSUIT',
      'STRUCTURE POLO SET',
    ],
  ],
  [
    'outerwear',
    [
      'AERO-TECH WINDBREAKER',
      'PRO-PILE SHERPA JACKET',
      'VANTA CORE JACKET',
      'AURORA LONGLINE JACKET',
      'METRO-SHIELD SUIT',
      'ARMOR-TECH JACKET',
      'THE KINETIC MATRIX JACKET',
    ],
  ],
  ['sports-accessories', []],
]

/** Every garment the harness draws. */
export const LIVE_GROUP_GARMENTS = LIVE_GROUPS.reduce((sum, [, names]) => sum + names.length, 0)
