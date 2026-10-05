/**
 * The 19 published Teamwear garments, in the page's order, each with its garment type and the sport
 * the owner's groups put it under (Q44), as the CMS held them on 2026-10-05 (read from production,
 * read-only; the names and types are public, in each garment page's title).
 *
 * `src/lib/sports.test.ts` sorts them; `e2e/sportFilter.spec.ts` lays them out and presses their
 * buttons. CI's database holds no Teamwear garment, so this list is how both see the real catalogue.
 */
export const LIVE_TEAMWEAR = [
  ['X-MILO PRO BIB', "Men's Cycling Bib Shorts", 'cycling'],
  ['X-MILO PRO SKIN-SUIT', "Women's Cycling Skinsuit", 'cycling'],
  ['WOMEN’S ATHLETIC TENNIS DRESS', "Women's Tennis Dress", 'tennis-pickleball'],
  ['MINECUT MOTION', "Women's Tennis Dress", 'tennis-pickleball'],
  ['BEEFLEX COURT DRESS', 'Tennis Bra and Skirt Set', 'tennis-pickleball'],
  ['GEOVENT TENNIS DRESS', "Women's Tennis Dress", 'tennis-pickleball'],
  ['TIGER TAIL PROFLEX', "Women's Tennis Dress", 'tennis-pickleball'],
  ['MANTRA RAY PROFLEX', 'Tennis and Pickleball Shirt', 'tennis-pickleball'],
  ['THE AGGRESSOR JERSEY', "Women's American Football Jersey", 'american-football'],
  ['THE AGGRESSOR JERSEY MEN', "Men's American Football Jersey", 'american-football'],
  ['THE AGGRESSOR UNIFORM', "Men's American Football Uniform", 'american-football'],
  ['SHORT RAGLAN SLEEVE', 'Raglan Soccer Tee', 'soccer'],
  ['CHEVRON V-NECK SOCCER JERSEY', 'V-Neck Soccer Jersey', 'soccer'],
  ['FLEX FITTED TRAINING VEST', 'Training Bib (Scrimmage Vest)', 'training'],
  ['CLASSIC SOCCER SHIRT', 'Polo-Collar Soccer Jersey', 'soccer'],
  ['VELOCITY PERFORMANCE JERSEY', 'Soccer Jersey', 'soccer'],
  ['MOTION-X TRAINING ZIPPER', "Men's Full-Zip Training Top", 'training'],
  ['X-MILO TRAINING VEST', "Men's Sleeveless Training Vest", 'training'],
  ['SCUBA-NECK PERFORMANCE', 'Neoprene Wetsuit', 'water-sports'],
] as const
