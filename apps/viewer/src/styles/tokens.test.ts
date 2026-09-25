import { existsSync, readFileSync, readdirSync } from 'node:fs'
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

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..')

/**
 * tokens.css and base.css moved to packages/ui on 2026-09-04 so apps/cms can render
 * the public site from the same design system rather than a second copy of it.
 *
 * ⚠️ EVERY check here MUST keep reaching page.css. The move would otherwise have
 * quietly dropped it — 2,263 lines, the largest stylesheet in the repo — out of this
 * file, and the suite would have gone green while measuring less. That is the failure
 * this repo keeps re-learning: a gate nothing reaches is worse than no gate, because
 * it is credited. Two directories are scanned, and files are resolved by NAME.
 */
const UI_STYLES_DIR = join(REPO_ROOT, 'packages', 'ui', 'src')
const PAGE_STYLES_DIR = join(import.meta.dirname)
/**
 * The public marketing site's chrome (apps/cms). It reads the same tokens, so it is
 * held to the same rules — a stylesheet outside this list is a stylesheet free to
 * reintroduce every defect the assertions below exist for.
 *
 * ⚠️ Yes, this reads across an app boundary on purpose. biome.jsonc bans cross-app
 * IMPORTS; this is a filesystem read in a test, and the alternative is a second copy
 * of eight assertions in apps/cms that would drift from this one. One gate covering
 * every consumer beats two gates that disagree.
 */
const SITE_STYLES_DIR = join(REPO_ROOT, 'apps', 'cms', 'src', 'app', '(frontend)')
const SCANNED_DIRS = [UI_STYLES_DIR, PAGE_STYLES_DIR, SITE_STYLES_DIR]
const DESIGN_MD = join(REPO_ROOT, 'docs', 'DESIGN.md')

/**
 * Resolve a stylesheet by NAME rather than by directory.
 *
 * The checks below care which file a rule is in, never where that file lives on
 * disk. Hard-coding one directory is exactly what broke when tokens.css and base.css
 * moved: page.css was still read from the old constant, and that surfaced as an
 * ENOENT rather than a wrong answer only by luck. Throwing on an unknown name keeps a
 * renamed file loud instead of silently unscanned.
 */
function cssPath(name: string): string {
  const dir = SCANNED_DIRS.find((candidate) => existsSync(join(candidate, name)))
  if (!dir) {
    throw new Error(
      `Stylesheet "${name}" is in none of [${SCANNED_DIRS.join(', ')}]. ` +
        'It was renamed, deleted, or moved somewhere this test does not scan — add ' +
        'the directory to SCANNED_DIRS rather than deleting the assertion.',
    )
  }
  return join(dir, name)
}

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

/**
 * The selector of the block a declaration sits in — enough to name an offender without
 * parsing CSS.
 *
 * ⚠️ THIS WAS A REGEX AND THE REGEX TOOK 3.3 SECONDS. `(before.match(/([^{};\n]+)\s*\{[^{}]*$/))`
 * reads correctly and backtracks catastrophically: `stripComments` replaces every comment
 * character with a SPACE, so these files carry runs of thousands of spaces, and both
 * `[^{};\n]+` and `\s*` can consume them in any split while `[^{}]*$` forces a rescan to
 * the end of the slice. Measured 2026-09-07 over the four scanned stylesheets
 * (base 19 KB, tokens 19 KB, page 119 KB, site 90 KB): **3316.6 ms**, against 0.1 ms for
 * this. Byte-identical output, both before and after the change.
 *
 * That single assertion was 3512 ms where every other test in this file is 2-11 ms, and
 * with vitest's 5 s default it TIMED OUT TWICE on a loaded machine in one session —
 * reported as "Test timed out in 5000ms" on a file nobody had edited, which reads as a
 * broken gate rather than a slow one. Raising the timeout would have hidden it.
 *
 * Same rule as the regex it replaces: the nearest `{` above the declaration, only if no
 * `}` intervenes, and the selector is the text on that line before it.
 */
function enclosingSelector(source: string, index: number): string {
  const before = source.slice(0, index)
  const open = before.lastIndexOf('{')
  if (open <= before.lastIndexOf('}')) return '?'
  const head = before.slice(0, open)
  const cut = Math.max(
    head.lastIndexOf('}'),
    head.lastIndexOf('{'),
    head.lastIndexOf(';'),
    head.lastIndexOf('\n'),
  )
  return head.slice(cut + 1).trim() || '?'
}

function cssFiles(): { name: string; source: string }[] {
  return SCANNED_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => name.endsWith('.css'))
      .map((name) => ({
        name,
        source: stripComments(readFileSync(join(dir, name), 'utf8')),
      })),
  )
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
    const tokens = readFileSync(cssPath('tokens.css'), 'utf8')
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

  /**
   * ⚠️ THE GATE ABOVE IS ASYMMETRIC, AND IT IS BLIND IN THE DIRECTION THAT ACTUALLY
   * HAPPENED. Measured 2026-09-07, both ways:
   *
   *   DESIGN.md documents a token tokens.css does not declare  -> caught
   *   tokens.css declares a token DESIGN.md does not document  -> 27 passed, silent
   *
   * The second is the dead-token case: something shipped to every visitor that no
   * document mentions and nothing reads. `--stagger: 60ms` lived in exactly that gap from
   * 2026-08-14 to 2026-09-07 and was reported by THREE separate audits before anyone
   * deleted it, because the gate meant to prevent drift skipped it by construction —
   * `if (!declared) continue` only ever walks rows that exist in the document.
   *
   * Motion tokens only. Colour and spacing tokens are documented across tables whose
   * columns differ and several are deliberately half-documented (see the `alpha` note
   * above); widening this would report those as failures on its first run.
   */
  it('every motion token in tokens.css is documented in DESIGN.md', () => {
    const tokens = readFileSync(cssPath('tokens.css'), 'utf8')
    const design = readFileSync(DESIGN_MD, 'utf8')

    // The motion block is delimited in the file by its own section comment.
    const block = tokens.slice(tokens.indexOf('--ease:'), tokens.indexOf('── Targets ─'))
    const declared = [...block.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1] ?? '')

    expect(
      declared.length,
      'the motion block parser found nothing — it has stopped reading tokens.css',
    ).toBeGreaterThan(6)

    const undocumented = declared.filter((token) => !design.includes(`\`${token}\``))
    expect(
      undocumented,
      'a motion token is shipped to every visitor and appears in no document.\n' +
        'Either use it and add it to the table in docs/DESIGN.md §5, or delete it.\n' +
        'This is the gap `--stagger` sat in for three weeks and three audits.',
    ).toEqual([])
  })

  /**
   * A Markdown table keeps only the columns its header row names. GitHub drops every
   * cell past that when it renders the page, and says nothing. The size-scale table
   * (§3) had a two-column header over three-column rows, so each px value and each
   * "used by" note was in the file and missing from the page — found 2026-09-17. The
   * parser above reads only the first value cell, so it could not notice.
   */
  it('every table in docs/DESIGN.md gives each row as many cells as its header', () => {
    const design = readFileSync(DESIGN_MD, 'utf8')
    // A pipe inside backticks, or written as \|, is text rather than a cell boundary.
    const cellCount = (line: string) =>
      line
        .replace(/\\\|/g, '')
        .replace(/`[^`]*`/g, (code) => code.replace(/\|/g, ''))
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|').length

    const mismatches: string[] = []
    let tables = 0
    let header: { cells: number; line: number } | null = null
    let inFence = false
    for (const [index, line] of design.split('\n').entries()) {
      if (line.startsWith('```')) {
        inFence = !inFence
        header = null
        continue
      }
      if (inFence || !line.trimStart().startsWith('|')) {
        header = null
        continue
      }
      if (header === null) {
        header = { cells: cellCount(line), line: index + 1 }
        tables += 1
        continue
      }
      const cells = cellCount(line)
      if (cells !== header.cells) {
        mismatches.push(
          `line ${index + 1}: ${cells} cells under the ${header.cells}-column header on line ${header.line}`,
        )
      }
    }

    // A scan that found no tables would pass forever; 13 tables exist on 2026-09-17.
    expect(
      tables,
      'the table scan found almost nothing — it has stopped reading DESIGN.md',
    ).toBeGreaterThan(10)
    expect(
      mismatches,
      'a DESIGN.md table row has a different number of cells from its header. GitHub drops\n' +
        'the extra cells without a warning, so the words are in the file and missing from the\n' +
        'page. Make the header row (and the --- row under it) name every column.',
    ).toEqual([])
  })
})

