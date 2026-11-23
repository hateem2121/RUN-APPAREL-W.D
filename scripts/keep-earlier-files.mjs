#!/usr/bin/env node
/**
 * Keep the earlier releases' hashed files in the release about to be uploaded.
 *
 * WHY. A page opened before a deploy keeps asking for the script and style files ITS release
 * named, and a new release's file set no longer has them. Measured on the live site on
 * 23 Nov 2026: `/assets/index-CNj-M4ah.js` (the viewer's entry file of 20 Nov) answered
 * 200 `text/html`, the page shell, and `/_next/static/chunks/0la5u2-qn7xuu.js` (a website
 * chunk of 18 Nov) answered 404. Cloudflare's "Version skew and static assets" (last updated
 * 12 Nov 2026, read 23 Nov) names the cure used here: "Include assets needed by older pages",
 * with content-hashed names, so different contents never share a path.
 *
 * HOW. Each release publishes a list of its own hashed files at `<prefix><list>` (for the viewer
 * `/assets/release-files.json`). Before an upload this script reads the LIVE list, downloads
 * every file on it that the new build does not have, puts it into the new build's folder, and
 * writes the new list: the build's own files, plus the kept ones with the day each was last
 * live. A kept file is dropped once it has not been live for `--days` (7), oldest first past
 * `--max-kept-mib` (20), so the set cannot grow without limit. Deploys run several times a day,
 * so "keep N releases" could mean under an hour: a time window is the honest unit.
 *
 * ⚠️ A STATUS CODE PROVES NOTHING HERE. The viewer answers a missing file with 200 and the page's
 * HTML (its single-page fallback). So a file is kept only if it answers 200 with a content type
 * that fits its name AND the byte size the list promised. Keeping the page shell under a `.js`
 * name would make the fault permanent.
 *
 * ⚠️ IT NEVER STOPS A RELEASE. The live list unreachable, unreadable or a file refused: a warning,
 * and the release goes out with whatever was kept (on the first run, nothing). Only `--check`
 * (after the deploy) exits 1, and only for a file this run kept that the live site then lacks.
 *
 * WHAT IT DOES NOT COVER (the same Cloudflare page): a NEW page whose file request reaches a
 * location that has not got the new version yet, for the seconds a deploy takes to spread.
 *
 * WHAT IT PRINTS goes to a public Actions log: counts, public file paths and sizes only.
 *
 * Usage:
 *   node scripts/keep-earlier-files.mjs --dir apps/viewer/dist --prefix /assets/ \
 *     --list release-files.json [--origin https://wear-run.com] [--release <sha>] [--save <file>]
 *   node scripts/keep-earlier-files.mjs --check --saved <file> [--origin https://wear-run.com]
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEEP_DAYS = 7
const MAX_KEPT_BYTES = 20 * 1024 * 1024
/** A list longer than this is not ours: refuse it whole rather than download from it. */
const MAX_LIST_FILES = 2000
const DAY_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000
const CONCURRENCY = 6

/**
 * A path this script may write under the build folder: inside `prefix`, plain name characters,
 * no `..`, no empty segment. The live list is fetched text; it never gets to choose a folder.
 */
export function safePath(path, prefix) {
  if (typeof path !== 'string' || !path.startsWith(prefix)) return false
  const rest = path.slice(prefix.length)
  if (!rest || rest.length > 300) return false
  return rest.split('/').every((part) => /^[A-Za-z0-9_~.-]+$/.test(part) && !/^\.+$/.test(part))
}

/** Every file under `dir + prefix`, as `{ path, bytes }`, the list file itself left out. */
function ownFiles(dir, prefix, listName) {
  const root = join(dir, prefix)
  const found = []
  const walk = (folder, urlPath) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(folder, entry.name), `${urlPath}${entry.name}/`)
      else if (entry.isFile() && `${urlPath}${entry.name}` !== `${prefix}${listName}`)
        found.push({
          path: `${urlPath}${entry.name}`,
          bytes: statSync(join(folder, entry.name)).size,
        })
    }
  }
  walk(root, prefix)
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * The live list, or null when the text is not one. An HTML fallback page, a truncated answer and
 * a list of the wrong shape all end here, and the caller keeps nothing.
 */
export function parseList(text, prefix) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.files)) return null
  if (data.files.length > MAX_LIST_FILES) return null
  const files = []
  for (const file of data.files) {
    if (!file || !safePath(file.path, prefix)) return null
    if (!Number.isInteger(file.bytes) || file.bytes <= 0) return null
    const lastLive = file.lastLive ?? null
    if (lastLive !== null && Number.isNaN(Date.parse(lastLive))) return null
    files.push({ path: file.path, bytes: file.bytes, lastLive })
  }
  return { release: typeof data.release === 'string' ? data.release : null, files }
}

