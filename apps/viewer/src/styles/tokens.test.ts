import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard the design tokens against the two ways they have actually broken.
 *
 * WHY THIS EXISTS. On 2026-08-13 an audit of the LIVE site found the skip link
 * rendering dark-on-dark at a contrast ratio of 1.00:1 — invisible to the sighted
 * keyboard user it exists for, in both themes. The cause was one word:
 * `base.css` declared `color: var(--page)`, and `--page` is not a token. It never
 * was. When a custom property has no value and no fallback the whole declaration
 * is dropped, so `color` silently fell back to `inherit` — which happened to be
 * the same ink as the background it sat on.
 *
 * Nothing caught it. `pnpm lint` does not resolve custom properties, the axe gate
 * in `e2e/a11y.spec.ts` deliberately treats colour-contrast as advisory, and
 * Lighthouse's accessibility category is `warn`. A typo in a variable name was
 * indistinguishable from a deliberate colour choice to every gate in the repo.
 *
 * The first assertion is therefore deliberately GENERIC — it does not know about
 * `--page` and would fail identically for the next mistyped token. The ad-hoc
 * check available at the time (does the skip link look right?) is exactly what
 * shipped the bug.
 */

const STYLES_DIR = join(import.meta.dirname)
const DESIGN_MD = join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'DESIGN.md')

/**
 * Blank out comment BODIES while preserving every offset and newline.
 *
 * Both checks below scan for source patterns, and this file's own comments
 * discuss those patterns in prose — the `:hover` guard immediately flagged the
 * sentence explaining why `:hover` needs guarding. Deleting comments outright
 * would fix the false positive and break every reported line number, so the
 * characters are replaced rather than removed.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}

function cssFiles(): { name: string; source: string }[] {
  return readdirSync(STYLES_DIR)
    .filter((name) => name.endsWith('.css'))
    .map((name) => ({
      name,
      source: stripComments(readFileSync(join(STYLES_DIR, name), 'utf8')),
    }))
}

/**
 * Custom properties this stylesheet READS but does not define, legitimately.
 *
 * `--reveal-y` and friends are ours and must resolve. Anything a third party owns
 * belongs here with the owner named, because we cannot define it and it is not a
 * typo.
 */
const EXTERNALLY_DEFINED = new Set<string>([
  // model-viewer's own theming API, set by the element, not by us.
  '--progress-bar-color',
  '--progress-bar-height',
  '--progress-mask',
])

