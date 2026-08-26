/**
 * Cases for format-edited-file.mjs. Run from the repo root:
 *
 *   node .claude/hooks/format-edited-file.test.mjs
 *
 * NOT part of `pnpm test`, for the reason guard-bare-pnpm.test.mjs states.
 *
 * WHY IT STUBS THE BINARY. What matters here is not that Biome formats correctly —
 * Biome's own suite covers that — but WHICH PATHS this hook hands it, and that list
 * is where a quiet mistake lives. Reformatting the Payload import map would produce
 * a diff on every regeneration, which CLAUDE.md names explicitly ("Do not 'fix' it
 * by reformatting the generated file into the repo"). So the stub records its
 * arguments and the cases assert the selection, not the formatting.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOOK = new URL('format-edited-file.mjs', import.meta.url).pathname
let failures = 0

/** A throwaway repo whose `biome` records every invocation instead of running one. */
function fixture({ withBiome = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'format-hook-'))
  mkdirSync(join(dir, 'node_modules/.bin'), { recursive: true })
  if (withBiome) {
    const stub = join(dir, 'node_modules/.bin/biome')
    writeFileSync(stub, `#!/bin/sh\necho "$@" >> "${join(dir, 'calls.log')}"\n`)
    chmodSync(stub, 0o755)
  }
  return dir
}

/** The arguments the stub was called with, one line per call. */
function callsIn(dir) {
  const log = join(dir, 'calls.log')
  return existsSync(log) ? readFileSync(log, 'utf8').trim() : ''
}

function run(dir, filePath) {
  execFileSync('node', [HOOK], {
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: filePath },
    }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
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

check('formats a TypeScript file that was just edited', () => {
  const dir = fixture()
  run(dir, join(dir, 'apps/viewer/src/App.tsx'))
  const calls = callsIn(dir)
  if (!calls.includes('App.tsx')) throw new Error(`did not format it: ${calls}`)
  if (!calls.includes('--write')) throw new Error(`did not apply fixes: ${calls}`)
})

check('leaves a file type Biome does not parse alone', () => {
  const dir = fixture()
  run(dir, join(dir, 'docs/RUNBOOK.md'))
  if (callsIn(dir) !== '') throw new Error(`ran on Markdown: ${callsIn(dir)}`)
})

check('NEVER reformats the generated Payload import map', () => {
  // CLAUDE.md: next dev rewrites this in Payload's own formatting, and reformatting
  // it into the repo guarantees a diff on every regeneration.
  const dir = fixture()
  run(dir, join(dir, 'apps/cms/src/app/(payload)/admin/importMap.js'))
  if (callsIn(dir) !== '') throw new Error(`reformatted a generated file: ${callsIn(dir)}`)
})

check('ignores a path outside the repo, where this config does not apply', () => {
  const dir = fixture()
  run(dir, '/Users/someone/elsewhere/other.ts')
  if (callsIn(dir) !== '') throw new Error(`reached outside the repo: ${callsIn(dir)}`)
})

check('does nothing on a fresh clone where the binary is not installed yet', () => {
  const dir = fixture({ withBiome: false })
  run(dir, join(dir, 'apps/viewer/src/App.tsx')) // must not throw
  if (callsIn(dir) !== '') throw new Error('called a binary that does not exist')
})

check('exits 0 and does nothing on malformed JSON', () => {
  const dir = fixture()
  execFileSync('node', [HOOK], {
    input: '{not json',
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (callsIn(dir) !== '') throw new Error('ran on a malformed payload')
})

console.log(failures === 0 ? '\nall cases pass' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
