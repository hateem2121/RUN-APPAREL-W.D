import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The stand-in fonts in `app/(frontend)/site.css` stay DERIVED, and stay calibrated against the
 * headlines that are actually on the pages.
 *
 * 1. `ascent-override × size-adjust` and `descent-override × size-adjust` are the real font's own
 *    ascent and descent, so for one real font they are constants. Changing a `size-adjust`
 *    without re-deriving its overrides (`new = old × oldSizeAdjust / newSizeAdjust`) moves the
 *    stand-in's line box away from the real font's, and a hand-typed pair of numbers has nothing
 *    else to catch a slip. Every stand-in face is checked against the baseline of the real font
 *    it stands in for — picked by its first `local()` source — so a new face is covered the day
 *    it is added, not when someone remembers to list it here.
 * 2. `scripts/calibrate-fallback.mjs` sizes those faces for three specific headline strings
 *    (live measurements behind that: CLS 0.404 on /products at 1350px, 2026-09-11). Reword a
 *    headline and the measured values no longer describe the page, with nothing on screen to say
 *    so until a slow connection shows the jump. The strings in the script must be the strings in
 *    the pages.
 */

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

/**
 * The 2026-09-07 derivations, computed from the font files (site.css carries the working). A
 * re-calibration changes `size-adjust` and re-derives the overrides FROM these; it never edits
 * them, so this file is not checking the CSS against itself.
 */
const BASELINES = {
  display: { sizeAdjust: 128.24, ascentOverride: 68.47, descentOverride: 16.38 },
  serif: { sizeAdjust: 79.52, ascentOverride: 124.49, descentOverride: 38.98 },
  body: { sizeAdjust: 98.61, ascentOverride: 89.03, descentOverride: 21.29 },
} as const
type RealFont = keyof typeof BASELINES

/**
 * Two-decimal CSS values cannot reproduce a product exactly: the worst rounding error is about
 * 0.005 × 130 + 0.005 × 125 ≈ 1.3 in these units, so the check allows 1.5. A forgotten
 * re-derivation is far outside that — moving the display face from 128.24% to 131.06% without
 * touching its overrides is off by 193.
 */
const PRODUCT_TOLERANCE = 1.5

interface StandInFace {
  family: string
  realFont: RealFont | null
  sizeAdjust: number
  ascentOverride: number | null
  descentOverride: number | null
}

/** Every `@font-face` in `css` that carries a `size-adjust`, i.e. every stand-in face. */
function standInFaces(css: string): StandInFace[] {
  const faces: StandInFace[] = []
  for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = (block[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
    const sizeAdjust = body.match(/size-adjust:\s*([\d.]+)%/)
    if (!sizeAdjust) continue
    const firstLocal = body.match(/src:\s*local\("([^"]+)"\)/)?.[1] ?? ''
    // A Liberation Serif face stands in for the SAME real font as a Georgia one (Instrument
    // Serif), on the machines that have no Georgia — so it shares the serif baseline.
    const realFont: RealFont | null =
      firstLocal === 'Arial Bold'
        ? 'display'
        : firstLocal === 'Georgia Italic' || firstLocal === 'Liberation Serif Italic'
          ? 'serif'
          : firstLocal === 'Arial'
            ? 'body'
            : null
    const number = (name: string) => {
      const found = body.match(new RegExp(`${name}:\\s*([\\d.]+)%`))
      return found ? Number.parseFloat(found[1] ?? '') : null
    }
    faces.push({
      family: body.match(/font-family:\s*"([^"]+)"/)?.[1] ?? '(unnamed)',
      realFont,
      sizeAdjust: Number.parseFloat(sizeAdjust[1] ?? ''),
      ascentOverride: number('ascent-override'),
      descentOverride: number('descent-override'),
    })
  }
  return faces
}

/** Every way a face has drifted from its real font's baseline. Empty means derived. */
function derivationErrors(face: StandInFace): string[] {
  if (!face.realFont) {
    return [`"${face.family}": its first local() source is not one of the three known stand-ins`]
  }
  const base = BASELINES[face.realFont]
  const errors: string[] = []
  for (const [name, value, baseline] of [
    ['ascent-override', face.ascentOverride, base.ascentOverride],
    ['descent-override', face.descentOverride, base.descentOverride],
  ] as const) {
    if (value === null) {
      errors.push(`"${face.family}": no ${name}`)
      continue
    }
    const product = value * face.sizeAdjust
    const target = baseline * base.sizeAdjust
    if (Math.abs(product - target) > PRODUCT_TOLERANCE) {
      const derived = ((baseline * base.sizeAdjust) / face.sizeAdjust).toFixed(2)
      errors.push(
        `"${face.family}": ${name} ${value}% at size-adjust ${face.sizeAdjust}% — derived value is ${derived}%`,
      )
    }
  }
  return errors
}

const PAGE_FILES: Record<string, string> = {
  '/': './app/(frontend)/page.tsx',
  '/products': './app/(frontend)/products/page.tsx',
  '/contact': './app/(frontend)/contact/page.tsx',
}

interface Headline {
  page: string
  archivo: string
  accent: string | null
}

/** The `HEADLINES` table in calibrate-fallback.mjs. */
function calibratedHeadlines(script: string): Headline[] {
  return [
    ...script.matchAll(
      /\{\s*page:\s*'([^']+)',\s*archivo:\s*'([^']*)',\s*accent:\s*(?:'([^']*)'|null)\s*\}/g,
    ),
  ].map((m) => ({ page: m[1] ?? '', archivo: m[2] ?? '', accent: m[3] ?? null }))
}

