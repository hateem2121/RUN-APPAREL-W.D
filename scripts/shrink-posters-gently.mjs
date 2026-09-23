#!/usr/bin/env node
/**
 * "Shrink gently": re-encode the two products scripts/poster-sizes.mjs flagged
 * (audit L-11/IM-02) at settings gentler than the pipeline's usual poster preset, so
 * `r-asb` and `r-wzu` come back under their family's median without a visible loss
 * of detail — the owner's 2026-09-17 call, on the two garments they looked at.
 *
 * WHY A FIXED LIST (`GENTLE_TRIMS`) RATHER THAN RE-DERIVING "WHAT'S FLAGGED" AND
 * RE-ENCODING IT LIVE. The settings below were chosen by looking at the RENDERED
 * output, not by tuning against file size — root CLAUDE.md's standing rule, "do not
 * tune presets against file size", is exactly what a script that re-decides its own
 * targets on every run would violate. Every entry here is one the owner already saw
 * and accepted; the dry run proves the settings still reproduce that exact approved
 * file, and refuses to guess a new one for a poster nobody has looked at.
 *
 * WHY THE OWNER RUNS `--apply`, NOT THIS SESSION. Standing rule (root CLAUDE.md,
 * "Never" list): only the owner runs this with `--apply`, and only after the deploy
 * that ships scripts/poster-sizes.mjs — see docs/RUNBOOK.md for their exact command.
 *
 * FIXED 2026-09-23: the CURRENT poster is always resolved through the live
 * product/media relation (posterState(), fed from dryRun()'s viewer payload and
 * apply()'s own Media read), never a guessed `<product>-<colour>-poster.webp`
 * filename. A guessed name cannot see a Payload-suffixed re-upload ("-1", "-2", …),
 * so the dry run could never observe a colour's own successful trim once
 * `--apply` had run once, and a retry after a half-finished run could not tell an
 * already-uploaded trim from a new job — findExistingUpload() now checks the
 * Media library for one before uploading again, and planProductWrite() skips a
 * PATCH entirely once every colour on a product is already 'done'.
 *
 * Usage:
 *   node scripts/shrink-posters-gently.mjs           # dry run: fetches the 7 live
 *                                                     # posters, re-encodes them in
 *                                                     # memory, changes nothing
 *   node scripts/shrink-posters-gently.mjs --apply    # asks for the key, hidden;
 *                                                     # uploads and repoints
 *
 * ⚠️ DO NOT PUT THE KEY ON THE COMMAND LINE — see scripts/apply-footer-facts.mjs's
 * header for why that specific shape failed twice on 2026-09-16. This script asks
 * for the key the same way, for the same reasons.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** The repo root, derived from this file's own location — never hard-coded. */
const REPO = fileURLToPath(new URL('..', import.meta.url))
/** Sharp is `tools/asset-pipeline`'s dependency, not this top-level package's. */
const require = createRequire(join(REPO, 'tools/asset-pipeline/package.json'))
const sharp = require('sharp')

const API_BASE = (process.env.CMS_API_BASE || 'https://cms.wear-run.help').replace(/\/+$/, '')
/** `let`, not `const`: the hidden prompt in apply() assigns it when unset. */
let API_KEY = process.env.CMS_API_KEY || ''
const APPLY = process.argv.includes('--apply')

/** The settings the owner approved for `r-wzu` (all five colourways). */
export const VEST = { quality: 75, alphaQuality: 80, effort: 6, smartSubsample: false }

/**
 * Every poster this script touches, with the settings the owner approved for it and
 * the exact bytes/hash on both sides — measured against the live files on
 * 2026-09-17. See scripts/poster-sizes.mjs, whose FLAG_AT/OWNER_EXCEPTIONS these
 * numbers are judged against (`apps/cms/src/shrinkPostersGently.test.ts` checks both
 * directions: `r-asb` lands under 2× the Sportswear median on its own, `r-wzu` lands
 * inside its 3× exception).
 */
