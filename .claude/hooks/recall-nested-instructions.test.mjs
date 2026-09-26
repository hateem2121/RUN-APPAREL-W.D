/**
 * Cases for recall-nested-instructions.mjs and its partner note-compaction.mjs.
 * Run from the repo root:
 *
 *   node .claude/hooks/recall-nested-instructions.test.mjs
 *
 * NOT part of `pnpm test`, for the reason guard-bare-pnpm.test.mjs states.
 *
 * WHY THE PAIR IS TESTED TOGETHER. They are one mechanism split across two events
 * only because PostCompact has no decision control and its output is discarded — so
 * the interesting failure is not in either file, it is in the handoff: a marker
 * written and never read, or read and never cleared, and in both cases nothing
 * fails. The one-shot case below is the one that matters most; a reminder that
 * repeats on every prompt is one the owner learns to skip.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RECALL = new URL('recall-nested-instructions.mjs', import.meta.url).pathname
const NOTE = new URL('note-compaction.mjs', import.meta.url).pathname
let failures = 0

/** A throwaway repo with a root CLAUDE.md and two nested ones. */
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'recall-hook-'))
  mkdirSync(join(dir, '.claude'), { recursive: true })
  mkdirSync(join(dir, 'apps/viewer'), { recursive: true })
  mkdirSync(join(dir, 'tools/asset-pipeline'), { recursive: true })
  writeFileSync(join(dir, 'CLAUDE.md'), 'root')
  writeFileSync(join(dir, 'apps/viewer/CLAUDE.md'), 'viewer traps')
  writeFileSync(join(dir, 'tools/asset-pipeline/CLAUDE.md'), 'pipeline traps')
  return dir
}

function run(hook, dir, payload) {
  const out = execFileSync('node', [hook], {
    input: JSON.stringify(payload),
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

check('stays silent when no compaction has happened', () => {
  const dir = fixture()
  const got = run(RECALL, dir, { hook_event_name: 'UserPromptSubmit', prompt: 'hello' })
  if (got !== '') throw new Error(`spoke without a compaction: ${got}`)
})

check('PostCompact writes the marker the next prompt reads', () => {
  const dir = fixture()
  run(NOTE, dir, { hook_event_name: 'PostCompact', trigger: 'auto' })
  if (!existsSync(join(dir, '.claude/.compact-pending'))) throw new Error('no marker written')
})

check('after a compaction, names the nested files and NOT the root', () => {
  const dir = fixture()
  run(NOTE, dir, { hook_event_name: 'PostCompact', trigger: 'manual' })
  const got = run(RECALL, dir, { hook_event_name: 'UserPromptSubmit', prompt: 'hello' })
  if (!got.includes('apps/viewer/CLAUDE.md')) throw new Error(`missed a nested file: ${got}`)
  if (!got.includes('tools/asset-pipeline/CLAUDE.md'))
    throw new Error(`missed a nested file: ${got}`)
  // The root survives compaction, so naming it would be wrong and would train the
  // reader to ignore the list.
  for (const line of got.split('\n')) {
    if (line.trim().startsWith('CLAUDE.md')) throw new Error(`named the root file: ${line}`)
  }
})

check('discovery is a glob, not a list — a NEW nested file is named without an edit', () => {
  const dir = fixture()
  mkdirSync(join(dir, 'apps/brand-new'), { recursive: true })
  writeFileSync(join(dir, 'apps/brand-new/CLAUDE.md'), 'invented after this hook was written')
  run(NOTE, dir, { hook_event_name: 'PostCompact', trigger: 'auto' })
  const got = run(RECALL, dir, { hook_event_name: 'UserPromptSubmit', prompt: 'hi' })
  if (!got.includes('apps/brand-new/CLAUDE.md')) throw new Error(`hardcoded list: ${got}`)
})

check('names the path rules in .claude/rules/ too, discovered rather than listed', () => {
  // Added 2026-09-26: the root file's cross-cutting traps moved into path rules, which
  // are no more re-injected after /compact than a nested CLAUDE.md is.
  const dir = fixture()
  mkdirSync(join(dir, '.claude/rules'), { recursive: true })
  writeFileSync(join(dir, '.claude/rules/invented-rule.md'), '---\npaths:\n  - "x/**"\n---\n')
  run(NOTE, dir, { hook_event_name: 'PostCompact', trigger: 'auto' })
  const got = run(RECALL, dir, { hook_event_name: 'UserPromptSubmit', prompt: 'hi' })
  if (!got.includes('.claude/rules/invented-rule.md')) throw new Error(`missed the rule: ${got}`)
  if (!got.includes('apps/viewer/CLAUDE.md')) throw new Error(`lost the nested files: ${got}`)
})

check('fires ONCE — the marker is cleared, so the next prompt is quiet', () => {
  const dir = fixture()
  run(NOTE, dir, { hook_event_name: 'PostCompact', trigger: 'auto' })
  const first = run(RECALL, dir, { hook_event_name: 'UserPromptSubmit', prompt: 'one' })
  if (first === '') throw new Error('said nothing on the first prompt')
  const second = run(RECALL, dir, { hook_event_name: 'UserPromptSubmit', prompt: 'two' })
  if (second !== '') throw new Error(`repeated itself: ${second}`)
})

check('skips node_modules, so a dependency CLAUDE.md is never reported', () => {
  const dir = fixture()
  mkdirSync(join(dir, 'node_modules/some-package'), { recursive: true })
  writeFileSync(join(dir, 'node_modules/some-package/CLAUDE.md'), 'not ours')
  run(NOTE, dir, { hook_event_name: 'PostCompact', trigger: 'auto' })
  const got = run(RECALL, dir, { hook_event_name: 'UserPromptSubmit', prompt: 'hi' })
  if (got.includes('node_modules')) throw new Error(`walked node_modules: ${got}`)
})

check('both hooks exit 0 and stay quiet on malformed JSON', () => {
  const dir = fixture()
  for (const hook of [NOTE, RECALL]) {
    const out = execFileSync('node', [hook], {
      input: '{not json',
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString()
    if (out.trim() !== '') throw new Error(`${hook} wrote something: ${out}`)
  }
})

console.log(failures === 0 ? '\nall cases pass' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
