import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../../../scripts/contrast-rules.mjs'
import {
  FILES,
  OUT_DIR,
  renderFiles,
  TOKENS_CSS,
  type TokenDocument,
} from '../../../scripts/export-design-tokens.mjs'

/*
 * packages/ui/src/tokens.css is the source of truth; packages/ui/tokens/ is generated from it by
 * scripts/export-design-tokens.mjs, and the Paper & Ink design system is re-synced FROM those
 * files. Until 2026-10-22 the design system, the brand guide and a dozen hex codes in code, tests
 * and docs were kept in step by hand: two colours changed that day and twelve files had to be
 * found by search. These four checks make the next drift fail a pull request instead.
 */

const REPO = join(__dirname, '..', '..', '..')
const css = () => readFileSync(TOKENS_CSS, 'utf8')
const committed = (file: string) => readFileSync(join(OUT_DIR, file), 'utf8')
const parsed = (text: string) => JSON.parse(text) as TokenDocument

/** Every file that differs between an export and what is committed. */
function staleFiles(rendered: Record<string, string>): string[] {
  return Object.entries(rendered)
    .filter(([file, text]) => committed(file) !== text)
    .map(([file]) => file)
}

describe('the exported design tokens match tokens.css', () => {
  it('the committed files are exactly what the export produces today', () => {
    const stale = staleFiles(renderFiles(css()))
    expect(
      stale,
      `${stale.join(', ')} no longer match packages/ui/src/tokens.css. ` +
        'Run pnpm tokens:export and commit the result.',
    ).toEqual([])
  })

  it('NEGATIVE CONTROL: one colour changed in tokens.css makes every file that carries it stale', () => {
    const source = css()
    const planted = source.replace('--danger: light-dark(#b3261e,', '--danger: light-dark(#b3261f,')
    expect(planted, 'the plant must land').not.toBe(source)
    // --danger's light half is in the light and high-contrast files (high contrast replaces it,
    // so only the light file changes) — the check must name exactly that file.
    expect(staleFiles(renderFiles(planted))).toEqual([FILES.light])
  })
})

// ── Contrast, computed from the exported files ─────────────────────────────────────────────

type Colour = { colorSpace: string; components: number[]; alpha?: number; hex?: string }
type Token = { $type?: string; $value: unknown; $extensions?: unknown }

/** Follow `{group.token}` references inside one document to a colour value. */
function colourOf(doc: TokenDocument, path: string): Colour {
  let value: unknown = `{${path}}`
  for (let hops = 0; typeof value === 'string' && hops < 8; hops++) {
    const [group, name] = (value as string).slice(1, -1).split('.') as [string, string]
    const token = (doc[group] as Record<string, Token> | undefined)?.[name]
    if (!token) throw new Error(`${path}: ${value} does not resolve`)
    value = token.$value
  }
  return value as Colour
}

/** sRGB 0–1 components → the 0–255 triple contrastRatio takes. Unrounded on purpose. */
const bytes = (c: Colour) => c.components.map((n) => n * 255)

const GROUNDS = ['bg', 'surface', 'wash', 'raised'] as const
/** Text drawn straight on a ground. The serif accent and dimension lines resolve to volt-deep. */
const GROUND_TEXT = ['text', 'muted', 'heading', 'headline', 'serif-accent', 'dimension', 'danger']
/** Text drawn on its own fill. A transparent fill means it sits on the ground instead. */
const FILLED_TEXT = [
  ['label-text', 'label-bg'],
  ['btn-primary-text', 'btn-primary-bg'],
] as const