export const GENTLE_TRIMS = [
  {
    product: 'r-asb',
    colour: 'blush',
    settings: { quality: 80, alphaQuality: 100, effort: 4, smartSubsample: false },
    original: {
      bytes: 105972,
      sha256: 'b7a4112370126d64df94eaa888cc992b2bd4991de9a055d1515b01e87b4f85ee',
    },
    approved: {
      bytes: 99020,
      sha256: '248266ab6c12a424102c2b0cbaf13f58759fa1ba17ec3b3be7869d92ed97befd',
    },
  },
  {
    product: 'r-asb',
    colour: 'pebble',
    settings: { quality: 80, alphaQuality: 100, effort: 4, smartSubsample: true },
    original: {
      bytes: 107208,
      sha256: 'f5707030d61b957e519aa8b52486c42a5ac863e85cdeb95565e7528739ac6ec2',
    },
    approved: {
      bytes: 99040,
      sha256: 'e79c8919449d4bba9730ddfb0f3f34c641939c2abff3f6154e2a9ebcc5acb75c',
    },
  },
  {
    product: 'r-wzu',
    colour: 'blush',
    settings: VEST,
    original: {
      bytes: 173448,
      sha256: '6864b699313dc66e015d7b555cd52063aeec920f5159ad7ec6683ea12bdebef1',
    },
    approved: {
      bytes: 133930,
      sha256: '9349235a36d8e56515dc1bae8daf62d7d3e2363ab004ec3bd6bf1febc19ae665',
    },
  },
  {
    product: 'r-wzu',
    colour: 'butter',
    settings: VEST,
    original: {
      bytes: 177230,
      sha256: 'd6863df9ebbe75b8d621fd145604fcc7c339a92814a69f0ebb0a75d842d76302',
    },
    approved: {
      bytes: 133180,
      sha256: '2aa678e05816d9b0bfced2d4ee1361f15573317eadde0966f4df356ae6969728',
    },
  },
  {
    product: 'r-wzu',
    colour: 'powder-blue',
    settings: VEST,
    original: {
      bytes: 191264,
      sha256: 'abf6bbc9c06efcd48d975cab5d6735ad34897e8d1091efa33c13dd103d5d69b2',
    },
    approved: {
      bytes: 139524,
      sha256: 'c1d44f72aa81b912c5fc19ec55fdd27f831962dc39ce9f26d56f9b2283bedb25',
    },
  },
  {
    product: 'r-wzu',
    colour: 'beige',
    settings: VEST,
    original: {
      bytes: 181698,
      sha256: '35211be971022215ef45ea3af23f7fec0b49ac02c40009cf360efac1da4a5726',
    },
    approved: {
      bytes: 132298,
      sha256: '7b449de9c33aad099a88327c260194d6e9f041ed486e3632db54451845502fbf',
    },
  },
  {
    product: 'r-wzu',
    colour: 'plum',
    settings: VEST,
    original: {
      bytes: 168964,
      sha256: '6445536067934a15654c73b3ee35f6e1091f0a84e42ccfed22063347d8c221ad',
    },
    approved: {
      bytes: 130004,
      sha256: '0fd90cc9a2cf42e4a1f40588db40135dceabf1bf6c22d61755bb967b684285a0',
    },
  },
]

/**
 * @param {string | Buffer | Uint8Array} bytes
 * @returns {string} lowercase hex
 */
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * @param {Buffer} bytes
 * @param {{ quality: number, alphaQuality: number, effort: number, smartSubsample: boolean }} settings
 * @returns {Promise<Buffer>}
 */
export async function reencode(bytes, settings) {
  return sharp(bytes)
    .webp({ ...settings })
    .toBuffer()
}

/**
 * A re-encode is only "gentle" if it is still recognisably the same picture: same
 * format, same size, same transparency — just fewer bytes. Every check here maps to
 * one of this task's fixture faults (see the test file), so each one is proven to
 * catch what it claims to catch, not just proven to pass a good case.
 *
 * @param {Buffer} original
 * @param {Buffer} result
 * @returns {Promise<string[]>} empty means the re-encode is fine
 */
export async function reencodeProblems(original, result) {
  const found = []
  let originalMeta
  try {
    originalMeta = await sharp(original).metadata()
  } catch {
    found.push('the original does not decode as an image')
    return found
  }
  let resultMeta
  try {
    resultMeta = await sharp(result).metadata()
  } catch {
    found.push('the result does not decode as an image')
    return found
  }
  if (resultMeta.format !== 'webp') found.push(`the result is ${resultMeta.format}, not webp`)
  if (resultMeta.width !== originalMeta.width || resultMeta.height !== originalMeta.height) {
    found.push(
      `the result is ${resultMeta.width}x${resultMeta.height}, the original was ` +
        `${originalMeta.width}x${originalMeta.height}`,
    )
  }
  if (originalMeta.hasAlpha && !resultMeta.hasAlpha) found.push('the result lost the alpha channel')
  if (result.length >= original.length) {
    found.push(
      `the result (${result.length} B) is not smaller than the original (${original.length} B)`,
    )
  }
  return found
}

/**
 * The id a relation is pointing at, whether Payload handed it back bare (as written)
 * or populated as `{ id, … }` (as read at a non-zero depth). Comparing the two shapes
 * naively would report every relation as "changed" on every read-back.
 *
 * @param {unknown} value
 * @returns {number | string | null}
 */
export function idOf(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return /** @type {{ id?: unknown }} */ (value).id ?? null
  return /** @type {number | string} */ (value)
}

/**
 * Replace ONLY `posterPreview`, on ONLY the rows named in `idsBySlug`; every other
 * row and every other field is returned untouched. A PATCH to `colourways` replaces
 * the WHOLE array (apps/cms/CLAUDE.md — "A PATCH to an array field REPLACES THE
 * WHOLE ARRAY"), so the caller must send every row back, and this is the one place
 * that decides which field is allowed to differ.
 *
 * @param {import('./shrink-posters-gently.d.mts').ColourwayRow[]} rows
 * @param {Map<string, number | string>} idsBySlug colour slug -> new media id
 * @returns {import('./shrink-posters-gently.d.mts').ColourwayRow[]}
 */
