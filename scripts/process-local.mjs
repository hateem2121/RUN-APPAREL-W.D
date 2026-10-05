#!/usr/bin/env node
/**
 * Process ONE garment on this Mac exactly as the Cloudflare shrink robot would, and (with
 * --apply) hand the result to the CMS the way the robot does.
 *
 * WHY THIS EXISTS. Owner decision 2026-09-27: process the catalogue's CLO exports on the
 * owner's own Mac, not in the Cloudflare Container ($0 instead of container minutes). The
 * danger in a second route is drift — a Mac-made model that differs from a robot-made one
 * in a way nobody sees until a print looks wrong. So nothing here re-implements the robot:
 *
 *   - the processing is `shrinkFile()` (apps/shrink/container/shrink-file.ts), the robot's
 *     own body, moved out of server.ts on 2026-09-27 for exactly this caller;
 *   - the flags are `shrinkFlagsFor(autoDetailFor(...))` from packages/shared, as the Worker
 *     chooses them;
 *   - the refusals are the robot's five (size, torn artwork, see-through artwork, glTF spec,
 *     a stripped colour map) from apps/shrink/src/refusals.ts and specGate.ts;
 *   - the CMS writes follow apps/shrink/src/index.ts `processJob`: the Media doc with
 *     `artworkVerdict: 'ok'`, then `fileColours`, then `planColourImport`, then
 *     `planModelAttach` — each a separate PATCH, each READ BACK (a PATCH naming a field that
 *     does not exist answers 200 and stores nothing: apps/cms/CLAUDE.md).
 *
 * WHAT IT REFUSES, before it spends a minute of CPU:
 *   - pipeline output as input (a second pass drops artwork protection — root CLAUDE.md 🔴;
 *     the guard-pipeline-input hook cannot see a library call, so this script checks itself);
 *   - a Mac whose pipeline packages differ from the container's lockfile (plan R7);
 *   - a live garment whose raw export does not match its fingerprint in raw/CANONICAL.json
 *     (plan R6) — a different export would be a different garment under the same name;
 *   - a garment folder with no zip, or more than one.
 *
 * THE OWNER'S FOLDER IS NEVER WRITTEN. The zip is COPIED to a scratch folder outside the
 * repo and the copy is unzipped; the unzipped raw is deleted when the run ends. The raw CLO
 * exports in that folder are the only copy that exists (root CLAUDE.md).
 *
 * A LIVE garment is never changed here. The robot refuses to attach a model or import colours
 * to a published product, and so does this; for a published garment this script also leaves
 * `fileColours` alone (the robot would write it) — the live swap is its own deliberate step.
 *
 * Usage (tsx is needed because this imports the pipeline's TypeScript; run from
 * tools/asset-pipeline so `--import tsx` resolves):
 *
 *   cd tools/asset-pipeline && node --import tsx ../../scripts/process-local.mjs <slug> \
 *     [--folder "<folder name>"] [--flags "--normal-scale 0.5"] [--apply] [--keep-raw]
 *
 * Dry run by default: processes, checks and reports, writes nothing anywhere but scratch.
 * The CMS key comes from $CMS_API_KEY or the macOS Keychain (service
 * run-apparel-cms-api-key, account cms). It is never printed.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defaultScratchRoot,
  modelKeyFor,
  PIPELINE_PACKAGES,
  pickSingle,
  pipelineOutputReason,
  sourceReferenceFor,
  squashName,
  versionMismatches,
  withNamePlan,
} from './process-local-lib.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const PIPELINE = join(REPO, 'tools', 'asset-pipeline')
const OWNER_FOLDER =
  process.env.GARMENT_SOURCE_DIR ?? '/Users/hateemjamshaid/Documents/3D Catalouge Products'
const CMS = process.env.CMS_ORIGIN ?? 'https://cms.wear-run.help'
// The user's own cache, not the shared temp folder — defaultScratchRoot says why.
const SCRATCH_ROOT = resolve(defaultScratchRoot(process.env, homedir()))
const CMS_TIMEOUT_MS = 120_000

// ── Arguments ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const slug = argv.find(
  (a) =>
    !a.startsWith('--') &&
    argv[argv.indexOf(a) - 1] !== '--folder' &&
    argv[argv.indexOf(a) - 1] !== '--flags',
)
const option = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const APPLY = argv.includes('--apply')
const KEEP_RAW = argv.includes('--keep-raw')
const extraFlags = (option('--flags') ?? '').split(/\s+/).filter(Boolean)
if (!slug) {
  console.error(
    'usage: process-local.mjs <slug> [--folder "<name>"] [--flags "..."] [--apply] [--keep-raw]',
  )
  process.exit(2)
}

/**
 * A refusal THROWS rather than exiting: `process.exit()` skips `finally`, and the clean-up
 * that deletes the unzipped raw copy lives in one. The bottom of the file catches it.
 */
