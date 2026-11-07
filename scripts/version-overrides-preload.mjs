/**
 * Loaded with `node --import ./scripts/version-overrides-preload.mjs` (through NODE_OPTIONS, so the
 * child processes the check scripts spawn inherit it): every request those scripts make to our own
 * hosts carries `Cloudflare-Workers-Version-Overrides`, which sends it to the version staged at 0%
 * instead of the live one. Why, and how the deploy proves the header worked:
 * scripts/version-overrides.mjs.
 *
 * It patches `fetch` and `node:http(s).request`/`.get` because the check scripts use both
 * (smoke-viewer-preview.mjs needs `node:https` to send Sec-Fetch-Mode, which fetch rewrites). Only
 * requests to OVERRIDE_HOSTS change; media.wear-run.com and every third-party host are untouched.
 * With CF_VERSION_PAIRS unset it does nothing at all.
 */
import http from 'node:http'
import https from 'node:https'
import { HEADER, OVERRIDE_HOSTS, overridesHeader, parsePairs } from './version-overrides.mjs'

const pairs = process.env.CF_VERSION_PAIRS
const value = pairs ? overridesHeader(parsePairs(pairs)) : null

/** @param {string | undefined | null} host */
export function isOverrideHost(host) {
  return OVERRIDE_HOSTS.includes(
    String(host ?? '')
      .replace(/:\d+$/, '')
      .toLowerCase(),
  )
}

if (value) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (!isOverrideHost(url.hostname)) return originalFetch(input, init)
    const headers = new Headers(
      init.headers ?? (input instanceof Request ? input.headers : undefined),
    )
    headers.set(HEADER, value)
    return originalFetch(input, { ...init, headers })
  }
  for (const mod of [http, https]) {
    for (const name of ['request', 'get']) {
      const original = mod[name]
      mod[name] = function patched(options, ...rest) {
        if (options && typeof options === 'object' && !(options instanceof URL)) {
          if (isOverrideHost(options.hostname ?? options.host)) {
            options = { ...options, headers: { ...(options.headers ?? {}), [HEADER]: value } }
          }
        } else if (options) {
          const url = new URL(String(options))
          if (isOverrideHost(url.hostname)) {
            const extra =
              rest[0] && typeof rest[0] === 'object' && typeof rest[0] !== 'function'
                ? rest.shift()
                : {}
            return original.call(
              this,
              url,
              { ...extra, headers: { ...(extra.headers ?? {}), [HEADER]: value } },
              ...rest,
            )
          }
        }
        return original.call(this, options, ...rest)
      }
    }
  }
  console.error(
    `[version-overrides] requests to ${OVERRIDE_HOSTS.join(', ')} carry ${HEADER}: ${value}`,
  )
}
