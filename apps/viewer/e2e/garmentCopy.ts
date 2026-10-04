/**
 * Copy longer than any live garment's (measured 2026-10-02, all 40): the longest description was
 * 454 characters (r-atj) and the longest name 25 ("THE KINETIC MATRIX JACKET"). Invented, so a
 * test does not carry a product's words; 462 and 26 characters, so it cannot pass for less.
 *
 * Shared by the layout tests (motion-and-layout.spec.ts) and the printed sheet (print.spec.ts):
 * measure layout with the catalogue's worst content, never the fixture's.
 */
export const LONGEST_COPY = {
  productName: 'THE VELOCITY MATRIX JACKET',
  shortDescription:
    'A four-way stretch shell cut for cold early starts and long training blocks. Bonded seams ' +
    'keep the weight down, laser-cut vents open under the arms and across the back, and a ' +
    'brushed inner face holds warmth without trapping heat. Reflective trims sit on the cuffs, ' +
    'hem and shoulders for low light, the zipped chest pocket takes a phone, and the dropped ' +
    'back hem stays put when the rider leans forward into a headwind for hours on end through ' +
    'rain, grit and cold.',
}
