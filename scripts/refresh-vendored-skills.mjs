#!/usr/bin/env node
/**
 * Refresh the third-party agent skills vendored into this repository from their upstream
 * GitHub repositories, behind a safety scan.
 *
 *   node scripts/refresh-vendored-skills.mjs [--write] [--summary <file>] [--only a,b]
 *
 * WHY THIS EXISTS. `.claude/skills/README.md` ("Updating") says a vendored skill moves only
 * when a person re-fetches it and edits the table in the same commit. Measured 2026-10-03:
 * 24 vendored skills in 161 files, and 13 of the 24 already differ from upstream's head. A
 * skill is an instruction, not a document (README, "Removed: browser-testing-with-devtools"):
 * it is injected into an agent's context, so a careless or hostile upstream edit is a prompt
 * injection with this repository's name on it. The script does the fetching and a first,
 * mechanical read of every change. It never merges anything: a person still reads the diff.
 *
 * WHAT IT DOES. For every skill in the README table or in skills-lock.json (the README rows
 * marked "unstated" are local-only and skipped) it asks GitHub for the default branch's head,
 * lists the skill's upstream folder, and compares it with the local folder by git blob id.
 * Only a skill that DIFFERS is scanned, before any file is touched.
 *
 * A SKILL IS NOT ONLY TEXT. Claude Code runs a line's `!` + backtick command and a ```! block
 * before the model reads the skill, lets the tools named in `allowed-tools` run without asking,
 * and keeps a skill's `hooks` running for the rest of the session (code.claude.com/docs/en/skills,
 * read 2026-10-03). So ".md and .json only" does not mean "nothing executable": lines are read.
 *
 * The scan BLOCKS the skill, and leaves it exactly as it was, when the new version:
 *   - adds or edits a file whose name does not end in .md or .json;
 *   - has a LINE the old version did not have that runs a command (a ```! block's every line,
 *     not only its first), is a SKILL.md header line outside the fields that only describe a
 *     skill (where tool grants and hooks would go), carries a character that shows as nothing,
 *     or matches the credential-access, instruction-override or secret-shaped patterns. Lines
 *     are compared as a multiset: a flagged line that was already there never blocks, a second
 *     copy of it does, and deleting one benign line does not pay for a new one (the first
 *     version compared per-file COUNTS, which let exactly that through: commit review,
 *     2026-10-03);
 *   - answers under a different GitHub owner (a rename is followed, a transfer is not);
 *   - has a licence that is not MIT or Apache-2.0, or not the one the README row records;
 *   - cannot be trusted as a file set: a symbolic link, a submodule, a path that leaves the
 *     folder, a nested .claude folder, a name outside [A-Za-z0-9._/-] or two names that differ
 *     only in capitals (one file on a Mac), a file over 1 MiB, a NUL byte or invalid UTF-8, or
 *     bytes that do not match GitHub's own file list.
 * --accept <name>@<commit> lets one skill's flagged LINES through after a person has read them
 * at that upstream commit; if upstream has moved since, it waives nothing. It waives no other
 * check, and the weekly workflow never passes it.
 * Without --write nothing is written (README and lock included). With --write, a skill that
 * passes has its changed files written, files that vanished upstream deleted, its README row's
 * commit cell set to upstream's head (12 hex) and its skills-lock.json hash recomputed.
 * If ANY skill could not be checked (network failure, rate limit), nothing is written at all:
 * a half-refreshed tree is worse than yesterday's.
 *
 * MEASURED 2026-10-03, WHICH SHAPED RULES BELOW.
 * - `vercel-labs/agent-skills` has no licence GitHub can detect (`license: null`; the README
 *   says the same: no LICENSE file at its root). Three README rows say MIT because the skills'
 *   own frontmatter declares `license: MIT`, the source the README accepts ("Unstated is
 *   measured, not lazy"). So when GitHub finds no licence file, the licence is the one the NEW
 *   SKILL.md declares, and it must still be allowed and match the README row.
 * - The lock names eight skills `emilkowalski/skill`; the README names the same upstream
 *   `emilkowalski/skills`. GitHub answers the first with `full_name: emilkowalski/skills`, so
 *   repositories are keyed by the full_name GitHub reports and fetched once.
 * - `ask-sonner` is in the lock and in .agents/skills/ but has no .claude/skills/ link (seven
 *   links exist where the README says eight), so a skill's folder is looked up in both places.
 * - The lock's three vercel-* hashes are neither the folder hash below nor SHA-256 of
 *   SKILL.md (the cause was not found), so the recipe cannot be checked on a nested folder.
 *   The first refresh that changes one of those skills rewrites its entry with the folder
 *   hash. The eight entries under .agents/skills/ match the recipe exactly.
 * - `[A-Z]+_TOKEN` is quadratic on a run of capitals: 72 ms at 10,000, 1,136 ms at 40,000,
 *   which extrapolates to about 13 minutes for one hostile 1 MiB file in an unattended job.
 *   `[A-Z]_TOKEN` counts the same matches (0 differences in 200,000 random strings) and
 *   took 0.2 ms on 1 MiB.
 *   `BEGIN [A-Z ]*PRIVATE KEY` is the same shape (2,052 ms on 30,000 repeats of "BEGIN "),
 *   so its tail is bounded at 40 characters.
 *
 * Environment: GITHUB_TOKEN (optional) is sent to api.github.com only, never to the raw-file
 * host, and is never printed. GITHUB_OUTPUT (set by GitHub Actions) receives `changed=true|false`
 * (true when a skill was, or in a dry run would be, updated and nothing failed) and
 * `blocked=<n>`. Behind a proxy, Node's fetch needs NODE_USE_ENV_PROXY=1.
 *
 * Exit status: 0 when the run completed, blocked skills included. 1 when anything could not be
 * checked or the command line was wrong.
 */
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

/**
 * @typedef {{ name: string, repo: string, sha: string, licence: string, line: number }} ReadmeRow
 * @typedef {{ source: string, sourceType: string, skillPath?: string, computedHash: string }} LockEntry
 * @typedef {{ version: number, skills: Record<string, LockEntry> }} Lock
 * @typedef {{
 *   name: string, repo: string, folder: string, readme?: ReadmeRow, lock?: LockEntry,
 *   problems: string[],
 * }} SkillRecord
 * @typedef {{
 *   name: string, repo: string, upstream: string | null,
 *   status: 'unchanged' | 'updated' | 'blocked' | 'error',
 *   oldSha: string | null, newSha: string | null, added: string[], changed: string[],
 *   removed: string[], reasons: string[], accepted: string[], acceptable: boolean,
 *   flagged?: { file: string, pattern: string, lines: { number: number, text: string }[] }[],
 *   message?: string, hasReadmeRow: boolean, hasLockEntry: boolean,
 *   plan?: { dir: string, writes: Map<string, Uint8Array>, deletes: string[] },
 * }} SkillResult
 * @typedef {{
 *   results: SkillResult[], updated: SkillResult[], blocked: SkillResult[],
 *   unchanged: SkillResult[], errors: SkillResult[], requestedWrite: boolean, wrote: boolean,
 * }} RefreshResult
 * @typedef {(
 *   url: string,
 *   init?: { headers?: Record<string, string>, signal?: AbortSignal },
 * ) => Promise<Response>} FetchLike
 */

