#!/usr/bin/env node
/**
 * The measuring half of `/audit-memory` — run monthly (owner, 2026-09-26).
 *
 * WHY. Every limit an instruction file has here was crossed at least once before anything
 * measured it (docs/CLAUDE-MD-MAINTENANCE.md). This script measures all of them in one
 * pass, so the monthly audit starts from numbers rather than impressions:
 *
 *   1. SIZE against each file's real limit: the root CLAUDE.md under 200 lines (Anthropic's
 *      target); every CLAUDE.md under 39,000 characters (apps/cms/src/claudeMd.test.ts);
 *      AGENTS.md under 24,000 bytes AFTER its `@[label](path)` includes expand
 *      (Antigravity truncates past that); the private MEMORY.md index under 200 lines and
 *      25 KB (Claude Code loads no more of it at session start).
 *   2. SCOPE: a rule file without `paths:` loads in EVERY session — CLAUDE.md bloat by
 *      another name.
 *   3. VERSION DRIFT: a pinned version an instruction file quotes (pnpm, the Playwright
 *      image) that no longer matches the repo.
 *   4. STALE NOTES: a private memory note that names a repo path which no longer exists.
 *   5. Opus 5.5 guide tip 06: an instruction that asks the model to write out its
 *      reasoning, which Opus 5.5 can refuse.
 *
 * PRIVACY. The repo is public, so this prints counts and file NAMES only — never the
 * content of a private note.
 *
 * Usage: node .claude/skills/audit-memory/audit-memory.mjs [--drift-only]
 * Exits 1 when a hard limit is broken.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (path) => readFileSync(join(REPO, path), 'utf8')
const chars = (text) => [...text].length
const lineCount = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0)

function tracked(...patterns) {
  return execFileSync('git', ['ls-files', ...patterns], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
}

/** Instruction files a session loads, excluding vendored skills' own AGENTS.md copies. */
function instructionFiles() {
  return tracked(
    '*CLAUDE.md',
    'AGENTS.md',
    '.claude/rules/*.md',
    '.claude/agents/*.md',
    '.claude/skills/*/SKILL.md',
  ).filter((f) => !/^\.claude\/skills\/[^/]+\/AGENTS\.md$/.test(f))
}

/** Antigravity's include syntax, expanded one level, as it measures the 24,000 bytes. */
function expandedAgentsBytes() {
  if (!existsSync(join(REPO, 'AGENTS.md'))) return null
  const text = read('AGENTS.md').replace(/@\[[^\]]*\]\(([^)]+)\)/g, (_, path) =>
    existsSync(join(REPO, path)) ? read(path) : '',
  )
  return Buffer.byteLength(text, 'utf8')
}

/** Claude Code's auto-memory folder for this checkout (non-alphanumerics become "-"). */
function memoryDir() {
  const slug = realpathSync(REPO).replace(/[^A-Za-z0-9-]/g, '-')
  return join(homedir(), '.claude', 'projects', slug, 'memory')
}

export function sizeProblems() {
  const rows = []
  const problems = []
  // Only files NAMED CLAUDE.md load; the dated copies in docs/archive/ end in it but never do.
  for (const file of tracked('*CLAUDE.md').filter((f) => /(^|\/)CLAUDE\.md$/.test(f))) {
    const text = read(file)
    const row = { file, lines: lineCount(text), chars: chars(text) }
    rows.push(row)
    if (row.chars > 39_000) problems.push(`${file}: ${row.chars} characters (limit 39,000)`)
    if (file === 'CLAUDE.md' && row.lines > 200)
      problems.push(`CLAUDE.md: ${row.lines} lines (target under 200)`)
  }
  const agents = expandedAgentsBytes()
  if (agents !== null) {
    rows.push({ file: 'AGENTS.md (expanded)', lines: null, chars: agents, unit: 'bytes' })
    if (agents > 24_000)
      problems.push(`AGENTS.md expands to ${agents} bytes (Antigravity cuts at 24,000)`)
  }
  const index = join(memoryDir(), 'MEMORY.md')
  if (existsSync(index)) {
    const text = readFileSync(index, 'utf8')
    const bytes = Buffer.byteLength(text, 'utf8')
    rows.push({ file: 'private MEMORY.md', lines: lineCount(text), chars: bytes, unit: 'bytes' })
    if (lineCount(text) > 200 || bytes > 25_000)
      problems.push(
        `private MEMORY.md: ${lineCount(text)} lines / ${bytes} bytes (loads only the first 200 lines or 25 KB)`,
      )
  }
  return { rows, problems }
}

