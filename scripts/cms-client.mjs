/**
 * ONE client for the scripts in `scripts/` that talk to the CMS (2026-10-25).
 *
 * WHY THIS EXISTS. Fourteen scripts each carried their own little client, and they named the
 * CMS address three ways (`CMS_API_BASE` in seven, `CMS_ORIGIN` in six, `CMS_URL` in one), so a
 * shell set up for one script silently pointed another at production. Five of them re-wrote the
 * same "read it back" check by hand, and two (`publish-garment`, `upload-posters`) never did —
 * the shape of the 2026-09-04 incident, where a PATCH naming a field that does not exist
 * answered 200, stored nothing, and a script printed "11 written, 0 failed"
 * (`apps/cms/CLAUDE.md`, "A PATCH NAMING A PROJECTED FIELD RETURNS 200 AND STORES NOTHING").
 *
 * WHAT IT GUARANTEES, in the order the rules in `.claude/rules/cms-scripted-writes.md` ask:
 *
 *   1. ONE NAME FOR THE ADDRESS: `CMS_API_BASE` (default https://cms.wear-run.help). The two
 *      older names still work as fallbacks and print one "renamed, use CMS_API_BASE" line, so
 *      nobody's shell setup breaks. `resolveCmsBase`.
 *   2. ONE WAY TO FIND THE KEY: `CMS_API_KEY` from the environment; the macOS Keychain
 *      (service run-apparel-cms-api-key, account cms) only for a script that asks for it
 *      (`keychain: true`), because three scripts have always read it and ten never have, and a
 *      dry run must not start using a stored key it was never given. The hidden prompt that
 *      `apply-footer-facts` and `shrink-posters-gently` show stays in those two scripts and
 *      hands the typed key to this client. `resolveCmsKey`.
 *   3. DRY RUN IS THE DEFAULT. A client made without `apply: true` makes NO write request: every
 *      write method answers `{ ok: true, dryRun: true }` and never touches the network. A script
 *      that forgets to pass `apply` therefore cannot write.
 *   4. EVERY WRITE IS READ BACK AND COMPARED (`?depth=0`). There is no write method without it:
 *      `write`, `patchDoc`, `createDoc`, `updateGlobal`, `deleteDoc` and `uploadMedia` each fetch
 *      the stored document and compare, and report `ok: false` when it differs. A caller can pass
 *      its own `verify`, but it must return an array of mismatches — returning nothing is a
 *      programming error, not a pass.
 *   5. THE KEY IS NEVER PRINTED AND NEVER IN A URL. It lives in a closure (not a property, so
 *      `JSON.stringify(client)` and `util.inspect(client)` cannot show it), travels only in the
 *      `Authorization` header, and is scrubbed from every error text this module builds.
 *   6. HTTPS OR LOOPBACK. A request that carries the key (or any write) is refused unless the
 *      address is https:// or plain http to localhost. This is the guard five scripts had
 *      written out by hand (CodeQL js/file-access-to-http, 2026-09), now at the one place a
 *      request is sent, so the check sits beside the `fetch` it protects.
 *
 * WHAT IT DOES NOT DO: it never touches a colourway `slug` or reorders rows. It cannot know a
 * script's data, so each caller still builds its own rows (`renderRows`, `repointedColourways`,
 * `fixedColourRows`), and the read-back is where an order change is caught.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

export const CMS_DEFAULT_BASE = 'https://cms.wear-run.help'
export const CMS_BASE_ENV = 'CMS_API_BASE'
/** The two older names, in the order they win when `CMS_API_BASE` is not set. */
export const CMS_RENAMED_BASE_ENVS = Object.freeze(['CMS_ORIGIN', 'CMS_URL'])
export const CMS_KEY_ENV = 'CMS_API_KEY'
export const CMS_KEYCHAIN = Object.freeze({ service: 'run-apparel-cms-api-key', account: 'cms' })