function contrastFailures(doc: TokenDocument, floor: number): string[] {
  const failures: string[] = []
  const check = (text: string, fg: Colour, ground: string, bg: Colour) => {
    // The floor is compared UNROUNDED: WCAG's Understanding page for 1.4.3 says 4.499:1 fails.
    const ratio = contrastRatio(bytes(fg), bytes(bg))
    if (ratio < floor) failures.push(`${text} on ${ground}: ${ratio}:1 < ${floor}:1`)
  }
  for (const text of GROUND_TEXT) {
    for (const ground of GROUNDS) {
      check(text, colourOf(doc, `color.${text}`), ground, colourOf(doc, `color.${ground}`))
    }
  }
  for (const [text, fill] of FILLED_TEXT) {
    const bg = colourOf(doc, `color.${fill}`)
    if ((bg.alpha ?? 1) > 0) check(text, colourOf(doc, `color.${text}`), fill, bg)
    else
      for (const ground of GROUNDS) {
        check(text, colourOf(doc, `color.${text}`), ground, colourOf(doc, `color.${ground}`))
      }
  }
  return failures
}

const THEMES = [
  { file: FILES.light, floor: 4.5, criterion: 'WCAG 1.4.3' },
  { file: FILES.dark, floor: 4.5, criterion: 'WCAG 1.4.3' },
  { file: FILES.highContrast, floor: 7, criterion: 'WCAG 1.4.6' },
] as const

describe('every text colour clears its floor on bg, surface, wash and raised', () => {
  for (const { file, floor, criterion } of THEMES) {
    it(`${file}: ${floor}:1 (${criterion})`, () => {
      expect(contrastFailures(parsed(committed(file)), floor)).toEqual([])
    })
  }

  it('NEGATIVE CONTROL: the colours before 2026-10-22 fail, on --wash and only there', () => {
    const old = css()
      .replace('light-dark(#62655a,', 'light-dark(#63665b,')
      .replace('--volt-deep: #586c05;', '--volt-deep: #5f7414;')
    expect(old, 'the plant must land').not.toBe(css())
    const failures = contrastFailures(parsed(renderFiles(old)[FILES.light] ?? ''), 4.5)
    // muted, and volt-deep three times: as the serif accent and the dimension line.
    expect(failures.map((f) => f.split(':')[0])).toEqual([
      'muted on wash',
      'serif-accent on wash',
      'dimension on wash',
    ])
  })
})

// ── The Design Tokens Format Module 2025.10, checked rule by rule ──────────────────────────
//
// Read 2026-10-22: designtokens.org/tr/2025.10/format/ and /color/ (Final Community Group Report,
// 28 October 2025). Written here rather than taken from a package: the repo adds no dependency
// for one check, and each rule below names the clause it enforces.

const TYPES = new Set([
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
  'duration',
  'cubicBezier',
  'number',
  'strokeStyle',
  'border',
  'transition',
  'shadow',
  'gradient',
  'typography',
])
const isNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const isRef = (v: unknown): v is string => typeof v === 'string' && /^\{[^{}]+\}$/.test(v)

function colourProblems(v: unknown): string[] {
  const c = v as Colour
  const out: string[] = []
  if (c?.colorSpace !== 'srgb') out.push('colorSpace must be "srgb" here')
  if (!Array.isArray(c?.components) || c.components.length !== 3)
    out.push('srgb needs 3 components')
  else if (!c.components.every((n) => isNumber(n) && n >= 0 && n <= 1))
    out.push('components in 0–1')
  if (c?.alpha !== undefined && !(isNumber(c.alpha) && c.alpha >= 0 && c.alpha <= 1))
    out.push('alpha in 0–1')
  if (c?.hex !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(c.hex)) out.push('hex must be 6-digit CSS hex')
    else if (Array.isArray(c.components)) {
      const fromComponents = `#${c.components
        .map((n) =>
          Math.round(n * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`
      if (fromComponents !== c.hex.toLowerCase())
        out.push(`hex ${c.hex} ≠ components ${fromComponents}`)
    }
  }
  return out
}
const dimensionProblems = (v: unknown) => {
  const d = v as { value: unknown; unit: unknown }
  return isNumber(d?.value) && (d.unit === 'px' || d.unit === 'rem')
    ? []
    : ['dimension: value + unit px|rem']
}

