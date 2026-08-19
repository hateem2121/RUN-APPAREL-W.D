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
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
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

check('records reason, repo-relative path and size for a session_start load', () => {
  const log = run({
    hook_event_name: 'InstructionsLoaded',
    load_reason: 'session_start',
    file_path: '/nope/CLAUDE.md',
    file_content: 'x'.repeat(42),
  })
  if (!log.includes('session_start')) throw new Error(`no reason in: ${log}`)
  if (!log.includes('42c')) throw new Error(`no size in: ${log}`)
})

check('makes an in-repo path relative, so the log is readable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'instr-hook-'))
  mkdirSync(join(dir, '.claude'), { recursive: true })
  execFileSync('node', [HOOK], {
    input: JSON.stringify({
      load_reason: 'nested_traversal',
      file_path: join(dir, 'apps/viewer/CLAUDE.md'),
      file_content: '',
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
    file_content: '',
  })
  if (!log.includes('/Users/someone/.claude/CLAUDE.md')) throw new Error(`rewritten: ${log}`)
})

check('does not log file_content — the log must not exceed what it describes', () => {
  const log = run({
    load_reason: 'compact',
    file_path: '/nope/CLAUDE.md',
    file_content: 'SECRET-CANARY-STRING'.repeat(50),
  })
  if (log.includes('SECRET-CANARY-STRING')) throw new Error('content was logged')
  if (!log.includes('1000c')) throw new Error(`size wrong: ${log}`)
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