class Refused extends Error {}
function refuse(message) {
  throw new Refused(message)
}

async function main() {
  // Scratch must be outside both the owner's folder and the repo: nothing may land in either.
  for (const [label, root] of [
    ['the owner’s garment folder', resolve(OWNER_FOLDER)],
    ['the repository', resolve(REPO)],
  ]) {
    if (!relative(root, SCRATCH_ROOT).startsWith('..'))
      refuse(`scratch ${SCRATCH_ROOT} is inside ${label}`)
  }

  // ── The CMS ───────────────────────────────────────────────────────────────────
  function apiKey() {
    if (process.env.CMS_API_KEY) return process.env.CMS_API_KEY
    try {
      return execFileSync(
        'security',
        ['find-generic-password', '-s', 'run-apparel-cms-api-key', '-a', 'cms', '-w'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim()
    } catch {
      refuse(
        'no CMS key: set CMS_API_KEY or add it to the Keychain (service run-apparel-cms-api-key, account cms)',
      )
    }
  }
  const KEY = apiKey()

  async function cms(path, init = {}) {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `users API-Key ${KEY}`)
    const res = await fetch(`${CMS}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(CMS_TIMEOUT_MS),
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    if (!res.ok) {
      // Payload's outer message never names the field; the inner one does.
      const inner = json?.errors?.[0]?.data?.errors
        ?.map((e) => `${e.path}: ${e.message}`)
        .join('; ')
      throw new Error(
        `${init.method ?? 'GET'} ${path} → ${res.status}: ${inner || text.slice(0, 300)}`,
      )
    }
    return json
  }

  async function readProduct() {
    const q = new URLSearchParams({ 'where[slug][equals]': slug, depth: '0', limit: '1' })
    const found = await cms(`/api/products?${q}`)
    const doc = found?.docs?.[0]
    if (!doc) refuse(`no product with slug "${slug}"`)
    return doc
  }

  const patchProduct = (id, data) =>
    cms(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })

  // ── Files ─────────────────────────────────────────────────────────────────────
  function sha256Of(path) {
    return new Promise((ok, fail) => {
      const hash = createHash('sha256')
      createReadStream(path)
        .on('data', (chunk) => hash.update(chunk))
        .on('end', () => ok(hash.digest('hex')))
        .on('error', fail)
    })
  }

  function findFiles(dir, extension) {
    const out = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__MACOSX' || entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) out.push(...findFiles(full, extension))
      else if (entry.name.toLowerCase().endsWith(extension)) out.push(full)
    }
    return out
  }

  function installedVersion(name) {
    const file = join(PIPELINE, 'node_modules', name, 'package.json')
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).version : null
  }

  // ── Run ───────────────────────────────────────────────────────────────────────
  const now = new Date()
  const commit = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  // 1. The container's versions, before anything else costs time.
  const lock = JSON.parse(readFileSync(join(PIPELINE, 'package-lock.json'), 'utf8'))
  const installed = Object.fromEntries(PIPELINE_PACKAGES.map((n) => [n, installedVersion(n)]))
  const drift = versionMismatches(installed, lock)
  if (drift.length) refuse(`this Mac's pipeline differs from the robot's:\n  ${drift.join('\n  ')}`)

  // 2. The product, and the folder its export lives in.
  const product = await readProduct()
  const folders = readdirSync(OWNER_FOLDER, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
  const wanted = option('--folder')
  const folderMatches = wanted
    ? folders.filter((f) => f === wanted)
    : folders.filter((f) => squashName(f) === squashName(product.productName))
  if (folderMatches.length !== 1) {
    refuse(
      `${folderMatches.length} garment folders match "${wanted ?? product.productName}" — pass --folder "<exact name>"`,
    )
  }
  const folder = join(OWNER_FOLDER, folderMatches[0])
  const zip = pickSingle(readdirSync(folder), '.zip')
  if ('error' in zip) refuse(`${folderMatches[0]}: ${zip.error}`)

  // 3. Copy the zip OUT of the owner's folder and unzip the copy.
  const scratch = join(SCRATCH_ROOT, slug)
  rmSync(scratch, { recursive: true, force: true })
  mkdirSync(join(scratch, 'unzipped'), { recursive: true })
  const zipCopy = join(scratch, zip.name)
  copyFileSync(join(folder, zip.name), zipCopy)
  const zipBytes = statSync(zipCopy).size
  const unzip = spawnSync('unzip', ['-q', zipCopy, '-d', join(scratch, 'unzipped')], {
    stdio: 'inherit',
  })
  if (unzip.status !== 0) refuse(`unzip failed on the scratch copy of ${zip.name}`)
  rmSync(zipCopy)
  const glbs = findFiles(join(scratch, 'unzipped'), '.glb')
  if (glbs.length !== 1) refuse(`the export holds ${glbs.length} .glb files, not one`)
  const raw = glbs[0]
  const rawBytes = statSync(raw).size

  const cleanup = () => {
    if (!KEEP_RAW) rmSync(join(scratch, 'unzipped'), { recursive: true, force: true })
  }

  try {
    // 4. Raw export only — never pipeline output.
    const { readGltfJson } = await import('../tools/asset-pipeline/src/describe.ts')
    const outputReason = pipelineOutputReason(await readGltfJson(raw))
    if (outputReason) refuse(`the export is pipeline output, not a raw CLO export: ${outputReason}`)

    // 5. For a garment with a fingerprint, the export must be THAT export.
    const sha256 = await sha256Of(raw)
    const canonical = JSON.parse(readFileSync(join(REPO, 'raw', 'CANONICAL.json'), 'utf8'))
      .garments?.[slug]
    if (canonical && (canonical.sha256 !== sha256 || canonical.bytes !== rawBytes)) {
      refuse(
        `raw/CANONICAL.json fingerprints ${slug} as ${canonical.bytes} bytes / ${canonical.sha256.slice(0, 16)}…, ` +
          `this export is ${rawBytes} bytes / ${sha256.slice(0, 16)}…`,
      )
    }
    const provenance = canonical ? 'matches raw/CANONICAL.json' : 'no fingerprint on record'

    // 6. The robot's processing, with the robot's flags.
    const { autoDetailFor, DEFAULT_SHRINK_DETAIL, shrinkFlagsFor, GLB_HARD_MAX_BYTES } =
      await import('../packages/shared/src/index.ts')
    const { shrinkFile } = await import('../apps/shrink/container/shrink-file.ts')
    const detail = autoDetailFor(DEFAULT_SHRINK_DETAIL, rawBytes)
    const flags = [...shrinkFlagsFor(detail), ...extraFlags]
    const key = modelKeyFor(slug, now)
    mkdirSync(join(SCRATCH_ROOT, 'finished'), { recursive: true })
    const out = join(SCRATCH_ROOT, 'finished', key.replace(/\.glb$/, '-optimized.glb'))
    console.log(
      `${slug}: ${folderMatches[0]} → ${(rawBytes / 1e6).toFixed(1)} MB raw (${provenance}), detail ${detail}` +
        (extraFlags.length ? `, extra flags ${extraFlags.join(' ')}` : ''),
    )
    const started = Date.now()
    const { bytes, report } = await shrinkFile(raw, out, flags, key)
    const seconds = Math.round((Date.now() - started) / 1000)

    // 7. The robot's refusals, in the robot's order.
    const { sizeRefusal, artworkRefusal, alphaRefusal, repairRefusal } = await import(
      '../apps/shrink/src/refusals.ts'
    )
    const { specRefusal } = await import('../apps/shrink/src/specGate.ts')
    const refusal =
      sizeRefusal(report.sizeBytes, detail) ??
      artworkRefusal(report.simplify?.artworkAtRisk) ??
      alphaRefusal(report.artworkAlphaProblems) ??
      specRefusal(report.spec) ??
      repairRefusal(report.repair)

    // 8. The private report: next to the finished file, never in the repo.
    mkdirSync(join(SCRATCH_ROOT, 'reports'), { recursive: true })
    const summary = {
      slug,
      productId: product.id,
      status: product.status,
      folder: folderMatches[0],
      zip: zip.name,
      zipBytes,
      rawBytes,
      sha256,
      provenance,
      detail,
      flags,
      seconds,
      out,
      sizeBytes: bytes.length,
      limitBytes: GLB_HARD_MAX_BYTES,
      refusal,
      commit,
    }
    writeFileSync(
      join(SCRATCH_ROOT, 'reports', `${slug}.json`),
      JSON.stringify({ summary, report: { ...report, text: undefined } }, null, 2),
    )
    writeFileSync(join(SCRATCH_ROOT, 'reports', `${slug}.txt`), String(report.text))
    console.log(
      `${slug}: ${(bytes.length / 1e6).toFixed(2)} MB in ${seconds} s, family ${report.family}, ` +
        `spec ${report.spec?.errors ?? '?'} errors, variants ${JSON.stringify(report.variantsInFileOrder ?? report.variants)}`,
    )
    if (refusal) refuse(`the robot would refuse this file:\n${refusal}`)

    // The colour words: the owner's plan where one exists (see withNamePlan), checked on a
    // dry run too, so a plan that does not fit the file is caught before anything is written.
    const { toFileColours, buildImportedRow } = await import('../packages/shared/src/index.ts')
    const namePlan = JSON.parse(readFileSync(join(REPO, 'scripts', 'colourway-names.json'), 'utf8'))
      .products?.[slug]
    const named = withNamePlan(toFileColours(report.variantColours), namePlan)
    if ('error' in named) refuse(`scripts/colourway-names.json: ${named.error}`)
    const previewRows = []
    for (const c of named.colours) previewRows.push(buildImportedRow(c, previewRows))
    console.log(
      `${slug}: colour rows ${namePlan ? 'from scripts/colourway-names.json' : "from the robot's sampler (no plan)"}: ` +
        previewRows.map((r) => `${r.variantId}=${r.slug || '(blank)'}`).join(', '),
    )

    if (!APPLY) {
      console.log(
        `${slug}: dry run — nothing written to the CMS. Report: ${join(SCRATCH_ROOT, 'reports', `${slug}.txt`)}`,
      )
      return
    }

    // 9. The Media doc, exactly as the robot creates it, then read back.
    const { describeModel, planModelAttach } = await import('../apps/shrink/src/attach.ts')
    const { planColourImport } = await import('../apps/shrink/src/colourImport.ts')
    const filename = String(report.suggestedFilename)
    const sourceReference = sourceReferenceFor({ zipName: zip.name, zipBytes, sha256, commit, now })
    const form = new FormData()
    form.append(
      '_payload',
      JSON.stringify({
        alt: describeModel({
          productCode: product.productCode ?? null,
          detail,
          sizeBytes: bytes.length,
          suggestedFilename: filename,
          now,
        }),
        artworkVerdict: 'ok',
        sourceReference,
      }),
    )
    form.append('file', new Blob([bytes], { type: 'model/gltf-binary' }), filename)
    const created = await cms('/api/media', { method: 'POST', body: form })
    const mediaId = created?.doc?.id
    if (mediaId == null) refuse('the CMS created no Media doc')
    const media = await cms(`/api/media/${mediaId}?depth=0`)
    if (media.filesize !== bytes.length) {
      refuse(`Media #${mediaId} stored ${media.filesize} bytes, not ${bytes.length}`)
    }
    // A plain GET, never HEAD: on this domain they hit different edge cache entries.
    const served = await fetch(media.url, { signal: AbortSignal.timeout(CMS_TIMEOUT_MS) })
    const servedBytes = (await served.arrayBuffer()).byteLength
    if (!served.ok || servedBytes !== bytes.length) {
      refuse(`${media.url} answered ${served.status} with ${servedBytes} bytes`)
    }
    console.log(
      `${slug}: Media #${mediaId} ${media.url} (GET ${served.status}, ${served.headers.get('cf-cache-status')})` +
        (media.sourceReference === sourceReference
          ? ', provenance stored'
          : ', provenance NOT readable back'),
    )

    // 10. The product: a LIVE one is never touched here.
    const fresh = await readProduct()
    const target = {
      productCode: fresh.productCode ?? null,
      status: fresh.status ?? null,
      hasGlbAsset: fresh.glbAsset != null && fresh.glbAsset !== '',
      colourwayCount: Array.isArray(fresh.colourways) ? fresh.colourways.length : 0,
      // The colour import names the colours in this category's style, as the robot does
      // (polish N2, packages/shared/src/colourNames.ts); a plan's family words are renamed too.
      category: typeof fresh.category === 'string' ? fresh.category : null,
    }
    if (target.status === 'published') {
      console.log(
        `${slug}: LIVE — Media #${mediaId} made, product untouched (the live swap is a separate step).`,
      )
      return
    }

    const fileColours = report.variantsInFileOrder ?? report.variants ?? []
    if (fileColours.length > 0) {
      await patchProduct(fresh.id, {
        fileColours,
        ...(report.variantColours?.length ? { fileColourDetails: report.variantColours } : {}),
      })
      const back = await readProduct()
      if (JSON.stringify(back.fileColours) !== JSON.stringify(fileColours)) {
        refuse(
          `fileColours did not store: sent ${JSON.stringify(fileColours)}, read ${JSON.stringify(back.fileColours)}`,
        )
      }
    }

    const colourPlan = planColourImport(target, named.colours)
    if (colourPlan.rows?.length) {
      await patchProduct(fresh.id, { colourways: colourPlan.rows })
      const back = await readProduct()
      if ((back.colourways ?? []).length !== colourPlan.rows.length) {
        refuse(
          `colour import did not store: sent ${colourPlan.rows.length} rows, read ${(back.colourways ?? []).length}`,
        )
      }
    }

    const attach = planModelAttach(fresh.id, target)
    if (attach.attach) {
      await patchProduct(fresh.id, { glbAsset: mediaId })
      const back = await readProduct()
      if (String(back.glbAsset) !== String(mediaId))
        refuse(`glbAsset did not store: read ${back.glbAsset}`)
    }
    console.log(
      `${slug}: done — fileColours ${fileColours.length}, colour rows ${colourPlan.rows?.length ?? 0}` +
        `${colourPlan.rows ? '' : ` (${colourPlan.note.trim() || 'none'})`}, model ${attach.attach ? 'attached' : `not attached: ${attach.note.trim()}`}`,
    )
  } finally {
    cleanup()
  }
}

try {
  await main()
} catch (error) {
  if (!(error instanceof Refused)) throw error
  console.error(`\nREFUSED (${slug}): ${error.message}`)
  process.exitCode = 1
}