const API = 'https://api.github.com'
const RAW = 'https://raw.githubusercontent.com'
// 2022-11-28 is what GitHub assumes without the header and is supported until 2028-03-10.
// The newer 2026-03-10 changes none of the three endpoints used here (repository, commit,
// tree), per docs.github.com/en/rest/about-the-rest-api/breaking-changes, read 2026-10-03.
const API_VERSION = '2022-11-28'
const USER_AGENT = 'run-apparel-refresh-vendored-skills'
const REQUEST_TIMEOUT_MS = 30_000
const DOWNLOAD_CONCURRENCY = 6

export const ALLOWED_LICENCES = ['MIT', 'Apache-2.0']
/** The largest vendored file today is 108,261 bytes (vercel-react-best-practices/AGENTS.md). */
export const MAX_FILE_BYTES = 1_048_576
const TEXT_FILE = /\.(md|json)$/
/** A name that reads the same to a person, to git and to every file system. */
const PLAIN_PATH = /^[A-Za-z0-9._/-]+$/

/**
 * Each is tried on one line at a time, as `visible` leaves it. See the header for why the two
 * `[A-Z]` forms are written without a `+` and the key header's tail is bounded.
 */
export const SCAN_PATTERNS = {
  credential:
    /process\.env|~\/\.ssh|AWS_|[A-Z]_TOKEN|[A-Z]_SECRET|API_KEY|\.env\b|localStorage|document\.cookie/g,
  override:
    /ignore (all |the )?previous|disregard|do not tell the user|don.t tell the user|without telling/gi,
  secret:
    /sk-[A-Za-z0-9]{12,}|AKIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{20,}|xox[bap]-|BEGIN [A-Z ]{0,40}PRIVATE KEY/g,
  // Claude Code RUNS `!` + backtick at a line's start or after a space, and a ```! block,
  // before the model sees the skill. After any other character it does not: KEY=!`x` is text.
  command: /(?:^|\s)!`|^\s*(?:```|~~~)\s*!/g,
}

/**
 * Characters a model reads and a person does not see: Unicode's default-ignorable set (zero-
 * width spaces and joiners, bidirectional overrides, variation selectors, and the U+E0000 "tag"
 * letters, which can spell a whole instruction invisibly), control and private-use characters,
 * the line and paragraph separators and the blank braille cell. Tab is ordinary and U+FE0F only
 * asks for an emoji's colour form, so both are left out. Measured 2026-10-03: the vendored
 * skills hold four, all U+200B, in improve-animations/PLAN-TEMPLATE.md.
 */
const HIDDEN = /(?!\t|\uFE0F)[\p{Default_Ignorable_Code_Point}\p{Cc}\p{Co}\p{Zl}\p{Zp}\u2800]/u
const HIDDEN_ALL = new RegExp(HIDDEN.source, 'gu')
const hex = (ch) => `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`

const NAME_CELL = /^`([^`\s]+)`$/
const SOURCE_CELL = /^`([^`\s/]+\/[^`\s/]+)`\s*@\s*`([0-9a-f]{7,40})`$/
const SHA_IN_CELL = /@\s*`([0-9a-f]{7,40})`/
const PLAIN_LICENCE = /^[A-Za-z0-9][A-Za-z0-9.+-]*$/
const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const REPO_NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/
const FULL_SHA = /^[0-9a-f]{40}$/

const decoder = new TextDecoder()
const strictUtf8 = new TextDecoder('utf-8', { fatal: true })
const toText = (content) => (typeof content === 'string' ? content : decoder.decode(content))

/**
 * A value from outside (a file name, a line, an error) made safe to print on one line: a line
 * break becomes a space, and a character that shows as nothing is shown by its code point, so
 * the report cannot hide from its reader what the scan saw.
 */
function tidy(value, max = 160) {
  const text = [...String(value)]
    .map((ch) => (ch < ' ' ? ' ' : HIDDEN.test(ch) ? `<${hex(ch)}>` : ch))
    .join('')
    .trim()
  const chars = [...text]
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text
}

/** `tidy`, in a Markdown code span that cannot break out of a table cell. */
const code = (value, max = 160) =>
  `\`${tidy(value, max).split('`').join("'").split('|').join('/')}\``

/**
 * An error's message with its cause. Node's fetch reports a DNS failure as just "fetch failed"
 * (measured 2026-10-03) and keeps the reason, here ENOTFOUND, in `error.cause`.
 *
 * @param {unknown} error
 */
function describeError(error) {
  if (!(error instanceof Error)) return tidy(error, 300)
  const cause = error.cause instanceof Error ? error.cause.message : error.cause
  const detail = cause ? String(cause) : ''
  return tidy(
    detail && !error.message.includes(detail) ? `${error.message}: ${detail}` : error.message,
    300,
  )
}

/**
 * A file's text, or null when there is no such file. One read, not "does it exist? then read
 * it": the file can change between the two, and GitHub's code scan (js/file-system-race)
 * flagged that shape in scripts/lighthouse-robot.mjs on 2026-10-01.
 *
 * @param {string} file
 * @returns {string | null}
 */
function readIfPresent(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

// ── Hashing ───────────────────────────────────────────────────────────────────

/**
 * git's own blob id: SHA-1 of "blob <bytes>\0" and the content, which is what GitHub's tree
 * API reports. It identifies content here and protects nothing, so SHA-1 is the right tool.
 *
 * @param {Uint8Array | string} content
 */
export function gitBlobSha(content) {
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : content
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex')
}

/**
 * Every regular file under a folder, keyed by its '/'-separated path. Folders named .git and
 * node_modules are skipped and symbolic links are ignored, as in vercel-labs/skills'
 * `computeSkillFolderHash`, so the hash below can be reproduced.
 *
 * @param {string} dir
 * @returns {Map<string, Buffer>}
 */
export function readFolder(dir) {
  const files = new Map()
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '.git' && entry.name !== 'node_modules') walk(full)
      } else if (entry.isFile()) {
        files.set(relative(dir, full).split(sep).join('/'), readFileSync(full))
      }
    }
  }
  walk(dir)
  return files
}

/**
 * skills-lock.json's `computedHash`: SHA-256 over each file's path then its content, files
 * sorted by path. The sort is pinned to en-US: the upstream tool uses the machine's default
 * locale, which is en-US on this Mac (measured 2026-10-03; CI's was not checked), and another
 * collation orders `SKILL.md` against a `references/` folder differently and so changes the hash.
 * Reproduces the lock's value for all eight skills under .agents/skills/ (checked 2026-10-03).
 *
 * @param {Map<string, Uint8Array>} files
 */
export function hashFiles(files) {
  const hash = createHash('sha256')
  const sorted = [...files].sort(([a], [b]) => a.localeCompare(b, 'en-US'))
  for (const [relativePath, content] of sorted) {
    hash.update(relativePath)
    hash.update(content)
  }
  return hash.digest('hex')
}

/** @param {string} dir */
export const folderHash = (dir) => hashFiles(readFolder(dir))

// ── The two records ───────────────────────────────────────────────────────────

function parseRow(line, index) {
  const text = line.trim()
  if (!text.startsWith('|') || !text.endsWith('|')) return null
  const cells = text
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim())
  const name = NAME_CELL.exec(cells[0] ?? '')
  const source = SOURCE_CELL.exec(cells[1] ?? '')
  const licence = cells[2]
  // "unstated" rows are gitignored and absent from git: there is nothing here to refresh.
  if (!name?.[1] || !source?.[1] || !source[2] || licence === undefined) return null
  if (/unstated/i.test(licence)) return null
  return { name: name[1], repo: source[1], sha: source[2], licence, line: index }
}

