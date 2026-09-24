#!/usr/bin/env node
/**
 * Every SETTING an instruction file quotes (a backticked `key: value`) must still be true
 * of the file the sentence is about. Run it directly as the fast local check;
 * apps/cms/src/claudeMd.test.ts is the CI gate.
 *
 * WHY THIS EXISTS. On 2026-08-31 ci.yml stopped cancelling runs on main (7bcefec), and
 * four notes kept saying it did for three weeks: the root CLAUDE.md, .github/CLAUDE.md,
 * CONTRIBUTING.md and the explain-failure hook. The hook's note is injected into any
 * session that a cancelled run has confused. Nothing failed, because nothing compared a
 * quote with the file it describes. Found by hand on 2026-09-24.
 *
 * HOW. A note is split into units: in markdown, a paragraph or one list item; in a hook,
 * one message string, however many `+` lines it spans. If a unit NAMES files (a path, a
 * folder, or a bare name such as ci.yml), each quote in it must appear in one of those
 * files, with whitespace normalised. A named test file also covers the file it tests. If a
 * unit names no file, the quote must appear in some tracked file that is not a note. A key
 * may be quoted or bare (`"types": […]` and `types: […]` are the same setting), so a note
 * can quote JSON the way YAML is written.
 *
 * Markdown counts only through its frontmatter, which is where an agent's `model:` and a
 * skill's `disable-model-invocation:` live. A note's own frontmatter backs its sentences
 * that name no file. Another note's frontmatter counts only for a sentence that names that
 * note. Otherwise notes are never evidence for each other, because two notes can repeat
 * the same stale quote.
 *
 * WHY THE NAMED FILE MATTERS. `cancel-in-progress: true` is still true of three other
 * workflows (android-chrome, lighthouse-live and voiceover). "Somewhere in the repo"
 * would therefore have passed all four of those stale notes.
 *
 * LIMITS.
 * - It proves the text is in the file the sentence names. It cannot prove the sentence
 *   reads that text correctly.
 * - Evidence is a file's whole text, COMMENTS INCLUDED, so a comment that repeats a quote
 *   keeps it green. Quote the setting itself, in the file that sets it.
 * - A nested list item, a paragraph after a blank line inside a list item, and a hook
 *   message joined from an array are units of their own, so a file named only by the
 *   text around them does not reach them: their quotes are checked against every
 *   tracked file instead.
 * - Fenced code blocks, and the comments in a hook, are not read as notes.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * The skills written for THIS repo. Everything else under .claude/skills/ is vendored
 * third-party text, listed in .claude/skills/README.md or skills-lock.json. Its quotes are
 * generic CSS and React examples, not claims about this repo.
 */
export const FIRST_PARTY_SKILLS = ['check-live', 'deploy-preflight', 'gates']

/**
 * Quotes that no file holds, on purpose. Each is allowed only in the note beside it, so
 * the same words in any other note are still checked. The test fails on an entry its note
 * no longer makes, so this list cannot rot.
 */