/**
 * Which earlier files to ask for. A file the live release called its own was live until this
 * deploy, so its last-live day is now; a file it had kept carries the day it recorded.
 *
 * @returns {{ wanted: {path:string,bytes:number,lastLive:string}[], tooOld: string[], overCap: string[] }}
 */
export function plan({ own, live, now, days = KEEP_DAYS, maxKeptBytes = MAX_KEPT_BYTES }) {
  const mine = new Set(own.map((file) => file.path))
  const nowIso = new Date(now).toISOString()
  const tooOld = []
  const fresh = []
  for (const file of live) {
    if (mine.has(file.path)) continue
    const lastLive = file.lastLive ?? nowIso
    if (now - Date.parse(lastLive) > days * DAY_MS) tooOld.push(file.path)
    else fresh.push({ path: file.path, bytes: file.bytes, lastLive })
  }
  // Newest first, so the cap drops the files least likely to be asked for.
  fresh.sort(
    (a, b) => Date.parse(b.lastLive) - Date.parse(a.lastLive) || a.path.localeCompare(b.path),
  )
  const wanted = []
  const overCap = []
  let total = 0
  for (const file of fresh) {
    if (total + file.bytes > maxKeptBytes) overCap.push(file.path)
    else {
      total += file.bytes
      wanted.push(file)
    }
  }
  return { wanted, tooOld, overCap }
}

/** What a file's name promises about its content type; anything else only must not be a page. */
const TYPE_BY_ENDING = [
  [/\.m?js$/, /javascript/],
  [/\.css$/, /text\/css/],
  [/\.json$/, /json/],
  [/\.woff2$/, /font|octet-stream/],
]

/**
 * Why an answer may NOT be kept, or null when it may.
 *
 * @param {{ path: string, bytes: number }} file
 * @param {{ status: number, contentType: string, length: number }} answer
 */
export function refusal(file, answer) {
  if (answer.status !== 200) return `answered ${answer.status}`
  const type = (answer.contentType || '').toLowerCase()
  if (type.includes('text/html')) return 'answered with a page (text/html), not the file'
  const rule = TYPE_BY_ENDING.find(([ending]) => ending.test(file.path))
  if (rule && !rule[1].test(type)) return `answered as ${type || 'no content type'}`
  if (answer.length !== file.bytes) return `is ${answer.length} bytes, the list says ${file.bytes}`
  return null
}

async function ask(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': 'run-apparel-keep-earlier-files' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  const body = new Uint8Array(await response.arrayBuffer())
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    length: body.byteLength,
    body,
  }
}

async function inTurns(items, work) {
  const results = new Array(items.length)
  let next = 0
  const runner = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await work(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, runner))
  return results
}

/**
 * Keep what can be kept and write the new list. Never throws.
 *
 * @returns {Promise<{ own: number, kept: object[], refused: string[], tooOld: string[], overCap: string[], note: string | null, list: object }>}
 */
export async function keepEarlierFiles({
  dir,
  prefix,
  listName,
  origin,
  release = null,
  now = Date.now(),
  fetchImpl = fetch,
  days = KEEP_DAYS,
  maxKeptBytes = MAX_KEPT_BYTES,
}) {
  const own = ownFiles(dir, prefix, listName)
  const kept = []
  const refused = []
  let outcome = { wanted: [], tooOld: [], overCap: [] }
  let note = null
  try {
    const answer = await ask(`${origin}${prefix}${listName}`, fetchImpl)
    const live =
      answer.status === 200 ? parseList(new TextDecoder().decode(answer.body), prefix) : null
    if (!live) {
      note = `the live list ${prefix}${listName} answered ${answer.status} ${answer.contentType} and is not a list; nothing kept`
    } else {
      outcome = plan({ own, live: live.files, now, days, maxKeptBytes })
      await inTurns(outcome.wanted, async (file) => {
        try {
          const got = await ask(`${origin}${file.path}`, fetchImpl)
          const why = refusal(file, got)
          if (why) return void refused.push(`${file.path} ${why}`)
          const target = join(dir, file.path)
          mkdirSync(dirname(target), { recursive: true })
          writeFileSync(target, got.body)
          kept.push(file)
        } catch (error) {
          refused.push(`${file.path} could not be fetched (${error?.name ?? 'error'})`)
        }
      })
    }
  } catch (error) {
    note = `the live list could not be read (${error?.name ?? 'error'}); nothing kept`
  }
  kept.sort((a, b) => a.path.localeCompare(b.path))
  const list = {
    release,
    written: new Date(now).toISOString(),
    files: [
      ...own.map((file) => ({ path: file.path, bytes: file.bytes, lastLive: null })),
      ...kept.map((file) => ({ path: file.path, bytes: file.bytes, lastLive: file.lastLive })),
    ],
  }
  const listFile = join(dir, prefix, listName)
  mkdirSync(dirname(listFile), { recursive: true })
  writeFileSync(listFile, `${JSON.stringify(list)}\n`)
  return { own: own.length, kept, refused, ...outcome, note, list }
}

