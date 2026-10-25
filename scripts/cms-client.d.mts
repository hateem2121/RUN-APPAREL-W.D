/**
 * Types for `cms-client.mjs`, so TypeScript tests can import it — the same reason and the same
 * shape as `webdriver-client.d.mts`.
 */

export declare const CMS_DEFAULT_BASE: string
export declare const CMS_BASE_ENV: string
export declare const CMS_RENAMED_BASE_ENVS: readonly string[]
export declare const CMS_KEY_ENV: string
export declare const CMS_KEYCHAIN: { readonly service: string; readonly account: string }

export declare class CmsConfigError extends Error {}

export declare class CmsError extends Error {
  status: number | undefined
  json: unknown
  constructor(message: string, details?: { status?: number; json?: unknown })
}

type Env = Record<string, string | undefined>

export declare function resolveCmsBase(options?: {
  env?: Env
  note?: (message: string) => void
}): string
export declare function defaultCmsBase(): string
export declare function resolveCmsKey(options?: {
  env?: Env
  keychain?: boolean
  readKeychain?: () => string
}): string

export declare function assertSafeBase(base: string): void
export declare function exitIfBaseUnsafe(base: string): void
export declare function explainPayloadError(json: unknown): string
export declare function subsetMismatches(sent: unknown, stored: unknown, at?: string): string[]

export interface Served {
  ok: boolean
  status: number
  byteLength: number
  sha256: string
  cache: string | null
  contentType: string | null
  bytes: Uint8Array
}
export declare function fetchServed(
  url: string,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<Served>

export interface ReadResult {
  ok: boolean
  status: number
  /** The parsed body, or `{ raw }` (the first 300 characters) when it was not JSON. */
  json: unknown
  text: string
  /** False when the body was not JSON. */
  parsed: boolean
}

export interface WriteResult {
  ok: boolean
  /** Where it stopped: the CMS refused, it could not be read back, it read back different, done. */
  stage: 'dry-run' | 'write' | 'read' | 'verify' | 'done'
  dryRun?: boolean
  method?: string
  path?: string
  /** Status of the response that ended it (the write's, or the read-back's when that failed). */
  status: number | null
  json: unknown
  /** The document read back with `depth=0`; null when it was not read. */
  stored: unknown
  mismatches: string[]
  /** The CMS's own explanation of a refusal, key removed. */
  detail: string
  /** One readable sentence for a log. */
  error: string
}

export interface UploadResult extends WriteResult {
  /** The media document the CMS answered the upload with. */
  doc: unknown
  /** The plain GET of the file's URL, when `expectServed` was given. */
  served: Served | null
}

export type Verify = (stored: unknown, context: { sent: unknown; response: unknown }) => string[]

export interface CmsClient {
  readonly base: string
  readonly apply: boolean
  get(path: string, options?: { auth?: boolean; timeoutMs?: number }): Promise<ReadResult>
  getJson(path: string, options?: { auth?: boolean; timeoutMs?: number }): Promise<unknown>
  fetchRaw(
    path: string,
    options?: {
      method?: 'GET'
      headers?: Record<string, string>
      auth?: boolean
      timeoutMs?: number
    },
  ): Promise<Response>
  productBySlug(slug: string): Promise<ReadResult & { doc: unknown }>
  write(request: {
    method: 'POST' | 'PATCH' | 'DELETE'
    path: string
    json?: unknown
    form?: FormData
    readPath?: string | ((response: unknown) => string | null)
    verify?: Verify
    expectGone?: boolean
  }): Promise<WriteResult>
  patchDoc(
    collection: string,
    id: number | string,
    json: unknown,
    options?: { verify?: Verify },
  ): Promise<WriteResult>
  createDoc(
    collection: string,
    options?: { json?: unknown; form?: FormData; verify?: Verify },
  ): Promise<WriteResult>
  updateGlobal(slug: string, json: unknown, options?: { verify?: Verify }): Promise<WriteResult>
  deleteDoc(collection: string, id: number | string): Promise<WriteResult>
  uploadMedia(upload: {
    filename: string
    bytes: Uint8Array
    type: string
    fields?: Record<string, unknown>
    verifyDoc?: (stored: unknown) => string[]
    expectServed?: { byteLength?: number; sha256?: string }
  }): Promise<UploadResult>
  fetchServed(url: string): Promise<Served>
}

export declare function publicCmsClient(): CmsClient

export declare function createCmsClient(options?: {
  base?: string
  key?: string
  apply?: boolean
  fetchImpl?: typeof fetch
  timeoutMs?: number
  env?: Env
  note?: (message: string) => void
}): CmsClient
