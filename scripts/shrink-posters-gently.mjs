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
export const MEDIA_ORIGIN = 'https://media.wear-run.help'
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

function fail(response, doing) {
  console.error(`\nCould not finish ${doing} (${response.status}): ${explain(response.json)}`)
  if (response.status === 401 || response.status === 403) {
    console.error('  This step needs an editor or admin key.')
    console.error('  (Reading needs only a recognised key — if reading also failed, the key')
    console.error("  itself isn't recognised at all, not just short of the right role.)")
  }
  process.exit(1)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The live URL for one GENTLE_TRIMS entry's poster, as a browser or QR scan loads
 * it — the same naming convention scripts/upload-posters.mjs uses.
 */
const liveUrl = (trim) => `${MEDIA_ORIGIN}/${trim.product}-${trim.colour}-poster.webp`

/**
 * All network, no writes. Fetches each live poster once, and either finds it already
 * at the approved bytes ("done") or re-encodes the fetched bytes and checks the
 * result against the approved sha ("ready"). Never fetches by GUESSING what changed
 * — a poster whose live sha matches neither the known original nor the approved trim
 * is reported as a problem instead of silently re-encoded, because at that point this
 * script no longer knows what picture it is looking at.
 */
async function dryRun() {
  const rows = []
  for (const trim of GENTLE_TRIMS) {
    const url = liveUrl(trim)
    const response = await fetch(url)
    if (!response.ok) {
      rows.push({ trim, url, status: 'problem', note: `poster answered ${response.status}` })
      continue
    }
    const contentType = response.headers.get('content-type') ?? ''
    const liveBytes = Buffer.from(await response.arrayBuffer())
    const liveSha = sha256(liveBytes)
    if (!contentType.startsWith('image/webp')) {
      rows.push({
        trim,
        url,
        status: 'problem',
        note: `content-type is "${contentType}", not image/webp`,
      })
      continue
    }
    if (liveSha === trim.approved.sha256) {
      rows.push({ trim, url, status: 'done', note: `already ${trim.approved.bytes} B` })
      continue
    }
    if (liveSha !== trim.original.sha256) {
      rows.push({
        trim,
        url,
        status: 'problem',
        note: `live sha ${liveSha} matches neither the known original nor the approved trim — the poster changed since this task was written`,
      })
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
      rows.push({ trim, url, status: 'ready', note: `${liveBytes.length} B -> ${result.length} B` })
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
 */
async function apply() {
  // Step 1: the key, hidden, never on the command line — see the file header.
  let key = API_KEY
  if (!key) {
    if (!process.stdin.isTTY) {
      console.error('\nNo key, and this is not an interactive terminal.')
      console.error('Run it in your own Terminal so it can ask, or set CMS_API_KEY.')
      process.exit(2)
    }
    console.log('\nThe key is needed to upload posters and update products. It is not shown as')
    console.log(
      'you type, and it is not stored anywhere — not in this command, not in your history.\n',
    )
    key = (await readHidden('CMS API key (editor or admin): ')).trim()
    if (!key) {
      console.error('Nothing entered.')
      process.exit(2)
    }
  }
  if (looksLikeInstructionText(key)) {
    console.error('\nThat looks like instruction text rather than a key:')
    console.error(`  ${key}`)
    console.error('Run without CMS_API_KEY set and the script will ask for it instead.')
    process.exit(2)
  }
  API_KEY = key
  const auth = { Authorization: `users API-Key ${API_KEY}` }

  const byProduct = new Map()
  for (const trim of GENTLE_TRIMS) {
    const list = byProduct.get(trim.product) ?? []
    list.push(trim)
    byProduct.set(trim.product, list)
  }

  for (const [product, trims] of byProduct) {
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
      process.exit(1)
    }
    const rowBySlug = new Map((doc.colourways ?? []).map((row) => [String(row.slug ?? ''), row]))

    const idsBySlug = new Map()
    const newUrlByColour = new Map()

    for (const trim of trims) {
      const row = rowBySlug.get(trim.colour)
      if (!row) {
        console.error(`  no colourway "${trim.colour}" on ${product}`)
        process.exit(1)
      }

      // Step 3: the row's CURRENT poster must be the live poster this was planned
      // against — guards against a concurrent edit between the dry run and --apply.
      const media = await api(auth, 'GET', `/api/media/${idOf(row.posterPreview)}?depth=0`)
      if (!media.ok) return fail(media, `reading the current poster for ${trim.colour}`)
      const expectedUrl = liveUrl(trim)
      if (media.json?.url !== expectedUrl) {
        console.error(
          `  ${trim.colour}: live poster is ${media.json?.url}, expected ${expectedUrl} — ` +
            'it changed since this was written. Stop, and re-run the dry run first.',
        )
        process.exit(1)
      }

      const liveResponse = await fetch(expectedUrl)
      const liveBytes = Buffer.from(await liveResponse.arrayBuffer())
      const result =
        sha256(liveBytes) === trim.approved.sha256
          ? liveBytes
          : await reencode(liveBytes, trim.settings)
      if (sha256(result) !== trim.approved.sha256) {
        console.error(`  ${trim.colour}: computed bytes do not match the approved trim. Stop.`)
        process.exit(1)
      }

      // Step 4. Payload may add "-1" to the filename if one of this name already
      // exists (it does — the current poster). That is fine; newDoc.url is read
      // back, never assumed from the name sent.
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
        return fail({ status: uploadResponse.status, json: uploadBody }, `uploading ${trim.colour}`)
      }
      const newDoc = uploadBody.doc ?? uploadBody

      // Step 5.
      const readBack = await fetch(newDoc.url)
      const readBackBytes = Buffer.from(await readBack.arrayBuffer())
      if (sha256(readBackBytes) !== trim.approved.sha256) {
        console.error(`  ${trim.colour}: uploaded, but the served bytes do not match. Stop.`)
        console.error('  The product was NOT patched.')
        process.exit(1)
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
      process.exit(1)
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
        trims.every((trim) => posterUrlBySlug.get(trim.colour) === newUrlByColour.get(trim.colour))
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
    console.error(
      `shrink-posters-gently: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  })
}