function valueProblems(type: string, v: unknown): string[] {
  if (isRef(v)) return []
  switch (type) {
    case 'color':
      return colourProblems(v)
    case 'dimension':
      return dimensionProblems(v)
    case 'duration': {
      const d = v as { value: unknown; unit: unknown }
      return isNumber(d?.value) && (d.unit === 'ms' || d.unit === 's')
        ? []
        : ['duration: value + unit ms|s']
    }
    case 'cubicBezier': {
      const a = v as number[]
      return Array.isArray(a) &&
        a.length === 4 &&
        a.every(isNumber) &&
        a[0]! >= 0 &&
        a[0]! <= 1 &&
        a[2]! >= 0 &&
        a[2]! <= 1
        ? []
        : ['cubicBezier: four numbers, x in 0–1']
    }
    case 'number':
      return isNumber(v) ? [] : ['number: a JSON number']
    case 'fontFamily':
      return typeof v === 'string' ||
        (Array.isArray(v) && v.length > 0 && v.every((f) => typeof f === 'string'))
        ? []
        : ['fontFamily: a name or an array of names']
    case 'shadow': {
      const s = v as Record<string, unknown>
      return [
        ...(isRef(s?.color) ? [] : colourProblems(s?.color)),
        ...['offsetX', 'offsetY', 'blur', 'spread'].flatMap((k) =>
          isRef(s?.[k]) ? [] : dimensionProblems(s?.[k]),
        ),
      ]
    }
    default:
      return []
  }
}

/** Every rule this file's documents must meet, as a list of problems (empty = valid). */
function formatProblems(doc: TokenDocument): string[] {
  const problems: string[] = []
  const types = new Map<string, string>()
  const walk = (node: Record<string, unknown>, path: string[], inherited?: string) => {
    const groupType = typeof node.$type === 'string' ? node.$type : inherited
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$')) continue
      const where = [...path, key].join('.')
      if (/[{}.]/.test(key)) problems.push(`${where}: a name may not contain { } or .`)
      if (typeof child !== 'object' || child === null) {
        problems.push(`${where}: not a token or group`)
        continue
      }
      const c = child as Record<string, unknown>
      if ('$value' in c) {
        const type = (c.$type as string | undefined) ?? groupType
        if (!type) problems.push(`${where}: no $type, and none to inherit`)
        else if (!TYPES.has(type)) problems.push(`${where}: unknown $type ${type}`)
        else {
          types.set(where, type)
          problems.push(...valueProblems(type, c.$value).map((p) => `${where}: ${p}`))
        }
        if (Object.keys(c).some((k) => !k.startsWith('$')))
          problems.push(`${where}: a token may not hold children`)
        if (
          c.$extensions !== undefined &&
          (typeof c.$extensions !== 'object' || c.$extensions === null)
        )
          problems.push(`${where}: $extensions must be an object`)
      } else walk(c, [...path, key], groupType)
    }
  }
  walk(doc as Record<string, unknown>, [])
  // A reference must name a token of the same type that exists in this document.
  const check = (where: string, v: unknown, type: string | undefined) => {
    if (!isRef(v)) return
    const target = v.slice(1, -1)
    if (!types.has(target)) problems.push(`${where}: ${v} does not resolve`)
    else if (type && types.get(target) !== type)
      problems.push(`${where}: ${v} is a ${types.get(target)}`)
  }
  for (const [where, type] of types) {
    const [group, name] = where.split('.') as [string, string]
    const token = (doc[group] as Record<string, Token> | undefined)?.[name]
    if (token) check(where, token.$value, type)
  }
  return problems
}