/**
 * The README table's rows: | `seo-audit` | `owner/repo` @ `dda3841f0b29` | MIT |
 * Rows whose licence cell says "unstated" are left out.
 *
 * @param {string} text
 * @returns {ReadmeRow[]}
 */
export function parseReadmeRows(text) {
  return text.split('\n').flatMap((line, index) => parseRow(line, index) ?? [])
}

/**
 * The README with ONE row's commit cell replaced and every other byte as it was. Done by
 * position, not by building a pattern from the skill's name.
 *
 * @param {string} text
 * @param {string} name
 * @param {string} newSha
 */
export function updateReadmeSha(text, name, newSha) {
  if (!/^[0-9a-f]{7,40}$/.test(newSha)) throw new Error(`not a commit id: ${tidy(newSha)}`)
  const lines = text.split('\n')
  const hits = lines.flatMap((line, index) => (parseRow(line, index)?.name === name ? index : []))
  if (hits.length !== 1) {
    throw new Error(
      `.claude/skills/README.md has ${hits.length} rows for ${code(name)}; expected 1`,
    )
  }
  const at = hits[0] ?? 0
  const line = lines[at] ?? ''
  const found = SHA_IN_CELL.exec(line)
  const old = found?.[1]
  if (!found || !old) throw new Error(`no commit cell in the README row for ${code(name)}`)
  const start = found.index + found[0].indexOf('`') + 1
  lines[at] = line.slice(0, start) + newSha + line.slice(start + old.length)
  return lines.join('\n')
}

/**
 * @param {string} text
 * @returns {Lock}
 */
export function parseLock(text) {
  const lock = JSON.parse(text)
  if (lock?.version !== 1 || typeof lock.skills !== 'object' || lock.skills === null) {
    throw new Error('skills-lock.json is not {"version":1,"skills":{…}}; refusing to edit it')
  }
  return lock
}

/**
 * The upstream installer's own format: skills sorted by name, two-space JSON, one final newline.
 *
 * @param {Lock} lock
 */
export function serializeLock(lock) {
  // fromEntries defines own properties, so a key such as "__proto__" cannot reach the prototype.
  const skills = Object.fromEntries(
    Object.keys(lock.skills)
      .sort()
      .map((name) => [name, lock.skills[name]]),
  )
  return `${JSON.stringify({ ...lock, skills }, null, 2)}\n`
}

/**
 * A path that stays inside its folder and cannot name a .git entry.
 *
 * @param {string} path
 */
export function isSafeRelativePath(path) {
  if (typeof path !== 'string' || path === '') return false
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false
  return path
    .split('/')
    .every((part) => part !== '' && part !== '.' && part !== '..' && part.toLowerCase() !== '.git')
}

/**
 * One record per skill, from the README rows and the lock together. The repository and the
 * upstream folder come from the lock when it has the skill (its `skillPath` is the only place
 * that says vercel-react-best-practices lives in skills/react-best-practices), otherwise from
 * the README row and `skills/<name>`.
 *
 * @param {ReadmeRow[]} readmeRows
 * @param {Lock | null} lock
 * @returns {SkillRecord[]}
 */
export function collectSkills(readmeRows, lock) {
  const byName = new Map()
  const slot = (name) => {
    if (!byName.has(name)) byName.set(name, { name })
    return byName.get(name)
  }
  for (const row of readmeRows) {
    const entry = slot(row.name)
    if (entry.readme) throw new Error(`.claude/skills/README.md lists ${code(row.name)} twice`)
    entry.readme = row
  }
  for (const [name, item] of Object.entries(lock?.skills ?? {})) slot(name).lock = item
  return [...byName.values()]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(({ name, readme, lock: entry }) => {
      const problems = []
      const repo = String(entry?.source ?? readme?.repo ?? '')
      const folder =
        typeof entry?.skillPath === 'string' ? posix.dirname(entry.skillPath) : `skills/${name}`
      if (!SKILL_NAME.test(name) || name.includes('..'))
        problems.push(`unsafe skill name ${code(name)}`)
      if (!REPO_NAME.test(repo)) problems.push(`not an owner/repo name: ${code(repo)}`)
      if (entry && entry.sourceType !== 'github') {
        problems.push(
          `skills-lock.json source type is ${code(entry.sourceType)}; only github is supported`,
        )
      }
      if (entry && readme && repo.toLowerCase() !== readme.repo.toLowerCase()) {
        problems.push(`README names ${code(readme.repo)} but skills-lock.json names ${code(repo)}`)
      }
      if (folder === '.' || !isSafeRelativePath(folder)) {
        problems.push(`skill folder ${code(folder)} is the repository root or not a safe path`)
      }
      return { name, repo, folder, readme, lock: entry, problems }
    })
}

/**
 * Where a skill's real files are: .claude/skills/<name> (a folder, or a link into
 * .agents/skills/), else .agents/skills/<name>. Writing goes to the real folder, so a link
 * stays a link.
 *
 * @param {string} root
 * @param {string} name
 * @returns {{ dir: string, problem?: undefined } | { dir: null, problem: string }}
 */
export function resolveSkillDir(root, name) {
  const realRoot = realpathSync(root)
  for (const base of ['.claude/skills', '.agents/skills']) {
    // One call, not "does it exist? then resolve it" (js/file-system-race, as readIfPresent).
    // A missing folder and a link to nothing are both ENOENT.
    let real
    try {
      real = realpathSync(join(realRoot, base, name))
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') continue
      throw error
    }
    const where = relative(realRoot, real)
    if (where.split(sep)[0] === '..' || isAbsolute(where)) {
      return { dir: null, problem: `${code(`${base}/${name}`)} points outside the repository` }
    }
    return { dir: real }
  }
  return { dir: null, problem: `local folder not found in .claude/skills/ or .agents/skills/` }
}

// ── The safety scan ───────────────────────────────────────────────────────────

/**
 * A line as the patterns read it: compatibility forms folded (ｄｉｓｒｅｇａｒｄ is disregard) and
 * hidden characters removed (ignore<U+200B> previous is ignore previous).
 *
 * @param {string} line
 */
const visible = (line) => line.normalize('NFKC').replace(HIDDEN_ALL, '')

/**
 * SKILL.md header fields that only DESCRIBE a skill. Measured 2026-10-03: the vendored skills
 * use name, description, metadata, license and disable-model-invocation. Every other field may
 * change what Claude Code DOES (allowed-tools grants tools, hooks and shell run commands,
 * disable-model-invocation decides when the skill loads), and YAML can spell a key in ways no
 * line pattern sees ("allowed\x2Dtools", `? hooks`, a whole header indented). So the check
 * fails closed: a header line is plain only when it sits, written plainly, under one of these
 * fields (commit review, 2026-10-03, which bypassed a list of the dangerous ones).
 */
const PLAIN_FIELDS = new Set([
  'name',
  'description',
  'license',
  'metadata',
  'compatibility',
  'argument-hint',
  'when_to_use',
])
const PLAIN_FIELD_LINE = /^([a-z][a-z0-9_-]*):(?:\s|$)/
/** Where Claude Code's header ends: `---` at the very start of a line. An indented one does not. */
const HEADER_END = /^---[ \t]*$/