/** A request could not be made as asked (a bad address, a key in a URL). Never an HTTP answer. */
export class CmsConfigError extends Error {}

/** A read the caller needs to continue failed. Carries what the CMS said. */
export class CmsError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, json?: unknown }} [details]
   */
  constructor(message, { status, json } = {}) {
    super(message)
    this.name = 'CmsError'
    this.status = status
    this.json = json
  }
}

const isSet = (env, name) => typeof env[name] === 'string' && env[name].trim() !== ''

/** Printed to stderr so a script's own stdout (a table, a verdict) stays clean. */
const printNote = (message) => console.error(`cms-client: ${message}`)

/**
 * The CMS address: `CMS_API_BASE`, else `CMS_ORIGIN`, else `CMS_URL`, else production.
 * A renamed variable that is in use, or set beside the new one, prints one line saying so.
 *
 * @param {{ env?: Record<string, string | undefined>, note?: (message: string) => void }} [options]
 * @returns {string} no trailing slash
 */
export function resolveCmsBase({ env = process.env, note = printNote } = {}) {
  const winner = [CMS_BASE_ENV, ...CMS_RENAMED_BASE_ENVS].find((name) => isSet(env, name))
  for (const old of CMS_RENAMED_BASE_ENVS) {
    if (!isSet(env, old)) continue
    if (old === winner) note(`${old} is renamed, use ${CMS_BASE_ENV}. It still works for now.`)
    else note(`${old} is renamed to ${CMS_BASE_ENV} and is ignored: ${winner} is set.`)
  }
  const chosen = winner ? String(env[winner]).trim() : CMS_DEFAULT_BASE
  return chosen.replace(/\/+$/, '')
}

let memoBase
/**
 * `resolveCmsBase()` on the real environment, once per process, so two modules that both ask
 * (`poster-sizes` and the probe that imports it) print the "renamed" note once, not twice.
 * Resolved on first use, never at import: a test that imports a script must not print it.
 */
export function defaultCmsBase() {
  memoBase ??= resolveCmsBase()
  return memoBase
}

function readKeychainKey() {
  try {
    return execFileSync(
      'security',
      ['find-generic-password', '-s', CMS_KEYCHAIN.service, '-a', CMS_KEYCHAIN.account, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
  } catch {
    return ''
  }
}

/**
 * The API key, or '' when there is none. Environment first; the Keychain only when asked.
 * Never prints anything.
 *
 * @param {{ env?: Record<string, string | undefined>, keychain?: boolean, readKeychain?: () => string }} [options]
 */
export function resolveCmsKey({
  env = process.env,
  keychain = false,
  readKeychain = readKeychainKey,
} = {}) {
  if (isSet(env, CMS_KEY_ENV)) return String(env[CMS_KEY_ENV])
  return keychain ? readKeychain() : ''
}

/** http:// to this machine only: the key never leaves it. */
function isLoopbackHttp(url) {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    )
  } catch {
    return false
  }
}

const UNSAFE_BASE = (base) =>
  `${CMS_BASE_ENV} must be https:// (plain http:// is accepted only for localhost), because ` +
  `the key and the data travel in every request. Got "${base}"`

/** Throws CmsConfigError unless `base` is https:// or http:// to localhost. */
export function assertSafeBase(base) {
  if (typeof base === 'string' && (base.startsWith('https://') || isLoopbackHttp(base))) return
  throw new CmsConfigError(UNSAFE_BASE(base))
}

/** The command-line form: print the reason and exit 2, as the guarded scripts always did. */
export function exitIfBaseUnsafe(base) {
  try {
    assertSafeBase(base)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(2)
  }
}

/**
 * Payload's useful error is nested: the outer message is "The following field is invalid" with
 * no field named, the inner `data.errors[]` has it (`.claude/rules/cms-scripted-writes.md`).
 * @param {any} json
 */