describe('the three files follow the Design Tokens Format Module 2025.10', () => {
  for (const file of Object.values(FILES)) {
    it(`${file} is valid`, () => {
      expect(formatProblems(parsed(committed(file)))).toEqual([])
    })
  }

  it('NEGATIVE CONTROL: each rule rejects the defect it names', () => {
    const doc = parsed(committed(FILES.light)) as Record<string, Record<string, Token>>
    const plant = (mutate: (d: Record<string, Record<string, Token>>) => void) => {
      const copy = structuredClone(doc)
      mutate(copy)
      return formatProblems(copy)
    }
    const colour = () => ({ ...(doc.color?.ink?.$value as Colour) })
    // Each planted defect yields exactly the problem it should, and nothing passes silently.
    expect(
      plant((d) => {
        d.size!['radius-panel']!.$value = { value: 1, unit: 'em' }
      }),
    ).toHaveLength(1)
    expect(
      plant((d) => {
        d.color!.ink!.$value = { ...colour(), hex: '#1d1f1aff' }
      }),
    ).toHaveLength(1)
    expect(
      plant((d) => {
        d.color!.ink!.$value = { ...colour(), components: [1.2, 0, 0] }
      }),
    ).not.toEqual([])
    expect(
      plant((d) => {
        d.color!.ink!.$value = { ...colour(), hex: '#000000' }
      }),
    ).toHaveLength(1)
    expect(
      plant((d) => {
        d.duration!.fast!.$value = { value: 200, unit: 'sec' }
      }),
    ).toHaveLength(1)
    expect(
      plant((d) => {
        d.easing!.ease!.$value = [1.5, 0, 0, 1]
      }),
    ).toHaveLength(1)
    expect(
      plant((d) => {
        d.color!['serif-accent']!.$value = '{color.nope}'
      }),
    ).toHaveLength(1)
    expect(
      plant((d) => {
        d.color!['serif-accent']!.$value = '{duration.fast}'
      }),
    ).toHaveLength(1)
    expect(
      plant((d) => {
        d.color!['a.b'] = d.color!.ink!
      }),
    ).toHaveLength(1)
    // With no type, ink is reported, and so is every token that refers to it.
    expect(
      plant((d) => {
        delete d.color!.ink!.$type
      }),
    ).toContain('color.ink: no $type, and none to inherit')
  })
})

// ── A copy of a brand colour that has gone stale ────────────────────────────────────────────
//
// Forty-seven tracked files hold a token's hex (2026-10-22), most of them legitimately, so a
// check banning copies would be noise. What drift actually looks like is a NEAR-MISS: a hex a
// hair away from a current token without being it — #63665b beside #62655a (ΔE 0.0035 in OKLab),
// #5f7414 beside #586c05 (0.027). In the files that copy the design system on purpose, such a
// hex fails unless its line is dated history (carries a YYYY-MM-DD) or is listed below with why.

const COPIES = [
  'packages/ui/src/*.css',
  'apps/cms/src/app/(frontend)/*.css',
  'apps/viewer/src/styles/*.css',
  'apps/viewer/index.html',
  'apps/cms/src/lib/themeColor.ts',
  'infra/apex-404/page.js',
  'packages/shared/src/tokenContract.ts',
  'docs/DESIGN.md',
  'docs/guide/*.md',
  'docs/images/*.svg',
  'scripts/capture-doc-screenshots.mjs',
  'apps/cms/src/contrastRules.test.ts',
  'apps/cms/e2e/darkHeadings.spec.ts',
  'apps/viewer/e2e/darkHeadings.spec.ts',
  'apps/viewer/src/styles/tokens.test.ts',
  'apps/cms/src/publicSite.test.ts',
]