describe('design tokens', () => {
  it('every var(--token) without a fallback resolves to a defined token', () => {
    const files = cssFiles()
    const defined = new Set<string>()
    for (const { source } of files) {
      for (const match of source.matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
        if (match[1]) defined.add(match[1])
      }
    }

    const dangling: string[] = []
    for (const { name, source } of files) {
      // `var(--x, fallback)` is safe even when --x is undefined: the fallback
      // applies and the declaration still produces a value. Only the bare form
      // can silently drop a declaration, so only the bare form is a finding.
      for (const match of source.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)) {
        const token = match[1]
        if (!token || defined.has(token) || EXTERNALLY_DEFINED.has(token)) continue
        const line = source.slice(0, match.index).split('\n').length
        dangling.push(`${name}:${line} reads ${token}, which is never defined`)
      }
    }

    expect(
      dangling,
      'A stylesheet reads a custom property that no stylesheet defines. The whole\n' +
        'declaration is dropped at computed-value time, so the property silently\n' +
        'inherits instead — which is how the skip link shipped at 1:1 contrast.\n' +
        'Either define the token, use the right name, or give var() a fallback.',
    ).toEqual([])
  })

  it('the motion tokens match the locked table in docs/DESIGN.md', () => {
    const tokens = readFileSync(join(STYLES_DIR, 'tokens.css'), 'utf8')
    const design = readFileSync(DESIGN_MD, 'utf8')

    // DESIGN.md calls itself the viewer's LOCKED design system and three source
    // files cite it as their authority. Until now nothing checked that the values
    // still agreed — the audit found them identical, which was discipline rather
    // than enforcement. `--settle` at 500ms is the specific value a vendored
    // animation skill would flag as "over 300ms, a finding"; the ruling in
    // apps/viewer/CLAUDE.md is that DESIGN.md wins, and this test is what makes
    // that ruling checkable instead of merely written down.
    // DESIGN.md carries the tokens across five tables and their COLUMNS DIFFER,
    // so a row cannot be read without its header:
    //
    //   | Token | Value | Role |   → column 3 is prose, not a dark value
    //   | Token | Light | Dark  |  → light-dark(c2, c3)
    //   | Token | Alpha | Used by | → column 2 is only the alpha of an rgba()
    //   | Token | Stack |         → one value
    //   | Token | Value |         → one value
    //
    // Two earlier drafts of this test got this wrong in opposite directions: the
    // first matched only backticked single values and silently skipped every
    // motion row — the rows it exists for — and the second treated any third
    // column as the dark value and reported the prose in `Role` as drift. Both
    // were green-or-noisy for reasons unrelated to the tokens. Parse the header.
    const norm = (value: string) => value.trim().replace(/['"]/g, '"').replace(/\s+/g, ' ')
    const strip = (cell: string) => cell.trim().replace(/^`|`$/g, '').trim()
    const mismatches: string[] = []
    const compared: string[] = []

    let columns: string[] = []
    for (const line of design.split('\n')) {
      const header = line.match(/^\|\s*Token\s*\|(.+)\|\s*$/i)
      if (header) {
        columns = (header[1] ?? '').split('|').map((c) => c.trim().toLowerCase())
        continue
      }
      const row = line.match(/^\|\s*`(--[a-z0-9-]+)`\s*\|(.+)\|\s*$/i)
      if (!row) continue

      const token = row[1] ?? ''
      const rest = row[2] ?? ''
      // `--grid` and friends are documented as an ALPHA only ("0.05"), which is
      // not enough to reconstruct the rgba() pair. Deliberately unchecked rather
      // than half-checked.
      if (!token || columns[0] === 'alpha') continue

      const declared = tokens.match(new RegExp(`${token}\\s*:\\s*([^;]+);`))
      if (!declared) continue

      const cells = rest.split('|').map(strip)
      const light = cells[0] ?? ''
      const dark = cells[1] ?? ''
      // Abbreviated on purpose in the document (a long font stack).
      if (!light || light.includes('…')) continue

      const documented =
        columns[0] === 'light' && columns[1] === 'dark' ? `light-dark(${light}, ${dark})` : light

      const actual = (declared[1] ?? '').trim().replace(/\s*\/\*.*$/, '')
      compared.push(token)
      if (norm(actual) !== norm(documented)) {
        mismatches.push(`${token}: DESIGN.md says "${documented}", tokens.css says "${actual}"`)
      }
    }

    // A parser that matched nothing would report zero mismatches and pass forever.
    // That is the failure mode BOTH earlier drafts of this test had, and no
    // `toEqual([])` can reveal it — so assert the work happened before asserting
    // its result. The floor is well under the ~20 rows currently comparable, so
    // adding or removing a documented token does not trip it; deleting the table,
    // or breaking the parser, does.
    expect(
      compared.length,
      `the DESIGN.md parser compared only ${compared.length} tokens — it has stopped ` +
        'reading the document it claims to guard',
    ).toBeGreaterThan(12)

    expect(
      mismatches,
      'tokens.css has drifted from the locked table in docs/DESIGN.md. Change both\n' +
        'together, or change neither — DESIGN.md was reconstructed FROM the code on\n' +
        '2026-08-06 precisely because a derived document that drifts is worse than none.',
    ).toEqual([])
  })
})

describe('spacing', () => {
  /**
   * The steps this design actually uses, measured on 2026-08-13.
   *
   * WHY AN ALLOWLIST AND NOT A 4px SCALE. The audit that produced this test found
   * 22 distinct spacing values on a 2px grid and no token, no documentation and
   * nothing preventing a 23rd. The obvious remedy — snap everything to 4/8/16/24
   * — moves 6, 10, 14, 18 and 22px by up to 2px each. That is a change to a
   * design `docs/DESIGN.md` calls LOCKED, on a live product, and it is a taste
   * decision rather than a correctness one, so it is the owner's to make and not
   * this test's to force.
   *
   * What was genuinely broken is that the set was accidental and open-ended.
   * Naming it closes that: the rendered result is byte-identical, a 23rd value
   * now fails, and tightening the list later is a one-line edit here plus the
   * CSS it forces you to look at.
   */
  const STEPS = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 64]

  it('uses only the documented spacing steps', () => {
    const offenders: string[] = []

    for (const { name, source } of cssFiles()) {
      const declaration = /^[ \t]*(padding|margin|gap|row-gap|column-gap)(-[a-z]+)?:([^;]+);/gim
      for (const match of source.matchAll(declaration)) {
        const line = source.slice(0, match.index).split('\n').length
        for (const value of (match[3] ?? '').trim().split(/\s+/)) {
          const px = value.match(/^(-?\d+(?:\.\d+)?)px$/)
          // `auto`, `0`, `clamp()`, `var()` and negative hairlines are not steps
          // on a spacing scale and are deliberately out of scope.
          if (!px) continue
          const magnitude = Math.abs(Number(px[1]))
          if (magnitude <= 1 || STEPS.includes(magnitude)) continue
          offenders.push(`${name}:${line} uses ${value} (${match[1]})`)
        }
      }
    }

    expect(
      offenders,
      `A spacing declaration uses a value outside the documented steps [${STEPS.join(', ')}].\n` +
        'Either reuse a step, or add the new one HERE and to the table in\n' +
        'docs/DESIGN.md so the set stays a decision rather than an accident.',
    ).toEqual([])
  })
})