export function repointedColourways(rows, idsBySlug) {
  const bySlug = new Map()
  for (const row of rows) {
    const slug = String(row.slug ?? '')
    if (bySlug.has(slug)) throw new Error(`duplicate colourway slug "${slug}"`)
    bySlug.set(slug, row)
  }
  for (const slug of idsBySlug.keys()) {
    if (!bySlug.has(slug)) throw new Error(`no colourway row for slug "${slug}"`)
  }
  return rows.map((row) => {
    const newId = idsBySlug.get(String(row.slug ?? ''))
    return newId === undefined ? row : { ...row, posterPreview: newId }
  })
}

const COLOURWAY_FIELDS = [
  'id',
  'slug',
  'displayName',
  'variantId',
  'posterPreview',
  'altText',
  'hexSwatch',
  'glbAsset',
  'active',
  'note',
]
const RELATION_FIELDS = new Set(['posterPreview', 'glbAsset'])

/**
 * Compare what was SENT in a colourways PATCH against what Payload reports for that
 * array afterwards. A 200 is not storage (apps/cms/CLAUDE.md — "A PATCH NAMING A
 * PROJECTED FIELD RETURNS 200 AND STORES NOTHING" cost eleven silent no-ops on
 * 2026-09-04), so every write in this script is read back and compared field by
 * field rather than trusted from the response status.
 *
 * @param {import('./shrink-posters-gently.d.mts').ColourwayRow[]} sent
 * @param {import('./shrink-posters-gently.d.mts').ColourwayRow[]} stored
 * @returns {string[]} empty means every field matches
 */
export function readBackProblems(sent, stored) {
  const found = []
  if (sent.length !== stored.length) {
    found.push(`row count changed: sent ${sent.length}, stored ${stored.length}`)
    return found
  }
  for (let i = 0; i < sent.length; i++) {
    const a = sent[i]
    const b = stored[i]
    for (const field of COLOURWAY_FIELDS) {
      const av = RELATION_FIELDS.has(field) ? idOf(a[field]) : (a[field] ?? null)
      const bv = RELATION_FIELDS.has(field) ? idOf(b[field]) : (b[field] ?? null)
      if (av !== bv) {
        found.push(
          `row ${i} (${a.slug}): ${field} sent ${JSON.stringify(av)}, stored ${JSON.stringify(bv)}`,
        )
      }
    }
  }
  return found
}

/**
 * Same rule as scripts/apply-footer-facts.mjs's inline check on the key it reads.
 * Kept as its own named export here so the refusal gets the same "catches its own
 * fault" test as every other rule in this file, rather than being trusted untested.
 * See that script's header for the incident this guards against (2026-09-16: a
 * placeholder run through as a real key, twice, because a command block is
 * something you run, not something you edit first).
 *
 * @param {string} key
 * @returns {boolean}
 */
export function looksLikeInstructionText(key) {
  return /\s/.test(key) || /paste|placeholder|your[-\w]*key|real[-_]?key|[<>]/i.test(key)
}

/**
 * Classify a poster's CURRENT bytes against one GENTLE_TRIMS entry — judged by
 * sha256 only, never by size or name, so a same-length coincidence can never be
 * mistaken for a match:
 *   'done'    already the approved trimmed bytes — nothing to do
 *   'ready'   still the known original, pre-trim bytes — safe to re-encode
 *   'changed' neither — something else is live; stop rather than guess
 *
 * Fix, 2026-09-23: the CURRENT poster must always be resolved through the real
 * product/media relation (dryRun()'s live viewer payload, apply()'s own Media
 * read) and handed to this function as bytes — never guessed from a filename,
 * which cannot see a Payload-suffixed re-upload ("-1", "-2", …) and so could never
 * observe a colour's own successful trim.
 *
 * @param {Buffer | Uint8Array} bytes
 * @param {import('./shrink-posters-gently.d.mts').GentleTrim} trim
 * @returns {{ state: 'done' | 'ready' | 'changed', bytes: number, sha256: string }}
 */
export function posterState(bytes, trim) {
  const digest = sha256(bytes)
  const state =
    digest === trim.approved.sha256 ? 'done' : digest === trim.original.sha256 ? 'ready' : 'changed'
  return { state, bytes: bytes.length, sha256: digest }
}

/**
 * The message for a 'changed' classification — named once so dryRun() and
 * planProductWrite() report the exact same thing for the exact same fault, naming
 * the actual bytes/sha256 against BOTH known values rather than just saying
 * "different".
 *
 * @param {import('./shrink-posters-gently.d.mts').GentleTrim} trim
 * @param {{ bytes: number, sha256: string }} current
 * @returns {string}
 */