/** file → hexes that are near a token on purpose, each with the reason. */
const NEAR_ON_PURPOSE: Record<string, Record<string, string>> = {
  'packages/ui/src/footer.css': {
    '#ecebe6':
      'the partner logos are recoloured to it in their SVGs (an image file cannot read a token); ' +
      'chosen in a side-by-side by the owner. 2 steps off dark --text #ecebe4, raised 2026-10-22',
  },
  'apps/cms/src/app/(frontend)/site.css': {
    '#63665b': 'the 2026-09 fade incident, solved from the --muted of that day',
    '#a3a49b': 'the same incident: the old --muted at 55% over the page ground',
    '#44473e':
      '--muted as this site raises it for prefers-contrast: more. The design system high-contrast muted is ' +
      '#47493f; the two disagree, raised with the owner 2026-10-22',
    '#4a4c46': 'arithmetic: 80% ink over a white wall, the worst case under the photo hero',
  },
  'apps/viewer/src/styles/tokens.test.ts': {
    '#63665b': 'negative controls plant the retired --muted',
    '#5f7414': 'negative controls plant the retired --volt-deep',
    '#333333': 'a neutral grey fixture, not a brand colour',
    '#44473e': 'the EXCEPTIONS list naming the prefers-contrast: more --muted in site.css',
  },
}

function oklab(hex: string): [number, number, number] {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [1, 3, 5].map((i) => lin(Number.parseInt(hex.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** Every opaque hex the three exported files hold. */
function currentHexes(): string[] {
  const out = new Set<string>()
  for (const file of Object.values(FILES)) {
    const doc = parsed(committed(file)) as Record<string, Record<string, Token>>
    for (const token of Object.values(doc.color ?? {})) {
      const v = token.$value as Colour
      if (typeof v === 'object' && v.hex && (v.alpha ?? 1) === 1) out.add(v.hex.toLowerCase())
    }
  }
  return [...out]
}

/** ΔE in OKLab under which a different hex reads as a copy of a token rather than a new colour. */
const NEAR = 0.03

function staleCopies(file: string, text: string, tokens: string[]): string[] {
  const labs = tokens.map((h) => [h, oklab(h)] as const)
  const out: string[] = []
  text.split('\n').forEach((line, i) => {
    for (const match of line.matchAll(/#[0-9a-f]{6}\b/gi)) {
      const hex = match[0].toLowerCase()
      if (tokens.includes(hex) || NEAR_ON_PURPOSE[file]?.[hex]) continue
      if (/\b20\d\d-\d\d-\d\d\b/.test(line)) continue
      const o = oklab(hex)
      const near = labs
        .map(([h, t]) => [h, Math.hypot(o[0] - t[0], o[1] - t[1], o[2] - t[2])] as const)
        .sort((a, b) => a[1] - b[1])[0]
      if (near && near[1] < NEAR)
        out.push(`${file}:${i + 1} ${hex} is ${near[1].toFixed(4)} from ${near[0]}`)
    }
  })
  return out
}

describe('no file that copies the design system holds a stale brand colour', () => {
  const files = execFileSync('git', ['ls-files', '--', ...COPIES], {
    cwd: REPO,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)

  it('the list of copies resolves to real files', () => {
    expect(files.length).toBeGreaterThanOrEqual(COPIES.length)
  })

  it('every brand hex in them is the current token, dated history, or listed with a reason', () => {
    const tokens = currentHexes()
    const stale = files.flatMap((f) => staleCopies(f, readFileSync(join(REPO, f), 'utf8'), tokens))
    expect(
      stale,
      'A hex close to a brand colour is not the colour itself. Use the value in ' +
        'packages/ui/src/tokens.css, or date the line if it records history.',
    ).toEqual([])
  })

  it('NEGATIVE CONTROL: the retired values are caught undated and pass dated', () => {
    const tokens = currentHexes()
    expect(staleCopies('docs/guide/brand.md', '| Muted | `#63665b` |', tokens)).toHaveLength(1)
    expect(staleCopies('docs/guide/brand.md', 'stroke: #5f7414;', tokens)).toHaveLength(1)
    expect(staleCopies('docs/guide/brand.md', 'was #63665b until 2026-10-22', tokens)).toEqual([])
    // A deliberately different colour, far from every token, is never a copy.
    expect(staleCopies('docs/guide/brand.md', 'fill: #0057b8;', tokens)).toEqual([])
  })
})
