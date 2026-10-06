import type { ProductCategory } from './types.ts'

/**
 * Colour names in each category's own style (polish N1/N2, the owner's answer Q38, 2026-10-03):
 * sport words for Teamwear & Uniforms (and Sports Accessories, from the sign-off of 2026-10-05),
 * performance words for Sportswear, nature words for Outerwear and easy fashion words for Casual
 * Wear, and "the same colour has the same name inside a category". The 200 live colourways were
 * renamed from this table, in one approval by the owner at the end of the polish build; the table
 * is what keeps every NEW garment in step with them.
 *
 * ⚠️ A NAME MUST SAY WHAT COLOUR THE GARMENT IS. The first list (5 Oct 2026, morning) avoided
 * plain words so well that most sport and performance names gave no hint: "Pennant", "Clubhouse",
 * "Second Wind". The owner's second list that evening (approved whole, D29) keeps a name that
 * already paints its colour ("Ice Rink", "Tennis Ball", "Strawberry") and gives the rest a themed
 * word plus a colour word: "Claret Red", "Varsity Navy", "Trophy Gold". 103 of the 216 names
 * changed (Teamwear 39, Sportswear 47, Outerwear 15, Casual Wear 2), and 127 of the 200 live
 * colourways with them.
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
 * `COLOUR_NAME_MAX` characters; never a plain word such as "Pink" on its own (owner, 2026-09-04:
 * "Do not use standard names like pink, yellow, etc."; "Rosette Pink" is the second list's form)
 * nor one of the namer's own words; and no brand or
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
 * The sport words: Teamwear & Uniforms' own, and Sports Accessories' too (the owner's sign-off,
 * 2026-10-05: "Use the sport words"). One table, so the two can never drift apart.
 */
const SPORT_WORDS = {
  'Optic White': 'Home White',
  Ivory: 'Cue Ball',
  Bone: 'Chalk Line',
  Cream: 'Club Cream',
  Beige: 'Bunker Beige',
  Sand: 'Beach Sand',
  Khaki: 'Caddie Khaki',
  Pebble: 'Silver Medal',
  Ash: 'Stadium Grey',
  Slate: 'Asphalt',
  Charcoal: 'Cinder Grey',
  Black: 'Puck Black',
  Tan: 'Bronze Medal',
  Camel: 'Hardwood',
  Chestnut: 'Saddle Brown',
  Mocha: 'Mitt Brown',
  Gold: 'Trophy Gold',
  Mustard: 'Kit Mustard',
  Butter: 'Lemon Squash',
  Citron: 'Yellow Card',
  Lime: 'Tennis Ball',
  Sage: 'Fairway Sage',
  Olive: 'Scrum Olive',
  Emerald: 'Pitch Green',
  'Forest Green': 'Baize Green',
  'Bottle Green': 'Grass Court',
  Mint: 'Croquet Mint',
  Turquoise: 'Pool Aqua',
  Teal: 'Deep End',
  Petrol: 'Pit Petrol',
  'Powder Blue': 'Ice Rink',
  Sky: 'Bluebird Day',
  Denim: 'Blue Line',
  Navy: 'Varsity Navy',
  Cobalt: 'Relay Blue',
  'Royal Blue': 'Court Blue',
  Indigo: 'Night Indigo',
  Lilac: 'Podium Lilac',
  Amethyst: 'Slam Purple',
  Mauve: 'Team Mauve',
  Plum: 'Away Plum',
  Blush: 'Rosette Pink',
  Fuchsia: 'Smash Pink',
  Magenta: 'Play Magenta',
  Crimson: 'Cricket Ball',
  Scarlet: 'Boxing Glove',
  Burgundy: 'Derby Red',
  Wine: 'Claret Red',
  Maroon: 'Home Maroon',
  Rust: 'Infield Rust',
  Terracotta: 'Clay Court',
  Coral: 'Rally Coral',
  Tangerine: 'Basketball',
  Peach: 'Track Peach',
} as const satisfies Record<ColourFamily, string>