/**
 * The indexes of SKILL.md's header lines that are not plain: any line outside a PLAIN_FIELDS
 * field, including the indented lines of such a field's value.
 *
 * @param {string[]} lines
 * @returns {Set<number>}
 */
function permissionLines(lines) {
  const found = new Set()
  if (lines[0]?.trim() !== '---') return found
  // Fail closed: before a plain field starts, an indented line could begin a whole indented
  // header, which YAML reads as top-level fields.
  let plain = false
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index] ?? ''
    if (HEADER_END.test(line)) break
    if (line.trim() === '' || line.startsWith('#')) continue
    if (!/^\s/.test(line)) {
      const field = PLAIN_FIELD_LINE.exec(line)?.[1]
      plain = field !== undefined && PLAIN_FIELDS.has(field)
    }
    if (!plain) found.add(index)
  }
  return found
}

/** Most severe first: the order a blocked skill's reasons are listed in. */
const CHECKS = ['command', 'permission', 'hidden', 'override', 'credential', 'secret']

/**
 * For each check, the [index, text] of every line of one file that it flags. Only the skill's
 * own top-level SKILL.md has a header that Claude Code reads.
 *
 * @param {string} text
 * @param {string} file the path inside the skill folder
 * @returns {Record<string, [number, string][]>}
 */
function flagLines(text, file) {
  const lines = text.split(/\r?\n/)
  const header = file === 'SKILL.md' ? permissionLines(lines) : new Set()
  /** @type {Record<string, [number, string][]>} */
  const flagged = Object.fromEntries(CHECKS.map((check) => [check, []]))
  // Every line of a ```! block runs, not only its first (commit review, 2026-10-03). The block
  // ends only at a CommonMark closing fence, so a line such as ```js inside it does not end it.
  let fence = ''
  lines.forEach((line, index) => {
    const view = visible(line)
    const inBlock = fence !== ''
    const opener = /^\s*(`{3,}|~{3,})\s*!/.exec(view)
    const closer = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(view)?.[1]
    if (inBlock && closer?.[0] === fence[0] && closer.length >= fence.length) fence = ''
    else if (!inBlock && opener) fence = opener[1] ?? ''
    /** @type {Record<string, boolean>} */
    const hits = {
      command: inBlock || opener !== null || view.search(SCAN_PATTERNS.command) >= 0,
      permission: header.has(index),
      hidden: HIDDEN.test(line),
      override: view.search(SCAN_PATTERNS.override) >= 0,
      credential: view.search(SCAN_PATTERNS.credential) >= 0,
      secret: view.search(SCAN_PATTERNS.secret) >= 0,
    }
    for (const check of CHECKS) if (hits[check]) flagged[check]?.push([index, line])
  })
  return flagged
}

/**
 * The entries of `now` that no equal line in `before` pays for: lines compared as a multiset.
 *
 * @param {[number, string][]} before
 * @param {[number, string][]} now
 */
function beyond(before, now) {
  const budget = new Map()
  for (const [, line] of before) budget.set(line, (budget.get(line) ?? 0) + 1)
  return now.filter(([, line]) => {
    const left = budget.get(line) ?? 0
    if (left > 0) budget.set(line, left - 1)
    return left === 0
  })
}

/**
 * Every line a check flags in the new version of a file that the old version did not have. A
 * file the old version did not have starts from nothing. The header says why lines are
 * compared as a multiset rather than counted.
 *
 * @param {Map<string, Uint8Array | string>} oldFiles
 * @param {Map<string, Uint8Array | string>} newFiles
 * @returns {{ file: string, pattern: string, lines: { number: number, text: string }[] }[]}
 */
export function findNewFindings(oldFiles, newFiles) {
  const findings = []
  for (const [file, content] of newFiles) {
    const before = oldFiles.get(file)
    if (before === content) continue
    const old = flagLines(before === undefined ? '' : toText(before), file)
    const now = flagLines(toText(content), file)
    for (const pattern of CHECKS) {
      const lines = beyond(old[pattern] ?? [], now[pattern] ?? [])
      if (lines.length > 0) {
        findings.push({
          file,
          pattern,
          lines: lines.map(([index, text]) => ({ number: index + 1, text })),
        })
      }
    }
  }
  return findings
}

/** "line 4", or "lines 4, 9, 12 and 3 more". */
function lineNumbers(lines) {
  const numbers = lines.map((line) => line.number)
  const more = numbers.length > 8 ? ` and ${numbers.length - 8} more` : ''
  return `${numbers.length === 1 ? 'line' : 'lines'} ${numbers.slice(0, 8).join(', ')}${more}`
}

/** The hidden characters on some lines, counted: "U+200B ×2, U+E0041 ×43". */
function hiddenList(lines) {
  const tally = new Map()
  for (const { text } of lines) {
    for (const [ch] of text.matchAll(HIDDEN_ALL)) tally.set(hex(ch), (tally.get(hex(ch)) ?? 0) + 1)
  }
  const all = [...tally].map(([name, times]) => (times === 1 ? name : `${name} ×${times}`))
  return all.length > 6
    ? `${all.slice(0, 6).join(', ')} and ${all.length - 6} more`
    : all.join(', ')
}

/**
 * A blocked skill's reason, quoting each new line so the person deciding reads what the scan
 * read. A line shaped like a key is never repeated: the summary becomes a public PR body.
 *
 * @param {{ file: string, pattern: string, lines: { number: number, text: string }[] }} finding
 */
export function describeFinding({ file, pattern, lines }) {
  const where = `${code(file)}, ${lineNumbers(lines)}`
  if (pattern === 'hidden') return `new hidden characters in ${where}: ${hiddenList(lines)}`
  if (pattern === 'secret')
    return `new secret pattern in ${where} (not shown: it may be a real key)`
  const quoted = lines
    .slice(0, 3)
    .map(({ text }) =>
      visible(text).search(SCAN_PATTERNS.secret) >= 0
        ? '(not shown: shaped like a key)'
        : code(text, 100),
    )
  return `new ${pattern} pattern in ${where}: ${quoted.join(' and ')}${lines.length > 3 ? ' …' : ''}`
}

/**
 * Why some downloaded bytes are not plain text, or null when they are.
 *
 * @param {Uint8Array} bytes
 */
function plainTextProblem(bytes) {
  if (bytes.includes(0)) return 'NUL byte'
  try {
    strictUtf8.decode(bytes)
  } catch {
    return 'not valid UTF-8'
  }
  return null
}

/**
 * The licence a skill declares in its own SKILL.md header (`license: MIT`), or null.
 *
 * @param {string} text
 */
export function declaredLicence(text) {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return null
  for (const line of lines.slice(1)) {
    if (line.trim() === '---') return null
    if (!line.startsWith('license:')) continue
    const value = line.slice('license:'.length).trim()
    const first = value[0]
    const quoted = value.length >= 2 && (first === '"' || first === "'") && value.at(-1) === first
    return (quoted ? value.slice(1, -1).trim() : value) || null
  }
  return null
}

/**
 * @param {string | null | undefined} spdx the licence id found; null when there is none
 * @param {string | undefined} readmeLicence the README row's licence cell
 * @param {string} source who reports `spdx`, as the reason says it
 * @returns {string[]}
 */
export function licenceProblems(spdx, readmeLicence, source = 'upstream reports') {
  if (!spdx || !ALLOWED_LICENCES.includes(spdx)) {
    const found = spdx ? `"${tidy(spdx, 40)}"` : 'no licence'
    return [`licence changed: ${source} ${found} (allowed: ${ALLOWED_LICENCES.join(', ')})`]
  }
  if (readmeLicence && PLAIN_LICENCE.test(readmeLicence) && readmeLicence !== spdx) {
    return [`licence changed: README says "${tidy(readmeLicence, 40)}", ${source} "${spdx}"`]
  }
  return []
}

// ── GitHub ────────────────────────────────────────────────────────────────────

/**
 * Four read-only calls: three lookups, each answered once per repository, and a file download.
 * The token goes to api.github.com and nowhere else; an error names the status and the path,
 * never a header.
 *
 * @param {{ fetch?: FetchLike, token?: string }} options
 */
export function createGithub({ fetch: fetchFn = globalThis.fetch, token } = {}) {
  const cache = new Map()
  const once = (key, make) => {
    if (!cache.has(key)) cache.set(key, make())
    return cache.get(key)
  }

  async function get(url) {
    const headers = { 'User-Agent': USER_AGENT }
    if (url.startsWith(`${API}/`)) {
      headers.Accept = 'application/vnd.github+json'
      headers['X-GitHub-Api-Version'] = API_VERSION
      if (token) headers.Authorization = `Bearer ${token}`
    }
    const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (res.ok) return res
    const limited = res.status === 403 || res.status === 429
    const hint =
      limited && res.headers.get('x-ratelimit-remaining') === '0'
        ? ' (GitHub rate limit used up; set GITHUB_TOKEN to raise it)'
        : ''
    throw new Error(`GitHub answered ${res.status} for ${tidy(new URL(url).pathname)}${hint}`)
  }

  const json = async (path) => (await get(`${API}${path}`)).json()

  return {
    /** @param {string} name an owner/repo name, possibly one that has since been renamed */
    repo: (name) =>
      once(`repo:${name.toLowerCase()}`, async () => {
        const body = await json(`/repos/${name}`)
        if (typeof body?.full_name !== 'string' || typeof body.default_branch !== 'string') {
          throw new Error(`unexpected answer from GitHub for /repos/${tidy(name)}`)
        }
        const spdx = typeof body.license?.spdx_id === 'string' ? body.license.spdx_id : null
        return { fullName: body.full_name, defaultBranch: body.default_branch, spdx }
      }),

    /**
     * The default branch's head commit. `per_page=1` cuts the commit's `files` list to one
     * entry (measured 2026-10-03: 1 file in each of 9 answers of 4-76 KB, one commit with 1,049
     * changed lines), so a big upstream commit does not come down in full.
     */
    head: (fullName, branch) =>
      once(`head:${fullName.toLowerCase()}`, async () => {
        const ref = branch.split('/').map(encodeURIComponent).join('/')
        const body = await json(`/repos/${fullName}/commits/${ref}?per_page=1`)
        if (typeof body?.sha !== 'string' || !FULL_SHA.test(body.sha)) {
          throw new Error(`unexpected commit answer from GitHub for ${tidy(fullName)}`)
        }
        return body.sha
      }),

    /** Every entry of the repository at a commit. Refuses a truncated list. */
    tree: (fullName, sha) =>
      once(`tree:${fullName.toLowerCase()}@${sha}`, async () => {
        const body = await json(`/repos/${fullName}/git/trees/${sha}?recursive=1`)
        if (body?.truncated) {
          throw new Error(
            `GitHub cut ${tidy(fullName)}'s file list short (over 100,000 entries or 7 MB); ` +
              'refusing to compare against part of a repository',
          )
        }
        if (!Array.isArray(body?.tree)) {
          throw new Error(`unexpected tree answer from GitHub for ${tidy(fullName)}`)
        }
        return body.tree
      }),

    /** One file's bytes at a commit, from the raw host. */
    file: async (fullName, sha, path) => {
      const encoded = path.split('/').map(encodeURIComponent).join('/')
      const res = await get(`${RAW}/${fullName}/${sha}/${encoded}`)
      return Buffer.from(await res.arrayBuffer())
    },
  }
}