/**
 * Tokens added by the 2026-08-14 audit.
 *
 * WHY THESE EXIST. The audit found the system was missing values it had already
 * decided on and was re-deriving by hand. `docs/DESIGN.md` states a 44px touch
 * floor twice and the CSS never encoded it — which is how `.theme-toggle` shipped
 * **2.0px wide** on a 320px phone: `width: 44px` on a flex child with the default
 * `flex-shrink: 1` is a MAXIMUM, not a floor. The only shadow in the codebase was
 * a raw `rgba(0,0,0,.12)`, invisible on the dark `--bg`. Eight radii were raw px
 * against three radius tokens. The Type block declared four font FAMILIES and
 * zero SIZES.
 *
 * `--instant` and `--ui` are the owner's motion decision of 2026-08-14: the lock
 * is not lowered, it is SPLIT. Editorial motion keeps `--settle`/`--slow`;
 * anything a finger is waiting on gets `--ui`; focus and press get `--instant`.
 * The vendored animation skills argue every duration should be sub-300ms, and
 * `apps/viewer/CLAUDE.md` rules that DESIGN.md wins — this split is what closes
 * that argument without moving an entrance.
 *
 * Every size and radius below was MEASURED from what already shipped, exactly as
 * the spacing list in §6 was. Adding them changes no pixel; it makes the next
 * value a decision instead of an accident.
 */
