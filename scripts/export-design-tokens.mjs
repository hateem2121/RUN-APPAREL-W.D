/**
 * `packages/ui/src/tokens.css` → three Design Tokens Format Module 2025.10 files.
 *
 *   node scripts/export-design-tokens.mjs           writes packages/ui/tokens/*.tokens.json
 *   node scripts/export-design-tokens.mjs --check   writes nothing; exits 1 if they are stale
 *
 * WHY. tokens.css is the source of truth (its own header says so), and until 2026-10-22 every
 * other copy of it — the Paper & Ink design system, the brand guide, a dozen hex codes in tests
 * and docs — was kept in step by hand. Two colours changed that day and twelve files had to be
 * found by search. These files are the one export the design system is re-synced FROM, and
 * `apps/cms/src/designTokens.test.ts` fails a pull request that changes tokens.css without
 * re-running this script.
 *
 * THE FORMAT (read 2026-10-22: designtokens.org/tr/2025.10/format/ and …/color/, Final
 * Community Group Report, 28 October 2025):
 *   - colour: { colorSpace: 'srgb', components: [r, g, b] in 0–1, alpha only below 1, hex }
 *     — `hex` is 6-digit; transparency lives only in `alpha`.
 *   - dimension: { value, unit } with unit 'px' or 'rem' ONLY.
 *   - duration: { value, unit: 'ms' }.  cubicBezier: four numbers.  number: a JSON number.
 *   - fontFamily: a name or an array of names.  shadow: { color, offsetX, offsetY, blur, spread }.
 *   - a reference is '{group.token}'; names may not start with '$' or contain '{', '}' or '.'.
 *
 * WHAT CANNOT BE CARRIED, and is therefore named in each file's top-level $description rather
 * than dropped silently: clamp() and vw (no such dimension unit), a var() to a property this file
 * does not declare, and the @media / @supports overrides further down tokens.css.
 * Letter-spacing in `em` IS carried, as a number with an extension recording the unit, because
 * the format's dimension allows only px and rem.
 *
 * Plain JavaScript with no dependencies, like `contrast-rules.mjs`: it runs under bare `node`
 * in CI and the CMS's TypeScript tests import it through `export-design-tokens.d.mts`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
export const TOKENS_CSS = join(REPO, 'packages', 'ui', 'src', 'tokens.css')
export const OUT_DIR = join(REPO, 'packages', 'ui', 'tokens')
export const FILES = {
  light: 'paper-ink.tokens.json',
  dark: 'paper-ink.dark.tokens.json',
  highContrast: 'paper-ink.high-contrast.tokens.json',
}

/** Reverse-domain key for this repo's extensions, as the format asks. */
const EXT = 'com.wear-run.paper-ink'

/*
 * ⚠️ THE HIGH-CONTRAST THEME IS A DESIGN-SYSTEM ADDITION, NOT SOMETHING tokens.css DECLARES.
 * These five values come from the RUN APPAREL Paper & Ink design system (version 19,
 * 22 Oct 2026) and are FIXED INPUTS here: change them there first, then here. Every other
 * colour in the high-contrast file is the light theme's. Measured 2026-10-22, each text value
 * clears 7:1 (WCAG 1.4.6) on bg, surface, wash and raised; the tightest is muted on wash, 7.00.
 */
export const HIGH_CONTRAST_INPUTS = Object.freeze({
  muted: '#47493f',
  'volt-deep': '#3c4e00',
  danger: '#950000',
  line: 'rgba(29, 31, 26, 0.5)', // ink at 50%
  'line-control': 'rgba(29, 31, 26, 0.65)', // ink at 65%
})

/** The declarations of the FIRST `:root { … }` block, comments removed, in source order. */
export function rootDeclarations(css) {
  const start = css.indexOf(':root {')
  if (start < 0) throw new Error('tokens.css has no :root block')
  let depth = 0
  let end = start
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) {
      end = i
      break
    }
  }
  const body = css.slice(css.indexOf('{', start) + 1, end).replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out.push({ name: m[1], value: m[2].replace(/\s+/g, ' ').trim() })
  }
  return out
}

/** Custom properties set again outside the main :root block (media queries, @supports). */
function overriddenElsewhere(css) {
  const start = css.indexOf(':root {')
  const afterRoot = css.slice(css.indexOf('\n}\n', start)).replace(/\/\*[\s\S]*?\*\//g, '')
  return [...new Set([...afterRoot.matchAll(/--([a-z0-9-]+)\s*:/gi)].map((m) => m[1]))]
}

/** Split `a, b` at the top-level comma only (nested parentheses kept whole). */
function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let from = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') depth--
    else if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(from, i).trim())
      from = i + 1
    }
  }
  parts.push(text.slice(from).trim())
  return parts
}