async function mapLimit(items, limit, fn) {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const item = items[next]
      next += 1
      await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

// ── One skill ─────────────────────────────────────────────────────────────────

/**
 * @param {SkillRecord} record
 * @param {{
 *   root: string, github: ReturnType<typeof createGithub>, accept: Map<string, string>,
 * }} context
 * @returns {Promise<SkillResult>}
 */
async function planSkill(record, { root, github, accept }) {
  /** @type {SkillResult} */
  const result = {
    name: record.name,
    repo: record.repo,
    upstream: null,
    status: 'unchanged',
    oldSha: record.readme?.sha ?? null,
    newSha: null,
    added: [],
    changed: [],
    removed: [],
    reasons: [],
    accepted: [],
    acceptable: false,
    hasReadmeRow: Boolean(record.readme),
    hasLockEntry: Boolean(record.lock),
  }
  /** @param {string[]} reasons */
  const block = (reasons) => ({ ...result, status: 'blocked', reasons })

  if (record.problems.length > 0) return block(record.problems)
  const local = resolveSkillDir(root, record.name)
  if (local.dir === null) return block([local.problem])

  const info = await github.repo(record.repo)
  result.upstream = info.fullName
  // GitHub answers a RENAMED repository under its new name (emilkowalski/skill is now
  // emilkowalski/skills) and a TRANSFERRED one under its new owner. A rename is followed; a
  // transfer would copy a stranger's instructions in under the old name (commit review,
  // 2026-10-03), so a person looks first.
  const owner = (name) => name.split('/')[0]?.toLowerCase()
  if (owner(info.fullName) !== owner(record.repo)) {
    return block([
      `upstream moved to another owner: ${code(record.repo)} now answers as ${code(info.fullName)}`,
    ])
  }
  const head = await github.head(info.fullName, info.defaultBranch)
  result.newSha = head.slice(0, 12)
  const entries = await github.tree(info.fullName, head)

  const prefix = `${record.folder}/`
  const upstream = new Map()
  for (const entry of entries) {
    if (typeof entry?.path === 'string' && entry.path.startsWith(prefix) && entry.type !== 'tree') {
      upstream.set(entry.path.slice(prefix.length), entry)
    }
  }
  if (upstream.size === 0) {
    return block([
      `upstream folder moved: nothing under ${code(record.folder)} at ${result.newSha}`,
    ])
  }

  const localFiles = readFolder(local.dir)
  const localShas = new Map([...localFiles].map(([rel, bytes]) => [rel, gitBlobSha(bytes)]))
  const unchanged =
    localShas.size === upstream.size &&
    [...upstream].every(([rel, entry]) => localShas.get(rel) === entry.sha)
  if (unchanged) return result

  result.added = [...upstream.keys()].filter((rel) => !localFiles.has(rel)).sort()
  result.removed = [...localFiles.keys()].filter((rel) => !upstream.has(rel)).sort()
  result.changed = [...upstream.keys()]
    .filter((rel) => localFiles.has(rel) && localShas.get(rel) !== upstream.get(rel).sha)
    .sort()

  // What can be judged from the file list alone, before a single byte is downloaded.
  const reasons = []
  for (const [rel, entry] of upstream) {
    if (entry.type === 'commit') reasons.push(`submodule in the upstream folder: ${code(rel)}`)
    else if (entry.mode === '120000')
      reasons.push(`symbolic link in the upstream folder: ${code(rel)}`)
    else if (entry.type !== 'blob')
      reasons.push(`unexpected entry type ${code(entry.type)}: ${code(rel)}`)
    else if (!isSafeRelativePath(rel)) reasons.push(`unsafe file path: ${code(rel)}`)
    else if (!PLAIN_PATH.test(rel))
      reasons.push(`a file name with characters other than A-Z a-z 0-9 . _ - /: ${code(rel)}`)
    else if (rel.split('/').some((part) => part.toLowerCase() === '.claude'))
      reasons.push(`a nested .claude folder (Claude Code loads skills from one): ${code(rel)}`)
  }
  // A Mac's disk treats SKILL.md and skill.md as one file: such a pair would overwrite each
  // other, and a rename that changes only capitals would delete the file it had just written.
  const byFoldedName = new Map()
  for (const rel of [...upstream.keys(), ...result.removed]) {
    const other = byFoldedName.get(rel.toLowerCase())
    if (other === undefined) byFoldedName.set(rel.toLowerCase(), rel)
    else reasons.push(`two names that differ only in capitals: ${code(other)} and ${code(rel)}`)
  }
  // Edited as well as added: a helper script already in a skill could otherwise be rewritten
  // into anything (commit review, 2026-10-03).
  for (const rel of [...result.added, ...result.changed]) {
    if (!TEXT_FILE.test(rel))
      reasons.push(`non-text file: ${code(rel)} (only .md and .json come in, new or edited)`)
  }
  for (const rel of [...result.added, ...result.changed]) {
    const size = upstream.get(rel).size
    if (typeof size === 'number' && size > MAX_FILE_BYTES) {
      reasons.push(`file over ${MAX_FILE_BYTES} bytes: ${code(rel)} (${size})`)
    }
  }
  // A repository with no licence file is judged after the download, by its new SKILL.md.
  if (info.spdx !== null) reasons.push(...licenceProblems(info.spdx, record.readme?.licence))
  if (reasons.length > 0) return block(reasons)

  const wanted = [...result.added, ...result.changed]
  const fetched = new Map()
  await mapLimit(wanted, DOWNLOAD_CONCURRENCY, async (rel) => {
    fetched.set(rel, await github.file(info.fullName, head, `${record.folder}/${rel}`))
  })
  const mismatched = wanted.filter((rel) => gitBlobSha(fetched.get(rel)) !== upstream.get(rel).sha)
  if (mismatched.length > 0) {
    return block([
      `downloaded bytes do not match GitHub's file list: ${mismatched.map(code).join(', ')}`,
    ])
  }

  const newFiles = new Map()
  for (const rel of upstream.keys()) newFiles.set(rel, fetched.get(rel) ?? localFiles.get(rel))
  for (const rel of wanted) {
    const problem = plainTextProblem(fetched.get(rel))
    if (problem) reasons.push(`not plain text (${problem}): ${code(rel)}`)
  }
  if (info.spdx === null) {
    // The README's rule for the vercel rows: no licence file, so SKILL.md's own `license:`.
    const skill = newFiles.get('SKILL.md')
    reasons.push(
      ...licenceProblems(
        skill === undefined ? null : declaredLicence(toText(skill)),
        record.readme?.licence,
        'the repository has no licence file and SKILL.md declares',
      ),
    )
  }
  if (reasons.length > 0) return block(reasons)

  // Flagged lines are the one thing a person may waive (--accept), and only at the upstream
  // commit they read: a push after the reading could add lines nobody saw (commit review,
  // 2026-10-03), so an accept that names another commit waives nothing.
  const flagged = findNewFindings(localFiles, newFiles)
  const findings = flagged.map(describeFinding)
  const reviewed = accept.get(record.name)
  if (findings.length > 0 && !(reviewed && head.startsWith(reviewed))) {
    const moved = reviewed
      ? [
          `--accept named ${code(reviewed)}, but upstream is now at ${code(result.newSha)}: read what changed since, then accept that commit`,
        ]
      : []
    return { ...block([...moved, ...findings]), acceptable: true, flagged }
  }
  return {
    ...result,
    status: 'updated',
    accepted: findings,
    flagged,
    plan: { dir: local.dir, writes: fetched, deletes: result.removed },
  }
}

// ── Writing ───────────────────────────────────────────────────────────────────

function insideDir(dir, rel) {
  const dest = resolve(dir, ...rel.split('/'))
  const where = relative(dir, dest)
  if (where === '' || where.split(sep)[0] === '..' || isAbsolute(where)) {
    throw new Error(`refusing to write outside ${dir}: ${tidy(rel)}`)
  }
  return dest
}

function pruneEmptyDirs(stop, start) {
  let current = start
  while (current !== stop && current.startsWith(stop) && readdirSync(current).length === 0) {
    rmdirSync(current)
    current = dirname(current)
  }
}

/**
 * @param {string} root
 * @param {SkillResult[]} updated
 */
function applyUpdates(root, updated) {
  for (const skill of updated) {
    const { dir, writes, deletes } = skill.plan ?? { dir: '', writes: new Map(), deletes: [] }
    for (const [rel, content] of writes) {
      const dest = insideDir(dir, rel)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, content)
    }
    for (const rel of deletes) {
      const dest = insideDir(dir, rel)
      rmSync(dest, { force: true })
      pruneEmptyDirs(dir, dirname(dest))
    }
  }

  const readmePath = join(root, '.claude', 'skills', 'README.md')
  const lockPath = join(root, 'skills-lock.json')
  const readmeBefore = readFileSync(readmePath, 'utf8')
  const lockBefore = readIfPresent(lockPath)
  const lock = lockBefore === null ? null : parseLock(lockBefore)
  let readme = readmeBefore
  for (const skill of updated) {
    if (skill.hasReadmeRow && skill.newSha)
      readme = updateReadmeSha(readme, skill.name, skill.newSha)
    // Own properties only: a skill named "constructor" must not find Object's.
    const entry = lock && Object.hasOwn(lock.skills, skill.name) ? lock.skills[skill.name] : null
    if (entry && skill.plan) entry.computedHash = folderHash(skill.plan.dir)
  }
  if (readme !== readmeBefore) writeFileSync(readmePath, readme)
  if (lock && lockBefore !== null && serializeLock(lock) !== lockBefore) {
    writeFileSync(lockPath, serializeLock(lock))
  }
}