export const ALLOWED_QUOTES = [
  // GitHub settings and `gh` output: read from GitHub, held by no file here.
  {
    file: '.github/CLAUDE.md',
    quote: 'sha_pinning_required: true',
    reason: "the old org's Actions policy",
  },
  {
    file: '.github/CLAUDE.md',
    quote: 'required_approving_review_count: 0',
    reason: "main's ruleset, set in GitHub",
  },
  {
    file: '.github/CLAUDE.md',
    quote: 'status: pending',
    reason: 'a dismissal request as the API reported it',
  },
  {
    file: 'CLAUDE.md',
    quote: 'mergeable: MERGEABLE',
    reason: 'gh pr view during the 2026-08-25 merge deadlock',
  },
  {
    file: 'CLAUDE.md',
    quote: 'mergeStateStatus: BLOCKED',
    reason: 'gh pr view during the 2026-08-25 merge deadlock',
  },
  {
    file: '.github/CLAUDE.md',
    quote: 'uses: repo@<sha>',
    reason: 'a pattern with a placeholder, not a value',
  },
  {
    file: '.github/CLAUDE.md',
    quote: '"type": "tag"',
    reason: 'what the GitHub API returns for an annotated tag',
  },
  {
    file: 'tools/asset-pipeline/CLAUDE.md',
    quote: '"resolved": "file:"',
    reason: 'the lockfile entry shape scripts/check-lockfile-sync.mjs rejects; a pattern',
  },
  // Error messages and log lines, quoted so that a search for them finds the note.
  {
    file: '.github/CLAUDE.md',
    quote: 'CAPIError: 400 The requested model is not supported',
    reason: "the error GitHub's AI-findings check printed",
  },
  {
    file: '.github/CLAUDE.md',
    quote: 'libevent-2.1.so.7: cannot open shared object file',
    reason: 'a WebKit launch error',
  },
  {
    file: 'apps/cms/CLAUDE.md',
    quote: 'curl: (3) bad range in URL',
    reason: "curl's error when zsh globs a URL",
  },
  {
    file: 'tools/asset-pipeline/CLAUDE.md',
    quote: 'TypeError: escapeHtml(...)…camera is not a function',
    reason: 'a runtime error',
  },
  {
    file: 'CONTRIBUTING.md',
    quote: 'status: 127',
    reason: "how Playwright's webServer error shows a child's exit",
  },
  {
    file: 'tools/asset-pipeline/CLAUDE.md',
    quote: 'geometry: none',
    reason: 'the line tools/asset-pipeline/src/cli.ts logs when no geometry flag arrived',
  },
  // Values measured on the day: what a response, a record or a render showed.
  {
    file: 'apps/cms/CLAUDE.md',
    quote: 'cf-cache-status: MISS',
    reason: 'a response header after a fresh upload',
  },
  {
    file: 'apps/viewer/CLAUDE.md',
    quote: 'sec-fetch-mode: navigate',
    reason: 'the browser request header that reproduces a CSP report',
  },
  {
    file: 'apps/viewer/CLAUDE.md',
    quote: 'X-Worker-Ran: yes',
    reason: 'a probe route used once to prove the Worker ran; not in the code',
  },
  {
    file: 'apps/cms/CLAUDE.md',
    quote: 'Vary: Origin, Sec-CH-Prefers-Color-Scheme',
    reason:
      'the header in HTTP form, as the 2026-08-18 fix set it; publicViewerHeaders.mjs writes JS',
  },
  {
    file: 'apps/viewer/CLAUDE.md',
    quote: 'scrollY: 0',
    reason: 'what an early assertion measured',
  },
  {
    file: 'CLAUDE.md',
    quote: 'artworkVerdict: ok',
    reason: "a garment's Media field on the day its model was unreachable",
  },
  {
    file: 'tools/asset-pipeline/CLAUDE.md',
    quote: 'wouldShip: true',
    reason: "the sweep's recorded output; output/ is gitignored",
  },
  {
    file: 'tools/asset-pipeline/CLAUDE.md',
    quote: 'alphaMode: BLEND',
    reason: 'a glTF material value inside exported garments',
  },
  // Settings that were tried and rejected, quoted so nobody tries them again.
  {
    file: 'apps/viewer/CLAUDE.md',
    quote: 'min-height: 700px',
    reason: 'the extrapolated floor that broke 900x700',
  },
  {
    file: 'apps/cms/CLAUDE.md',
    quote: "runtime: 'edge'",
    reason: 'tried on the CMS and refused by the Cloudflare build',
  },
]

const ALLOWED = new Set(ALLOWED_QUOTES.map(({ file, quote }) => `${file}\n${quote}`))

/**
 * Never evidence: this file holds the allow-list, and the test holds the planted negative
 * controls. Either one would otherwise "confirm" a stale quote by containing it.
 */
const NOT_EVIDENCE = new Set(['scripts/quoted-settings.mjs', 'apps/cms/src/claudeMd.test.ts'])
const UNREADABLE =
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json)$|\.(png|jpe?g|webp|avif|gif|ico|glb|gltf|bin|ktx2|pdf|woff2?|ttf|otf|mp4|webm|zip|gz)$/i