describe('tokens added by the 2026-08-14 audit', () => {
  const tokens = () => readFileSync(cssPath('tokens.css'), 'utf8')

  it('splits interactive motion from editorial motion', () => {
    const source = tokens()
    expect(source, '--instant: focus and press, deliberately below --fast').toContain(
      '--instant: 120ms',
    )
    expect(source, '--ui: controls a finger is waiting on').toContain('--ui: 220ms')
    // The split is only meaningful if the editorial durations SURVIVE it.
    expect(source, '--settle must not be lowered by the split').toContain('--settle: 500ms')
    expect(source, '--slow must not be lowered by the split').toContain('--slow: 800ms')
  })

  it('encodes the touch-target floor DESIGN.md states twice and the CSS never did', () => {
    expect(tokens()).toContain('--target-min: 44px')
  })

  it('declares one elevation token, because the only shadow shipped was raw rgba', () => {
    expect(tokens()).toMatch(/--shadow-raised:\s*light-dark\(/)
  })

  it('declares the two radii measured from the eight raw values that shipped', () => {
    const source = tokens()
    expect(source).toContain('--radius-card: 12px')
    expect(source).toContain('--radius-chip: 6px')
  })

  it('declares the action-bar height that three places re-derived by hand', () => {
    expect(tokens()).toContain('--action-bar-h: 72px')
  })

  it('declares a type scale written FROM the shipped sizes', () => {
    const source = tokens()
    for (const token of [
      // rem since 2026-09-04 — same pixels at the 16px default, but they now follow
      // the visitor's own text-size setting. The px equivalents stay in the comment
      // beside each token so the audit's original measurement is still readable.
      '--text-body: 1.0625rem',
      '--text-sm: 0.9375rem',
      '--text-xs: 0.8125rem',
      '--text-mono: 0.6875rem',
      '--text-mono-sm: 0.625rem',
      // The four added 2026-09-05, closing the gap the 2026-08-14 block named in
      // its own comment: it tokenised five of nine and said "nothing to stop a
      // tenth". Seventeen raw declarations were still in the two component sheets.
      // --text-wordmark (18px) was deleted 2026-09-24 with its only reader, the viewer's old header wordmark.
      '--text-wordmark-sm: 1rem',
      '--text-note: 0.875rem',
      '--text-mono-lg: 0.75rem',
    ]) {
      expect(source, `${token} is one of the eleven raw sizes the audit counted`).toContain(token)
    }
  })

  it('declares the tracking and layering scales added 2026-09-05', () => {
    const source = tokens()
    for (const token of [
      '--tracking-caps-tight: 0.1em',
      '--tracking-caps: 0.12em',
      '--tracking-caps-wide: 0.14em',
      '--tracking-caps-compact: 0.06em',
      // ⚠️ NOT 0.12em. docs/DESIGN.md §3 states 11px/0.11em and 10px/0.12em as
      // separate rows because they render 1.21px and 1.20px — the same optical
      // tracking from two sizes. Folding them moves `.mono` to 1.32px.
      '--tracking-mono: 0.11em',
      '--tracking-wordmark: -0.02em',
      '--z-stage-control: 1',
      '--z-header: 40',
      '--z-action-bar: 50',
      '--z-grain: 60',
      '--z-cursor: 70',
      '--z-preloader: 80',
      '--z-skip-link: 100',
    ]) {
      expect(source, `${token} documents a value that already shipped`).toContain(token)
    }
  })

  it('keeps the skip link above the preloader', () => {
    // Not a style preference. The preloader covers the viewport, and the skip link
    // is the keyboard user's first control — if the curtain won, tabbing during
    // load would focus something nobody can see. Asserted on the NUMBERS so a
    // renumbering that reads fine cannot invert them.
    const source = tokens()
    const value = (token: string) => {
      const match = source.match(new RegExp(`${token}:\\s*(\\d+)`))
      expect(match, `${token} is missing`).not.toBeNull()
      return Number(match?.[1])
    }
    expect(value('--z-skip-link')).toBeGreaterThan(value('--z-preloader'))
    expect(value('--z-preloader')).toBeGreaterThan(value('--z-cursor'))
    expect(value('--z-grain')).toBeGreaterThan(value('--z-action-bar'))
    expect(value('--z-action-bar')).toBeGreaterThan(value('--z-header'))
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

/**
 * No raw radius, shadow or duration in a component stylesheet.
 *
 * `tokens.css:4` states the rule in its own words — "Components read ONLY these
 * semantic custom properties — never raw hex" — and `docs/DESIGN.md` §8 repeats
 * it as rule 3. Until 2026-08-14 nothing enforced it, and an audit found eight
 * raw `border-radius` values against three radius tokens (`12px` alone appeared
 * three separate times), one raw `rgba(0, 0, 0, 0.12)` drop shadow in a system
 * that defined no shadow token at all, and one raw `120ms ease-out`.
 *
 * The shadow is the one worth naming: 12% black is invisible over the dark `--bg`
 * (#1c1f18), so the floating colourway preview lost its only separation from the
 * rail behind it — in the theme a large share of phones default to.
 *
 * `tokens.css` is exempt: it is where the literals are SUPPOSED to live.
 */
/**
 * Match a declaration terminated by `;` OR by the closing `}` of its block.
 *
 * ⚠️ Both halves added 2026-09-05 after an independent verification pass found the
 * three gates below could be walked past two ways. Neither was being exploited —
 * re-scanned at the time, 0 instances of each — but a gate with a known hole is a
 * gate that stops being trusted the first time it misses something.
 */
const DECL = (prop: string) => new RegExp(`${prop}:\\s*([^;}]+)[;}]`, 'g')

/**
 * A `var()` with a RAW FALLBACK is a raw value wearing a token's clothes:
 * `font-size: var(--nope, 14px)` renders 14px when the token does not exist, which
 * is exactly the mistyped-token failure `tokens.test.ts` was written for. Only a
 * bare `var(--token)` counts as tokenised.
 */
const isTokenised = (value: string) => /^var\(\s*--[\w-]+\s*\)$/.test(value.trim())

describe('raw values in component stylesheets', () => {
  const components = () => cssFiles().filter(({ name }) => name !== 'tokens.css')

  it('every border-radius cites a token', () => {
    const offenders: string[] = []
    for (const { name, source } of components()) {
      // `50%` and `999px` are shapes, not scale steps — a circle is a circle.
      for (const match of source.matchAll(/border-radius:\s*(\d+)px/g)) {
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(`${name}:${line} uses border-radius: ${match[1]}px`)
      }
    }
    expect(
      offenders,
      'Use --radius-panel / --radius-card / --radius-button / --radius-chip / --radius-pill.\n' +
        'If none fits, add the step to tokens.css and to docs/DESIGN.md §4 — the two\n' +
        'that exist were measured from shipped values rather than invented.',
    ).toEqual([])
  })

  it('every shadow cites a token, and none of them is pure black', () => {
    const offenders: string[] = []
    for (const { name, source } of components()) {
      for (const match of source.matchAll(/box-shadow:\s*([^;]+);/g)) {
        const value = match[1] ?? ''
        // An inset ring drawn with color-mix from a token is fine; a literal
        // rgba(0,0,0,…) is not, and is invisible in dark mode besides.
        if (!/rgba?\(\s*0\s*,\s*0\s*,\s*0/.test(value)) continue
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(`${name}:${line} — ${value.trim().slice(0, 60)}`)
      }
    }
    expect(
      offenders,
      'Use --shadow-raised. Pure black is wrong in BOTH halves of this system:\n' +
        '--ink is deliberately "#1d1f1a … Never #000", and 12% black over the dark\n' +
        '--bg is invisible, which is the bug this token was added to fix.',
    ).toEqual([])
  })

  it('every transition and animation duration cites a token', () => {
    const offenders: string[] = []
    for (const { name, source } of components()) {
      // Shorthand only. `transition-duration: 0.01ms !important` in the
      // reduced-motion block is a longhand override and is deliberately exempt —
      // it is the mechanism that disables motion, not a duration choice.
      for (const match of source.matchAll(/^\s*(transition|animation):\s*([^;]+);/gm)) {
        const value = match[2] ?? ''
        if (!/\b\d+(?:\.\d+)?m?s\b/.test(value)) continue
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(`${name}:${line} — ${match[1]}: ${value.trim().slice(0, 60)}`)
      }
    }
    expect(
      offenders,
      'Use --instant / --fast / --ui / --settle / --slow. docs/DESIGN.md §5 says which\n' +
        'is which; they are 20ms apart in places and mean different things.',
    ).toEqual([])
  })

  /**
   * The three gates added 2026-09-05, and what each of them would have caught.
   *
   * The radius/shadow/duration gates above have held since 2026-08-14 while
   * font-size, letter-spacing and z-index went on being written as literals — 17,
   * 21 and 7 of them. That is not an oversight anyone would spot by reading: a
   * lone `font-size: 0.875rem` looks like a decision, and only counting reveals
   * that three separate components each made it independently.
   *
   * ⚠️ EACH ALLOWLIST BELOW IS A DOCUMENTED DECISION, NOT A TODO. `clamp()`
   * display sizes and `.serif-accent`'s `1.07em` are exempt because
   * docs/DESIGN.md §3 says ranges and ratios are not scale steps. Emptying an
   * allowlist to "finish the job" would reverse that.
   *
   * TY-03 (2026-09-25): the exemption used to be "any clamp() and any em", which let a
   * sixth display size — or a `0.9em` body size — through without anyone deciding it.
   * It is now the five ranges below, BY SELECTOR, and the one ratio. Each range must
   * also be named in docs/DESIGN.md §3, so the prose index cannot drift from the CSS.
   */
  const DISPLAY_RANGES = [
    { file: 'base.css', selector: '.display--hero', value: 'clamp(2.125rem, 5.4vw, 4.5rem)' },
    {
      file: 'base.css',
      selector: '.display--section',
      value: 'clamp(1.625rem, 4vw, 2.875rem)',
    },
    {
      file: 'page.css',
      selector: '.product-info--aside .display--hero',
      value: 'clamp(1.5625rem, 9.5cqi, 2.5rem)',
    },
    {
      file: 'site.css',
      selector: '.site-hero .display--hero',
      value: 'clamp(min(2.125rem, 9.6vw), 5.4vw, 4.5rem)',
    },
    { file: 'site.css', selector: '.footer-q', value: 'clamp(27px, 4.3vw, 52px)' },
  ] as const
  const RATIOS = [{ file: 'base.css', selector: '.serif-accent', value: '1.07em' }] as const

  function rawFontSizes(): Array<{ at: string; file: string; selector: string; value: string }> {
    const found: Array<{ at: string; file: string; selector: string; value: string }> = []
    for (const { name, source } of components()) {
      for (const match of source.matchAll(DECL('font-size'))) {
        const value = (match[1] ?? '').trim()
        if (isTokenised(value)) continue
        const line = source.slice(0, match.index).split('\n').length
        found.push({
          at: `${name}:${line}`,
          file: name,
          selector: enclosingSelector(source, match.index),
          value,
        })
      }
    }
    return found
  }

  it('every font-size cites a token, a range, or a ratio', () => {
    const allowed = [...DISPLAY_RANGES, ...RATIOS]
    const offenders = rawFontSizes()
      .filter(
        (size) =>
          !allowed.some(
            (entry) =>
              entry.file === size.file &&
              entry.selector === size.selector &&
              entry.value === size.value,
          ),
      )
      .map((size) => `${size.at} ${size.selector} — font-size: ${size.value}`)
    expect(
      offenders,
      'Use a --text-* token. Nine sizes ship (10-18px) and all nine are declared;\n' +
        'if a tenth is genuinely needed, add it to tokens.css AND to the table in\n' +
        'docs/DESIGN.md §3 — the drift test above reads that table. A new display\n' +
        'range is a design decision: add it to DISPLAY_RANGES here AND to §3.',
    ).toEqual([])
  })

  it('TY-03 — every allowed range and ratio is still in use and named in docs/DESIGN.md', () => {
    const sizes = rawFontSizes()
    const design = readFileSync(DESIGN_MD, 'utf8')
    const stale: string[] = []
    for (const entry of [...DISPLAY_RANGES, ...RATIOS]) {
      const used = sizes.some(
        (size) =>
          size.file === entry.file &&
          size.selector === entry.selector &&
          size.value === entry.value,
      )
      if (!used) stale.push(`${entry.file} ${entry.selector} no longer sets ${entry.value}`)
      // The FULL selector, scope included: §3 names `.site-hero .display--hero` and
      // `.product-info--aside .display--hero` as the two narrower variants by those names.
      if (!design.includes(entry.selector)) {
        stale.push(`docs/DESIGN.md never names ${entry.selector}`)
      }
    }
    expect(
      stale,
      'An allowed font-size range is no longer where this test says it is, or the\n' +
        'design index stopped describing it. Update the list and docs/DESIGN.md §3 together.',
    ).toEqual([])
  })

  it('every letter-spacing cites a token, or inherits its parent’s', () => {
    const offenders: string[] = []
    for (const { name, source } of components()) {
      for (const match of source.matchAll(DECL('letter-spacing'))) {
        const value = (match[1] ?? '').trim()
        if (isTokenised(value)) continue
        /*
         * `inherit` is the serif accent taking whatever the headline around it has —
         * see `.serif-accent` in base.css and docs/DESIGN.md §3. It is not a value, so
         * it cannot be an eighth step, and it cannot drift from the headline the way a
         * cited token can: whatever it resolves to has already passed this gate on the
         * parent.
         *
         * ⚠️ THIS EXEMPTION WAS `value === '0'` UNTIL 2026-09-07 AND IS NOW STRICTLY
         * TIGHTER, not widened. `0` existed for this one rule, which is what audit
         * FA-C-63 was about: the accent sat untracked inside a headline tracked
         * -2.16px, a visible change of rhythm mid-sentence. With the rule gone, a bare
         * `0` is no longer allowed anywhere — grep confirms none remains.
         */
        if (value === 'inherit') continue
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(`${name}:${line} — letter-spacing: ${value}`)
      }
    }
    expect(
      offenders,
      'Use --tracking-caps-tight / --tracking-caps / --tracking-caps-wide /\n' +
        '--tracking-caps-compact / --tracking-mono / --tracking-wordmark, or one of\n' +
        'the two display tokens — or `inherit`, if the rule is text sitting INSIDE\n' +
        'other text and should carry that text’s tracking. Six steps cover the shipped\n' +
        'declarations; a seventh needs a row in docs/DESIGN.md §3 saying what it is FOR.',
    ).toEqual([])
  })

  it('every z-index cites a token', () => {
    const offenders: string[] = []
    for (const { name, source } of components()) {
      for (const match of source.matchAll(DECL('z-index'))) {
        const value = (match[1] ?? '').trim()
        if (isTokenised(value)) continue
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(`${name}:${line} — z-index: ${value}`)
      }
    }
    expect(
      offenders,
      'Use a --z-* token. A z-index means nothing on its own — it is only a\n' +
        'position in the stack, and the stack is the table in docs/DESIGN.md §4.\n' +
        'A raw number is a layer nobody can order against the other six.',
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

/**
 * The progress indicators must be VISIBLE, in both themes.
 *
 * WHY THIS EXISTS. On 2026-08-13 the preloader's progress rule was measured at
 * **1.11:1** against the light background: `.preloader__rule > span` filled with
 * raw `var(--volt)` (#cdf345) on `--bg` (#f1efea). Light mode is the default, so
 * most visitors had never seen that bar at all — while a large counter above it
 * animated convincingly. The owner's report was "it does not show the loading
 * status"; this was one of the five causes.
 *
 * It is the same failure class as the 1.00:1 skip link above, and it evaded the
 * same gates for a different reason: the token was not mistyped, so the dangling-
 * token test could not see it, and axe scores only TEXT, so a 2px graphical fill
 * is invisible to the a11y gate too.
 *
 * DESIGN.md is unambiguous about the rule being broken: `--volt-deep` exists
 * because "volt is illegible on paper-white", and the mode-flip table assigns
 * dimension lines to volt-deep in light and volt in dark — which is exactly the
 * `--dimension` token. A progress fill is a dimension line.
 */
const PROGRESS_FILLS = [
  { file: 'page.css', selector: '.preloader__rule > span' },
  { file: 'page.css', selector: '.stage__loading-bar span' },
]

/** sRGB relative luminance, per WCAG. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const linear = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
}

/** What the eye receives when `fg` is drawn over `bg` at `alpha`. */
function composite(fg: string, bg: string, alpha: number): string {
  const ch = (hex: string, i: number) => Number.parseInt(hex.slice(i, i + 2), 16)
  const mix = (i: number) => Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha))
  return `#${[1, 3, 5].map((i) => mix(i).toString(16).padStart(2, '0')).join('')}`
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

/** The raw declared value of a token, before any nested var() is expanded. */
function rawValue(tokensSource: string, token: string): string | null {
  const declaration = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(tokensSource)
  return declaration?.[1]?.trim() ?? null
}

/**
 * Resolve a token to its light and dark hex values, unwrapping `light-dark()`
 * AND any nested token references.
 *
 * The nesting is not hypothetical: the token this test exists to check is
 * `--dimension: light-dark(var(--volt-deep), var(--volt))`, so a resolver that
 * only understood literal hex would report "does not resolve" for precisely the
 * value it was written to verify — and an unverifiable token must fail loudly
 * rather than pass by default.
 */
function resolveToken(tokensSource: string, token: string): { light: string; dark: string } | null {
  let value = rawValue(tokensSource, token)
  if (value === null) return null
  for (let depth = 0; depth < 4 && value.includes('var('); depth++) {
    value = value.replace(
      /var\(\s*(--[a-z0-9-]+)\s*\)/gi,
      (whole, nested: string) => rawValue(tokensSource, nested) ?? whole,
    )
  }
  const pair = /light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/i.exec(value)
  if (pair?.[1] && pair[2]) return { light: pair[1], dark: pair[2] }
  const flat = /^(#[0-9a-f]{6})$/i.exec(value)
  if (flat?.[1]) return { light: flat[1], dark: flat[1] }
  return null
}

describe('progress indicators', () => {
  it('every progress fill clears 3:1 against the background it sits on, in BOTH themes', () => {
    const tokensSource = readFileSync(cssPath('tokens.css'), 'utf8')
    const bg = resolveToken(tokensSource, '--bg')
    expect(bg, '--bg must resolve for this test to mean anything').not.toBeNull()

    const failures: string[] = []
    for (const { file, selector } of PROGRESS_FILLS) {
      const source = stripComments(readFileSync(cssPath(file), 'utf8'))
      // Find the rule block for this selector and read its `background`.
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(source)
      if (!block?.[1]) {
        failures.push(`${file}: no rule found for \`${selector}\` — did it get renamed?`)
        continue
      }
      const background = /background(?:-color)?\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/i.exec(block[1])
      if (!background?.[1]) {
        failures.push(
          `${file} ${selector}: background is not a bare var(--token); cannot verify it`,
        )
        continue
      }
      const fill = resolveToken(tokensSource, background[1])
      if (!fill) {
        failures.push(`${file} ${selector}: ${background[1]} does not resolve to a hex pair`)
        continue
      }
      for (const mode of ['light', 'dark'] as const) {
        const ratio = contrast(fill[mode], bg?.[mode] ?? '#ffffff')
        if (ratio < 3) {
          failures.push(
            `${file} ${selector} fills with ${background[1]} (${fill[mode]}) on ${bg?.[mode]} ` +
              `in ${mode} mode — ${ratio.toFixed(2)}:1, below the 3:1 floor for a graphical object`,
          )
        }
      }
    }

    expect(
      failures,
      'A progress indicator is not visible against its own background. axe cannot\n' +
        'catch this (it scores text, not a 2px fill) and the dangling-token test\n' +
        'cannot either (the token exists). Use --dimension for a dimension line:\n' +
        'DESIGN.md says volt is illegible on paper-white, which is why --volt-deep\n' +
        'exists and why --dimension resolves to it in light mode.',
    ).toEqual([])
  })

  /**
   * ⚠️ THE TEST ABOVE READS THE TOKEN, AND THAT IS WHY IT MISSED `.stage__more`.
   *
   * `.stage__more` — the chevron telling a phone visitor there is more page below —
   * carried `color: var(--muted); opacity: 0.55` until 2026-09-05. The token was
   * fine at 5.10:1 light / 6.69:1 dark. Composited through that opacity a visitor
   * actually saw **2.19:1 and 2.97:1**, both under the 3:1 floor for a graphical
   * object. It is `aria-hidden="true"`, so axe skipped it too — three gates, none
   * of which could see the defect, on the only cue that says the page continues.
   *
   * So this checks the thing the other test structurally cannot: a rule that
   * declares BOTH a token colour and an `opacity`, scored on what the eye receives.
   *
   * It does not attempt to resolve arbitrary opacity anywhere in the cascade — a
   * translucent ANCESTOR is a different problem and one this file cannot see. It
   * pins the case that actually shipped, which is opacity beside colour in one rule.
   */
  const TRANSLUCENT_GRAPHICS = [{ file: 'page.css', selector: '.stage__more' }]

  it('a rule that dims its own colour still clears 3:1 on what the eye receives', () => {
    // ⚠️ `cssPath`, NOT a directory constant. This test arrived from main (2026-09-05)
    // written against `STYLES_DIR`, the same day this branch deleted that constant by
    // moving tokens.css into packages/ui. Git auto-merged the two without a marker and
    // the result referenced a name that no longer existed — caught by running the
    // gates on a trial merge, not by reading the diff.
    const tokensSource = readFileSync(cssPath('tokens.css'), 'utf8')
    const bg = resolveToken(tokensSource, '--bg')
    expect(bg, '--bg must resolve for this test to mean anything').not.toBeNull()

    const failures: string[] = []
    for (const { file, selector } of TRANSLUCENT_GRAPHICS) {
      const source = stripComments(readFileSync(cssPath(file), 'utf8'))
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(source)
      if (!block?.[1]) {
        failures.push(`${file}: no rule found for \`${selector}\` — did it get renamed?`)
        continue
      }
      const colour = /(?:^|[;{\s])color\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/i.exec(block[1])
      if (!colour?.[1]) {
        failures.push(`${file} ${selector}: color is not a bare var(--token); cannot verify it`)
        continue
      }
      const resolved = resolveToken(tokensSource, colour[1])
      if (!resolved) {
        failures.push(`${file} ${selector}: ${colour[1]} does not resolve to a hex pair`)
        continue
      }
      const alphaMatch = /(?:^|[;{\s])opacity\s*:\s*([\d.]+)/i.exec(block[1])
      const alpha = alphaMatch?.[1] ? Number(alphaMatch[1]) : 1
      for (const mode of ['light', 'dark'] as const) {
        const behind = bg?.[mode] ?? '#ffffff'
        const seen = composite(resolved[mode], behind, alpha)
        const ratio = contrast(seen, behind)
        if (ratio < 3) {
          failures.push(
            `${file} ${selector}: ${colour[1]} at opacity ${alpha} reads ${ratio.toFixed(2)}:1 ` +
              `on ${behind} in ${mode} mode — below the 3:1 floor. The token itself is ` +
              `${contrast(resolved[mode], behind).toFixed(2)}:1, which is why a token-only ` +
              `check passes this.`,
          )
        }
      }
    }

    expect(
      failures,
      'A cue is being dimmed below the contrast floor by its own opacity.\n' +
        'Lower the opacity requirement rather than the colour: dropping `opacity`\n' +
        'and keeping --muted measures 5.10:1 light / 6.69:1 dark. --dimension also\n' +
        'passes but resolves to volt, which pulls the eye off the garment.',
    ).toEqual([])
  })
})

describe('user preferences the stylesheets answer', () => {
  /**
   * Each of these is a real accessibility need with a real consumer on this page,
   * and the list has grown by discovery rather than by design — reduced-transparency
   * was added 2026-08-14 after a grep found only two were answered, and
   * forced-colors and prefers-contrast on 2026-09-04 after an audit found the
   * colourway selection was expressed purely as a fill inversion, which is exactly
   * what Windows High Contrast overrides.
   *
   * The test names the consumer for each, so a future removal has to argue with a
   * specific case rather than with a media query.
   */
  const REQUIRED = [
    ['prefers-color-scheme', 'the light/dark palette'],
    ['prefers-reduced-motion', 'reveals, the cursor, Lenis and the loading sweep'],
    ['prefers-reduced-transparency', 'the loading card'],
    ['forced-colors', 'colourway and camera selection, which is fill-inversion only'],
    ['prefers-contrast', 'the 18%-opacity hairlines every panel is separated by'],
  ] as const

  it.each(REQUIRED)('answers %s — %s', (query, consumer) => {
    const all = cssFiles()
      .map(({ source }) => source)
      .join('\n')
    expect(
      all.includes(`(${query}`),
      `No stylesheet answers ${query}. It matters here for ${consumer}.`,
    ).toBe(true)
  })

  /**
   * FA-G-52 / FA-G-61 — Windows High Contrast works because the code does NOT
   * fight it, and there is exactly one sanctioned exception.
   *
   * The audit of 2026-09-06 scored this 9 and the whole finding rests on a
   * negative: `forced-color-adjust: none` opts an element out of the user's
   * palette, and it appears on ONE selector in the entire design system —
   * `.colourway-tab__swatch`, whose only job is to show a colour that
   * forced-colors would otherwise erase, turning the rail into five identical
   * circles. `page.css:2316` states the rule as prose ("ON THE SWATCH ONLY, and
   * nowhere else"); prose is not a gate.
   *
   * ⚠️ THE FAILURE MODE IS SILENT AND LOOKS LIKE A FIX. Someone reports that the
   * brand colours vanish in High Contrast, adds `forced-color-adjust: none` to
   * `.btn--primary` or to `body`, and the page now ignores the palette a visitor
   * with low vision explicitly chose — while looking correct to everyone who
   * reviews it, because neither engine available on this machine emulates
   * forced-colors. The related audit finding FA-G-61 is that 51 reported contrast
   * failures under forced-colors were FALSE: the checker read author colours
   * before substitution. Substitution is what this property switches off.
   *
   * The SET OF SELECTORS is what must not grow, so that is what is compared — not
   * a count, and not a line number. A count says nothing about which element
   * escaped, and a line number would make this fail on every unrelated edit above
   * it, which is how a gate gets loosened to shut it up.
   */
  /*
   * ⚠️ THE CONTROL FOR THE ASSERTION BELOW, AND IT IS NOT OPTIONAL. That test passes when
   * the set of offenders is exactly one — which is also what it would report if
   * `enclosingSelector` silently returned `?` for everything, or if the match loop found
   * nothing at all. This feeds it a stylesheet shaped like the failure it exists to
   * catch, including the long comment run that made the old regex quadratic, and
   * requires the offender to be NAMED.
   */
  it('the offender detector names a real selector (negative control)', () => {
    const sabotaged = [
      `/*${' '.repeat(4000)}*/`,
      '.colourway-tab__swatch {',
      '  forced-color-adjust: none;',
      '}',
      '.btn--primary {',
      '  forced-color-adjust: none;',
      '}',
    ].join('\n')

    const found = [...sabotaged.matchAll(/forced-color-adjust\s*:\s*none/g)].map((match) =>
      enclosingSelector(sabotaged, match.index),
    )
    expect(found).toEqual(['.colourway-tab__swatch', '.btn--primary'])
  })

  it('opts exactly one element out of the forced-colors palette', () => {
    const uses: string[] = []
    for (const { name, source } of cssFiles()) {
      // `none` is the only value that opts out; `auto` is the default and is a
      // no-op wherever it appears.
      for (const match of source.matchAll(/forced-color-adjust\s*:\s*none/g)) {
        uses.push(`${name} ${enclosingSelector(source, match.index)}`)
      }
    }

    expect(
      uses.sort(),
      'forced-color-adjust: none opts an element out of the palette a Windows High\n' +
        'Contrast user chose. It is sanctioned on the colourway swatch ONLY, because\n' +
        'that element exists to show a colour. Anywhere else it overrides an\n' +
        'accessibility preference, and no browser on this machine can show you that\n' +
        'it did. See page.css and audit FA-G-52.',
    ).toEqual(['page.css .colourway-tab__swatch'])
  })
})

/**
 * Spacing written into JSX, where the stylesheet gate cannot see it.
 *
 * ⚠️ THIS EXISTS BECAUSE THE GATE ABOVE HAD A HOLE AND WAS BEING CREDITED ANYWAY.
 * "uses only the documented spacing steps" reads `.css` files. On 2026-09-05 an audit
 * of the public site found three hard-coded spacing values living in `style={{ … }}`
 * attributes inside `.tsx` files — `marginTop: '24px'` twice and `padding: '20px'` once
 * — which had never been scanned by anything. The values happened to be documented
 * steps, so nothing was visibly wrong; the point is that nothing would have been
 * visibly wrong if they had not been.
 *
 * A gate with a known hole is worse than no gate, because the hole is invisible from
 * the passing result. This closes it for the two component trees that render the
 * design system.
 *
 * Inline styles are not banned outright — a computed transform or a dynamic dimension
 * genuinely belongs in JSX. What is banned is a LITERAL spacing value, which is the
 * one thing the token scale exists to decide.
 */
const COMPONENT_DIRS = [
  join(REPO_ROOT, 'apps', 'cms', 'src', 'app', '(frontend)'),
  join(REPO_ROOT, 'apps', 'cms', 'src', 'components'),
  join(REPO_ROOT, 'apps', 'viewer', 'src'),
]

function tsxFiles(dir: string): Array<{ name: string; source: string }> {
  const out: Array<{ name: string; source: string }> = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.name.endsWith('.tsx') || entry.name.includes('.test.')) continue
      out.push({ name: full.slice(REPO_ROOT.length + 1), source: readFileSync(full, 'utf8') })
    }
  }
  if (existsSync(dir)) walk(dir)
  return out
}

describe('spacing written into JSX', () => {
  it('never hard-codes a spacing value in an inline style', () => {
    const offenders: string[] = []
    // `padding: '20px'`, `marginTop: "24px"`, `gap: '8px'` — a literal px string on a
    // spacing property. A `var(--…)`, a template literal or a computed value is fine.
    const inline = /\b(padding|margin|gap|rowGap|columnGap)[A-Za-z]*\s*:\s*'(-?\d+(?:\.\d+)?)px'/g

    for (const dir of COMPONENT_DIRS) {
      for (const { name, source } of tsxFiles(dir)) {
        for (const match of source.matchAll(inline)) {
          const line = source.slice(0, match.index).split('\n').length
          offenders.push(`${name}:${line} sets ${match[1]} to ${match[2]}px inline`)
        }
      }
    }

    expect(
      offenders,
      'A spacing value is hard-coded in an inline style, where the stylesheet gate\n' +
        'cannot see it. Move it into a class — that is what the token scale is for.',
    ).toEqual([])
  })

  it('actually reaches the files it claims to scan', () => {
    // The negative control for the check above. A walker that silently finds nothing —
    // a wrong directory, a rename, a bad extension filter — reports a clean result that
    // means "measured nothing", which is this repo's most repeated failure.
    const counts = COMPONENT_DIRS.map((dir) => tsxFiles(dir).length)
    for (const [index, count] of counts.entries()) {
      expect(count, `${COMPONENT_DIRS[index]} yielded no .tsx files`).toBeGreaterThan(0)
    }
  })
})

/*
 * ── Colour and type discipline: CO-06, CO-07, CO-08, TY-01 (2026-09-25) ──────────────
 *
 * Four properties of the design system that were true when audited and held only by hand.
 * Each check below reads EVERY scanned stylesheet (the shared package, the viewer's
 * page.css and the site's site.css), so it covers both surfaces from one place.
 */

type Rgba = { r: number; g: number; b: number; a: number }

const NAMED_COLOURS: Record<string, Rgba> = {
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
}

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (never an HTML entity such as `&#8470;`, the № sign), `rgb()`/`rgba()`, `hsl()`/`hsla()`, and the three named colours this system uses. */
const COLOUR_LITERAL =
  /(?<![&\w])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black|transparent)\b/gi

function parseColour(text: string): Rgba | null {
  const lower = text.toLowerCase()
  if (lower in NAMED_COLOURS) return NAMED_COLOURS[lower] ?? null
  if (lower.startsWith('#')) {
    let hex = lower.slice(1)
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('')
    const channel = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16)
    return {
      r: channel(0),
      g: channel(2),
      b: channel(4),
      a: hex.length === 8 ? channel(6) / 255 : 1,
    }
  }
  const numbers = (lower.match(/-?[\d.]+%?/g) ?? []).map((n) =>
    n.endsWith('%') ? Number(n.slice(0, -1)) / 100 : Number(n),
  )
  if (lower.startsWith('rgb')) {
    const [r = 0, g = 0, b = 0, a = 1] = numbers
    return { r, g, b, a }
  }
  // hsl(h, s%, l%[, a]) — percentages already divided by 100 above.
  const [h = 0, s = 0, l = 0, a = 1] = numbers
  const k = (n: number) => (n + h / 30) % 12
  const f = (n: number) =>
    l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255), a }
}

/** Hue in degrees and HSL saturation (0-1). A grey has saturation 0 and no meaningful hue. */
function hueAndSaturation({ r, g, b }: Rgba): { hue: number; saturation: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const delta = max - min
  const lightness = (max + min) / 2
  if (delta === 0) return { hue: 0, saturation: 0 }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue: number
  if (max === R) hue = ((G - B) / delta) % 6
  else if (max === G) hue = (B - R) / delta + 2
  else hue = (R - G) / delta + 4
  hue *= 60
  return { hue: hue < 0 ? hue + 360 : hue, saturation }
}

const hexOf = ({ r, g, b }: Rgba) =>
  `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`

/** Every custom property definition in every scanned stylesheet, ALL of them — a token redefined under a media query or a theme contributes every value it can take. */
function customPropertyDefinitions(): Map<string, string[]> {
  const defs = new Map<string, string[]>()
  for (const { source } of cssFiles()) {
    for (const match of source.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)[;}]/g)) {
      const [, name, value] = match
      if (!name) continue
      defs.set(name, [...(defs.get(name) ?? []), (value ?? '').trim()])
    }
  }
  return defs
}

/** Every literal colour a CSS value can resolve to: its own literals plus, recursively, those of every token it reads. */
function resolvedColours(value: string, defs: Map<string, string[]>, seen = new Set<string>()) {
  const out: Array<{ text: string; rgba: Rgba }> = []
  for (const match of value.matchAll(COLOUR_LITERAL)) {
    const rgba = parseColour(match[0])
    if (rgba) out.push({ text: match[0], rgba })
  }
  for (const match of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
    const token = match[1]
    if (!token || seen.has(token)) continue
    seen.add(token)
    for (const definition of defs.get(token) ?? []) {
      out.push(...resolvedColours(definition, defs, seen))
    }
  }
  return out
}

/** The full argument of every `*-gradient(` in a source, balanced on parentheses. */
function gradients(source: string): Array<{ index: number; text: string }> {
  const found: Array<{ index: number; text: string }> = []
  for (const match of source.matchAll(/(?:repeating-)?(?:linear|radial|conic)-gradient\(/g)) {
    let depth = 0
    let end = match.index
    for (let i = match.index; i < source.length; i++) {
      if (source[i] === '(') depth++
      else if (source[i] === ')') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    found.push({ index: match.index, text: source.slice(match.index, end + 1) })
  }
  return found
}

/** A chromatic colour whose hue sits in the purple-blue band an "AI default" gradient uses. */
const isPurpleBlue = (rgba: Rgba) => {
  if (rgba.a === 0) return false
  const { hue, saturation } = hueAndSaturation(rgba)
  return saturation >= 0.15 && hue >= 220 && hue <= 300
}

describe('CO-06 — both surfaces declare the colour schemes they support', () => {
  /*
   * `color-scheme` is what tells the browser to draw its OWN parts — scrollbars, form
   * controls, the canvas behind an unpainted page — in the matching theme, and what
   * `light-dark()` resolves against. Both apps import the same tokens.css
   * (`apps/cms/src/sharedTokens.test.ts`, CO-13), so this pins the declarations there:
   * `light dark` by default, and each forced theme narrowing it to one.
   */
  it('declares exactly: light dark by default, light and dark when the toggle forces one', () => {
    const declarations: string[] = []
    for (const { name, source } of cssFiles()) {
      for (const match of source.matchAll(/(?<![\w-])color-scheme\s*:\s*([^;{}]+)[;}]/g)) {
        declarations.push(
          `${name} ${enclosingSelector(source, match.index)}: ${(match[1] ?? '').trim()}`,
        )
      }
    }
    expect(
      declarations.sort(),
      'The color-scheme declarations changed. A page without `light dark` at :root draws\n' +
        'browser chrome (scrollbars, inputs) in the wrong theme, and light-dark() stops\n' +
        'following the visitor. A forced theme must narrow it to that one scheme.',
    ).toEqual(
      [
        'tokens.css :root: light dark',
        'tokens.css :root[data-theme="light"]: light',
        'tokens.css :root[data-theme="dark"]: dark',
      ].sort(),
    )
  })
})

describe('CO-07 (VC-01, VC-02, VC-03) — no purple-blue gradients, no gradient text, one documented grain', () => {
  it('the gradient scanner resolves tokens and sees a purple-blue stop (negative control)', () => {
    const defs = new Map([['--accent', ['light-dark(#1d1f1a, #6d28d9)']]])
    const planted = gradients(
      'a { background: linear-gradient(90deg, var(--accent), #cdf345 60%); }',
    )
    expect(planted).toHaveLength(1)
    const colours = resolvedColours(planted[0]?.text ?? '', defs)
    expect(colours.map((c) => c.text)).toEqual(['#cdf345', '#1d1f1a', '#6d28d9'])
    expect(colours.filter((c) => isPurpleBlue(c.rgba)).map((c) => c.text)).toEqual(['#6d28d9'])
    // …and the volt and the ink, which the real gradients use, are not in the band.
    expect(isPurpleBlue(parseColour('rgba(205, 243, 69, 0.42)') as Rgba)).toBe(false)
    expect(isPurpleBlue(parseColour('hsl(260, 80%, 50%)') as Rgba)).toBe(true)
  })

  it('VC-01: no gradient stop, resolved through its tokens, has a hue of 220-300°', () => {
    const defs = customPropertyDefinitions()
    const offenders: string[] = []
    let stops = 0
    for (const { name, source } of cssFiles()) {
      for (const gradient of gradients(source)) {
        const line = source.slice(0, gradient.index).split('\n').length
        for (const colour of resolvedColours(gradient.text, defs)) {
          stops++
          if (isPurpleBlue(colour.rgba)) {
            offenders.push(`${name}:${line} ${colour.text} (${hexOf(colour.rgba)})`)
          }
        }
      }
    }
    // The control: the blueprint grid, the glow and the footer light are real gradients
    // with real stops. A scan that found none measured nothing.
    expect(stops, 'no gradient colour stop was found in any stylesheet').toBeGreaterThan(10)
    expect(
      offenders,
      'A gradient reaches the purple-blue band (hue 220-300°) — the generic "AI" gradient\n' +
        'this system deliberately never uses. Its only gradients are the blueprint grid,\n' +
        'the volt glow and the footer light (docs/DESIGN.md §4 "Motifs").',
    ).toEqual([])
  })

  it('VC-02: no text is painted with a gradient (background-clip: text, -webkit- prefixed or not), in CSS or JSX', () => {
    const offenders: string[] = []
    for (const { name, source } of cssFiles()) {
      for (const match of source.matchAll(/background-clip\s*:\s*text/g)) {
        offenders.push(`${name}:${source.slice(0, match.index).split('\n').length}`)
      }
    }
    for (const dir of COMPONENT_DIRS) {
      for (const { name, source } of tsxFiles(dir)) {
        if (/[Bb]ackgroundClip\s*:\s*['"]text['"]|background-clip\s*:\s*text/.test(source)) {
          offenders.push(name)
        }
      }
    }
    expect(offenders, 'Gradient text is not part of this design system.').toEqual([])
  })

  it('VC-03: the only grain/noise overlay is `.grain`: 5% opacity, dark mode only', () => {
    const uses: string[] = []
    for (const { name, source } of cssFiles()) {
      for (const match of source.matchAll(/feTurbulence/g)) {
        uses.push(`${name} ${enclosingSelector(source, match.index)}`)
      }
    }
    for (const dir of COMPONENT_DIRS) {
      for (const { name, source } of tsxFiles(dir)) {
        if (/feTurbulence/i.test(source)) uses.push(name)
      }
    }
    expect(uses, 'a second grain/noise overlay appeared').toEqual(['base.css .grain'])
    // …and no raster noise either: a texture image is the other way to lay grain over a page.
    const rasterNoise: string[] = []
    for (const { name, source } of cssFiles()) {
      for (const match of source.matchAll(/url\(\s*["']?([^"')]*)/g)) {
        if (/noise|grain|grit|texture/i.test(match[1] ?? ''))
          rasterNoise.push(`${name}: ${match[1]}`)
      }
    }
    expect(rasterNoise, 'a noise/grain image is laid over the page').toEqual([])

    const base = cssFiles().find(({ name }) => name === 'base.css')?.source ?? ''
    const rule = base.match(/\n\.grain\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule, 'the .grain rule was not found').toContain('feTurbulence')
    const opacity = Number(rule.match(/(?<![\w-])opacity\s*:\s*([\d.]+)/)?.[1] ?? Number.NaN)
    expect(
      opacity,
      'the grain is a whisper — docs/DESIGN.md §4 fixes it at 0.05',
    ).toBeLessThanOrEqual(0.05)
    // Hidden in light mode both ways the page can be light: forced by the toggle, and by
    // the visitor's own preference when no theme is forced.
    expect(base).toMatch(/:root\[data-theme="light"\]\s*\.grain\s*\{\s*display:\s*none/)
    expect(base).toMatch(
      /@media \(prefers-color-scheme: light\)\s*\{\s*:root:not\(\[data-theme="dark"\]\)\s*\.grain\s*\{\s*display:\s*none/,
    )
  })
})

describe('CO-08 — every literal colour is on the palette, or a named exception', () => {
  /*
   * "A small, disciplined set of colours": the palette is whatever tokens.css declares —
   * read from the file, never copied here — and every OTHER literal colour in a component
   * stylesheet must equal one of those colours (a token's rgba() at a different alpha is
   * the same colour) or be one of the exceptions below, each explained where it lives.
   */
  const EXCEPTIONS = [
    {
      file: 'site.css',
      colours: ['#b3261e', '#f2b8b5'],
      why: 'the contact form error colour, --danger — contrast measured beside it',
    },
    {
      file: 'site.css',
      colours: ['#111111', '#333333', '#999999'],
      why: 'the printed footer (@media print) — paper has no dark theme',
    },
    {
      file: 'site.css',
      colours: ['#44473e', '#cfd2c2'],
      why: '--muted raised for prefers-contrast: more',
    },
  ] as const

  /** Every literal colour in a declaration, skipping `mask`/`mask-image`, whose #000/#0000 stops are alpha, not colour. */
  function literalColoursIn(source: string) {
    const out: Array<{ index: number; text: string; rgba: Rgba }> = []
    for (const declaration of source.matchAll(/([\w-]+)\s*:\s*([^;{}]+)[;}]/g)) {
      if (/^(?:-webkit-)?mask(?:-image)?$/.test(declaration[1] ?? '')) continue
      for (const match of (declaration[2] ?? '').matchAll(COLOUR_LITERAL)) {
        const rgba = parseColour(match[0])
        if (!rgba || rgba.a === 0) continue
        out.push({ index: declaration.index, text: match[0], rgba })
      }
    }
    return out
  }

  const palette = () => {
    const tokens = cssFiles().find(({ name }) => name === 'tokens.css')?.source ?? ''
    return new Set(literalColoursIn(tokens).map((c) => hexOf(c.rgba)))
  }

  it('reads a real palette from tokens.css (control)', () => {
    const colours = palette()
    // The ink, the paper and the volt are the brand; if these are not found, the scan is broken.
    for (const brand of ['#1d1f1a', '#f1efea', '#cdf345']) expect(colours).toContain(brand)
    expect(colours.size, 'the palette is small by design').toBeLessThanOrEqual(20)
  })

  it('no component stylesheet introduces a colour the palette does not have', () => {
    const known = palette()
    const offenders: string[] = []
    const used = new Set<string>()
    for (const { name, source } of cssFiles()) {
      if (name === 'tokens.css') continue
      for (const colour of literalColoursIn(source)) {
        const hex = hexOf(colour.rgba)
        if (known.has(hex)) continue
        const exception = EXCEPTIONS.find(
          (entry) => entry.file === name && (entry.colours as readonly string[]).includes(hex),
        )
        if (exception) {
          used.add(`${name} ${hex}`)
          continue
        }
        const line = source.slice(0, colour.index).split('\n').length
        offenders.push(`${name}:${line} ${colour.text} (${hex}) is on no palette`)
      }
    }
    for (const dir of COMPONENT_DIRS) {
      for (const { name, source } of tsxFiles(dir)) {
        const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
        for (const match of code.matchAll(COLOUR_LITERAL)) {
          if (/^(?:white|black|transparent)$/i.test(match[0])) continue // English words in JSX copy
          const rgba = parseColour(match[0])
          if (rgba && !known.has(hexOf(rgba)))
            offenders.push(`${name}: ${match[0]} is on no palette`)
        }
      }
    }
    expect(
      offenders,
      'An off-palette colour. Use a token (docs/DESIGN.md §1), or — if this is a genuine\n' +
        'new need like the form error colour — add it to EXCEPTIONS with the reason.',
    ).toEqual([])
    // A stale exception is a hole waiting for a colour to fall through it.
    const stale = EXCEPTIONS.flatMap((entry) =>
      entry.colours
        .filter((hex) => !used.has(`${entry.file} ${hex}`))
        .map((hex) => `${entry.file} ${hex}`),
    )
    expect(stale, 'an exception names a colour that is no longer used there').toEqual([])
  })
})

describe('TY-01 (VC-05, VC-06) — two brand typefaces and a system mono; no Inter, no Space Grotesk', () => {
  /*
   * The two faces the brand is set in, the system monospace stack for labels, and the
   * generic families each stack ends on. Every OTHER family a stylesheet names must be a
   * metric-matched stand-in declared with `@font-face` in these same files and built from
   * `local()` fonts only — it downloads nothing and exists to stop layout shift
   * (docs/DESIGN.md §3). The fonts an AI-generated page reaches for by default are named
   * separately so a failure says what went wrong, not just that something did.
   */
  const BRAND = ['Archivo Variable', 'Archivo', 'Instrument Serif']
  const SYSTEM = [
    'ui-monospace',
    'SF Mono',
    'SFMono-Regular',
    'Menlo',
    'Consolas',
    'Liberation Mono',
    'monospace',
    'system-ui',
    'sans-serif',
    'serif',
    'Georgia',
  ]
  const AI_DEFAULTS =
    /\b(?:Inter|Space Grotesk|Roboto|Poppins|Montserrat|Open Sans|Lato|Geist|DM Sans|Manrope|Plus Jakarta Sans|Outfit|IBM Plex)\b/i

  const familiesOf = (value: string) =>
    value
      .split(',')
      .map((family) => family.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)

  function standIns(): Map<string, string> {
    const faces = new Map<string, string>()
    for (const { source } of cssFiles()) {
      for (const block of source.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
        const family = block[1]?.match(/font-family:\s*["']([^"']+)["']/)?.[1]
        if (family) faces.set(family, block[1]?.match(/src:\s*([^;]+);/)?.[1] ?? '')
      }
    }
    return faces
  }

  it('every family in every font stack is a brand face, the system stack, or a local stand-in', () => {
    const faces = standIns()
    expect(faces.size, 'no @font-face stand-in was found — the scan is broken').toBeGreaterThan(0)
    const offenders: string[] = []
    for (const { name, source } of cssFiles()) {
      const outside = source.replace(/@font-face\s*\{[^}]*\}/g, (block) =>
        block.replace(/[^\n]/g, ' '),
      )
      for (const match of outside.matchAll(/(--font-[\w-]+|font-family)\s*:\s*([^;{}]+)[;}]/g)) {
        const value = (match[2] ?? '').trim()
        if (/^var\(--font-[\w-]+\)$/.test(value) || value === 'inherit') continue
        const line = outside.slice(0, match.index).split('\n').length
        for (const family of familiesOf(value)) {
          if (AI_DEFAULTS.test(family)) {
            offenders.push(`${name}:${line} names ${family}, a generic default face`)
          } else if (!BRAND.includes(family) && !SYSTEM.includes(family) && !faces.has(family)) {
            offenders.push(`${name}:${line} names ${family}, which is not part of the type system`)
          }
        }
      }
    }
    for (const [family, src] of faces) {
      if (!/^\s*local\(/.test(src) || /url\(/.test(src)) {
        offenders.push(`@font-face "${family}" downloads a file — a stand-in must be local() only`)
      }
    }
    expect(offenders, 'docs/DESIGN.md §3: two families plus a system mono stack.').toEqual([])
  })

  it('each stack starts with its brand face, wherever it is redefined', () => {
    const first = new Map<string, Set<string>>()
    for (const { source } of cssFiles()) {
      for (const match of source.matchAll(/(--font-(?:display|body|serif))\s*:\s*([^;{}]+)[;}]/g)) {
        const token = match[1] ?? ''
        first.set(token, (first.get(token) ?? new Set()).add(familiesOf(match[2] ?? '')[0] ?? ''))
      }
    }
    expect(Object.fromEntries([...first].map(([token, set]) => [token, [...set]]))).toEqual({
      '--font-display': ['Archivo Variable'],
      '--font-body': ['Archivo Variable'],
      '--font-serif': ['Instrument Serif'],
    })
  })

  it('the only webfonts either app installs or imports are Archivo and Instrument Serif', () => {
    const imported = new Set<string>()
    const entries = [
      join(REPO_ROOT, 'apps', 'viewer', 'src', 'main.tsx'),
      join(REPO_ROOT, 'apps', 'cms', 'src', 'app', '(frontend)', 'layout.tsx'),
      join(REPO_ROOT, 'apps', 'cms', 'src', 'app', 'not-found.tsx'),
    ]
    for (const file of entries) {
      for (const match of readFileSync(file, 'utf8').matchAll(
        /['"]@fontsource(?:-variable)?\/([\w-]+)/g,
      )) {
        if (match[1]) imported.add(match[1])
      }
    }
    for (const pkg of ['apps/viewer/package.json', 'apps/cms/package.json']) {
      const json = JSON.parse(readFileSync(join(REPO_ROOT, pkg), 'utf8')) as Record<
        string,
        Record<string, string> | undefined
      >
      for (const dep of Object.keys({ ...json.dependencies, ...json.devDependencies })) {
        const match = dep.match(/^@fontsource(?:-variable)?\/([\w-]+)$/)
        if (match?.[1]) imported.add(match[1])
      }
    }
    expect([...imported].sort()).toEqual(['archivo', 'instrument-serif'])
  })
})