// ── The run ───────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   root: string, fetch?: FetchLike, write?: boolean, only?: string[], accept?: string[],
 *   token?: string,
 * }} options
 * @returns {Promise<RefreshResult>}
 */
export async function refresh({
  root,
  fetch: fetchFn = globalThis.fetch,
  write = false,
  only = [],
  accept = [],
  token,
}) {
  const realRoot = realpathSync(root)
  const rows = parseReadmeRows(
    readFileSync(join(realRoot, '.claude', 'skills', 'README.md'), 'utf8'),
  )
  const lockText = readIfPresent(join(realRoot, 'skills-lock.json'))
  const lock = lockText === null ? null : parseLock(lockText)
  const records = collectSkills(rows, lock)

  const wanted = new Set(only)
  /** @type {Map<string, string>} each accepted skill, and the upstream commit that was read */
  const accepted = new Map()
  for (const entry of accept) {
    const pinned = /^([^@\s]+)@([0-9a-f]{7,40})$/.exec(entry)
    if (!pinned?.[1] || !pinned[2]) {
      throw new Error(
        `--accept needs the upstream commit that was read, as <name>@<commit> from the report: ${tidy(entry)}`,
      )
    }
    accepted.set(pinned[1], pinned[2])
  }
  const unknown = [...new Set([...wanted, ...accepted.keys()])].filter(
    (name) => !records.some((record) => record.name === name),
  )
  if (unknown.length > 0) {
    throw new Error(
      `not a vendored skill this script can refresh (unknown, or local-only): ${unknown.map((name) => tidy(name)).join(', ')}`,
    )
  }
  const leftOut = [...accepted.keys()].filter((name) => wanted.size > 0 && !wanted.has(name))
  if (leftOut.length > 0) {
    throw new Error(
      `--accept names a skill that --only leaves out: ${leftOut.map((name) => tidy(name)).join(', ')}`,
    )
  }

  const github = createGithub({ fetch: fetchFn, token })
  /** @type {SkillResult[]} */
  const results = []
  for (const record of records.filter((r) => wanted.size === 0 || wanted.has(r.name))) {
    try {
      results.push(await planSkill(record, { root: realRoot, github, accept: accepted }))
    } catch (error) {
      results.push({
        name: record.name,
        repo: record.repo,
        upstream: null,
        status: 'error',
        oldSha: record.readme?.sha ?? null,
        newSha: null,
        added: [],
        changed: [],
        removed: [],
        reasons: [],
        accepted: [],
        acceptable: false,
        message: describeError(error),
        hasReadmeRow: Boolean(record.readme),
        hasLockEntry: Boolean(record.lock),
      })
    }
  }

  const by = (status) => results.filter((r) => r.status === status)
  const updated = by('updated')
  const errors = by('error')
  const wrote = write && errors.length === 0
  if (wrote && updated.length > 0) applyUpdates(realRoot, updated)
  return {
    results,
    updated,
    blocked: by('blocked'),
    unchanged: by('unchanged'),
    errors,
    requestedWrite: write,
    wrote,
  }
}

