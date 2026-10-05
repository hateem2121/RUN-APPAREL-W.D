import type { ProductCategory } from './types'

/**
 * Colour names in each category's own style (polish N1/N2, the owner's answer Q38, 2026-10-03):
 * sport words for Teamwear & Uniforms, performance words for Sportswear, nature words for
 * Outerwear and easy fashion words for Casual Wear, and "the same colour has the same name inside
 * a category". The 200 live colourways were renamed from this table, in one approval by the owner
 * at the end of the polish build; the table is what keeps every NEW garment in step with them.
 *
 * ⚠️ ONLY THE WORDS CHANGE, NEVER THE ADDRESS. A colourway's slug is printed on QR tags, so the
 * live rows keep theirs ("Addresses keep their old word", Q38), and an imported row keeps the
 * namer's measured family word as its slug (`buildImportedRow`, importColours.ts): a style name is
 * a choice that may change again, an address is for ever.
 *
 * ⚠️ THE KEYS ARE THE PIPELINE NAMER'S OWN WORDS. tools/asset-pipeline/src/colour-name.ts names a
 * garment's colour by measuring it (CIEDE2000 against 47 colours and a 7-step grey ramp). It runs
 * in the shrink container, which cannot know a product's category or install this package (plain
 * npm, no workspace links: that file's header says why), so the style is applied here, at import,
 * where the category is known. `colour-name.test.ts` fails if the namer gains a word this table
 * lacks, and the `satisfies` below fails the typecheck if a style misses one of these words.
 *
 * Rules every name keeps (colourNames.test.ts): unique inside its category; at most
 * `COLOUR_NAME_MAX` characters; never a plain word such as "Pink" (owner, 2026-09-04: "Do not use
 * standard names like pink, yellow, etc.") nor one of the namer's own words; and no brand or
 * product name. Regatta, Champion, Tarmac, Tempo, Tailwind, Endurance, Adrenaline, Ignite, Redline,
 * Solar, Base Camp, Kingfisher, Mulberry and Canyon were dropped for that reason, and Kinetic
 * because a garment here is called THE KINETIC MATRIX JACKET.
 */

/**
 * The garment page's laptop name cell is 117px, and the code-style font draws "BOTTLE GREEN /"
 * (14 characters) 111px wide in Chromium and Firefox and 114px in WebKit (page.css, polish D8,
 * measured 2026-10-04). A name that is followed by " /" may therefore be 12 characters.
 */
export const COLOUR_NAME_MAX = 12

/**
 * Every word `nameColour` can answer with (colour-name.ts's grey ramp and palette), here grouped by
 * colour: whites and greys, browns and yellows, greens, blues, purples, pinks, reds, oranges.
 */
export const COLOUR_FAMILIES = [
  'Optic White',
  'Ivory',
  'Bone',
  'Cream',
  'Beige',
  'Sand',
  'Khaki',
  'Pebble',
  'Ash',
  'Slate',
  'Charcoal',
  'Black',
  'Tan',
  'Camel',
  'Chestnut',
  'Mocha',
  'Gold',
  'Mustard',
  'Butter',
  'Citron',
  'Lime',
  'Sage',
  'Olive',
  'Emerald',
  'Forest Green',
  'Bottle Green',
  'Mint',
  'Turquoise',
  'Teal',
  'Petrol',
  'Powder Blue',
  'Sky',
  'Denim',
  'Navy',
  'Cobalt',
  'Royal Blue',
  'Indigo',
  'Lilac',
  'Amethyst',
  'Mauve',
  'Plum',
  'Blush',
  'Fuchsia',
  'Magenta',
  'Crimson',
  'Scarlet',
  'Burgundy',
  'Wine',
  'Maroon',
  'Rust',
  'Terracotta',
  'Coral',
  'Tangerine',
  'Peach',
] as const

export type ColourFamily = (typeof COLOUR_FAMILIES)[number]

/**
 * One name per colour family per styled category. Sports Accessories has no style yet (the
 * owner gave four), so its colours keep the namer's word: see `themedColourName`.
 */