describe('pointer-only styling', () => {
  it('every :hover rule sits inside a (hover: hover) block', () => {
    // A touch device has no hover, but it DOES match :hover on tap and holds it
    // until the next tap elsewhere. An ungated rule therefore reads as a stuck
    // state — and this product is reached by scanning a QR code, so most visits
    // are phones. Two of the six rules found on 2026-08-13 shared their styling
    // with `[aria-pressed]` / `[aria-selected]`, which made a merely-tapped
    // control indistinguishable from the selected one.
    const ungated: string[] = []

    for (const { name, source } of cssFiles()) {
      // Walk the braces. A regex cannot decide this: the `@media` guard and the
      // `:hover` it protects are separated by the rule's own block, so whether a
      // given `:hover` is covered depends on nesting, not on proximity.
      let depth = 0
      let pendingGuard = false
      const guardDepths: number[] = []

      for (let i = 0; i < source.length; i++) {
        if (source.startsWith('@media', i)) {
          const brace = source.indexOf('{', i)
          if (brace !== -1 && /hover:\s*hover/.test(source.slice(i, brace))) pendingGuard = true
          continue
        }
        if (source[i] === '{') {
          depth++
          if (pendingGuard) {
            guardDepths.push(depth)
            pendingGuard = false
          }
          continue
        }
        if (source[i] === '}') {
          if (guardDepths.at(-1) === depth) guardDepths.pop()
          depth--
          continue
        }
        if (source.startsWith(':hover', i) && guardDepths.length === 0) {
          const line = source.slice(0, i).split('\n').length
          ungated.push(
            `${name}:${line} — ${source.slice(source.lastIndexOf('\n', i) + 1, i + 6).trim()}`,
          )
        }
      }
    }

    expect(
      ungated,
      'A :hover rule is not gated behind `@media (hover: hover) and (pointer: fine)`.\n' +
        'On a phone that state sticks after a tap. If the rule expresses real state\n' +
        'rather than a hover hint, split it — see `.camera-btn` in page.css, where\n' +
        '`[aria-pressed="true"]` stays unconditional and only the hover half is gated.',
    ).toEqual([])
  })
})