// ── What a person reads ───────────────────────────────────────────────────────

/** The name GitHub now gives a renamed repository, or null when it still has the old one. */
const movedTo = (r) =>
  r.upstream && r.upstream.toLowerCase() !== r.repo.toLowerCase() ? r.upstream : null

/** GitHub refuses a pull-request body over 65,536 characters, which would fail the workflow. */
const MAX_SUMMARY_CHARS = 60_000
const MAX_REPORT_LINES = 200

/**
 * Every flagged line of a blocked skill, for the person deciding whether to --accept it: a
 * reason quotes three, and an accept waives all of them (commit review, 2026-10-03). A list
 * too long to read is cut and says so, rather than inviting an accept nobody could check.
 *
 * @param {SkillResult} r
 */
function everyFlaggedLine(r) {
  const all = (r.flagged ?? []).flatMap(({ file, pattern, lines }) =>
    lines.map(({ number, text }) => {
      const shown =
        visible(text).search(SCAN_PATTERNS.secret) >= 0
          ? '(not shown: shaped like a key)'
          : tidy(text, 200)
      return `        ${pattern.padEnd(10)}  ${tidy(`${file}:${number}`)}  ${shown}`
    }),
  )
  if (all.length <= MAX_REPORT_LINES) return all
  return [
    ...all.slice(0, MAX_REPORT_LINES),
    `        … and ${all.length - MAX_REPORT_LINES} more: too many to judge here; read the upstream change instead`,
  ]
}

const describeFiles = ({ changed, added, removed }) =>
  [
    changed.length > 0 ? `${changed.length} edited` : '',
    added.length > 0 ? `${added.length} added` : '',
    removed.length > 0 ? `${removed.length} removed` : '',
  ]
    .filter(Boolean)
    .join(', ')

function fileList({ changed, added, removed }) {
  const all = [
    ...changed.map((file) => `~ ${tidy(file)}`),
    ...added.map((file) => `+ ${tidy(file)}`),
    ...removed.map((file) => `- ${tidy(file)}`),
  ]
  return all.length > 6
    ? `${all.slice(0, 6).join(', ')} and ${all.length - 6} more`
    : all.join(', ')
}

/**
 * The plain-text report for the terminal.
 *
 * @param {RefreshResult} result
 */
export function renderReport(result) {
  const { updated, blocked, unchanged, errors, requestedWrite, wrote } = result
  const lines = [
    !wrote
      ? 'Vendored skills refresh: dry run (nothing was written; add --write to apply)'
      : updated.length > 0
        ? 'Vendored skills refresh: WRITE (files, README commits and skills-lock.json were updated)'
        : 'Vendored skills refresh: WRITE (nothing needed updating)',
  ]
  if (requestedWrite && !wrote) {
    lines.push(
      '--write was given but NOTHING was written, because some skills could not be checked.',
    )
  }
  const width = Math.max(0, ...result.results.map((r) => r.name.length))
  const label = (r) => {
    const moved = movedTo(r)
    return `${r.name.padEnd(width)}  ${r.repo}${moved ? ` (now ${moved})` : ''}`
  }
  if (updated.length > 0) {
    lines.push('', `${wrote ? 'Updated' : 'Would update'} ${updated.length}:`)
    for (const r of updated) {
      lines.push(
        `  ${label(r)}  ${r.oldSha ?? 'not recorded'} -> ${r.newSha}  (${describeFiles(r)})`,
      )
      lines.push(`      ${fileList(r)}`)
      for (const reason of r.accepted) lines.push(`      accepted after review: ${reason}`)
    }
  }
  if (blocked.length > 0) {
    lines.push('', `Blocked, NOT updated ${blocked.length}:`)
    for (const r of blocked) {
      lines.push(`  ${label(r)}`)
      for (const reason of r.reasons) lines.push(`      - ${reason}`)
      if (r.acceptable) {
        lines.push('      Only lines were flagged. Every one of them, to read before accepting:')
        lines.push(...everyFlaggedLine(r))
        lines.push(
          `      If all are harmless: --write --only ${r.name} --accept ${r.name}@${r.newSha}`,
        )
      }
    }
  }
  if (errors.length > 0) {
    lines.push('', `Could not be checked ${errors.length}:`)
    for (const r of errors) lines.push(`  ${label(r)}  ${r.message}`)
  }
  const names = unchanged.map((r) => r.name).join(', ')
  lines.push('', `Unchanged: ${unchanged.length}${names ? ` (${names})` : ''}`)
  return lines.join('\n')
}

/**
 * Markdown for a pull-request body. Its reader is the owner, who is not a developer.
 *
 * @param {RefreshResult} result
 */
