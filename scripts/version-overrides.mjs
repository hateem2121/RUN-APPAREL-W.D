#!/usr/bin/env node
/**
 * Test each new Worker version BEFORE visitors get it (owner decision, 2026-11-07).
 *
 *   node scripts/version-overrides.mjs stage   <worker> <package-dir> <tag> [config]  → prints old=…, new=…
 *   node scripts/version-overrides.mjs verify                                 (reads CF_VERSION_PAIRS)
 *   node scripts/version-overrides.mjs promote <worker> <package-dir> <version-id> [config]
 *   node scripts/version-overrides.mjs unstage <worker> <package-dir> <old-version-id> [config]
 *
 * `[config]` names a wrangler config file in the package directory, for a Worker that is not the
 * directory's default one: the front door is `apps/cms` + `wrangler.door.jsonc`. It matters because
 * `versions deploy` also writes the config's non-versioned settings (logging) onto the Worker it
 * names, and without it the door would be given the site Worker's.
 *
 * WHY. Of 73 ci.yml runs on `main` from 25 Oct to 7 Nov, 8 deploys needed fixing ("Deploy failed"
 * issues), and in 3 of the 4 opened the failing step was a check that runs AFTER the deploy — the
 * broken version had already reached visitors. Cloudflare's method (Gradual deployments; Version
 * overrides, both read 2026-11-07): upload the new version without deploying it, deploy it at 0%
 * beside the live one at 100%, send the checks to it with `Cloudflare-Workers-Version-Overrides`,
 * then move it to 100%. Going 0% → 100% (never a split) keeps the version-skew window of the
 * 21 Oct 3D-fallback incident no longer than a plain deploy's. Preview URLs stay off.
 *
 * ⚠️ AN OVERRIDE THAT IS NOT APPLIED FAILS SILENTLY: Cloudflare then routes "according to the
 * percentages", i.e. to the OLD version, and every check would pass against what is already live.
 * `verify` therefore asks each Worker's version address (apps/cms/workerVersion.mjs,
 * apps/viewer/worker/workerVersion.ts) WITH the header, expecting the new id, and WITHOUT it,
 * expecting the old one — a negative control on every deploy. scripts/version-overrides-preload.mjs
 * adds the header to the check scripts' own requests.
 *
 * ⚠️ AN OVERRIDE CAN BE IGNORED FOR A FEW SECONDS AFTER STAGING, and that is waiting, not breaking.
 * Cloudflare documents it (Workers docs, "Version overrides", read 2026-11-18): the location handling
 * the request "may not include the version. This can happen while a deployment change spreads across
 * the network", and "an ignored override can still return a successful response". Main run
 * 44296435136 (PR #421's merge, 18 Nov 2026) asked the viewer 3.45 s after staging it, got the OLD
 * version's answer, and stopped the deploy; the two deploys before it had passed at 3.65 s and 4.15 s,
 * and the re-run passed. So `verify` asks the WITH-header question again, up to about 30 s in all,
 * but only while the answer is exactly what the OLD version gives. Any other wrong answer fails at
 * once, and an override that never lands still fails when the waits run out.
 *
 * Exit codes: 0 done; 1 a check failed (a wrong version answered, or wrangler refused); 2 bad
 * arguments or an answer wrangler documents differently. A 403/429/503 from Bot Fight Mode is
 * INCONCLUSIVE (.github/CLAUDE.md), never "wrong version": ::warning:: and exit 0.
 */
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const HEADER = 'Cloudflare-Workers-Version-Overrides'

/** Where each Worker answers which version it is (both through the public hosts). */
export const VERSION_URLS = {
  'run-apparel-viewer-cms': 'https://cms.wear-run.help/__worker/version',
  'run-apparel-viewer-site': 'https://wear-run.com/products/__worker/version',
  // The front door (apps/cms/door.mjs DOOR_VERSION_PATH), staged with the other two since
  // 21 Nov 2026 so the pre-live checks pass through the NEW door, not the live one.
  'run-apparel-site-door': 'https://wear-run.com/products/__door/version',
  // The site-only Worker (apps/cms/wrangler.site.jsonc, the admin split of 22 Nov 2026). It has no
  // address of its own: the door hands this one to it over a binding, and a request carrying the
  // override header is handed to it whatever the door's switch says (apps/cms/door.mjs).
  'run-apparel-site-only': 'https://wear-run.com/__worker/version',
}