// A key, optionally in JSON's double quotes, or a CSS custom property (`--reveal-y`).
const QUOTE = /`("?(?:--)?[A-Za-z_][\w.-]*"?: [^`]{1,80})`/g
const CODE_TOKEN = /`([^`\s]+)`/g
const BARE_FILE =
  /(?<![\w./-])([\w-][\w.-]*\.(?:ya?ml|jsonc?|toml|mjs|cjs|js|ts|tsx|sh))(?![\w.-])/g

const normalise = (text) => text.replace(/\s+/g, ' ').trim()

/** The same setting with its key bare and in double quotes: a note may quote JSON as YAML. */
function spellings(quote) {
  const parts = quote.match(/^"?((?:--)?[A-Za-z_][\w.-]*)"?: (.*)$/)
  if (!parts) return [quote]
  return [...new Set([quote, `${parts[1]}: ${parts[2]}`, `"${parts[1]}": ${parts[2]}`])]
}

/**
 * The files a session loads or follows as instructions: every CLAUDE.md, the root
 * AGENTS.md, CONTRIBUTING.md and README.md, the agents and rules, our own skills, and the
 * hooks, whose messages are injected into a session word for word.
 *
 * @param {string[]} tracked repo-relative paths
 */
export function noteFiles(tracked) {
  return tracked.filter(
    (file) =>
      file === 'CLAUDE.md' ||
      file.endsWith('/CLAUDE.md') ||
      ['AGENTS.md', 'CONTRIBUTING.md', 'README.md'].includes(file) ||
      /^\.claude\/(agents|rules)\/[^/]+\.md$/.test(file) ||
      FIRST_PARTY_SKILLS.some(
        (skill) => file.startsWith(`.claude/skills/${skill}/`) && file.endsWith('.md'),
      ) ||
      (/^\.claude\/hooks\/[^/]+\.mjs$/.test(file) && !file.endsWith('.test.mjs')),
  )
}

/** Markdown units: paragraphs and list items. Fenced code blocks are skipped. */
function markdownUnits(text) {
  const units = []
  let lines = []
  let start = 0
  let fenced = false
  const flush = () => {
    if (lines.length > 0) units.push({ start, text: lines.join('\n') })
    lines = []
  }
  text.split('\n').forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      flush()
      fenced = !fenced
      return
    }
    if (fenced) return
    if (line.trim() === '' || /^\s*(?:[-*+]|\d+\.) /.test(line)) flush()
    if (line.trim() === '') return
    if (lines.length === 0) start = index + 1
    lines.push(line)
  })
  flush()
  return units
}

/**
 * Hook units: the text of each message string, joined across the `+` that continues it
 * onto the next line. Code and comments are skipped; only what a session is shown counts.
 */
function scriptUnits(text) {
  const units = []
  let lines = []
  let start = 0
  text.split('\n').forEach((line, index) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
    const literals = [...line.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)].map((match) =>
      (match[1] ?? match[2]).replace(/\\n/g, ' ').replace(/\\(.)/g, '$1'),
    )
    if (literals.length === 0 && lines.length === 0) return
    if (lines.length === 0) start = index + 1
    lines.push(literals.join(''))
    if (!line.trimEnd().endsWith('+')) {
      units.push({ start, text: lines.join('\n') })
      lines = []
    }
  })
  if (lines.length > 0) units.push({ start, text: lines.join('\n') })
  return units
}

/**
 * Every quoted `key: value` in a note, with its line and the unit it sits in.
 *
 * @param {string} file repo-relative path; `.md` is read as markdown, anything else as a hook
 * @param {string} text the file's contents
 */
export function quotesIn(file, text) {
  const units = file.endsWith('.md') ? markdownUnits(text) : scriptUnits(text)
  return units.flatMap((unit) =>
    [...unit.text.matchAll(QUOTE)].map((match) => ({
      quote: normalise(match[1]),
      line: unit.start + (unit.text.slice(0, match.index).match(/\n/g)?.length ?? 0),
      unit: unit.text,
    })),
  )
}

/**
 * The tracked files a unit names: an exact path, every file under a named folder, or
 * every file with a named bare file name. A named test file brings the file it tests.
 */