/** `light-dark(a, b)` → { light: a, dark: b }; anything else is the same in both. */
function themeHalves(value) {
  const m = /^light-dark\(([\s\S]*)\)$/.exec(value)
  if (!m) return { light: value, dark: value }
  const [light, dark] = splitTopLevel(m[1])
  return { light, dark }
}

const round = (n) => Number(n.toFixed(6))
const hex2 = (n) => n.toString(16).padStart(2, '0')

/** A CSS colour → a 2025.10 colour value, or null if this is not a colour. */
export function colourValue(css) {
  let rgb
  let alpha = 1
  if (css === 'transparent') {
    rgb = [0, 0, 0]
    alpha = 0
  } else if (/^#[0-9a-f]{6}$/i.test(css)) {
    rgb = [1, 3, 5].map((i) => Number.parseInt(css.slice(i, i + 2), 16))
  } else {
    const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(css)
    if (!m) return null
    rgb = [Number(m[1]), Number(m[2]), Number(m[3])]
    alpha = m[4] === undefined ? 1 : Number(m[4])
  }
  const value = { colorSpace: 'srgb', components: rgb.map((c) => round(c / 255)) }
  if (alpha < 1) value.alpha = alpha
  value.hex = `#${rgb.map(hex2).join('')}`
  return value
}

const reference = (css) => /^var\(--([a-z0-9-]+)\)$/i.exec(css)?.[1] ?? null