export function unscopedRules() {
  // `paths:` may be the frontmatter's FIRST key, so no newline is required before it.
  return tracked('.claude/rules/*.md').filter(
    (file) => !/^---\n(?:[^\n]*\n)*?paths:/.test(read(file)),
  )
}

export function versionDrift() {
  const pkg = JSON.parse(read('package.json'))
  const pnpm = pkg.packageManager?.replace(/^pnpm@/, '')
  const viewer = JSON.parse(read('apps/viewer/package.json'))
  const playwright = (viewer.devDependencies?.['@playwright/test'] ?? '').replace(/^[\^~]/, '')
  const found = []
  for (const file of instructionFiles()) {
    const text = read(file)
    for (const m of text.matchAll(/pnpm@(\d+\.\d+\.\d+)/g))
      if (pnpm && m[1] !== pnpm) found.push(`${file}: quotes pnpm@${m[1]}, the repo pins ${pnpm}`)
    for (const m of text.matchAll(/playwright:v(\d+\.\d+\.\d+)/g))
      if (playwright && m[1] !== playwright)
        found.push(`${file}: quotes playwright:v${m[1]}, @playwright/test is ${playwright}`)
  }
  return [...new Set(found)]
}

export function reasoningRequests() {
  const pattern =
    /(show|write out|explain|walk through|reproduce)\s+(your|its)\s+(reasoning|thinking|thought process|chain[- ]of[- ]thought)|think step[- ]by[- ]step/i
  const hits = []
  for (const file of instructionFiles()) {
    read(file)
      .split('\n')
      .forEach((line, i) => {
        if (pattern.test(line)) hits.push(`${file}:${i + 1}`)
      })
  }
  return hits
}

/** Private notes naming a repo path that no longer exists. Names only, never content. */
export function staleNotes() {
  const dir = memoryDir()
  if (!existsSync(dir)) return { checked: 0, stale: [] }
  const stale = []
  const notes = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md')
  for (const note of notes) {
    const text = readFileSync(join(dir, note), 'utf8')
    const missing = new Set()
    for (const m of text.matchAll(
      /`((?:apps|packages|tools|scripts|docs|infra|\.claude|\.github)\/[\w./@()-]+\.[a-z]{2,5})(?::\d+)?`/g,
    )) {
      if (!existsSync(join(REPO, m[1]))) missing.add(m[1])
    }
    if (missing.size > 0) stale.push({ note, missing: [...missing] })
  }
  return { checked: notes.length, stale }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const driftOnly = process.argv.includes('--drift-only')
  const drift = versionDrift()
  if (driftOnly) {
    console.log(
      drift.length === 0 ? '✓ no pinned-version drift in instruction files' : drift.join('\n'),
    )
    process.exit(0)
  }
  const { rows, problems } = sizeProblems()
  console.log('SIZES')
  for (const r of rows)
    console.log(
      `  ${r.file.padEnd(34)} ${r.lines === null ? '' : `${r.lines} lines, `}${r.chars} ${r.unit ?? 'chars'}`,
    )
  const unscoped = unscopedRules()
  const reasoning = reasoningRequests()
  const notes = staleNotes()
  console.log(
    `\nRULES WITHOUT paths: (load in every session): ${unscoped.length ? unscoped.join(', ') : 'none'}`,
  )
  console.log(`VERSION DRIFT: ${drift.length ? `\n  ${drift.join('\n  ')}` : 'none'}`)
  console.log(
    `ASKS TO SHOW REASONING (Opus 5.5 tip 06): ${reasoning.length ? reasoning.join(', ') : 'none'}`,
  )
  console.log(`PRIVATE NOTES naming a missing repo path: ${notes.stale.length} of ${notes.checked}`)
  for (const s of notes.stale) console.log(`  ${s.note}: ${s.missing.join(', ')}`)
  console.log(
    problems.length
      ? `\n✗ ${problems.length} hard limit(s) broken:\n  ${problems.join('\n  ')}`
      : '\n✓ every hard limit holds',
  )
  process.exit(problems.length ? 1 : 0)
}