/** One name per colour family per category. */
export const COLOUR_NAME_STYLES = {
  'Teamwear & Uniforms': SPORT_WORDS,
  'Sports Accessories': SPORT_WORDS,
  Sportswear: {
    'Optic White': 'Chalk White',
    Ivory: 'Pure Ivory',
    Bone: 'Studio Bone',
    Cream: 'Rest Cream',
    Beige: 'Mat Beige',
    Sand: 'Desert Run',
    Khaki: 'Trail Khaki',
    Pebble: 'Pace Grey',
    Ash: 'Split Grey',
    Slate: 'Iron Slate',
    Charcoal: 'Stealth Grey',
    Black: 'Shadow Black',
    Tan: 'Stride Tan',
    Camel: 'Grit Camel',
    Chestnut: 'Hustle Brown',
    Mocha: 'Caffeine',
    Gold: 'Podium Gold',
    Mustard: 'Golden Hour',
    Butter: 'Fuel Yellow',
    Citron: 'Flash Yellow',
    Lime: 'Sprint Lime',
    Sage: 'Calm Sage',
    Olive: 'Trail Olive',
    Emerald: 'Finish Green',
    'Forest Green': 'Racing Green',
    'Bottle Green': 'Lap Green',
    Mint: 'Fresh Mint',
    Turquoise: 'Hydro Aqua',
    Teal: 'Flow Teal',
    Petrol: 'Octane Blue',
    'Powder Blue': 'Ice Bath',
    Sky: 'Summit Sky',
    Denim: 'Steady Blue',
    Navy: 'Night Navy',
    Cobalt: 'Surge Blue',
    'Royal Blue': 'Power Blue',
    Indigo: 'Ultraviolet',
    Lilac: 'Yoga Lilac',
    Amethyst: 'Flex Purple',
    Mauve: 'Spin Mauve',
    Plum: 'Drive Plum',
    Blush: 'Glow Pink',
    Fuchsia: 'Pulse Pink',
    Magenta: 'Max Magenta',
    Crimson: 'Red Zone',
    Scarlet: 'Cardio Red',
    Burgundy: 'Burn Red',
    Wine: 'Stamina Wine',
    Maroon: 'Iron Maroon',
    Rust: 'Track Rust',
    Terracotta: 'Hot Clay',
    Coral: 'Flare Coral',
    Tangerine: 'Blaze Orange',
    Peach: 'Warmup Peach',
  },
  Outerwear: {
    'Optic White': 'Snowfall',
    Ivory: 'Seashell',
    Bone: 'Birch',
    Cream: 'Cloud Cream',
    Beige: 'Driftwood',
    Sand: 'Dune',
    Khaki: 'Savannah',
    Pebble: 'Mist',
    Ash: 'Granite',
    Slate: 'Shale Grey',
    Charcoal: 'Storm Grey',
    Black: 'Obsidian',
    Tan: 'Acorn',
    Camel: 'Fawn',
    Chestnut: 'Walnut',
    Mocha: 'Bark',
    Gold: 'Amber',
    Mustard: 'Ochre',
    Butter: 'Primrose',
    Citron: 'Daffodil',
    Lime: 'Lime Leaf',
    Sage: 'Lichen Green',
    Olive: 'Moss',
    Emerald: 'Ivy',
    'Forest Green': 'Pine',
    'Bottle Green': 'Spruce',
    Mint: 'Jade',
    Turquoise: 'Lagoon',
    Teal: 'Fjord Teal',
    Petrol: 'Abyss Blue',
    'Powder Blue': 'Glacier',
    Sky: 'Cornflower',
    Denim: 'Dusk Blue',
    Navy: 'Midnight',
    Cobalt: 'Deep Sea',
    'Royal Blue': 'Lapis Blue',
    Indigo: 'Twilight',
    Lilac: 'Wisteria',
    Amethyst: 'Iris',
    Mauve: 'Heather',
    Plum: 'Bramble Plum',
    Blush: 'Blossom',
    Fuchsia: 'Hibiscus',
    Magenta: 'Foxglove',
    Crimson: 'Ruby',
    Scarlet: 'Poppy',
    Burgundy: 'Beetroot',
    Wine: 'Garnet',
    Maroon: 'Red Cedar',
    Rust: 'Autumn Rust',
    Terracotta: 'Red Clay',
    Coral: 'Flamingo',
    Tangerine: 'Ember',
    Peach: 'Dawn Peach',
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
    Sky: 'Bluebell',
    Denim: 'Blueberry',
    Navy: 'Ink',
    Cobalt: 'Ultramarine',
    'Royal Blue': 'Sapphire',
    Indigo: 'Blackcurrant',
    Lilac: 'Lavender',
    Amethyst: 'Grape',
    Mauve: 'Orchid',
    Plum: 'Fig',
    Blush: 'Rose Petal',
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