export function renderSummary(result) {
  const { updated, blocked, unchanged, errors, wrote } = result
  const out = [
    '## Agent skills: refresh from the original projects',
    '',
    'The agent skills in `.claude/skills/` are written instructions that Claude reads before a ' +
      'certain kind of job, for example checking a page for search-engine problems. We did not write ' +
      "them: each one is copied from someone else's public GitHub project and kept here on purpose, " +
      'so every change arrives as a pull request like this one and a person can read it first.',
    '',
    wrote
      ? 'A script (`scripts/refresh-vendored-skills.mjs`) looked up the newest version of every ' +
        'skill, ran a safety check on each change, and copied in only the ones that passed. It ' +
        'changes no website code, and nothing takes effect until this is merged.'
      : 'This is a preview from a script (`scripts/refresh-vendored-skills.mjs`). Nothing was changed.',
    '',
  ]

  out.push(`### ${wrote ? 'Updated' : 'Available updates'} (${updated.length})`, '')
  if (updated.length === 0) {
    out.push('No skill needed an update.', '')
  } else {
    out.push('| Skill | Original project | Version (old to new) | Files |', '|---|---|---|---|')
    for (const r of updated) {
      // A skill that is only in skills-lock.json has no README row, so no old commit on record.
      const compare = `https://github.com/${r.upstream ?? r.repo}/compare/${r.oldSha}...${r.newSha}`
      const version = r.oldSha
        ? `${code(r.oldSha)} to ${code(r.newSha)} ([what changed](${compare}))`
        : `no version on record; now ${code(r.newSha)}`
      const moved = movedTo(r)
      const project = `${code(r.repo)}${moved ? ` (now ${code(moved)})` : ''}`
      out.push(`| ${code(r.name)} | ${project} | ${version} | ${describeFiles(r)} |`)
    }
    out.push(
      '',
      wrote
        ? 'The version numbers in `.claude/skills/README.md` and the fingerprints in `skills-lock.json` were updated to match.'
        : 'With `--write` the version numbers in `.claude/skills/README.md` and the fingerprints in `skills-lock.json` would be updated to match.',
      '',
    )
    const waived = updated.filter((r) => r.accepted.length > 0)
    if (waived.length > 0) {
      out.push('Let through with `--accept`, after a person read these lines:', '')
      for (const r of waived) out.push(`- ${code(r.name)}: ${r.accepted.join('; ')}`)
      out.push('')
    }
  }

  out.push('### Blocked — NOT updated', '')
  if (blocked.length === 0) {
    out.push('Nothing was blocked.', '')
  } else {
    for (const r of blocked)
      out.push(`- ${code(r.name)} (${code(r.repo)}): ${r.reasons.join('; ')}`)
    out.push(
      '',
      'A blocked skill was left exactly as it was. The safety check stops a change that:',
      '',
      '- adds or edits a file that is not plain text (only `.md` and `.json` come in);',
      "- adds a line that runs a command when the skill loads (`command`), or a header line other than the skill's name, description, licence or notes, which is where letting Claude use tools without asking, or hooks, would go (`permission`);",
      '- adds characters that show as nothing on screen but that Claude still reads (`hidden`);',
      '- adds a line about passwords, keys, environment variables or browser storage (`credential`);',
      '- adds wording that tells Claude to ignore its instructions or to hide things from the user (`override`);',
      '- adds something shaped like a real key or token (`secret`);',
      '- comes from a project that moved to a different GitHub owner, or whose licence is no longer MIT or Apache-2.0, or no longer the one recorded;',
      '- cannot be trusted as a set of files (a link, a submodule, a path that leaves its folder, an odd or clashing file name, a very large file, or files that do not match what GitHub lists).',
      '',
      'A person has to decide what to do about each of these. When only lines were flagged, a person who has read them and found them harmless can let that one skill through by hand: `.claude/skills/README.md`, "Updating".',
      '',
    )
  }

  if (errors.length > 0) {
    out.push('### Could not be checked', '')
    for (const r of errors) out.push(`- ${code(r.name)} (${code(r.repo)}): ${r.message}`)
    out.push('')
  }

  out.push(
    '### Unchanged',
    '',
    unchanged.length === 1
      ? '1 skill already matches its original project and was left alone.'
      : `${unchanged.length} skills already match their original project and were left alone.`,
    '',
    '### Before merging',
    '',
    '- Skim the table. Each "what changed" link opens GitHub\'s own comparison of the two versions.',
    '- The safety check is a first filter, not a review: it cannot tell whether new advice suits this website. If anything looks odd, close this pull request. Nothing else depends on it.',
    '',
  )
  const text = out.join('\n')
  if (text.length <= MAX_SUMMARY_CHARS) return text
  return `${text.slice(0, MAX_SUMMARY_CHARS)}\n\n… cut short to fit a pull request. Run \`node scripts/refresh-vendored-skills.mjs\` for the whole list.\n`
}

// ── Command line ──────────────────────────────────────────────────────────────

const USAGE = `Usage: node scripts/refresh-vendored-skills.mjs [--write] [--summary <file>] [--only a,b]

  (no flags)        dry run: report what would change and write nothing
  --write           apply the updates: files, the README table's commits, skills-lock.json
  --summary <file>  also write a plain-English Markdown summary, for a pull-request body
  --only a,b        limit the run to these skills
  --accept a@<commit>,b@<commit>
                    let these skills' flagged LINES through, once a person has read every one
                    at that upstream commit (the report prints them and the commit); if
                    upstream has moved since, nothing is waived. Every other check still
                    applies, and the weekly workflow never passes this

Environment: GITHUB_TOKEN (optional) is sent to api.github.com and raises GitHub's hourly
request limit. GITHUB_OUTPUT (GitHub Actions) receives changed=true|false and blocked=<n>.`

/**
 * @param {{
 *   argv?: string[], env?: Record<string, string | undefined>, fetch?: FetchLike, root?: string,
 *   out?: (line: string) => void, err?: (line: string) => void,
 * }} options
 * @returns {Promise<number>} the exit status
 */
export async function run({
  argv = [],
  env = {},
  fetch: fetchFn = globalThis.fetch,
  root = fileURLToPath(new URL('..', import.meta.url)),
  out = console.log,
  err = console.error,
} = {}) {
  const token = env.GITHUB_TOKEN || undefined
  // Whatever an error message happens to contain, the token never reaches a log or a summary.
  const hide = (value) => (token ? String(value).split(token).join('***') : String(value))
  const say = (line) => out(hide(line))
  const complain = (line) => err(hide(line))

  let values
  try {
    values = parseArgs({
      args: argv,
      options: {
        write: { type: 'boolean', default: false },
        summary: { type: 'string' },
        only: { type: 'string' },
        accept: { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
      allowPositionals: false,
    }).values
  } catch (error) {
    complain(`${error instanceof Error ? error.message : error}\n\n${USAGE}`)
    return 1
  }
  if (values.help) {
    say(USAGE)
    return 0
  }

  /** @param {string | undefined} value */
  const names = (value) =>
    (value ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
  let result
  try {
    result = await refresh({
      root,
      fetch: fetchFn,
      write: values.write,
      only: names(values.only),
      accept: names(values.accept),
      token,
    })
  } catch (error) {
    complain(`Could not refresh the vendored skills: ${describeError(error)}`)
    return 1
  }

  say(renderReport(result))
  if (values.summary) writeFileSync(values.summary, hide(renderSummary(result)))
  if (env.GITHUB_OUTPUT) {
    appendFileSync(
      env.GITHUB_OUTPUT,
      `changed=${result.errors.length === 0 && result.updated.length > 0}\nblocked=${result.blocked.length}\n`,
    )
  }
  return result.errors.length > 0 ? 1 : 0
}

// Real paths on both sides: node reports the module's real path, while argv[1] keeps a
// symlink or a space as typed (see scripts/check-required-checks.mjs, where this bit).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await run({ argv: process.argv.slice(2), env: process.env })
}
