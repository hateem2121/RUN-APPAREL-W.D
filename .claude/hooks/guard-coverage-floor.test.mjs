/**
 * Cases for guard-coverage-floor.mjs. Run from the repo root:
 *
 *   node .claude/hooks/guard-coverage-floor.test.mjs
 *
 * NOT part of `pnpm test` — .claude/ is not a workspace package — but
 * `.claude/skills/gates/run-gates.mjs` runs it with the other hook tests, and CI's
 * `verify` step runs every `.claude/hooks/*.test.mjs`.
 *
 * The guard reads the file it is about to judge, so the cases write throwaway copies of a
 * `vitest.config.ts` and a `check-coverage.mjs` into the OS temp directory and hand the
 * hook the same payload the harness sends. The ALLOW half matters as much as the DENY
 * half: raising a floor is the documented way to move one (scripts/check-coverage.mjs,
 * "RAISING IS ALLOWED; LOWERING IS NOT"), and a guard that blocks it, or blocks an
 * unrelated edit in the same config, gets switched off within a day.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'guard-coverage-'))
const config = join(dir, 'vitest.config.ts')
mkdirSync(join(dir, 'scripts'))
const repoFloor = join(dir, 'scripts', 'check-coverage.mjs')
const elsewhere = join(dir, 'notes.ts')

writeFileSync(
  config,
  [
    "import { coverage } from '../../vitest.coverage.mjs'",
    'export default {',
    '  test: {',
    "    environment: 'node',",
    '    coverage: coverage({',
    "      include: ['src/**'],",
    '      thresholds: { lines: 58, functions: 55, branches: 49, statements: 57 },',
    '    }),',
    '  },',
    '}',
    '',
  ].join('\n'),
)
writeFileSync(repoFloor, 'export const REPO_LINE_FLOOR = 81\n')
writeFileSync(elsewhere, 'const thresholds = { lines: 90 }\n')

const LINE = 'thresholds: { lines: 58, functions: 55, branches: 49, statements: 57 },'
const edit = (file_path, old_string, new_string, extra = {}) => ({
  tool_name: 'Edit',
  tool_input: { file_path, old_string, new_string, ...extra },
})
const write = (file_path, content) => ({ tool_name: 'Write', tool_input: { file_path, content } })

const cases = [
  // The rule itself: a floor goes down.
  ['DENY', edit(config, 'lines: 58', 'lines: 50')],
  ['DENY', edit(config, LINE, LINE.replace('branches: 49', 'branches: 48'))],
  // A floor removed is a floor lowered to nothing.
  ['DENY', edit(config, LINE, LINE.replace(' branches: 49,', ''))],
  ['DENY', edit(config, `      ${LINE}\n`, '')],
  // A whole-file Write is judged against what is on disk.
  ['DENY', write(config, LINE.replace('lines: 58', 'lines: 40'))],
  ['DENY', edit(repoFloor, 'REPO_LINE_FLOOR = 81', 'REPO_LINE_FLOOR = 79')],
  ['DENY', edit(repoFloor, 'export const REPO_LINE_FLOOR = 81\n', '')],

  // Raising is the documented way to move a floor.
  ['ALLOW', edit(config, 'lines: 58', 'lines: 60')],
  ['ALLOW', edit(repoFloor, 'REPO_LINE_FLOOR = 81', 'REPO_LINE_FLOOR = 83')],
  // An unrelated edit in the same config.
  ['ALLOW', edit(config, "environment: 'node'", "environment: 'jsdom'")],
  // An unchanged Write of the same file.
  ['ALLOW', write(config, LINE)],
  // A brand-new config has no floor to lower.
  ['ALLOW', write(join(dir, 'new', 'vitest.config.ts'), 'thresholds: { lines: 10 }')],
  // A file that only LOOKS like a floor is not one.
  ['ALLOW', edit(elsewhere, 'lines: 90', 'lines: 1')],
  // Tools the guard does not judge.
  ['ALLOW', { tool_name: 'Read', tool_input: { file_path: config } }],
]

let bad = 0
try {
  for (const [want, payload] of cases) {
    const out = execFileSync('node', ['.claude/hooks/guard-coverage-floor.mjs'], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', ...payload }),
    }).toString()
    const got = out.includes('"deny"') ? 'DENY' : 'ALLOW'
    const ok = got === want
    if (!ok) bad++
    const what = payload.tool_input.new_string ?? payload.tool_input.content ?? payload.tool_name
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} want=${want} got=${got} ${payload.tool_name} ${JSON.stringify(what).slice(0, 60)}`,
    )
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(bad === 0 ? '\nall cases correct' : `\n${bad} FAILURES`)
process.exit(bad === 0 ? 0 : 1)