/**
 * Workers that are reached only THROUGH the front door, over a service binding. The override
 * header carries through a forwarded binding call (Cloudflare, "Version overrides", "Service
 * bindings", updated 12 Nov 2026), so the check works as for any Worker, with two differences
 * that both follow from the address being shared with the CMS Worker behind the door:
 *
 *   - WITHOUT the header, the CMS Worker may be the one that answers: the switch is off (KV
 *     `front-door` = `full` or `off`), or the door live at that moment predates the split. That
 *     is the control passing: whatever answered, it was not the new version.
 *   - WITH the header, an answer from the CMS Worker is "no door in front", but ONLY when the door
 *     itself was found on no route in this same run. With a door that answered, it is the fault
 *     this check exists for: a door that did not pass the check on, so every pre-live check would
 *     test the Worker that is already live.
 */
export const BEHIND_DOOR_WORKERS = ['run-apparel-site-only']

/**
 * The WITH-header verdict for a Worker behind the door, once the waits have run out.
 * @param {'ok' | 'wrong' | 'inconclusive' | 'unrouted'} verdict
 * @param {boolean} doorUnrouted the door was judged 'unrouted' in this run
 * @returns {'ok' | 'wrong' | 'inconclusive' | 'unrouted'}
 */
export function judgeBehindDoor(verdict, body, worker, doorUnrouted) {
  if (verdict !== 'wrong' || !BEHIND_DOOR_WORKERS.includes(worker)) return verdict
  return doorUnrouted && body?.worker !== worker ? 'unrouted' : 'wrong'
}

/**
 * Workers that answer only on ROUTES, and so may be on none: the front door's whole undo is
 * deleting its routes (docs/RUNBOOK.md, "The front door"), and a deploy must still get through
 * with the door taken away, or the undo would block every later deploy the way the door's own
 * fault did on 20 Nov 2026 (runs 44767665680 and 44781104367).
 */
export const ROUTE_ONLY_WORKERS = ['run-apparel-site-door']

/**
 * The WITH-header answer for a route-only Worker, judged once the waits have run out.
 * 'unrouted' means no version of that Worker answered at all (the viewer's page or a 404 came
 * back instead), so there is no door in front of the site to test: a warning, never a failure.
 * An answer FROM the Worker with another version id stays wrong: that is an override not applied.
 * @param {'ok' | 'wrong' | 'inconclusive'} verdict
 * @returns {'ok' | 'wrong' | 'inconclusive' | 'unrouted'}
 */
export function judgeRouteOnly(verdict, body, worker) {
  if (verdict !== 'wrong' || !ROUTE_ONLY_WORKERS.includes(worker)) return verdict
  return body?.worker === worker ? 'wrong' : 'unrouted'
}

/** Hosts whose requests carry the override header (both Workers answer on them). */
export const OVERRIDE_HOSTS = ['wear-run.com', 'www.wear-run.com', 'cms.wear-run.help']

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The newest uploaded version carrying `tag`, from `wrangler versions list --json`.
 * @param {Array<{id: string, number?: number, annotations?: Record<string, string>}>} versions
 */
export function versionWithTag(versions, tag) {
  if (!Array.isArray(versions)) throw new Error('`versions list --json` did not answer a list')
  const tagged = versions.filter((v) => v.annotations?.['workers/tag'] === tag && UUID.test(v.id))
  if (tagged.length === 0) throw new Error(`no uploaded version carries the tag ${tag}`)
  return tagged.reduce((a, b) => ((b.number ?? 0) > (a.number ?? 0) ? b : a)).id
}

/**
 * The one version serving 100%, from `wrangler deployments status --json`. A deployment already
 * split between two versions is refused: Workers serve at most two at once, so staging a third
 * would need a choice a person should make.
 */