/** The hero headline in a page's JSX, split the way the calibration script splits it. */
function heroHeadline(tsx: string): { archivo: string; accent: string | null } | null {
  const h1 = tsx.match(/<h1 className="display display--hero[^"]*">([\s\S]*?)<\/h1>/)?.[1]
  if (h1 === undefined) return null
  // `&nbsp;` is how the pages keep a headline's last two words together (TY-12); it renders as
  // a space, and the calibration table measures it as one.
  const text = (s: string) =>
    s.replaceAll('&rsquo;', '’').replaceAll('&nbsp;', ' ').replace(/\s+/g, ' ').trim()
  const accent = h1.match(/<span className="serif-accent">([\s\S]*?)<\/span>/)
  return {
    archivo: text(accent ? h1.slice(0, accent.index) : h1),
    accent: accent ? text(accent[1] ?? '') : null,
  }
}

describe('PF-03 — the stand-in font faces stay derived from the real fonts', () => {
  const faces = standInFaces(read('./app/(frontend)/site.css'))

  it('finds a stand-in face for each of the three real fonts (the instrument sees the CSS)', () => {
    expect(new Set(faces.map((face) => face.realFont))).toEqual(
      new Set(['display', 'serif', 'body']),
    )
  })

  it('every face keeps ascent-override × size-adjust and descent-override × size-adjust', () => {
    expect(faces.flatMap(derivationErrors)).toEqual([])
  })

  it('NEGATIVE CONTROL: a size-adjust moved without re-deriving its overrides is caught', () => {
    const [broken] = standInFaces(`
      @font-face {
        font-family: "Archivo Display Fallback";
        src: local("Arial Bold"), local("Arial");
        font-weight: 700 900;
        size-adjust: 131.06%;
        ascent-override: 68.47%;
        descent-override: 16.38%;
      }
    `)
    expect(broken).toBeDefined()
    expect(derivationErrors(broken as StandInFace)).toHaveLength(2)
  })

  it('NEGATIVE CONTROL: the same face, re-derived, passes', () => {
    const [fixed] = standInFaces(`
      @font-face {
        font-family: "Archivo Display Fallback";
        src: local("Arial Bold"), local("Arial");
        size-adjust: 131.06%;
        ascent-override: 67%;
        descent-override: 16.03%;
      }
    `)
    expect(derivationErrors(fixed as StandInFace)).toEqual([])
  })
})

/**
 * Stand-in families that no font stack names. The 2026-09-08 attempt at this fix declared a
 * /products face and wired it with a plain `font-family` rule whose win over `.display` depended
 * on stylesheet order, which nobody measured; a face nothing can reach is inert and still passes
 * every derivation check above.
 */
function unwiredFaces(css: string): string[] {
  const outside = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@font-face\s*\{[^}]*\}/g, '')
  return standInFaces(css)
    .map((face) => face.family)
    .filter((family) => !outside.includes(`"${family}"`))
}

describe('PF-03 — every stand-in face is reachable', () => {
  it('each stand-in family is named in a font stack outside its @font-face rule', () => {
    expect(unwiredFaces(read('./app/(frontend)/site.css'))).toEqual([])
  })

  it('NEGATIVE CONTROL: a face that no stack names is caught', () => {
    const css = `
      @font-face { font-family: "Orphan Fallback"; src: local("Arial Bold"); size-adjust: 131.06%; ascent-override: 67%; descent-override: 16.03%; }
      /* a comment naming "Orphan Fallback" is not a stack */
      :root { --font-display: "Archivo Variable", system-ui, sans-serif; }
    `
    expect(unwiredFaces(css)).toEqual(['Orphan Fallback'])
  })
})

describe('PF-03 — the calibrated headlines are the live headlines', () => {
  const headlines = calibratedHeadlines(read('../scripts/calibrate-fallback.mjs'))

  it('reads all three headlines out of the calibration script (the instrument sees the table)', () => {
    expect(headlines.map((h) => h.page).sort()).toEqual(['/', '/contact', '/products'])
  })

  for (const page of Object.keys(PAGE_FILES)) {
    it(`${page}: the page's hero headline is the string the faces were sized for`, () => {
      const calibrated = headlines.find((h) => h.page === page)
      const live = heroHeadline(read(PAGE_FILES[page] as string))
      expect(live, `no hero <h1> found in ${PAGE_FILES[page]}`).not.toBeNull()
      expect(
        live,
        `${page}'s headline changed. Re-run apps/cms/scripts/calibrate-fallback.mjs, update its ` +
          'HEADLINES table, and apply the values it prints to site.css.',
      ).toEqual({ archivo: calibrated?.archivo.trim(), accent: calibrated?.accent ?? null })
    })
  }

  it('NEGATIVE CONTROL: a reworded headline no longer matches', () => {
    const reworded = heroHeadline(
      '<h1 className="display display--hero">Every jacket, <span className="serif-accent">turnable.</span></h1>',
    )
    expect(reworded).not.toEqual({ archivo: 'Every garment,', accent: 'turnable.' })
    expect(reworded).toEqual({ archivo: 'Every jacket,', accent: 'turnable.' })
  })
})