export function explainPayloadError(json) {
  const outer = json?.errors?.[0]
  const inner = Array.isArray(outer?.data?.errors) ? outer.data.errors : []
  if (inner.length > 0) {
    return inner.map((e) => `${e.field ?? e.path ?? '?'}: ${e.message}`).join('; ')
  }
  return outer?.message || json?.raw || JSON.stringify(json ?? null).slice(0, 200)
}

const show = (value) => {
  const text = JSON.stringify(value)
  if (text === undefined) return 'nothing'
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

/**
 * Every place a SENT value is not in the STORED document. Sent is a subset of stored: the CMS
 * adds ids, timestamps and defaults, so only what was sent is compared — a list must keep its
 * length and order, an object only the keys that were sent. A key the CMS silently dropped (an
 * unknown or projected field) shows up as "stored nothing", which is the whole point.
 *
 * @param {unknown} sent
 * @param {unknown} stored
 * @param {string} [at]
 * @returns {string[]}
 */
export function subsetMismatches(sent, stored, at = '') {
  const label = at || '(document)'
  if (sent === undefined) return []
  if (sent === null) {
    return stored === null || stored === undefined
      ? []
      : [`${label}: sent empty, stored ${show(stored)}`]
  }
  if (Array.isArray(sent)) {
    if (!Array.isArray(stored))
      return [`${label}: sent ${sent.length} item(s), stored ${show(stored)}`]
    if (stored.length !== sent.length) {
      return [`${label}: sent ${sent.length} item(s), stored ${stored.length}`]
    }
    return sent.flatMap((item, index) => subsetMismatches(item, stored[index], `${at}[${index}]`))
  }
  if (typeof sent === 'object') {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return [`${label}: sent an object, stored ${show(stored)}`]
    }
    return Object.keys(sent).flatMap((key) =>
      subsetMismatches(sent[key], stored[key], at ? `${at}.${key}` : key),
    )
  }
  return sent === stored ? [] : [`${label}: sent ${show(sent)}, stored ${show(stored)}`]
}

const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * A plain GET of a public file (a model, a poster) — never a HEAD, which lands on a different
 * edge cache entry on this domain (root CLAUDE.md, measured 2026-08-06 and 2026-08-13).
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
export async function fetchServed(url, { fetchImpl, timeoutMs } = {}) {
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args))
  const response = await doFetch(
    url,
    timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : undefined,
  )
  const bytes = new Uint8Array(await response.arrayBuffer())
  return {
    ok: response.ok,
    status: response.status,
    byteLength: bytes.byteLength,
    sha256: sha256Hex(bytes),
    cache: response.headers.get('cf-cache-status'),
    contentType: response.headers.get('content-type'),
    bytes,
  }
}

const withDepthZero = (path) =>
  /[?&]depth=/.test(path) ? path : `${path}${path.includes('?') ? '&' : '?'}depth=0`

const idOf = (json) => json?.doc?.id ?? json?.id ?? null

/**
 * @param {{
 *   base?: string,
 *   key?: string,
 *   apply?: boolean,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   env?: Record<string, string | undefined>,
 *   note?: (message: string) => void,
 * }} [options]
 *   `base` overrides the environment (a script's own `--url`). `key` empty means no
 *   Authorization header at all: a public read. `apply` false makes every write a no-op.
 *   `fetchImpl` is looked up at call time when omitted, so a test's stubbed `fetch` is seen.
 */
