/**
 * Cases for log-instructions-loaded.mjs. Run from the repo root:
 *
 *   node .claude/hooks/log-instructions-loaded.test.mjs
 *
 * NOT part of `pnpm test`, for the reason guard-bare-pnpm.test.mjs states: .claude/
 * is not a workspace package, so vitest never sees it.
 *
 * The cases that matter are the SILENT ones. This hook runs on every memory-file
 * load, several times per session, and its exit code is ignored by design — so a
 * hook that threw would produce a stream of unexplained stderr in the transcript
 * and change nothing. Every malformed input below must still exit 0 and write
 * nothing rather than half a line.
 *
 * ⚠️ THIS FILE IS WHY THE SIZE COLUMN WAS WRONG FOR 167 ENTRIES, and it is the
 * fourth time this repo has been bitten by the same thing. The size cases used to
 * pass `file_content: 'x'.repeat(42)` and assert `42c`. A real InstructionsLoaded
 * payload DOES NOT CARRY `file_content` — so the fixture supplied a field
 * production never sends, the hook's `event.file_content.length` read it happily in
 * the test, and took its `: 0` fallback on every real load. Green suite, `0c`
 * beside a 38,036-byte file, nobody warned.
 *
 * That is verbatim the pattern the root CLAUDE.md calls "the one pattern that keeps
 * causing incidents": seeded placeholders with no compression, then no CSP-tripping
 * geometry, then no textures and no UVs — "if production compresses, seed
 * compressed." A fixture richer than production is the same bug as a fixture poorer
 * than it. So the size cases below now write a REAL FILE and assert its REAL byte
 * count, and the negative control asserts that a payload carrying `file_content`
 * for a path that does not exist logs `0b` — i.e. that the field which caused the
 * bug can no longer be mistaken for a measurement.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOOK = new URL('log-instructions-loaded.mjs', import.meta.url).pathname
let failures = 0

/** Run the hook with `payload` on stdin, in a throwaway project dir. Returns the log. */
function run(payload) {
  const dir = mkdtempSync(join(tmpdir(), 'instr-hook-'))
  mkdirSync(join(dir, '.claude'), { recursive: true })
  execFileSync('node', [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const log = join(dir, '.claude', 'instructions-loaded.log')
  return existsSync(log) ? readFileSync(log, 'utf8') : ''
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

check("records reason, repo-relative path and the file's REAL size", () => {
  const dir = mkdtempSync(join(tmpdir(), 'instr-hook-'))
  mkdirSync(join(dir, '.claude'), { recursive: true })
  const target = join(dir, 'CLAUDE.md')
  writeFileSync(target, 'x'.repeat(42))
  execFileSync('node', [HOOK], {
    input: JSON.stringify({
      hook_event_name: 'InstructionsLoaded',
      load_reason: 'session_start',
      file_path: target,
    }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const log = readFileSync(join(dir, '.claude', 'instructions-loaded.log'), 'utf8')
  if (!log.includes('session_start')) throw new Error(`no reason in: ${log}`)
  // Note there is no `file_content` in the payload above, because a real one has none.
  if (!log.includes('42b')) throw new Error(`size not measured from disk: ${log}`)
})

check('NEGATIVE CONTROL: file_content cannot stand in for a real measurement', () => {
  // This is the case that would have caught the original bug. A payload that carries
  // `file_content` for a path that does not exist must log 0 — never the string's
  // length — or the hook is measuring the fixture again instead of the file.
  const log = run({
    load_reason: 'session_start',
    file_path: '/nope/CLAUDE.md',
    file_content: 'x'.repeat(42),
  })
  if (log.includes('42b') || log.includes('42c')) {
    throw new Error(`measured the payload field, not the file: ${log}`)
  }
  if (!log.includes('0b')) throw new Error(`expected 0b for a missing file: ${log}`)
})

check('makes an in-repo path relative, so the log is readable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'instr-hook-'))
  mkdirSync(join(dir, '.claude'), { recursive: true })
  execFileSync('node', [HOOK], {
    input: JSON.stringify({
      load_reason: 'nested_traversal',
      file_path: join(dir, 'apps/viewer/CLAUDE.md'),
    }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const log = readFileSync(join(dir, '.claude', 'instructions-loaded.log'), 'utf8')
  if (!log.includes('apps/viewer/CLAUDE.md')) throw new Error(`not relative: ${log}`)
  if (log.includes(dir)) throw new Error(`absolute path leaked: ${log}`)
})

check('keeps an out-of-repo path absolute — ~/.claude loading is worth seeing', () => {
  const log = run({
    load_reason: 'session_start',
    file_path: '/Users/someone/.claude/CLAUDE.md',
  })
  if (!log.includes('/Users/someone/.claude/CLAUDE.md')) throw new Error(`rewritten: ${log}`)
})

check('does not log the file body — the log must not exceed what it describes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'instr-hook-'))
  mkdirSync(join(dir, '.claude'), { recursive: true })
  const target = join(dir, 'CLAUDE.md')
  const body = 'SECRET-CANARY-STRING'.repeat(50)
  writeFileSync(target, body)
  execFileSync('node', [HOOK], {
    input: JSON.stringify({ load_reason: 'compact', file_path: target }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const log = readFileSync(join(dir, '.claude', 'instructions-loaded.log'), 'utf8')
  if (log.includes('SECRET-CANARY-STRING')) throw new Error('content was logged')
  if (!log.includes(`${body.length}b`)) throw new Error(`size wrong: ${log}`)
})

check('exits 0 and writes nothing on malformed JSON', () => {
  const log = run('{not json at all')
  if (log !== '') throw new Error(`wrote something: ${log}`)
})

check('exits 0 and writes nothing on empty stdin', () => {
  const log = run('')
  if (log !== '') throw new Error(`wrote something: ${log}`)
})

check('survives a payload missing every optional field', () => {
  const log = run({})
  if (!log.includes('(no reason)')) throw new Error(`no placeholder: ${log}`)
  if (!log.includes('(unknown)')) throw new Error(`no placeholder: ${log}`)
})

console.log(failures === 0 ? '\nall cases pass' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
