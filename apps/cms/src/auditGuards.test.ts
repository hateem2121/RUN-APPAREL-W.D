import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Regression guards for measurements in the 2026-09-06 beta-website audit (kept privately) that
 * PASSED and that nothing was holding in place.
 *
 * ⚠️ WHY A SEPARATE FILE FROM publicSite.test.ts. That file gates what the marketing
 * site must DO. These four gate properties the audit measured once and scored 8–9
 * precisely because "a number measured once is a fact about Tuesday" — each is true
 * today and each would go quietly false under an ordinary change. The audit ID is on
 * every case so a future reader can find the original measurement.
 *
 * Everything here reads FILES. The rendered half of the same audit rows lives in
 * `apps/cms/e2e/` — a computed style or a layout box can only be measured in a browser,
 * and this repo has shipped four gates that measured nothing by asserting the source
 * text of something whose effect had moved elsewhere.
 */

const CMS_ROOT = join(import.meta.dirname, '..')
const REPO_ROOT = join(CMS_ROOT, '..', '..')
const read = (...parts: string[]) => readFileSync(join(...parts), 'utf8')

/** Blank comment BODIES, preserving offsets — the same helper publicSite.test.ts uses. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, (line) => ' '.repeat(line.length))
}

function walk(dir: string, extensions: string[]): string[] {
  const out: string[] = []
  const step = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        // Build output, not source. `.open-next/` carries a bundled copy of every
        // stylesheet in the repo, so scanning it would find the viewer's CSS inside the
        // CMS and report a violation that does not exist in any file anyone edits.
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        step(full)
        continue
      }
      // Test files are excluded, and this one is the reason: the first run of this
      // file reported ITSELF as an offender twice, because the assertions below name
      // the very patterns they forbid. Same false positive publicSite.test.ts and
      // tokens.test.ts each hit once.
      if (entry.name.includes('.test.')) continue
      if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(full)
    }
  }
  if (existsSync(dir)) step(dir)
  return out
}

describe('FA-F-06 — the marketing site scrolls natively; Lenis is the viewer only', () => {
  /**
   * MEASURED 2026-09-06: the site's scroll is the browser's, and every scroll-linked
   * effect it has (the notch condense) is CSS `animation-timeline` with no listener.
   *
   * Nothing stopped that changing. Lenis is already in the monorepo for the 3D pages,
   * so adding it here is one import away — and it is the wrong thing here twice over:
   * `docs/DESIGN.md` splits the two surfaces deliberately, and the viewer's own audit
   * rows record what smoothed scrolling costs (FA-F-08: one wheel tick takes 1046 ms to
   * settle). A marketing page that answers a wheel tick a second later is not the same
   * page.
   */
  it('declares no smooth-scroll dependency', () => {
    const manifest = JSON.parse(read(CMS_ROOT, 'package.json')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    expect(declared.filter((name) => /lenis/i.test(name))).toEqual([])
  })

  it('never constructs one, and never sets scroll-behavior: smooth', () => {
    const offenders: string[] = []
    for (const file of walk(join(CMS_ROOT, 'src'), ['.ts', '.tsx', '.css'])) {
      const source = stripComments(readFileSync(file, 'utf8'))
      const name = file.slice(REPO_ROOT.length + 1)
      if (/\blenis\b/i.test(source)) offenders.push(`${name}: names Lenis`)
      // The hand-rolled version of the same thing. `scroll-behavior: smooth` retargets
      // every in-page jump, including the skip link, which is the one navigation a
      // keyboard user has.
      if (/scroll-behavior:\s*smooth/i.test(source)) offenders.push(`${name}: scroll-behavior`)
    }
    expect(offenders, 'the marketing site took over the scroll').toEqual([])
  })
})