/**
 * After the deploy: the live site must name this release in its list and hold every kept file.
 *
 * @returns {Promise<string[]>} what is wrong; empty when nothing is
 */
export async function checkKeptFiles({ saved, origin, fetchImpl = fetch }) {
  const problems = []
  const listUrl = `${origin}${saved.prefix}${saved.listName}`
  try {
    const answer = await ask(listUrl, fetchImpl)
    const live =
      answer.status === 200 ? parseList(new TextDecoder().decode(answer.body), saved.prefix) : null
    if (!live) problems.push(`${listUrl} is not a list (${answer.status} ${answer.contentType})`)
    else if (saved.list.release && live.release !== saved.list.release)
      problems.push(`${listUrl} names release ${live.release}, not ${saved.list.release}`)
  } catch (error) {
    problems.push(`${listUrl} could not be read (${error?.name ?? 'error'})`)
  }
  const keptFiles = saved.list.files.filter((file) => file.lastLive !== null)
  await inTurns(keptFiles, async (file) => {
    try {
      const why = refusal(file, await ask(`${origin}${file.path}`, fetchImpl))
      if (why) problems.push(`${file.path} ${why}`)
    } catch (error) {
      problems.push(`${file.path} could not be fetched (${error?.name ?? 'error'})`)
    }
  })
  return problems.sort()
}

function argument(args, name) {
  const at = args.indexOf(name)
  return at === -1 ? null : (args[at + 1] ?? null)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const origin = argument(args, '--origin') ?? 'https://wear-run.com'
  if (args.includes('--check')) {
    const savedFile = argument(args, '--saved')
    let saved
    try {
      saved = JSON.parse(readFileSync(savedFile, 'utf8'))
    } catch {
      // The keep step did not run or could not write (it never stops a release): nothing to check.
      console.log(`::warning::keep-earlier-files: no saved list at ${savedFile}; nothing checked`)
      process.exit(0)
    }
    const problems = await checkKeptFiles({ saved, origin })
    const keptCount = saved.list.files.filter((file) => file.lastLive !== null).length
    if (problems.length === 0) {
      console.log(
        `[keep-earlier-files] ${saved.prefix}: the live list names this release and all ${keptCount} kept files answer`,
      )
    } else {
      for (const problem of problems) console.log(`::error::${problem}`)
      process.exit(1)
    }
  } else {
    const dir = argument(args, '--dir')
    const prefix = argument(args, '--prefix')
    const listName = argument(args, '--list')
    if (!dir || !prefix || !listName || !prefix.startsWith('/') || !prefix.endsWith('/')) {
      console.error(
        'usage: keep-earlier-files.mjs --dir <folder> --prefix </path/> --list <name.json>',
      )
      process.exit(2)
    }
    const release = argument(args, '--release') ?? process.env.GITHUB_SHA ?? null
    let result
    try {
      result = await keepEarlierFiles({ dir, prefix, listName, origin, release })
    } catch (error) {
      // The build folder itself could not be read or written: say so, and let the release go.
      console.log(
        `::warning::keep-earlier-files could not run for ${prefix}: ${error?.message ?? error}`,
      )
      process.exit(0)
    }
    const bytes = result.kept.reduce((sum, file) => sum + file.bytes, 0)
    console.log(
      `[keep-earlier-files] ${prefix}: ${result.own} files of this release, ${result.kept.length} earlier files kept (${bytes} bytes), ${result.tooOld.length} past ${KEEP_DAYS} days, ${result.overCap.length} over the size cap, ${result.refused.length} refused`,
    )
    if (result.note) console.log(`::warning::${result.note}`)
    for (const line of result.refused) console.log(`::warning::not kept: ${line}`)
    const save = argument(args, '--save')
    if (save) writeFileSync(save, JSON.stringify({ prefix, listName, list: result.list }))
  }
}