function changedNote(trim, current) {
  return (
    `current poster is ${current.bytes} B (${current.sha256}) — neither the approved trim ` +
    `(${trim.approved.bytes} B, ${trim.approved.sha256}) nor the known original ` +
    `(${trim.original.bytes} B, ${trim.original.sha256}). It changed since this was written — ` +
    're-run the dry run first.'
  )
}

/**
 * What a product's PATCH should do, decided from each of its colours' CURRENT
 * state alone — no network, so "a second full run is a polite no-op" is provable
 * without touching production. A 'changed' colour always stops the whole product
 * (apply() exits rather than guessing); short of that, 'done' colours are left out
 * of the write entirely and 'ready' colours are the ones that still need a
 * re-encode/upload. `needsWrite` is false only when EVERY colour is already
 * 'done' — the case a second `--apply` run hits, where the product should be left
 * alone and the fact said plainly.
 *
 * @param {import('./shrink-posters-gently.d.mts').TrimState[]} states
 * @returns {import('./shrink-posters-gently.d.mts').ProductWritePlan}
 */
export function planProductWrite(states) {
  const problems = states
    .filter((s) => s.state === 'changed')
    .map((s) => `${s.trim.colour}: ${changedNote(s.trim, s)}`)
  const toTrim = states.filter((s) => s.state === 'ready')
  const alreadyDone = states.filter((s) => s.state === 'done')
  return { toTrim, alreadyDone, problems, needsWrite: problems.length === 0 && toTrim.length > 0 }
}

/**
 * Media docs whose filename COULD be a previous upload of this trim — by name
 * only, never trusted alone. Payload suffixes a colliding filename ("-1", "-2", …),
 * so this narrows a full Media listing down to the handful worth fetching and
 * hashing; findExistingUpload() below is what actually verifies a match by bytes.
 *
 * @param {import('./shrink-posters-gently.d.mts').MediaListing[]} mediaDocs
 * @param {import('./shrink-posters-gently.d.mts').GentleTrim} trim
 * @returns {{ id: number | string, url: string }[]}
 */
export function candidateUploads(mediaDocs, trim) {
  const prefix = `${trim.product}-${trim.colour}-poster`
  return mediaDocs
    .filter((doc) => String(doc.filename ?? '').startsWith(prefix) && doc.url)
    .map((doc) => ({ id: doc.id, url: /** @type {string} */ (doc.url) }))
}

/**
 * A prior, possibly interrupted `--apply` run may already have uploaded this
 * exact trim under a Payload-suffixed filename ("-1", "-2", …). Reusing it instead
 * of uploading again is what keeps a retry from creating a duplicate Media
 * document for the same colour. Every candidate's BYTES are fetched and checked
 * against the approved trim directly — the name only narrowed which candidates
 * were worth fetching, it never decides the match.
 *
 * @param {import('./shrink-posters-gently.d.mts').MediaListing[]} mediaDocs
 * @param {import('./shrink-posters-gently.d.mts').GentleTrim} trim
 * @returns {Promise<{ id: number | string, url: string } | null>}
 */
export async function findExistingUpload(mediaDocs, trim) {
  for (const candidate of candidateUploads(mediaDocs, trim)) {
    const response = await fetch(candidate.url)
    if (!response.ok) continue
    const bytes = Buffer.from(await response.arrayBuffer())
    if (sha256(bytes) === trim.approved.sha256) return candidate
  }
  return null
}

async function api(auth, method, pathname, body) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...auth },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 300) }
  }
  return { ok: response.ok, status: response.status, json }
}

function explain(json) {
  const outer = json?.errors?.[0]
  const inner = outer?.data?.errors?.[0]
  if (inner) return `${inner.field}: ${inner.message}`
  return outer?.message || json?.raw || JSON.stringify(json).slice(0, 200)
}

/**
 * Thrown in place of `process.exit()` everywhere inside dryRun()/apply()'s own
 * logic, so a test can observe a stop (via `.rejects`) without killing the test
 * process — `main()`, the real CLI entry, is the only place that still calls
 * `process.exit`, translating a caught Stop into `process.exit(stop.code)`.
 *
 * Every message the owner sees has ALREADY been printed via console.error at the
 * throw site, exactly as before this existed — a Stop carries only the exit code,
 * never text to print, so nothing the owner sees on screen changes.
 */
export class Stop extends Error {
  constructor(code) {
    super(`stop (exit ${code})`)
    this.code = code
  }
}