/** One non-theme value → { $type, $value[, $extensions] }, or { omit: reason }. */
function classify(css) {
  if (/clamp\(|vw|vh|round\(/.test(css)) return { omit: `${css} (no 2025.10 dimension unit)` }
  let m = /^(-?[\d.]+)(px|rem)$/.exec(css)
  if (m) return { $type: 'dimension', $value: { value: Number(m[1]), unit: m[2] } }
  m = /^(-?[\d.]+)ms$/.exec(css)
  if (m) return { $type: 'duration', $value: { value: Number(m[1]), unit: 'ms' } }
  m = /^(-?[\d.]+)em$/.exec(css)
  if (m) {
    return {
      $type: 'number',
      $value: Number(m[1]),
      $extensions: { [EXT]: { unit: 'em', css } },
    }
  }
  m = /^cubic-bezier\(([^)]+)\)$/.exec(css)
  if (m) return { $type: 'cubicBezier', $value: m[1].split(',').map((n) => Number(n.trim())) }
  if (/^-?\d+$/.test(css)) return { $type: 'number', $value: Number(css) }
  // Split first, then test each name on its own: one pattern over the whole list
  // (`^(".*?"|[\w-]+)(\s*,\s*(…))*$`) backtracks exponentially, which CodeQL raised on PR #222.
  const names = splitTopLevel(css)
  if (names.every((f) => /^(?:"[^"]*"|[\w-]+)$/.test(f)) && /"|serif|monospace/.test(css)) {
    return { $type: 'fontFamily', $value: names.map((f) => f.replace(/^"|"$/g, '')) }
  }
  return { omit: `${css} (no 2025.10 type holds it)` }
}

/** `0 8px 24px rgba(…)` → a 2025.10 shadow value. */
function shadowValue(css) {
  const m =
    /^(-?[\d.]+)(px)?\s+(-?[\d.]+)(px)?\s+(-?[\d.]+)(px)?\s+(rgba?\([^)]+\)|#[0-9a-f]{6})$/i.exec(
      css,
    )
  if (!m) return null
  const px = (n) => ({ value: Number(n), unit: 'px' })
  return {
    color: colourValue(m[7]),
    offsetX: px(m[1]),
    offsetY: px(m[3]),
    blur: px(m[5]),
    spread: px(0),
  }
}

/** Which group a name belongs to, so a reference can name its full path. */
const GROUP = {
  color: 'color',
  dimension: 'size',
  duration: 'duration',
  cubicBezier: 'easing',
  number: null, // decided per token below: tracking or layer
  fontFamily: 'font',
  shadow: 'shadow',
}
const numberGroup = (name) => (name.startsWith('tracking-') ? 'tracking' : 'layer')

/**
 * Build the three documents from tokens.css source text. Pure: no file is read or written,
 * which is what lets the drift test run the export in memory.
 */
export function exportTokens(css) {
  const decls = rootDeclarations(css)
  const omitted = []
  /** name → { group, light, dark } once classified; references resolved to paths after. */
  const entries = new Map()

  for (const { name, value } of decls) {
    const halves = themeHalves(value)
    const lightColour = colourValue(halves.light) ?? (reference(halves.light) ? 'ref' : null)
    const darkColour = colourValue(halves.dark) ?? (reference(halves.dark) ? 'ref' : null)
    if (
      lightColour &&
      darkColour &&
      (lightColour !== 'ref' || darkColour !== 'ref' || value.startsWith('light-dark'))
    ) {
      entries.set(name, { group: 'color', $type: 'color', halves })
      continue
    }
    if (halves.light !== halves.dark && shadowValue(halves.light) && shadowValue(halves.dark)) {
      entries.set(name, { group: 'shadow', $type: 'shadow', halves })
      continue
    }
    const ref = reference(value)
    if (ref) {
      entries.set(name, { group: null, ref, halves })
      continue
    }
    const c = classify(value)
    if ('omit' in c) {
      omitted.push(`--${name}: ${c.omit}`)
      continue
    }
    const group = c.$type === 'number' ? numberGroup(name) : GROUP[c.$type]
    entries.set(name, { group, ...c })
  }

  // A reference takes its target's group and type; one to an undeclared property is left out.
  for (const [name, e] of entries) {
    if (e.group !== null) continue
    const target = entries.get(e.ref)
    if (!target || target.group === null) {
      omitted.push(`--${name}: var(--${e.ref}) (--${e.ref} is not declared in tokens.css)`)
      entries.delete(name)
      continue
    }
    e.group = target.group
    e.$type = target.$type
  }

  const path = (name) => `{${entries.get(name).group}.${name}}`
  const colourHalf = (css) => {
    const ref = reference(css)
    return ref ? path(ref) : colourValue(css)
  }

  const overrides = overriddenElsewhere(css)
  const description = (theme) =>
    `RUN APPAREL "Paper & Ink", ${theme}. GENERATED by scripts/export-design-tokens.mjs from ` +
    'packages/ui/src/tokens.css, the source of truth; do not edit by hand (run pnpm tokens:export). ' +
    `Left out because the 2025.10 format cannot hold them: ${omitted.join('; ')}. ` +
    `Not carried, because they are responsive overrides set outside :root: ${overrides
      .map((n) => `--${n}`)
      .join(', ')}.`

  const build = (theme, half, onlyThemed, colourOverrides = {}) => {
    const doc = { $description: description(theme) }
    for (const [name, e] of entries) {
      const themed = e.group === 'color' || e.group === 'shadow'
      if (onlyThemed && !themed) continue
      doc[e.group] ??= {}
      let token
      if (e.group === 'color') {
        const css = colourOverrides[name] ?? e.halves[half]
        token = { $type: 'color', $value: colourHalf(css) }
      } else if (e.group === 'shadow') {
        token = { $type: 'shadow', $value: shadowValue(e.halves[half]) }
      } else if (e.ref) {
        token = { $type: e.$type, $value: path(e.ref) }
      } else {
        token = { $type: e.$type, $value: e.$value }
        if (e.$extensions) token.$extensions = e.$extensions
      }
      doc[e.group][name] = token
    }
    return doc
  }

  return {
    light: build('light theme, plus every token that is not a colour', 'light', false),
    dark: build(
      'dark theme (colours and the shadow; every other token is in paper-ink.tokens.json)',
      'dark',
      true,
    ),
    highContrast: build(
      'high-contrast theme: the light theme with five colours from the design system (version 19, 22 Oct 2026)',
      'light',
      true,
      HIGH_CONTRAST_INPUTS,
    ),
    omitted,
  }
}

/**
 * The exact bytes each file holds: Biome's own JSON layout (biome.jsonc, line width 100), so
 * `pnpm lint` passes on generated output and the drift test compares like with like. Biome sets
 * an array of plain values on one line when that line fits, and one value per line when not.
 */
export const serialise = (doc) =>
  `${JSON.stringify(doc, null, 2).replace(
    /^( *)("[^"\n]*": )?\[\n([^[\]{}]*?)\n *\](,?)$/gm,
    (whole, indent, key = '', items, comma) => {
      const line = `${indent}${key}[${items.trim().split(/,\n */).join(', ')}]${comma}`
      return line.length <= 100 ? line : whole
    },
  )}\n`

/** { fileName: text } for the three files, from tokens.css source text. */
export function renderFiles(css) {
  const docs = exportTokens(css)
  return Object.fromEntries(
    Object.entries(FILES).map(([key, file]) => [file, serialise(docs[key])]),
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = renderFiles(readFileSync(TOKENS_CSS, 'utf8'))
  if (process.argv.includes('--check')) {
    const stale = Object.entries(files).filter(([file, text]) => {
      try {
        return readFileSync(join(OUT_DIR, file), 'utf8') !== text
      } catch {
        return true
      }
    })
    if (stale.length) {
      console.error(`Stale: ${stale.map(([f]) => f).join(', ')}. Run pnpm tokens:export.`)
      process.exit(1)
    }
    console.log('Design tokens are in step with tokens.css.')
  } else {
    mkdirSync(OUT_DIR, { recursive: true })
    for (const [file, text] of Object.entries(files)) writeFileSync(join(OUT_DIR, file), text)
    console.log(`Wrote ${Object.keys(files).join(', ')} to packages/ui/tokens/.`)
  }
}