export function namedFiles(unit, tracked) {
  const trackedSet = new Set(tracked)
  const tokens = [
    ...[...unit.matchAll(CODE_TOKEN)].map((match) => match[1]),
    ...[...unit.matchAll(BARE_FILE)].map((match) => match[1]),
  ]
  const found = new Set()
  for (const raw of tokens) {
    const token = raw.replace(/:\d+(?:[:-]\d+)?$/, '').replace(/[),.;:'"]+$/, '')
    if (!token || /[*<>$]/.test(token)) continue
    if (trackedSet.has(token)) {
      found.add(token)
      continue
    }
    const folder = token.endsWith('/') ? token : `${token}/`
    const under = tracked.filter((file) => file.startsWith(folder))
    if (under.length > 0) {
      for (const file of under) found.add(file)
      continue
    }
    if (!/\.[A-Za-z]+$/.test(token)) continue
    for (const file of tracked) if (file.endsWith(`/${token}`)) found.add(file)
  }
  for (const file of [...found]) {
    const test = file.match(/^(.*)\.(?:test|spec)\.[cm]?[jt]sx?$/)
    if (!test) continue
    for (const ext of ['ts', 'tsx', 'mjs', 'js']) {
      if (trackedSet.has(`${test[1]}.${ext}`)) found.add(`${test[1]}.${ext}`)
    }
  }
  return [...found]
}

/** What a file contributes as evidence: markdown only through its frontmatter. */
export function evidenceText(file, raw) {
  if (!file.endsWith('.md')) return normalise(raw)
  return normalise(raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '')
}

/**
 * The quotes no longer true of the files their sentences name.
 *
 * @param {{notes: {file: string, text: string}[], tracked: string[], read: (file: string) => string}} input
 *   `read` returns a file's evidence text (see evidenceText)
 */
export function staleQuotes({ notes, tracked, read }) {
  // Whether a file is a note depends on the file, not on which notes this call checks.
  const noteSet = new Set([...noteFiles(tracked), ...notes.map((note) => note.file)])
  const isEvidence = (file) =>
    !NOT_EVIDENCE.has(file) &&
    !UNREADABLE.test(file) &&
    !(noteSet.has(file) && !file.endsWith('.md'))
  const everywhere = tracked.filter(isEvidence)
  const stale = []
  let checked = 0
  for (const { file, text } of notes) {
    for (const { quote, line, unit } of quotesIn(file, text)) {
      checked++
      if (ALLOWED.has(`${file}\n${quote}`)) continue
      const named = namedFiles(unit, tracked).filter((f) => f !== file && isEvidence(f))
      // Naming nothing, a sentence is backed by its own frontmatter or by a file that is
      // not a note: another note saying the same thing is no evidence it is still true.
      const within =
        named.length > 0 ? named : everywhere.filter((f) => f === file || !noteSet.has(f))
      const forms = spellings(quote)
      if (within.some((f) => forms.some((form) => read(f).includes(form)))) continue
      stale.push({ file, line, quote, checkedIn: named.length > 0 ? named : null })
    }
  }
  return { stale, checked }
}

/** @param {string} root */
export function trackedFiles(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
}

/** A cached `read` for staleQuotes. A tracked path that cannot be read is empty. */
export function fileReader(root) {
  const cache = new Map()
  return (file) => {
    if (!cache.has(file)) {
      let raw = ''
      try {
        raw = readFileSync(join(root, file), 'utf8')
      } catch {
        // A symlink to a folder, or a file deleted but not yet committed.
      }
      cache.set(file, evidenceText(file, raw))
    }
    return cache.get(file)
  }
}

/** @param {string} root */
export function reportStaleQuotes(root) {
  const tracked = trackedFiles(root)
  const notes = noteFiles(tracked).map((file) => ({
    file,
    text: readFileSync(join(root, file), 'utf8'),
  }))
  return { ...staleQuotes({ notes, tracked, read: fileReader(root) }), notes: notes.length }
}

function main() {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const { stale, checked, notes } = reportStaleQuotes(root)
  for (const { file, line, quote, checkedIn } of stale) {
    const where = checkedIn
      ? `${checkedIn.slice(0, 3).join(', ')}${checkedIn.length > 3 ? ` and ${checkedIn.length - 3} more` : ''}`
      : 'any tracked file that is not a note'
    console.log(`${file}:${line}  \`${quote}\`  is not in ${where}`)
  }
  if (stale.length > 0) {
    console.log(
      `\n✗ ${stale.length} of ${checked} quoted settings are not in the file their sentence names. ` +
        'Correct the note, or add it to ALLOWED_QUOTES in scripts/quoted-settings.mjs with the reason.',
    )
    process.exit(1)
  }
  console.log(`✓ ${checked} quoted settings checked across ${notes} notes; 0 stale.`)
}

// Real paths on both sides: node reports the module's real path, while argv[1] keeps a
// symlink or a space as typed (see scripts/check-required-checks.mjs, where this bit).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main()
}
