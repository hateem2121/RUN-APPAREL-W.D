/**
 * The website build's fingerprint (site speed plan, owner's yes 4 Nov 2026): what a kept page and a
 * kept tap are keyed by instead of the deploy, and what Next uses as its build ID.
 *
 * WHY. The page store named the deploy (CF_VERSION_METADATA) in every key, so every deploy retired
 * every kept page, including the merges that changed only garment pages. Measured 4 Nov, 45 minutes
 * after the 18:08 deploy (#318): 33 of the 43 website pages were cold, each 0.66-3.12 s to the first
 * byte against about 0.05 s once kept, and Workers logs had a home-page drawing at a median 1,960 ms.
 * The deploy was in the key for one reason: a page from the last build names script files the new
 * build no longer has. This fingerprint changes exactly when those files or the code that draws the
 * pages can change, and not otherwise.
 *
 * HOW, in two halves:
 * - `siteSourceBuildId()` hashes git's own content ids (tree and blob hashes) of everything the
 *   website is built from (SITE_SOURCE_PATHS). next.config.mjs hands it to Next as the build ID, so
 *   the build ID in every page and every tap answer is the same across two builds of the same code.
 *   Without that, Next makes a random build ID per build and a kept page's links would load whole
 *   pages instead of taps. It returns null (Next's random ID, so nothing is kept across deploys) when
 *   git cannot answer or any of those paths has uncommitted changes: HEAD's ids would then describe
 *   code that is not the code being built.
 * - `siteBuildKey()` runs after the build and adds a hash of the built script and style file names,
 *   so if two builds of the same code ever named their files differently, the key would differ too
 *   and nothing could ask for a missing file. The deploy passes it to the Worker as SITE_BUILD.
 *
 * ⚠️ MEASURED BEFORE BUILDING (4 Nov 2026, this Mac, Next 16.4.3, OpenNext 1.20.13): two builds of
 * one commit gave identical names for all 229 files under .open-next/assets apart from the three in
 * the build-ID folder; with the build ID pinned, all 232 matched. The server bundle never matches
 * byte for byte (`__BUILD_TIMESTAMP_MS__` and the order of two route manifests), which is why the
 * key hashes the SOURCE for the server half rather than the bundle.
 *
 * Plain Node, run at build and deploy time only: worker.mjs never imports it (it reads SITE_BUILD).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')

/**
 * Everything the website build reads, from the repository root. apps/cms may import only
 * packages/shared and packages/ui from elsewhere (biome.jsonc noRestrictedImports); the root files
 * set the tool and package versions. A path that is not here and changes the pages would serve old
 * pages until the next fingerprint change, so src/siteBuild.test.ts fails if apps/cms gains a
 * workspace dependency outside this list.
 */
export const SITE_SOURCE_PATHS = Object.freeze([
  'apps/cms',
  'packages/shared',
  'packages/ui',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
])

/** The only shape SITE_BUILD may have; pageCache.mjs keptBuild ignores anything else. */
export const SITE_BUILD_PATTERN = /^site-[0-9a-f]{20}\.[0-9a-f]{12}$/

/** Where OpenNext leaves the build ID and the built files (relative to apps/cms). */
export const BUILD_ID_FILE = '.open-next/server-functions/default/apps/cms/.next/BUILD_ID'
export const ASSETS_DIR = '.open-next/assets/_next/static'

/**
 * The build's name as a FILE among the site's static files (front door, 20 Nov 2026): the door
 * Worker (door.mjs) asks for `/__site-build.txt` to learn which website build is live. It is a
 * static file on purpose: Cloudflare serves it with the deployed version's other files and without
 * starting the site's Worker, so it changes at the very moment the pages' script files do, and a
 * door that is a separate deploy can never name the wrong build. Outside `_next/static`, so it is
 * not one of the file names the fingerprint is made from. The name is already public: every page
 * answers with it in `Server-Timing`.
 */
export const SITE_BUILD_ASSET = '.open-next/assets/__site-build.txt'
/** What the file says when the build carries no fingerprint: the door then hands every page on. */
export const NO_SITE_BUILD = 'per-deploy'

const sha256 = (text) => createHash('sha256').update(text).digest('hex')

/** `git -C <repo> <args>`, trimmed; throws when git does. */
function runGit(args) {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' }).trim()
}