describe('FA-Q-03 — the custom cursor is one cursor on both surfaces', () => {
  /**
   * MEASURED 2026-09-06: the dot and the ring look identical on the site and in the
   * viewer. They are drawn by two independent implementations (FA-H-30, an open
   * finding) which agree only because both defer their APPEARANCE to one stylesheet and
   * share one inflation constant. Both halves of that are one edit from being untrue,
   * and the symptom would be two subtly different cursors on two pages a visitor moves
   * between — the kind of difference nobody can name and everybody feels.
   */
  const BASE_CSS = join(REPO_ROOT, 'packages', 'ui', 'src', 'base.css')

  it('is styled in packages/ui and nowhere else', () => {
    expect(read(BASE_CSS)).toMatch(/\.cursor-ring\s*\{/)

    const redeclared: string[] = []
    for (const dir of [join(CMS_ROOT, 'src'), join(REPO_ROOT, 'apps', 'viewer', 'src')]) {
      for (const file of walk(dir, ['.css'])) {
        const source = stripComments(readFileSync(file, 'utf8'))
        /*
         * ⚠️ APPEARANCE ONLY, NOT EVERY MENTION. The first draft matched any rule naming
         * the class and failed on site.css's print block, which hides the cursor with
         * `display: none` — correct, and nothing to do with what the cursor looks like
         * on screen. What must stay in one place is its size, its ink and its shape.
         */
        for (const rule of source.matchAll(/\.cursor-(?:dot|ring)[^{}]*\{([^}]*)\}/g)) {
          const body = rule[1] ?? ''
          if (
            /(?:^|;)\s*(?:width|height|border|background|border-radius|translate|scale)\b/.test(
              `;${body}`,
            )
          ) {
            redeclared.push(`${file.slice(REPO_ROOT.length + 1)}: ${body.trim().slice(0, 40)}`)
          }
        }
      }
    }
    expect(
      redeclared,
      'a surface restyled the shared cursor — the two pages now draw different ones',
    ).toEqual([])
  })

  it('inflates by the same factor over an interactive target on both surfaces', () => {
    /*
     * 1.53 is 52/34 — the inflated ring against the resting one, both measured from
     * base.css. base.css records that the CSS rule which used to carry it was removed
     * because CSS `scale` and a JS-written `transform` fight, so the number now lives in
     * two TypeScript files with nothing making them agree.
     */
    const site = stripComments(read(CMS_ROOT, 'src', 'components', 'site', 'Cursor.tsx'))
    const viewer = stripComments(read(REPO_ROOT, 'apps', 'viewer', 'src', 'polish', 'Cursor.tsx'))
    const factor = (source: string) => source.match(/([0-9]+\.[0-9]+)\s*:\s*1\b/)?.[1]

    expect(factor(site), 'the site cursor no longer states an inflation factor').toBeDefined()
    expect(factor(viewer), 'the viewer cursor no longer states an inflation factor').toBeDefined()
    expect(factor(site), 'the two cursors now inflate by different amounts').toBe(factor(viewer))
  })
})

describe('FA-S-05 — every migration this repo adds from here is additive', () => {
  /**
   * MEASURED 2026-09-06: the two migrations pending against production were one
   * `ADD COLUMN` and eleven more plus two leaf tables — no table rebuild, so none of
   * this repo's cascade hazard applied. That was a property of those two files, not of
   * anything enforcing it, and the count has already moved (a third landed 2026-09-07).
   *
   * The durable claim is the SHAPE, so that is what this asserts. `PRAGMA
   * foreign_keys=OFF` is a no-op on D1, `defer_foreign_keys` defers checks but not
   * CASCADES, and a `DROP TABLE` runs an implicit `DELETE` that cascades — which is how
   * a table nobody was watching was emptied on 2026-07-29. A rebuild is not forbidden
   * forever; it is forbidden silently.
   */
  const MIGRATIONS = join(CMS_ROOT, 'src', 'migrations')

  /**
   * The one migration that rebuilds, from the day of the incident above. It is applied,
   * it is history, and rewriting it would be worse than the exception.
   */
  const LEGACY_REBUILD = '20260729_070548_inline_colourways.ts'

  const upBody = (file: string) => {
    const source = stripComments(readFileSync(join(MIGRATIONS, file), 'utf8'))
    const down = source.indexOf('export async function down')
    // `down()` drops things for a living. Only the forward half is asserted.
    return down === -1 ? source : source.slice(0, down)
  }

  const files = () =>
    readdirSync(MIGRATIONS).filter((name) => name.endsWith('.ts') && name !== 'index.ts')

  it('drops, renames and rebuilds nothing on the way up', () => {
    const offenders: string[] = []
    for (const file of files()) {
      if (file === LEGACY_REBUILD) continue
      const found = [...upBody(file).matchAll(/DROP\s+TABLE|DROP\s+COLUMN|RENAME\s+(TO|COLUMN)/gi)]
      if (found.length > 0) offenders.push(`${file}: ${found.map((m) => m[0]).join(', ')}`)
    }
    expect(
      offenders,
      'a migration is destructive on the way up. That may be right — but it is a ' +
        'deliberate decision that needs the cascade note in CLAUDE.md read first, not a ' +
        'diff that slid past.',
    ).toEqual([])
  })

  it('and the exception is real, so this gate is not asserting an empty set', () => {
    // The negative control, permanently wired in: if the legacy file ever stopped
    // matching, the loop above would be exempting nothing and could pass while blind.
    expect(files()).toContain(LEGACY_REBUILD)
    expect(upBody(LEGACY_REBUILD)).toMatch(/DROP\s+TABLE/i)
  })
})

