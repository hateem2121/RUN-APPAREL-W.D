import { isDocumentResponse } from './documentHeaders'

/**
 * Compress the HTML this Worker returns (audit PF-13).
 *
 * ⚠️ `no-transform` IS WHY THE PAGE WENT OUT UNCOMPRESSED, AND IT HAS TO STAY. Cloudflare
 * does not compress a response carrying `Cache-Control: no-transform`
 * (https://developers.cloudflare.com/speed/optimization/content/compression/), and
 * noTransform.ts puts that directive on every garment page to keep injected script out.
 * Measured 2026-09-16: /rxps/wine answered 11,209 bytes with no Content-Encoding to
 * requests offering `br, gzip`, plain and navigation-shaped alike.
 *
 * So the Worker compresses instead. When a Worker's response carries `Content-Encoding`
 * and `encodeBody` is left at its default ("automatic"), the runtime compresses the body
 * itself (https://developers.cloudflare.com/workers/runtime-apis/response/). `br` is
 * available because wrangler.jsonc's compatibility_date (2026-07-01) is past 2024-04-29,
 * when the `brotli_content_encoding` flag became the default. Measured 2026-09-17 on a bare
 * workerd with that date: `br` and `gzip` both arrived compressed and decoded to the exact
 * page, WHATEVER the client offered, while an `encodeBody: 'manual'` control arrived
 * undecodable. The runtime does not check the visitor, so the choice below is the only
 * thing between a visitor and bytes it cannot read.
 *
 * ⚠️ THE CHOICE READS `request.cf.clientAcceptEncoding`, NOT THE HEADER. Cloudflare rewrites
 * the visitor's Accept-Encoding before the Worker runs and keeps the visitor's own list there
 * (https://developers.cloudflare.com/workers/runtime-apis/request/). Its cache guide names
 * what reading the header does instead: a Brotli copy for a visitor that only reads gzip
 * (https://developers.cloudflare.com/workers/cache/examples/). Measured 2026-09-17 against
 * Cloudflare's own echo Worker: `gzip` is stored as "gzip", Chrome's list as
 * "gzip, deflate, br", `identity` as "identity", and nothing at all for no header, an empty
 * one, `*` or `zstd`. With no stored list the page goes out plain rather than trusting a
 * header Cloudflare may have filled in itself: every browser names gzip or br, and every
 * such list measured was stored. One thing is lost on the way: `br;q=0, gzip` is stored as
 * "gzip, br", so a refusal of brotli that explicit cannot be seen here. No browser sends one.
 *
 * ⚠️ THE ETAG IS WEAKENED, NOT DROPPED. A strong ETag promises byte-identical bodies, and a
 * compressed body is not the file's bytes. A weak one still lets a browser revalidate the
 * shell, which is served `max-age=0, must-revalidate`, and get a 304 back.
 */
export type Encoding = 'br' | 'gzip'

/** The best encoding the request accepts, honouring `q=0`. Null means "send it plain". */
export function chooseEncoding(acceptEncoding: string | null): Encoding | null {
  const offered = new Map<string, number>()
  for (const part of (acceptEncoding ?? '').split(',')) {
    const [name = '', ...params] = part.trim().toLowerCase().split(';')
    if (!name) continue
    const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='))
    const weight = q === undefined ? 1 : Number(q.slice(2))
    offered.set(name, Number.isFinite(weight) ? weight : 0)
  }
  const accepts = (name: string) => (offered.get(name) ?? offered.get('*') ?? 0) > 0
  if (accepts('br')) return 'br'
  if (accepts('gzip')) return 'gzip'
  return null
}

/**
 * The visitor's own Accept-Encoding.
 *
 * On Cloudflare (`request.cf` present): the stored list, or null when there is none, which
 * sends the page plain. The header is never read there, because it may be Cloudflare's own.
 * Outside Cloudflare (vitest; `cf` absent): the header, which nobody rewrote.
 *
 * Read through a structural cast on purpose. Under @cloudflare/workers-types `request.cf` is
 * a union and only one member has `clientAcceptEncoding`; under the DOM lib there is no `cf`
 * at all. This type-checks under both, and `typeof` does the real narrowing.
 */
export function visitorAcceptEncoding(request: Request): string | null {
  const cf = (request as unknown as { cf?: { clientAcceptEncoding?: unknown } }).cf
  if (!cf) return request.headers.get('accept-encoding')
  return typeof cf.clientAcceptEncoding === 'string' ? cf.clientAcceptEncoding : null
}

export function withCompression(request: Request, response: Response): Response {
  if (!isDocumentResponse(response)) return response
  if (response.headers.has('content-encoding')) return response
  const encoding = chooseEncoding(visitorAcceptEncoding(request))
  const next = new Response(response.body, response)
  const vary = next.headers.get('vary') ?? ''
  if (!/(^|,)\s*accept-encoding\s*(,|$)/i.test(vary)) next.headers.append('vary', 'Accept-Encoding')
  if (!encoding) return next
  next.headers.set('content-encoding', encoding)
  next.headers.delete('content-length')
  const etag = next.headers.get('etag')
  if (etag && !etag.startsWith('W/')) next.headers.set('etag', `W/${etag}`)
  return next
}