export const COLOUR_NAME_STYLES = {
  'Teamwear & Uniforms': {
    'Optic White': 'Clean Sheet',
    Ivory: 'Cue Ball',
    Bone: 'Touchline',
    Cream: 'Pavilion',
    Beige: 'Bunker',
    Sand: 'Beach Volley',
    Khaki: 'Caddie',
    Pebble: 'Silver Medal',
    Ash: 'Bleachers',
    Slate: 'Asphalt',
    Charcoal: 'Cinder',
    Black: 'Puck',
    Tan: 'Bronze Medal',
    Camel: 'Hardwood',
    Chestnut: 'Saddle',
    Mocha: 'Paddock',
    Gold: 'Trophy',
    Mustard: 'Goalpost',
    Butter: 'Golden Goal',
    Citron: 'Floodlight',
    Lime: 'Tennis Ball',
    Sage: 'Fairway',
    Olive: 'Scrum',
    Emerald: 'Pitch',
    'Forest Green': 'Baize',
    'Bottle Green': 'Grass Court',
    Mint: 'Croquet',
    Turquoise: 'Poolside',
    Teal: 'Deep End',
    Petrol: 'Pit Lane',
    'Powder Blue': 'Ice Rink',
    Sky: 'Bluebird Day',
    Denim: 'Blue Line',
    Navy: 'Varsity',
    Cobalt: 'Diving Pool',
    'Royal Blue': 'Hard Court',
    Indigo: 'Night Game',
    Lilac: 'Victory Lap',
    Amethyst: 'Grand Slam',
    Mauve: 'Fair Play',
    Plum: 'Hat Trick',
    Blush: 'Rosette',
    Fuchsia: 'Hot Shot',
    Magenta: 'Power Play',
    Crimson: 'Cricket Ball',
    Scarlet: 'Boxing Glove',
    Burgundy: 'Clubhouse',
    Wine: 'Pennant',
    Maroon: 'Home Ground',
    Rust: 'Infield',
    Terracotta: 'Clay Court',
    Coral: 'Rally',
    Tangerine: 'Basketball',
    Peach: 'Half Time',
  },
  Sportswear: {
    'Optic White': 'Chalk',
    Ivory: 'First Light',
    Bone: 'Rest Day',
    Cream: 'Recovery',
    Beige: 'Breathe',
    Sand: 'Desert Run',
    Khaki: 'Trail',
    Pebble: 'Slipstream',
    Ash: 'Stopwatch',
    Slate: 'Barbell',
    Charcoal: 'Stealth',
    Black: 'Shadowbox',
    Tan: 'Long Run',
    Camel: 'Stamina',
    Chestnut: 'Grit',
    Mocha: 'Caffeine',
    Gold: 'Podium',
    Mustard: 'Golden Hour',
    Butter: 'Electrolyte',
    Citron: 'Lightning',
    Lime: 'Fast Twitch',
    Sage: 'Cooldown',
    Olive: 'Terrain',
    Emerald: 'Breakaway',
    'Forest Green': 'Racing Green',
    'Bottle Green': 'Interval',
    Mint: 'Fresh Legs',
    Turquoise: 'Hydrate',
    Teal: 'Threshold',
    Petrol: 'Octane',
    'Powder Blue': 'Ice Bath',
    Sky: 'Altitude',
    Denim: 'Steady State',
    Navy: 'Night Run',
    Cobalt: 'Surge',
    'Royal Blue': 'Electric',
    Indigo: 'Ultraviolet',
    Lilac: 'Yoga Flow',
    Amethyst: 'Plasma',
    Mauve: 'Spin Class',
    Plum: 'Momentum',
    Blush: 'Afterglow',
    Fuchsia: 'Pulse',
    Magenta: 'Overdrive',
    Crimson: 'Red Zone',
    Scarlet: 'Cardio',
    Burgundy: 'Deep Burn',
    Wine: 'Second Wind',
    Maroon: 'Iron Will',
    Rust: 'Hot Lap',
    Terracotta: 'Heatwave',
    Coral: 'Flare',
    Tangerine: 'Blaze',
    Peach: 'Sunrise Run',
  },
  Outerwear: {
    'Optic White': 'Snowfall',
    Ivory: 'Seashell',
    Bone: 'Birch',
    Cream: 'Elderflower',
    Beige: 'Driftwood',
    Sand: 'Dune',
    Khaki: 'Savannah',
    Pebble: 'Mist',
    Ash: 'Granite',
    Slate: 'Shale',
    Charcoal: 'Basalt',
    Black: 'Obsidian',
    Tan: 'Acorn',
    Camel: 'Fawn',
    Chestnut: 'Walnut',
    Mocha: 'Bark',
    Gold: 'Amber',
    Mustard: 'Ochre',
    Butter: 'Primrose',
    Citron: 'Daffodil',
    Lime: 'Meadow',
    Sage: 'Lichen',
    Olive: 'Moss',
    Emerald: 'Ivy',
    'Forest Green': 'Pine',
    'Bottle Green': 'Spruce',
    Mint: 'Jade',
    Turquoise: 'Lagoon',
    Teal: 'Fjord',
    Petrol: 'Abyss',
    'Powder Blue': 'Glacier',
    Sky: 'Cornflower',
    Denim: 'Dusk',
    Navy: 'Midnight',
    Cobalt: 'Deep Sea',
    'Royal Blue': 'Lapis',
    Indigo: 'Twilight',
    Lilac: 'Wisteria',
    Amethyst: 'Iris',
    Mauve: 'Heather',
    Plum: 'Bramble',
    Blush: 'Blossom',
    Fuchsia: 'Hibiscus',
    Magenta: 'Foxglove',
    Crimson: 'Ruby',
    Scarlet: 'Poppy',
    Burgundy: 'Damson',
    Wine: 'Garnet',
    Maroon: 'Cedar',
    Rust: 'Bracken',
    Terracotta: 'Sandstone',
    Coral: 'Flamingo',
    Tangerine: 'Ember',
    Peach: 'Dawn',
  },
  'Casual Wear': {
    'Optic White': 'Coconut',
    Ivory: 'Vanilla',
    Bone: 'Oat Milk',
    Cream: 'Meringue',
    Beige: 'Almond',
    Sand: 'Biscuit',
    Khaki: 'Chai',
    Pebble: 'Cloud',
    Ash: 'Pewter',
    Slate: 'Smoke',
    Charcoal: 'Graphite',
    Black: 'Jet',
    Tan: 'Caramel',
    Camel: 'Latte',
    Chestnut: 'Cocoa',
    Mocha: 'Espresso',
    Gold: 'Honey',
    Mustard: 'Turmeric',
    Butter: 'Custard',
    Citron: 'Lemon Drop',
    Lime: 'Kiwi',
    Sage: 'Matcha',
    Olive: 'Bay Leaf',
    Emerald: 'Basil',
    'Forest Green': 'Palm',
    'Bottle Green': 'Holly',
    Mint: 'Spearmint',
    Turquoise: 'Sea Glass',
    Teal: 'Peacock',
    Petrol: 'Ocean',
    'Powder Blue': 'Duck Egg',
    Sky: 'Hydrangea',
    Denim: 'Blueberry',
    Navy: 'Ink',
    Cobalt: 'Ultramarine',
    'Royal Blue': 'Sapphire',
    Indigo: 'Blackcurrant',
    Lilac: 'Lavender',
    Amethyst: 'Grape',
    Mauve: 'Orchid',
    Plum: 'Fig',
    Blush: 'Petal',
    Fuchsia: 'Watermelon',
    Magenta: 'Raspberry',
    Crimson: 'Pomegranate',
    Scarlet: 'Strawberry',
    Burgundy: 'Cranberry',
    Wine: 'Black Cherry',
    Maroon: 'Rosewood',
    Rust: 'Cinnamon',
    Terracotta: 'Paprika',
    Coral: 'Grapefruit',
    Tangerine: 'Pumpkin',
    Peach: 'Apricot',
  },
} as const satisfies Partial<Record<ProductCategory, Record<ColourFamily, string>>>

const STYLES: Partial<Record<string, Readonly<Record<string, string>>>> = COLOUR_NAME_STYLES

/**
 * A colour name in its category's style. Each part of a two-fabric name ("Wine / Black") is named
 * on its own, as the live catalogue's compound names were. A word that is not one of the namer's
 * (a name the owner typed), or a category without a style, comes back unchanged.
 */
export function themedColourName(name: string, category: unknown): string {
  const style = typeof category === 'string' ? STYLES[category] : undefined
  if (!style || name.trim() === '') return name
  return name
    .split('/')
    .map((part) => {
      const word = part.trim()
      return style[word] ?? word
    })
    .join(' / ')
}