export function liveVersion(status) {
  const versions = status?.versions
  if (!Array.isArray(versions) || versions.length === 0)
    throw new Error('`deployments status --json` has no versions')
  if (versions.length !== 1 || versions[0].percentage !== 100) {
    throw new Error(
      `the live deployment is already split (${versions.map((v) => `${v.version_id}@${v.percentage}%`).join(', ')}); finish or undo that first`,
    )
  }
  if (!UUID.test(versions[0].version_id)) throw new Error('the live version id is not a version id')
  return versions[0].version_id
}

/**
 * The header value for several Workers: a Structured-Field dictionary of quoted strings
 * (Cloudflare: `my-worker-name="<version-id>"`).
 * @param {Record<string, string>} pairs worker → version id
 */
export function overridesHeader(pairs) {
  const entries = Object.entries(pairs)
  for (const [worker, id] of entries) {
    if (!/^[a-z][a-z0-9-]*$/.test(worker) || !UUID.test(id))
      throw new Error(`not a worker=version pair: ${worker}=${id}`)
  }
  return entries.map(([worker, id]) => `${worker}="${id}"`).join(', ')
}

/** `cms=<id>,site=<id>` style input (CF_VERSION_PAIRS) → { worker: id }. */
export function parsePairs(text) {
  const out = {}
  for (const part of (text ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [worker, id] = part.split('=')
    out[worker] = id
  }
  overridesHeader(out)
  return out
}

/**
 * What a version address answered, judged. `expected` is the id that must answer.
 * @returns {'ok' | 'wrong' | 'inconclusive'}
 */
export function judgeAnswer(status, body, worker, expected) {
  if ([403, 429, 503].includes(status)) return 'inconclusive'
  if (status !== 200) return 'wrong'
  return body?.worker === worker && body?.version === expected ? 'ok' : 'wrong'
}

/**
 * The negative control: WITHOUT the header, the answer must not come from the new version.
 *
 * ⚠️ It must accept a live version that predates the version address. The first deploy of it
 * (run 42359271801, 2026-11-07) failed here while the overrides worked — both new versions
 * answered their ids WITH the header — because the old CMS answered 404 and the old viewer its
 * ordinary page (200, not JSON): neither had the address yet, so "expected the old id" could
 * never pass. An answer with no version id from a live version is still proof the header was
 * what reached the new one, since the new one answers its id at that address.
 * @returns {'ok' | 'wrong' | 'inconclusive'}
 */
export function judgeControl(status, body, worker, newId, oldId) {
  if ([403, 429, 503].includes(status)) return 'inconclusive'
  if (body?.version === newId) return 'wrong'
  if (status === 200 && body?.worker === worker && body?.version === oldId) return 'ok'
  // Another Worker answered at an address the two share behind the door (BEHIND_DOOR_WORKERS).
  if (
    status === 200 &&
    BEHIND_DOOR_WORKERS.includes(worker) &&
    typeof body?.worker === 'string' &&
    body.worker !== worker
  )
    return 'ok'
  // The live version does not know the address: a 404, or the viewer's page shell (not JSON).
  if ((status === 404 || status === 200) && (body === null || body?.version === undefined))
    return 'ok'
  return 'wrong'
}

/**
 * How long to wait before each further ask of the WITH-header question, in ms: 30 s in all, five
 * more asks. Cloudflare gives no figure for how long a deployment takes to reach every location
 * (see the header above), so this is a bound on a delay we have seen at 3-4 s, not a measurement
 * of it. The success line says how many asks it took, which will show the real figure over time.
 */
export const OVERRIDE_WAITS_MS = [2_000, 3_000, 5_000, 8_000, 12_000]

/**
 * A comma-separated list of waits in ms, or `fallback` when it is empty or not all non-negative
 * numbers (a typo must not turn into `setTimeout(NaN)`, which fires at once).
 * @param {string | undefined} text
 * @param {readonly number[]} fallback
 */
export function parseWaits(text, fallback) {
  if (!text) return fallback
  const waits = text.split(',').map((part) => Number(part.trim()))
  return waits.every((ms) => Number.isFinite(ms) && ms >= 0) ? waits : fallback
}

/**
 * Ask until the override has landed. It waits only while the answer was judged wrong AND is what
 * the OLD version gives (`fromOldVersion`): that is an override not applied yet, which Cloudflare
 * says can happen while a deployment spreads. Any other answer is returned as it is, the first
 * time: an ok, an inconclusive Bot Fight Mode refusal, a 500, another Worker's name. And when the
 * last wait has passed the answer is returned wrong, so an override that never lands still fails.
 * @param {() => Promise<{status: number, body: any}>} ask
 * @param {(answer: {status: number, body: any}) => 'ok' | 'wrong' | 'inconclusive'} judge
 * @param {(answer: {status: number, body: any}) => boolean} fromOldVersion
 * @param {readonly number[]} waits
 * @param {(ms: number) => Promise<void>} sleep
 * @param {(line: string) => void} note
 * @returns {Promise<{status: number, body: any, verdict: 'ok' | 'wrong' | 'inconclusive', asks: number}>}
 */
export async function askUntilApplied(ask, judge, fromOldVersion, waits, sleep, note = () => {}) {
  for (let tried = 0; ; tried++) {
    const answer = await ask()
    const verdict = judge(answer)
    const wait = waits[tried]
    if (verdict !== 'wrong' || wait === undefined || !fromOldVersion(answer))
      return { ...answer, verdict, asks: tried + 1 }
    note(
      `the old version answered (${answer.body?.version ?? 'no version id'}), so the override is not applied yet (ask ${tried + 1}); asking again in ${wait} ms`,
    )
    await sleep(wait)
  }
}

function wrangler(dir, args) {
  const bin = process.env.WRANGLER_BIN ?? 'pnpm'
  const prefix = process.env.WRANGLER_BIN ? [] : ['exec', 'wrangler']
  const run = spawnSync(bin, [...prefix, ...args], {
    cwd: dir,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (run.status !== 0)
    throw new Error(
      `wrangler ${args.slice(0, 2).join(' ')} failed: ${(run.stderr || run.stdout).trim().slice(-800)}`,
    )
  return run.stdout
}

/**
 * Is this wrangler failure Cloudflare not yet knowing a version it has just created?
 *
 * ⚠️ 16 Nov 2026, main run 43879164061 (PR #409): the SENTRY_DSN step created CMS version
 * ef436e53 at 14:11:00, `versions list` returned it, and 15 seconds later `versions deploy`
 * answered "The requested Worker version could not be found … [code: 100146]". Nothing was
 * staged, the deploy stopped, and the change waited for the next merge. The last good deploy had
 * done the same steps 14 seconds apart, so nothing of ours had changed: Cloudflare's own read
 * came before its write had settled. It was the first 100146 in the last 60 runs on main.
 */
export function isVersionNotFound(message) {
  return /\b100146\b|Worker version could not be found/i.test(String(message ?? ''))
}

/** How long to wait before each further try of `versions deploy`, in ms. Two more tries. */
export const VERSION_RETRY_WAITS_MS = [5_000, 15_000]

/**
 * Run `attempt`, and run it again after each wait while it fails the way `retryable` names.
 * Any other failure, and the last failure, is thrown as it is: a wrong version id or a refused
 * token must stop the deploy at once, not three tries later.
 * @template T
 * @param {() => T} attempt
 * @param {(message: string) => boolean} retryable
 * @param {readonly number[]} waits
 * @param {(ms: number) => Promise<void>} sleep
 * @param {(line: string) => void} note
 * @returns {Promise<T>}
 */
export async function withRetries(attempt, retryable, waits, sleep, note = () => {}) {
  for (let tried = 0; ; tried++) {
    try {
      return attempt()
    } catch (err) {
      const wait = waits[tried]
      if (wait === undefined || !retryable(err?.message)) throw err
      note(`Cloudflare did not know the version yet (try ${tried + 1}); trying again in ${wait} ms`)
      await sleep(wait)
    }
  }
}

/**
 * `wrangler versions deploy …`, tried again when Cloudflare has not caught up with a version it
 * just created. Repeating it is safe: it names the same versions and the same percentages, and
 * the failure it repeats after is one where nothing was deployed.
 */
function retryWaits() {
  return process.env.CF_VERSION_RETRY_WAITS_MS
    ? process.env.CF_VERSION_RETRY_WAITS_MS.split(',').map(Number)
    : VERSION_RETRY_WAITS_MS
}

function deployVersions(dir, args) {
  return withRetries(
    () => wrangler(dir, args),
    isVersionNotFound,
    retryWaits(),
    (ms) => new Promise((done) => setTimeout(done, ms)),
    // To stderr: this step's stdout is piped into $GITHUB_OUTPUT (ci.yml, "Stage the four new versions").
    (line) => console.error(`::warning::${line}`),
  )
}

function jsonOf(text) {
  const start = text.search(/[[{]/)
  return JSON.parse(text.slice(start))
}

/**
 * Is this the list not showing a version that was uploaded a moment ago?
 *
 * ⚠️ 20 Nov 2026, main run 44733082549, attempt 1 (PR #432): both uploads had answered with a
 * version id (12:31:01 and 12:31:26 UTC), the stage step started at 12:31:26 and stopped 1.4 s
 * later with "no uploaded version carries the tag r44733082549a1". Attempt 2, the same commit
 * re-run by hand, passed. Cloudflare's list most likely had not caught up with its own write (not
 * proven: the list's answer was not kept, and the log does not say which Worker's list it was),
 * the same shape as the 100146 above, one call earlier. So the list is asked again after each of
 * VERSION_RETRY_WAITS_MS; a tag that is truly missing still fails, 20 seconds later.
 */
export function isTagNotListed(message) {
  return /no uploaded version carries the tag/i.test(String(message ?? ''))
}

/** `--config <file>` for a Worker that is not its directory's default one, else nothing. */
export function configArgs(config) {
  if (config === undefined || config === '') return []
  if (!/^[\w.-]+\.jsonc?$/.test(config)) throw new Error(`not a wrangler config file: ${config}`)
  return ['--config', config]
}

async function ask(url, headers) {
  for (const wait of [0, 3_000, 10_000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait))
    try {
      const res = await fetch(url, {
        headers: { ...headers, 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(20_000),
      })
      const text = await res.text()
      let body = null
      try {
        body = JSON.parse(text)
      } catch {}
      if (![429, 500, 502, 503, 504].includes(res.status)) return { status: res.status, body }
    } catch {}
  }
  return { status: 503, body: null }
}

async function main([command, ...args]) {
  if (command === 'stage') {
    const [worker, dir, tag, config] = args
    if (!worker || !dir || !tag) return usage()
    const named = ['--name', worker, ...configArgs(config)]
    const fresh = await withRetries(
      () => versionWithTag(jsonOf(wrangler(dir, ['versions', 'list', ...named, '--json'])), tag),
      isTagNotListed,
      retryWaits(),
      (ms) => new Promise((done) => setTimeout(done, ms)),
      // To stderr, like deployVersions: this step's stdout is piped into $GITHUB_OUTPUT.
      (line) => console.error(`::warning::${line} (the list did not show the tag ${tag})`),
    )
    const old = liveVersion(jsonOf(wrangler(dir, ['deployments', 'status', ...named, '--json'])))
    if (fresh === old) throw new Error(`the tagged version ${fresh} is already live`)
    await deployVersions(dir, [
      'versions',
      'deploy',
      `${old}@100%`,
      `${fresh}@0%`,
      ...named,
      '--message',
      `staged ${tag} at 0%`,
      '--yes',
    ])
    console.log(`old=${old}`)
    console.log(`new=${fresh}`)
    return 0
  }
  if (command === 'promote' || command === 'unstage') {
    const [worker, dir, id, config] = args
    if (!worker || !dir || !UUID.test(id ?? '')) return usage()
    await deployVersions(dir, [
      'versions',
      'deploy',
      `${id}@100%`,
      '--name',
      worker,
      ...configArgs(config),
      '--message',
      `${command}d ${id}`,
      '--yes',
    ])
    console.log(`${worker}: ${id} now serves 100%`)
    return 0
  }
  if (command === 'verify') {
    const fresh = parsePairs(process.env.CF_VERSION_PAIRS)
    const old = parsePairs(process.env.CF_VERSION_OLD_PAIRS)
    const header = { [HEADER]: overridesHeader(fresh) }
    const waits = parseWaits(process.env.CF_VERSION_VERIFY_WAITS_MS, OVERRIDE_WAITS_MS)
    const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
    let failed = 0
    let doorUnrouted = false
    // The door first: a Worker behind it is judged by whether the door answered (judgeBehindDoor).
    const order = Object.keys(fresh).sort(
      (a, b) => Number(BEHIND_DOOR_WORKERS.includes(a)) - Number(BEHIND_DOOR_WORKERS.includes(b)),
    )
    for (const worker of order) {
      const url = VERSION_URLS[worker]
      if (!url) throw new Error(`no version address known for ${worker}`)
      for (const [label, headers, want] of [
        ['with the override', header, fresh[worker]],
        ['without it (negative control)', {}, old[worker]],
      ]) {
        const started = Date.now()
        let answer
        if (want === fresh[worker]) {
          answer = await askUntilApplied(
            () => ask(url, headers),
            (a) => judgeAnswer(a.status, a.body, worker, want),
            (a) => judgeControl(a.status, a.body, worker, want, old[worker]) === 'ok',
            waits,
            sleep,
            (note) => console.log(`  … ${worker}: ${note}`),
          )
        } else {
          const a = await ask(url, headers)
          answer = {
            ...a,
            verdict: judgeControl(a.status, a.body, worker, fresh[worker], want),
            asks: 1,
          }
        }
        const { status, body, asks } = answer
        const verdict =
          want === fresh[worker]
            ? judgeBehindDoor(
                judgeRouteOnly(answer.verdict, body, worker),
                body,
                worker,
                doorUnrouted,
              )
            : answer.verdict
        if (verdict === 'unrouted' && ROUTE_ONLY_WORKERS.includes(worker)) doorUnrouted = true
        const tries =
          asks > 1
            ? `, after ${asks} asks over ${((Date.now() - started) / 1000).toFixed(1)} s`
            : ''
        const line = `${worker} ${label}: HTTP ${status}, answered ${body?.version ?? '(no version id)'}, expected ${want === fresh[worker] ? want : `not ${fresh[worker]}`}${tries}`
        if (verdict === 'ok') console.log(`✓ ${line}`)
        else if (verdict === 'inconclusive')
          console.log(`::warning::${line} — inconclusive (Bot Fight Mode), not a wrong version`)
        else if (verdict === 'unrouted')
          console.log(
            `::warning::${line} — no version of ${worker} answered, so nothing routes to it and the checks do not pass through it`,
          )
        else {
          console.log(`::error::${line}`)
          failed++
        }
      }
    }
    return failed ? 1 : 0
  }
  return usage()
}

function usage() {
  console.error(
    'usage: version-overrides.mjs stage|promote|unstage <worker> <dir> <tag|id>  |  verify',
  )
  return 2
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  try {
    process.exitCode = await main(process.argv.slice(2))
  } catch (err) {
    // ⚠️ TO STDERR, ON ONE LINE, WITHOUT COLOUR CODES. `stage`'s stdout is piped into
    // $GITHUB_OUTPUT (ci.yml), and on 16 Nov 2026 this line, printed to stdout with wrangler's
    // colours and line breaks in it, reached that file and GitHub added a second error on top of
    // the real one: "Unable to process file command 'output' … Invalid format". GitHub reads
    // `::error::` from stderr just as well.
    const plain = String(err.message)
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping terminal colour codes is the point
      .replace(/\u001b\[[0-9;]*m/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    console.error(`::error::${plain}`)
    process.exitCode = 1
  }
}