describe('FA-S-06 — the pre-deploy backup is taken AND proven to restore, before migrating', () => {
  /**
   * MEASURED 2026-09-06: `ci.yml` dumps D1, uploads the dump, verifies it restores, and
   * only then runs `migrate:remote`. The ordering is the whole value — a backup taken
   * after the migration is a backup of the damage, and an unverified one is a file.
   * Neither is visible in a green run, and nothing asserted the order.
   *
   * `verifyBackup.test.ts` covers what the verifier decides. This covers that it is
   * reached at all, which is the same class of gap as the gitleaks workflow that scanned
   * 60 bytes and stayed green.
   */
  it('runs backup, then verify, then migrate — in that order, in one job', () => {
    /*
     * ⚠️ COMMENTS STRIPPED FIRST. ci.yml explains all three of these steps at length in
     * prose above them, and this compares POSITIONS — a comment naming `migrate:remote`
     * anywhere above the backup step would fail the gate for a documentation edit. Only
     * what the runner executes counts.
     */
    const workflow = read(REPO_ROOT, '.github', 'workflows', 'ci.yml').replace(/^\s*#.*$/gm, '')
    const at = (pattern: RegExp, label: string) => {
      const index = workflow.search(pattern)
      expect(index, `${label} is not in ci.yml at all`).toBeGreaterThan(-1)
      return index
    }
    const backup = at(/node scripts\/backup-d1\.mjs/, 'the D1 backup')
    const verify = at(/node scripts\/verify-backup\.mjs/, 'the backup verification')
    const migrate = at(/migrate:remote/, 'the production migration')

    expect(backup, 'the backup is taken after the verification').toBeLessThan(verify)
    expect(verify, 'production is migrated before its backup is known to restore').toBeLessThan(
      migrate,
    )
  })
})

describe('XS-02 — one menu bar on both surfaces, styled once', () => {
  /**
   * Owner decision 2026-09-17: "Same menu bars everywhere. The one I prefer is at
   * wear-run.help." The bar's rules moved VERBATIM from the site's stylesheet into
   * packages/ui/src/notch.css, so the site and the 3D viewer draw one bar rather than two
   * copies of it — the arrangement FA-Q-03 above already uses for the cursor.
   *
   * ⚠️ APPEARANCE ONLY, NOT EVERY MENTION. Each surface legitimately keeps its own
   * POSITIONING (the site fixes the bar over the page; the viewer keeps it in the page flow
   * so --header-h measures its stage), the site's scroll condense (an `animation`), its print
   * block, and the footer's own `.footer-legal .nav-link` overrides. What must stay in one
   * place is how the bar looks and lays out.
   */
  const NOTCH_CSS = join(REPO_ROOT, 'packages', 'ui', 'src', 'notch.css')
  const BAR = /(?:^|[\s,>+~(])\.notch(?:-shell|__[a-z-]+)?(?![\w-])/
  const LOOK =
    /(?:^|;)\s*(?:display|flex(?:-[a-z]+)?|gap|row-gap|column-gap|(?:min-|max-)?(?:width|height)|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?|border(?:-[a-z]+)?|background(?:-[a-z]+)?|color|font(?:-[a-z]+)?|letter-spacing|line-height|text-[a-z-]+|box-shadow|mask|scale|transition|outline(?:-[a-z]+)?|--notch-[a-z-]+)\s*:/
  const restyles = (source: string) =>
    [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selector = '', body = '']) => {
        const names = selector.split(',').map((part) => part.trim())
        const bar = names.some((name) => BAR.test(` ${name}`))
        const bareLink = names.some((name) => /^\.nav-link(?![\w-])/.test(name))
        return (bar || bareLink) && LOOK.test(`;${body}`)
      })
      .map(([, selector = '']) => selector.trim().replace(/\s+/g, ' ').slice(0, 60))

  it('draws the bar in packages/ui and nowhere else', () => {
    expect(existsSync(NOTCH_CSS), 'packages/ui/src/notch.css is missing').toBe(true)
    expect(read(NOTCH_CSS)).toMatch(/\.notch\s*\{/)
    const offenders: string[] = []
    for (const dir of [join(CMS_ROOT, 'src'), join(REPO_ROOT, 'apps', 'viewer', 'src')]) {
      for (const file of walk(dir, ['.css'])) {
        for (const selector of restyles(stripComments(readFileSync(file, 'utf8')))) {
          offenders.push(`${file.slice(REPO_ROOT.length + 1)}: ${selector}`)
        }
      }
    }
    expect(
      offenders,
      'a surface restyled the shared bar — the two hosts now draw different bars. ' +
        'Put the rule in packages/ui/src/notch.css.',
    ).toEqual([])
  })

  it('sees a planted restyle, and allows what each surface keeps (negative control)', () => {
    expect(restyles('.page .notch { color: red; }')).toEqual(['.page .notch'])
    expect(restyles('.nav-link { padding-inline: 2px; }')).toEqual(['.nav-link'])
    expect(restyles('.notch-shell { position: fixed; inset-block-start: 0; }')).toEqual([])
    expect(restyles('.notch { animation: notch-condense linear both; }')).toEqual([])
    expect(restyles('.footer-legal .nav-link { padding-inline: 0; }')).toEqual([])
  })

  it('renders the same bar on both hosts: every shared marker is in both headers', () => {
    // The two headers are written in two frameworks (a Next server component with client
    // islands; a Vite client component), so the markup exists twice. These markers are what
    // the stylesheet, the popover and the contract suites depend on. Whitespace is collapsed
    // so the formatter's line breaks cannot matter.
    const flat = (source: string) => stripComments(source).replace(/\s+/g, ' ')
    const siteDir = join(CMS_ROOT, 'src', 'components', 'site')
    const site = flat(
      ['SiteHeader.tsx', 'NavLinks.tsx', 'ThemeSwitch.tsx']
        .map((name) => read(siteDir, name))
        .join('\n'),
    )
    const viewer = flat(read(REPO_ROOT, 'apps', 'viewer', 'src', 'components', 'Header.tsx'))
    const MARKERS = [
      'className="notch-shell"',
      'className="notch"',
      'className="notch__wordmark"',
      'className="notch__nav" aria-label={SITE_NAV_LABEL}',
      'className="notch__menu-btn" popoverTarget={SITE_MENU_ID}',
      'className="notch__icon" aria-hidden="true"',
      '<span className="visually-hidden">{SITE_MENU_NAME}</span>',
      'className="notch__menu" id={SITE_MENU_ID} popover="auto"',
      'SITE_NAV_LINKS.map',
      'className="nav-link"',
      'className="theme-toggle"',
      'theme-toggle__face theme-toggle__face--to-dark',
      'theme-toggle__face theme-toggle__face--to-light',
      '<span className="visually-hidden">{THEME_SWITCH_NAMES.toDark}</span>',
      '<span className="visually-hidden">{THEME_SWITCH_NAMES.toLight}</span>',
    ]
    for (const [host, source] of [
      ['the site', site],
      ['the viewer', viewer],
    ] as const) {
      expect(
        MARKERS.filter((marker) => !source.includes(marker)),
        `${host}'s bar lost a shared marker`,
      ).toEqual([])
      expect(
        source.match(/className="notch__icon-line"/g) ?? [],
        `${host}: three Speed Lines`,
      ).toHaveLength(3)
    }
  })
})