export function createCmsClient({
  base,
  key = '',
  apply = false,
  fetchImpl,
  timeoutMs,
  env = process.env,
  note = printNote,
} = {}) {
  const origin = (base ?? resolveCmsBase({ env, note })).replace(/\/+$/, '')
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args))

  /** The key can come back in an error body or a network message: scrub it from any text. */
  const redact = (text) => {
    const value = String(text ?? '')
    return key ? value.split(key).join('[key removed]') : value
  }

  async function sendRaw(
    method,
    path,
    { headers = {}, body, auth = true, timeout = timeoutMs } = {},
  ) {
    if (key && (path.includes(key) || origin.includes(key))) {
      throw new CmsConfigError('the API key must never be part of a URL')
    }
    const url = `${origin}${path}`
    const authed = auth && key !== ''
    // A request that carries the key, or any write, goes only over https (or to localhost).
    // Checked here, beside the fetch, so no caller can send it any other way.
    if ((authed || method !== 'GET') && !url.startsWith('https://') && !isLoopbackHttp(url)) {
      throw new CmsConfigError(UNSAFE_BASE(origin))
    }
    const finalHeaders = { ...headers }
    if (authed) finalHeaders.Authorization = `users API-Key ${key}`
    try {
      return await doFetch(url, {
        method,
        headers: finalHeaders,
        body,
        signal: timeout ? AbortSignal.timeout(timeout) : undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (key && message.includes(key)) throw new CmsError(redact(message))
      throw error
    }
  }

  /**
   * One read, parsed. `json` is the parsed body, or `{ raw: <first 300 characters> }` when the
   * body is not JSON (a Cloudflare challenge page); `parsed` says which.
   */
  async function get(path, { auth = true, timeoutMs: timeout } = {}) {
    const response = await sendRaw('GET', path, {
      headers: { accept: 'application/json' },
      auth,
      timeout,
    })
    const text = await response.text()
    let json
    let parsed = true
    try {
      json = JSON.parse(text)
    } catch {
      json = { raw: text.slice(0, 300) }
      parsed = false
    }
    return { ok: response.ok, status: response.status, json, text, parsed }
  }

  /** A read that must succeed with JSON, or throws. */
  async function getJson(path, options) {
    const result = await get(path, options)
    if (!result.ok) {
      throw new CmsError(
        redact(`GET ${path} → ${result.status}: ${explainPayloadError(result.json)}`),
        { status: result.status, json: result.json },
      )
    }
    if (!result.parsed) {
      throw new CmsError(redact(`GET ${path} → ${result.status} but the body was not JSON`), {
        status: result.status,
      })
    }
    return result.json
  }

  /**
   * The raw Response of a READ, for a caller that parses it its own way (the probes treat a
   * non-JSON body as an exit code). Reads only: a write has no door here, so it cannot skip
   * the read-back.
   */
  function fetchRaw(path, { method = 'GET', headers, auth = true, timeoutMs: timeout } = {}) {
    if (method !== 'GET') {
      throw new CmsConfigError('fetchRaw reads only; writes go through write() and are read back')
    }
    return sendRaw('GET', path, { headers, auth, timeout })
  }

  const productBySlug = async (slug) => {
    const result = await get(
      `/api/products?where%5Bslug%5D%5Bequals%5D=${encodeURIComponent(slug)}&depth=0&limit=1`,
    )
    return { ...result, doc: result.json?.docs?.[0] ?? null }
  }

  const dryResult = (method, path) => ({
    ok: true,
    dryRun: true,
    stage: 'dry-run',
    method,
    path,
    status: null,
    json: null,
    stored: null,
    mismatches: [],
    detail: '',
    error: '',
  })

  /**
   * The one write. Sends, reads the stored document back with `depth=0`, and compares.
   *
   * `stage` says where it stopped: 'write' (the CMS refused), 'read' (it could not be read
   * back), 'verify' (read back, and not what was sent), 'done' (matches), 'dry-run'.
   * `status` and `json` are those of the response that ended it. `ok` is true only for 'done'
   * and 'dry-run'.
   *
   * @param {{
   *   method: 'POST' | 'PATCH' | 'DELETE',
   *   path: string,
   *   json?: unknown,
   *   form?: FormData,
   *   readPath?: string | ((response: any) => string | null),
   *   verify?: (stored: any, context: { sent: unknown, response: any }) => string[],
   *   expectGone?: boolean,
   * }} request
   */
  async function writeCore(
    { method, path, json, form, readPath, verify, expectGone = false },
    { readDoc = true } = {},
  ) {
    if (!['POST', 'PATCH', 'DELETE'].includes(method)) {
      throw new TypeError(`write() sends POST, PATCH or DELETE, not ${method}`)
    }
    if (json !== undefined && form !== undefined) throw new TypeError('send json or form, not both')
    if (readDoc && !expectGone && typeof verify !== 'function' && json === undefined) {
      throw new TypeError('a write with no JSON body needs a verify() to compare against')
    }
    if (!apply) return dryResult(method, path)

    const sent = await sendRaw(method, path, {
      headers:
        json !== undefined
          ? { 'Content-Type': 'application/json', accept: 'application/json' }
          : { accept: 'application/json' },
      body: json !== undefined ? JSON.stringify(json) : form,
    })
    const text = await sent.text()
    let response
    try {
      response = JSON.parse(text)
    } catch {
      response = { raw: text.slice(0, 300) }
    }
    const fail = (stage, status, body, what) => {
      const detail = redact(explainPayloadError(body))
      return {
        ok: false,
        stage,
        status,
        json: body,
        stored: null,
        mismatches: [],
        detail,
        error: redact(`${what} → ${status}: ${detail}`),
      }
    }
    if (!sent.ok) return fail('write', sent.status, response, `${method} ${path}`)

    // Only uploadMedia turns the document read off, and only when it checks the served file
    // instead (it refuses to run without one of the two).
    if (!readDoc) {
      return {
        ok: true,
        stage: 'done',
        status: sent.status,
        json: response,
        stored: null,
        mismatches: [],
        detail: '',
        error: '',
      }
    }
    const target = typeof readPath === 'function' ? readPath(response) : readPath
    if (!target) {
      return {
        ...fail('write', sent.status, response, `${method} ${path}`),
        detail: 'the CMS answered but named no document to read back',
        error: `${method} ${path} → ${sent.status}: the CMS answered but named no document to read back`,
      }
    }
    const readFrom = withDepthZero(target)
    const read = await get(readFrom)

    if (expectGone) {
      if (read.status === 404) {
        return {
          ok: true,
          stage: 'done',
          status: sent.status,
          json: response,
          stored: null,
          mismatches: [],
          detail: '',
          error: '',
        }
      }
      if (!read.ok) return fail('read', read.status, read.json, `read-back GET ${readFrom}`)
      const mismatches = ['still readable after the delete']
      return {
        ok: false,
        stage: 'verify',
        status: sent.status,
        json: response,
        stored: read.json,
        mismatches,
        detail: '',
        error: mismatches.join('; '),
      }
    }

    if (!read.ok) return fail('read', read.status, read.json, `read-back GET ${readFrom}`)
    const mismatches = verify
      ? verify(read.json, { sent: json, response })
      : subsetMismatches(json, read.json)
    if (!Array.isArray(mismatches)) {
      throw new TypeError('verify() must return an array of mismatch strings (empty means stored)')
    }
    const safe = mismatches.map(redact)
    return {
      ok: safe.length === 0,
      stage: safe.length === 0 ? 'done' : 'verify',
      status: sent.status,
      json: response,
      stored: read.json,
      mismatches: safe,
      detail: '',
      error: safe.join('; '),
    }
  }

  const write = (request) => writeCore(request)

  /** PATCH `/api/<collection>/<id>`, read back from the same document. */
  const patchDoc = (collection, id, json, { verify } = {}) =>
    write({
      method: 'PATCH',
      path: `/api/${collection}/${id}`,
      json,
      readPath: `/api/${collection}/${id}`,
      verify,
    })

  /** POST `/api/<collection>`, read back from the id the CMS answers with. */
  const createDoc = (collection, { json, form, verify } = {}) =>
    write({
      method: 'POST',
      path: `/api/${collection}`,
      json,
      form,
      readPath: (response) => {
        const id = idOf(response)
        return id == null ? null : `/api/${collection}/${id}`
      },
      verify,
    })

  /** POST `/api/globals/<slug>` (a global is one document), read back from the same address. */
  const updateGlobal = (slug, json, { verify } = {}) =>
    write({
      method: 'POST',
      path: `/api/globals/${slug}`,
      json,
      readPath: `/api/globals/${slug}`,
      verify,
    })

  /** DELETE `/api/<collection>/<id>`, then confirm the CMS no longer has it. */
  const deleteDoc = (collection, id) =>
    write({
      method: 'DELETE',
      path: `/api/${collection}/${id}`,
      readPath: `/api/${collection}/${id}`,
      expectGone: true,
    })

  /**
   * Upload one file to `/api/media` (multipart: `_payload` then `file`, the shape the admin
   * sends) and read it back. At least one of `verifyDoc` (compare the stored media document,
   * `?depth=0`) and `expectServed` (a plain GET of the file's URL, compared by `byteLength`
   * and/or `sha256`) is required, so an upload is never trusted on a 200 alone.
   *
   * The filename becomes the R2 key — name it the way the existing objects are named
   * (`<product>-<colour>-poster.webp`).
   *
   * @param {{
   *   filename: string,
   *   bytes: Uint8Array,
   *   type: string,
   *   fields?: Record<string, unknown>,
   *   verifyDoc?: (stored: any) => string[],
   *   expectServed?: { byteLength?: number, sha256?: string },
   * }} upload
   */
  async function uploadMedia({ filename, bytes, type, fields = {}, verifyDoc, expectServed }) {
    if (typeof verifyDoc !== 'function' && !expectServed) {
      throw new TypeError('uploadMedia needs verifyDoc or expectServed: a 200 is not storage')
    }
    if (!apply) return { ...dryResult('POST', '/api/media'), doc: null, served: null }
    const form = new FormData()
    form.append('_payload', JSON.stringify(fields))
    form.append('file', new File([bytes], filename, { type }))
    // The stored document is read back only when the caller has something to compare in it; a
    // caller that compares the served bytes alone (shrink-posters-gently) skips that GET.
    const created = await writeCore(
      {
        method: 'POST',
        path: '/api/media',
        form,
        readPath: (response) => {
          const id = idOf(response)
          return id == null ? null : `/api/media/${id}`
        },
        verify: verifyDoc,
      },
      { readDoc: typeof verifyDoc === 'function' },
    )
    if (created.stage === 'write' || created.stage === 'read') {
      return { ...created, doc: null, served: null }
    }
    const doc = created.json?.doc ?? created.json
    const url = created.stored?.url ?? doc?.url
    if (!expectServed) return { ...created, doc, served: null }
    if (!url) {
      return {
        ...created,
        ok: false,
        stage: 'verify',
        doc,
        served: null,
        mismatches: [...created.mismatches, 'the CMS named no URL for the file'],
        error: 'the CMS named no URL for the file',
      }
    }
    const served = await fetchServed(url, { fetchImpl, timeoutMs })
    const mismatches = [...created.mismatches]
    if (!served.ok) mismatches.push(`GET ${url} answered ${served.status}`)
    if (expectServed.byteLength !== undefined && served.byteLength !== expectServed.byteLength) {
      mismatches.push(`served ${served.byteLength} bytes, expected ${expectServed.byteLength}`)
    }
    if (expectServed.sha256 !== undefined && served.sha256 !== expectServed.sha256) {
      mismatches.push('the served bytes are not the bytes that were uploaded (sha256 differs)')
    }
    return {
      ...created,
      ok: mismatches.length === 0,
      stage: mismatches.length === 0 ? 'done' : 'verify',
      doc,
      served,
      mismatches,
      error: mismatches.join('; '),
    }
  }

  return Object.freeze({
    base: origin,
    apply,
    get,
    getJson,
    fetchRaw,
    productBySlug,
    write,
    patchDoc,
    createDoc,
    updateGlobal,
    deleteDoc,
    uploadMedia,
    fetchServed: (url) => fetchServed(url, { fetchImpl, timeoutMs }),
  })
}
