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
      '--text-wordmark: 1.125rem',
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
   */
  it('every font-size cites a token, a range, or a ratio', () => {
    const offenders: string[] = []
    for (const { name, source } of components()) {
      for (const match of source.matchAll(DECL('font-size'))) {
        const value = (match[1] ?? '').trim()
        if (isTokenised(value)) continue
        // A clamp() is a RANGE and an em is a RATIO — neither is a step on a
        // scale, and docs/DESIGN.md §3 exempts both by name.
        if (value.startsWith('clamp(')) continue
        if (/^[\d.]+em$/.test(value)) continue
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(`${name}:${line} — font-size: ${value}`)
      }
    }
    expect(
      offenders,
      'Use a --text-* token. Nine sizes ship (10-18px) and all nine are declared;\n' +
        'if a tenth is genuinely needed, add it to tokens.css AND to the table in\n' +
        'docs/DESIGN.md §3 — the drift test above reads that table.',
    ).toEqual([])
  })

  it('every letter-spacing cites a token, or is exactly 0', () => {
    const offenders: string[] = []
    for (const { name, source } of components()) {
      for (const match of source.matchAll(DECL('letter-spacing'))) {
        const value = (match[1] ?? '').trim()
        if (isTokenised(value)) continue
        // `0` is the serif accent deliberately opting OUT of tracking, which
        // docs/DESIGN.md §3 states. It is an absence, not an eighth step.
        if (value === '0') continue
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(`${name}:${line} — letter-spacing: ${value}`)
      }
    }
    expect(
      offenders,
      'Use --tracking-caps-tight / --tracking-caps / --tracking-caps-wide /\n' +
        '--tracking-caps-compact / --tracking-mono / --tracking-wordmark, or one of\n' +
        'the two display tokens. Six steps cover 21 shipped declarations; a seventh\n' +
        'needs a row in docs/DESIGN.md §3 saying what it is FOR.',
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
    ['prefers-reduced-transparency', 'the blurred sticky header and the loading card'],
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