function fail(response, doing) {
  console.error(`\nCould not finish ${doing} (${response.status}): ${explain(response.json)}`)
  if (response.status === 401 || response.status === 403) {
    console.error('  This step needs an editor or admin key.')
    console.error('  (Reading needs only a recognised key — if reading also failed, the key')
    console.error("  itself isn't recognised at all, not just short of the right role.)")
  }
  throw new Stop(1)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * GENTLE_TRIMS, grouped by product — used by both dryRun() and apply() so every
 * trimmed colour on a product is handled together (one viewer payload fetch, one
 * PATCH), never one colour at a time.
 *
 * @param {import('./shrink-posters-gently.d.mts').GentleTrim[]} trims
 * @returns {Map<string, import('./shrink-posters-gently.d.mts').GentleTrim[]>}
 */
function groupByProduct(trims) {
  const byProduct = new Map()
  for (const trim of trims) {
    const list = byProduct.get(trim.product) ?? []
    list.push(trim)
    byProduct.set(trim.product, list)
  }
  return byProduct
}

/**
 * Every Media document, depth 0 — the same shape scripts/find-orphan-media.mjs
 * already reads, and the only way this codebase searches Media at all: nothing
 * here queries by a `where` filter on filename, so this does not invent one.
 * Read-only; apply() calls it at most once per run, lazily, only once a colour
 * actually needs a re-encode.
 *
 * Fixed 2026-09-23 (round 2): a failed page used to return whatever had been
 * gathered so far, silently — every OTHER network call in this file fails loud
 * (via `fail()`), and this was the one exception. An incomplete listing means
 * findExistingUpload() can miss a genuine prior upload from a half-finished run
 * and let a retry create the very duplicate this fix exists to prevent, with no
 * message telling the owner the reuse check was skipped. So a failed page stops
 * the WHOLE run here, before any upload or PATCH, and says plainly that nothing
 * was changed.
 *
 * @param {Record<string, string>} auth
 * @returns {Promise<import('./shrink-posters-gently.d.mts').MediaListing[]>}
 */
async function fetchMediaIndex(auth) {
  const docs = []
  for (let page = 1; ; page++) {
    const listed = await api(auth, 'GET', `/api/media?limit=100&depth=0&page=${page}`)
    if (!listed.ok) {
      console.error(
        `\nCould not list Media to check for a prior upload (${listed.status}): ${explain(listed.json)}`,
      )
      console.error('  The reuse check could not run. Nothing was uploaded or changed.')
      throw new Stop(1)
    }
    docs.push(...(listed.json?.docs ?? []))
    if (!listed.json?.hasNextPage) break
  }
  return docs
}

/**
 * All network, no writes, no key. For each product, reads its live viewer payload
 * ONCE — the same `GET /api/public/viewer/<product>` scripts/poster-sizes.mjs and
 * this script's own apply() already read — and resolves each trimmed colour's
 * poster through the REAL relation it carries.
 *
 * Fixed 2026-09-23: this used to build a guessed, unsuffixed filename, which could
 * never observe a colour's own successful trim once Payload suffixed the upload
 * ("-1", "-2", …) — so a correct `--apply` left the dry run reporting the OLD,
 * orphaned file forever. Never fetches by GUESSING what changed — a poster whose
 * bytes match neither the known original nor the approved trim is reported as a
 * problem, because at that point this script no longer knows what picture it is
 * looking at.
 *
 * @param {import('./shrink-posters-gently.d.mts').GentleTrim[]} [trims] Defaults
 *   to the real GENTLE_TRIMS; a test supplies its own small, self-contained list
 *   instead, since GENTLE_TRIMS' hashes are real production bytes this file does
 *   not have local copies of.
 * @returns {Promise<import('./shrink-posters-gently.d.mts').DryRunRow[]>}
 */
export async function dryRun(trims = GENTLE_TRIMS) {
  const rows = []
  for (const [product, productTrims] of groupByProduct(trims)) {
    const response = await fetch(`${API_BASE}/api/public/viewer/${product}`)
    if (!response.ok) {
      for (const trim of productTrims) {
        rows.push({
          trim,
          url: null,
          status: 'problem',
          note: `viewer payload answered ${response.status}`,
        })
      }
      continue
    }
    const body = await response.json()
    const posterUrlByColour = new Map(
      (body?.colourways ?? []).map((c) => [String(c.slug ?? ''), c.poster?.url]),
    )
    for (const trim of productTrims) {
      const url = posterUrlByColour.get(trim.colour)
      if (!url) {
        rows.push({
          trim,
          url: null,
          status: 'problem',
          note: 'no poster url in the viewer payload',
        })
        continue
      }
      const posterResponse = await fetch(url)
      if (!posterResponse.ok) {
        rows.push({
          trim,
          url,
          status: 'problem',
          note: `poster answered ${posterResponse.status}`,
        })
        continue
      }
      const contentType = posterResponse.headers.get('content-type') ?? ''
      if (!contentType.startsWith('image/webp')) {
        rows.push({
          trim,
          url,
          status: 'problem',
          note: `content-type is "${contentType}", not image/webp`,
        })
        continue
      }
      const liveBytes = Buffer.from(await posterResponse.arrayBuffer())
      const classified = posterState(liveBytes, trim)
      if (classified.state === 'done') {
        rows.push({ trim, url, status: 'done', note: `already ${trim.approved.bytes} B` })
        continue
      }
      if (classified.state === 'changed') {
        rows.push({ trim, url, status: 'problem', note: changedNote(trim, classified) })
        continue
      }
      const result = await reencode(liveBytes, trim.settings)
      const problems = await reencodeProblems(liveBytes, result)
      const resultSha = sha256(result)
      if (problems.length > 0) {
        rows.push({ trim, url, status: 'problem', note: problems.join('; ') })
      } else if (resultSha !== trim.approved.sha256) {
        rows.push({
          trim,
          url,
          status: 'problem',
          note:
            `re-encoded to ${result.length} B (${resultSha}), expected ${trim.approved.bytes} B ` +
            `(${trim.approved.sha256})`,
        })
      } else {
        rows.push({
          trim,
          url,
          status: 'ready',
          note: `${liveBytes.length} B -> ${result.length} B`,
        })
      }
    }
  }
  return rows
}

function printDryRunTable(rows) {
  for (const row of rows) {
    console.log(
      `  ${row.trim.product.padEnd(8)} ${row.trim.colour.padEnd(14)} ${row.status.padEnd(8)} ${row.note}`,
    )
  }
}

/**
 * Hidden entry, character by character — same approach as
 * scripts/apply-footer-facts.mjs's readHidden, for the same reason: `readline`
 * echoes, which is correct for a `[y/N]` and wrong for a secret.
 *
 * Compared by CODE POINT, not by a literal control character in a string — Ctrl-D,
 * Ctrl-C and DEL are non-printing, and this repo's own tooling has already turned an
 * escaped invisible character into the literal byte on write (root CLAUDE.md,
 * "ESCAPES"); a numeric comparison keeps this file free of any invisible byte at all.
 */
const EOT = 4 // Ctrl-D
const ETX = 3 // Ctrl-C
const DEL = 127 // Backspace on most terminals; '\b' (8) covers the rest

const readHidden = (promptText) =>
  new Promise((resolve, reject) => {
    const input = process.stdin
    process.stdout.write(promptText)
    input.setRawMode(true)
    input.resume()
    input.setEncoding('utf8')
    let typed = ''
    const finish = (done) => {
      input.setRawMode(false)
      input.pause()
      input.off('data', onData)
      process.stdout.write('\n')
      done()
    }
    const onData = (chunk) => {
      for (const ch of chunk) {
        const code = ch.codePointAt(0)
        if (ch === '\r' || ch === '\n' || code === EOT) return finish(() => resolve(typed))
        if (code === ETX) return finish(() => reject(new Error('cancelled')))
        if (code === DEL || ch === '\b') typed = typed.slice(0, -1)
        else typed += ch
      }
    }
    input.on('data', onData)
  })

/**
 * Uploads and repoints. Steps 1 and 10 happen once; steps 2–9 repeat per PRODUCT
 * (GENTLE_TRIMS spans two: `r-asb`, two colourways; `r-wzu`, five), because
 * `colourways` PATCHes as one array per product — every trimmed colour on a product
 * goes in the SAME PATCH, never one PATCH per colour.
 *
 * Fixed 2026-09-23: the CURRENT poster is always read through the row's real
 * `posterPreview` relation (never a guessed filename), classified with
 * posterState() — done/ready/changed — and planned with planProductWrite() so a
 * product whose colours are all already 'done' sends no PATCH at all. Before any
 * upload, the Media library is checked for an existing upload that already carries
 * the approved bytes (findExistingUpload()), so a retry after a half-finished run
 * never uploads the same trim twice.
 *
 * Fixed 2026-09-23 (round 2, testability): every fatal condition throws `Stop`
 * instead of calling `process.exit` directly, and the key/trims this needs are
 * now PARAMETERS rather than only the module's own `API_KEY`/`GENTLE_TRIMS` —
 * both default to the real values, so the owner's invocation
 * (`node scripts/shrink-posters-gently.mjs --apply`, no arguments) is byte-for-byte
 * unchanged, while a test can call `apply('fake-test-key', [aTestTrim])` directly,
 * skip the interactive prompt entirely, and catch a Stop instead of losing the
 * test process to a real exit.
 *
 * @param {string} [providedKey] Supplied directly by a test; the owner's real
 *   invocation never passes this, so the hidden prompt below runs exactly as it
 *   always has.
 * @param {import('./shrink-posters-gently.d.mts').GentleTrim[]} [trims]
 * @returns {Promise<void>}
 */
export async function apply(providedKey, trims = GENTLE_TRIMS) {
  // Step 1: the key, hidden, never on the command line — see the file header.
  let key = providedKey ?? API_KEY
  if (!key) {
    if (!process.stdin.isTTY) {
      console.error('\nNo key, and this is not an interactive terminal.')
      console.error('Run it in your own Terminal so it can ask, or set CMS_API_KEY.')
      throw new Stop(2)
    }
    console.log('\nThe key is needed to upload posters and update products. It is not shown as')
    console.log(
      'you type, and it is not stored anywhere — not in this command, not in your history.\n',
    )
    key = (await readHidden('CMS API key (editor or admin): ')).trim()
    if (!key) {
      console.error('Nothing entered.')
      throw new Stop(2)
    }
  }
  if (looksLikeInstructionText(key)) {
    console.error('\nThat looks like instruction text rather than a key:')
    console.error(`  ${key}`)
    console.error('Run without CMS_API_KEY set and the script will ask for it instead.')
    throw new Stop(2)
  }
  // Only the real interactive/env path updates module state — a test's own key
  // must never leak into a later call that expects to prompt for one.
  if (!providedKey) API_KEY = key
  const auth = { Authorization: `users API-Key ${key}` }

  // Fetched at most once, lazily, the first time a colour actually needs an
  // upload — most runs (a clean first pass, or a full re-run once everything is
  // 'done') never need it at all.
  let mediaIndexPromise = null
  const getMediaIndex = () => (mediaIndexPromise ??= fetchMediaIndex(auth))

  for (const [product, productTrims] of groupByProduct(trims)) {
    console.log(`\n${product}:`)

    // Step 2.
    const found = await api(
      auth,
      'GET',
      `/api/products?where%5Bslug%5D%5Bequals%5D=${product}&depth=0&limit=1`,
    )
    if (!found.ok) return fail(found, `reading ${product}`)
    const doc = found.json?.docs?.[0]
    if (!doc) {
      console.error(`  no product with slug "${product}"`)
      throw new Stop(1)
    }
    const rowBySlug = new Map((doc.colourways ?? []).map((row) => [String(row.slug ?? ''), row]))

    // Step 3: each trimmed colour's CURRENT poster, read through its REAL
    // relation (never a guessed filename) and classified.
    const currentBytesByColour = new Map()
    const states = []
    for (const trim of productTrims) {
      const row = rowBySlug.get(trim.colour)
      if (!row) {
        console.error(`  no colourway "${trim.colour}" on ${product}`)
        throw new Stop(1)
      }
      const media = await api(auth, 'GET', `/api/media/${idOf(row.posterPreview)}?depth=0`)
      if (!media.ok) return fail(media, `reading the current poster for ${trim.colour}`)
      const currentUrl = media.json?.url
      if (!currentUrl) {
        console.error(`  ${trim.colour}: the current poster has no url. Stop.`)
        throw new Stop(1)
      }
      // M1 (2026-09-23): mirror dryRun()'s two checks on this same fetch (:587-606
      // above). Before this, a 403/404/5xx body — or an HTML challenge page — was
      // fed straight into posterState(), whose sha256 digest could not match
      // either known hash, so it was classified 'changed' and reported with
      // changedNote()'s wording: "It changed since this was written — re-run the
      // dry run first." Safe (the run still stops before any write) but the wrong
      // story — nothing changed, the fetch just failed. Name the status instead.
      const currentResponse = await fetch(currentUrl)
      if (!currentResponse.ok) {
        console.error(
          `  ${trim.colour}: the current poster answered ${currentResponse.status}. Stop — re-run the dry run first.`,
        )
        throw new Stop(1)
      }
      const currentContentType = currentResponse.headers.get('content-type') ?? ''
      if (!currentContentType.startsWith('image/webp')) {
        console.error(
          `  ${trim.colour}: the current poster's content-type is "${currentContentType}", not image/webp. Stop — re-run the dry run first.`,
        )
        throw new Stop(1)
      }
      const currentBytes = Buffer.from(await currentResponse.arrayBuffer())
      currentBytesByColour.set(trim.colour, currentBytes)
      states.push({ trim, ...posterState(currentBytes, trim) })
    }

    const plan = planProductWrite(states)
    if (plan.problems.length > 0) {
      for (const problem of plan.problems) console.error(`  ${problem}`)
      throw new Stop(1)
    }
    for (const done of plan.alreadyDone) {
      console.log(`  ${done.trim.colour}: already ${done.trim.approved.bytes} B — nothing to do.`)
    }
    if (!plan.needsWrite) {
      console.log(
        `  ${product}: every trimmed colour is already at the approved bytes — nothing to write.`,
      )
      continue
    }

    const idsBySlug = new Map()
    const newUrlByColour = new Map()

    for (const { trim } of plan.toTrim) {
      const row = rowBySlug.get(trim.colour)
      const currentBytes = currentBytesByColour.get(trim.colour)
      const result = await reencode(currentBytes, trim.settings)
      if (sha256(result) !== trim.approved.sha256) {
        console.error(`  ${trim.colour}: computed bytes do not match the approved trim. Stop.`)
        throw new Stop(1)
      }

      // Before uploading: has a previous, possibly interrupted run already put
      // this exact trim in the Media library under a Payload-suffixed filename?
      // Reuse it rather than creating a second duplicate.
      const existing = await findExistingUpload(await getMediaIndex(), trim)
      let newDoc
      if (existing) {
        newDoc = existing
        console.log(
          `  ${trim.colour}: reusing existing upload ${existing.id} — bytes already match the approved trim.`,
        )
      } else {
        // Step 4. Payload may add "-1" to the filename if one of this name
        // already exists (it does — the current poster). That is fine; newDoc.url
        // is read back, never assumed from the name sent.
        const form = new FormData()
        form.append('_payload', JSON.stringify({ alt: row.altText }))
        form.append(
          'file',
          new File([result], `${product}-${trim.colour}-poster.webp`, { type: 'image/webp' }),
        )
        const uploadResponse = await fetch(`${API_BASE}/api/media`, {
          method: 'POST',
          headers: auth,
          body: form,
        })
        const uploadBody = await uploadResponse.json()
        if (uploadResponse.status >= 300) {
          return fail(
            { status: uploadResponse.status, json: uploadBody },
            `uploading ${trim.colour}`,
          )
        }
        newDoc = uploadBody.doc ?? uploadBody

        // Step 5.
        const readBack = await fetch(newDoc.url)
        const readBackBytes = Buffer.from(await readBack.arrayBuffer())
        if (sha256(readBackBytes) !== trim.approved.sha256) {
          console.error(`  ${trim.colour}: uploaded, but the served bytes do not match. Stop.`)
          console.error('  The product was NOT patched.')
          throw new Stop(1)
        }
      }

      idsBySlug.set(trim.colour, newDoc.id)
      newUrlByColour.set(trim.colour, newDoc.url)
      // Step 8 (printed as we go, per colour, rather than batched at the end).
      console.log(`  ${trim.colour}: poster ${idOf(row.posterPreview)} -> ${newDoc.id}`)
    }

    // Step 6.
    const sentRows = repointedColourways(doc.colourways ?? [], idsBySlug)
    const patched = await api(auth, 'PATCH', `/api/products/${doc.id}`, { colourways: sentRows })
    if (!patched.ok) return fail(patched, `writing ${product}`)

    // Step 7.
    const reread = await api(auth, 'GET', `/api/products/${doc.id}?depth=0`)
    if (!reread.ok) return fail(reread, `reading ${product} back`)
    const problems = readBackProblems(sentRows, reread.json?.colourways ?? [])
    if (problems.length > 0) {
      console.error(`  read-back mismatch on ${product}:`)
      for (const problem of problems) console.error(`    - ${problem}`)
      throw new Stop(1)
    }
    console.log(`  ${product}: written and read back — every field matches.`)

    // Step 9. src/lib/content.ts caches public page content in-process for up to
    // 60 s (apps/cms/CLAUDE.md), so an admin read can see the PATCH well before an
    // anonymous visitor's request does.
    console.log('  waiting for the public payload to catch up…')
    let caughtUp = false
    for (let attempt = 0; attempt < 12; attempt++) {
      const publicResponse = await fetch(`${API_BASE}/api/public/viewer/${product}`)
      const publicBody = publicResponse.ok ? await publicResponse.json() : { colourways: [] }
      const posterUrlBySlug = new Map(
        (publicBody.colourways ?? []).map((c) => [String(c.slug ?? ''), c.poster?.url]),
      )
      if (
        plan.toTrim.every(
          ({ trim }) => posterUrlBySlug.get(trim.colour) === newUrlByColour.get(trim.colour),
        )
      ) {
        caughtUp = true
        break
      }
      if (attempt < 11) await sleep(10_000)
    }
    console.log(
      caughtUp
        ? '  the public payload now serves the new posters.'
        : '  ⚠️ the public payload still served the old poster after 120 s of polling — ' +
            'give it another minute and check by hand.',
    )
  }

  // Step 10.
  console.log('\nNothing was deleted. The old poster media documents are still in the CMS;')
  console.log('scripts/find-orphan-media.mjs will report them once nothing references them.')
}

async function main() {
  if (!API_BASE.startsWith('https://')) {
    console.error(
      `CMS_API_BASE must be https:// — the key travels in every request. Got "${API_BASE}"`,
    )
    process.exit(2)
  }
  if (APPLY) {
    await apply()
    return
  }
  const rows = await dryRun()
  printDryRunTable(rows)
  const problems = rows.filter((row) => row.status === 'problem')
  console.log(
    `\n${rows.length - problems.length}/${rows.length} ready or already done, ${problems.length} problem(s).`,
  )
  console.log('\nDry run only — nothing was uploaded or changed.')
  console.log('To apply: node scripts/shrink-posters-gently.mjs --apply')
  if (problems.length > 0) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // A Stop already printed everything the owner needs to see, at the throw
    // site — only the exit code is still owed. Anything else is unexpected, so
    // it gets the generic wrapper it always has.
    if (error instanceof Stop) {
      process.exit(error.code)
    }
    console.error(
      `shrink-posters-gently: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  })
}
