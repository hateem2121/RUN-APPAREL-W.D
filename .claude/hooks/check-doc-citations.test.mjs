/**
 * Cases for check-doc-citations.mjs. Run from the repo root:
 *
 *   node .claude/hooks/check-doc-citations.test.mjs
 *
 * NOT part of `pnpm test`, for the reason guard-bare-pnpm.test.mjs states.
 *
 * WHY IT STUBS THE CHECKER. The real scripts/doc-citations.mjs is exercised by CI
 * (apps/cms/src/claudeMd.test.ts) and passes today, so running it here would prove
 * only that the repo is currently clean — it could never produce the FAILING case,
 * which is the one this hook exists for. That is the fixture trap this repo keeps
 * hitting: a test whose fixture cannot exhibit the failure is not a test. So the
 * checker is stubbed to fail on demand.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOOK = new URL('check-doc-citations.mjs', import.meta.url).pathname
let failures = 0

/** A throwaway repo whose citation checker passes, fails, or is missing entirely. */
function fixture(mode) {
  const dir = mkdtempSync(join(tmpdir(), 'citations-hook-'))
  if (mode !== 'absent') {
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    const body =
      mode === 'fails'
        ? "console.log('docs/RUNBOOK.md:12 -> apps/viewer/gone.ts (not found)')\nprocess.exit(1)\n"
        : "console.log('684 citations checked across 50 documents; 0 unresolved.')\n"
    writeFileSync(join(dir, 'scripts/doc-citations.mjs'), body)
  }
  return dir
}

function run(dir, filePath) {
  const out = execFileSync('node', [HOOK], {
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: filePath },
    }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).toString()
  if (out.trim() === '') return ''
  return JSON.parse(out).hookSpecificOutput?.additionalContext ?? ''
}

function check(name, fn) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures++
    console.error(`FAIL  ${name}\n      ${error.message}`)
  }
}

check('surfaces the broken citation, with the checker output, after a .md edit', () => {
  const got = run(fixture('fails'), 'docs/RUNBOOK.md')
  if (!got.includes('apps/viewer/gone.ts')) throw new Error(`lost the detail: ${got}`)
  if (!got.includes('claudeMd.test.ts')) throw new Error('did not say CI gates on it')
})

check('stays quiet when every citation resolves', () => {
  const got = run(fixture('passes'), 'CLAUDE.md')
  if (got !== '') throw new Error(`spoke on a clean run: ${got}`)
})

check('does not run the checker for a non-Markdown edit', () => {
  // A stub that would FAIL, on a .ts path: silence proves the extension gate, not luck.
  const got = run(fixture('fails'), 'apps/viewer/src/App.tsx')
  if (got !== '') throw new Error(`ran on a source file: ${got}`)
})

check('does nothing when the checker is not present', () => {
  const got = run(fixture('absent'), 'docs/RUNBOOK.md')
  if (got !== '') throw new Error(`spoke without a checker: ${got}`)
})

check('exits 0 and stays quiet on malformed JSON', () => {
  const dir = fixture('fails')
  const out = execFileSync('node', [HOOK], {
    input: '{not json',
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).toString()
  if (out.trim() !== '') throw new Error(`wrote something: ${out}`)
})

console.log(failures === 0 ? '\nall cases pass' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