/**
 * ⚠️ ONE SOURCE, TWO BUILDS, TWO NAMES (the admin split, 22 Nov 2026). The same commit is built
 * twice: whole, for the CMS Worker, and with `SITE_ONLY=1` for the site-only Worker, which leaves
 * out the admin and the CMS API (next.config.mjs `pageExtensions`). Measured that day on one
 * commit: the two builds shared 264 browser files and the site-only build had 7 script files the
 * whole build did not. With one build id for both, a visitor moved from one Worker to the other
 * (the front door's switch, door.mjs) would keep tapping between pages whose script files the
 * other Worker does not have. A name of its own makes Next load the whole page instead, as it
 * does after any deploy that changed the website.
 */
export const SITE_ONLY_FLAVOUR = 'site-only'

/**
 * Which build this process is making: '' for the whole app, SITE_ONLY_FLAVOUR for the site-only one.
 * @param {{ SITE_ONLY?: string }} [env]
 */
export function buildFlavour(env = process.env) {
  return env.SITE_ONLY === '1' ? SITE_ONLY_FLAVOUR : ''
}

/**
 * The source half: `site-` and 20 hex digits, or null when it cannot be trusted.
 * @param {(args: string[]) => string} [git] for the tests
 * @param {string} [flavour] '' or SITE_ONLY_FLAVOUR; read from SITE_ONLY when not given
 */
export function siteSourceBuildId(git = runGit, flavour = buildFlavour()) {
  try {
    if (git(['status', '--porcelain', '--', ...SITE_SOURCE_PATHS]) !== '') return null
    const ids = SITE_SOURCE_PATHS.map((path) => `${path} ${git(['rev-parse', `HEAD:${path}`])}`)
    // The site-only build gets a name of its own (the note on SITE_ONLY_FLAVOUR, below).
    if (flavour) ids.push(`flavour ${flavour}`)
    return `site-${sha256(ids.join('\n')).slice(0, 20)}`
  } catch {
    return null
  }
}

/** Every file name under `dir`, relative and sorted, so the order never depends on the disk. */
export function builtFileNames(dir) {
  const names = []
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name)
      if (entry.isDirectory()) walk(path)
      else names.push(relative(dir, path).split('\\').join('/'))
    }
  }
  walk(dir)
  return names.sort()
}

/**
 * The key a deploy hands the Worker: the build ID and 12 hex digits of the built file names, or
 * null when the build ID is not a fingerprint (then the Worker keys by the deploy, as before).
 */
export function siteBuildKey(buildId, fileNames) {
  if (!/^site-[0-9a-f]{20}$/.test(buildId ?? '')) return null
  return `${buildId}.${sha256(fileNames.join('\n')).slice(0, 12)}`
}

/** Read this build's key off the OpenNext output in `cmsDir`; null when it has none. */
export function siteBuildKeyOf(cmsDir = HERE) {
  const idFile = join(cmsDir, BUILD_ID_FILE)
  const assets = join(cmsDir, ASSETS_DIR)
  if (!existsSync(idFile) || !existsSync(assets)) return null
  return siteBuildKey(readFileSync(idFile, 'utf8').trim(), builtFileNames(assets))
}

/**
 * Write the build's name where the door reads it; returns what it wrote. Nothing is written when
 * there is no built site to put it in.
 */
export function writeSiteBuildAsset(cmsDir = HERE) {
  const assets = join(cmsDir, dirname(SITE_BUILD_ASSET))
  if (!existsSync(assets)) return null
  const name = siteBuildKeyOf(cmsDir) ?? NO_SITE_BUILD
  writeFileSync(join(cmsDir, SITE_BUILD_ASSET), name)
  return name
}

/*
 * `node siteBuild.mjs` prints the `--var` argument for `wrangler deploy` (package.json "deploy"), or
 * a variable that keys by the deploy when the build carries no fingerprint. It prints only the key,
 * which is a hash of public source: nothing secret can reach the public Actions log this way.
 * The same run writes the name among the static files (writeSiteBuildAsset), so the Worker's
 * variable and the file the front door reads are one value from one command and cannot differ.
 */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`SITE_BUILD:${writeSiteBuildAsset() ?? siteBuildKeyOf() ?? NO_SITE_BUILD}`)
}
