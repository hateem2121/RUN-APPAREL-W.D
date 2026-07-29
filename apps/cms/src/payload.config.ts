import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { resendAdapter } from '@payloadcms/email-resend'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { r2Storage } from '@payloadcms/storage-r2'
import { buildConfig } from 'payload'

import { Events } from './collections/Events'
import { Media } from './collections/Media'
import { Products } from './collections/Products'
import { RawUploads } from './collections/RawUploads'
import { Users } from './collections/Users'
import { eventsEndpoint } from './endpoints/events'
import { healthEndpoint } from './endpoints/health'
import { pipelinePlanEndpoint } from './endpoints/pipelinePlan'
import { publicViewerEndpoint } from './endpoints/publicViewer'
import { SiteSettings } from './globals/SiteSettings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Live Worker: real bindings. `next dev`: bindings via the OpenNext dev
// context. `next build` / typegen / importmap: no DB access, so a missing
// context returns null. Payload CLI runs (migrate, seed via `payload run`)
// set PAYLOAD_LOCAL_D1=1 and get wrangler's local platform proxy so they use
// the same emulated D1/R2 state — that import is gated behind the flag and
// marked ignore so bundlers never trace wrangler's native deps into the app.
async function resolveCloudflareEnv(): Promise<CloudflareEnv | null> {
  const context = await getCloudflareContext({ async: true }).catch(() => null)
  if (context?.env) return context.env

  if (process.env.PAYLOAD_LOCAL_D1) {
    // Build the specifier at runtime so no bundler can statically resolve it.
    // `webpackIgnore`/`turbopackIgnore` keep `next build` from tracing wrangler,
    // but OpenNext runs a *second* esbuild pass over the server output that does
    // NOT honour those magic comments — a literal 'wrangler' string there gets
    // bundled into the Worker (dragging in wrangler's config loader + undici's
    // node:sqlite shim, which then fail to bundle). Obfuscating the specifier,
    // the way OpenNext does for its own wrangler import, keeps it a runtime-only
    // dynamic import that is never reached inside the deployed Worker.
    const wranglerSpecifier = ['wr', 'angler'].join('')
    const { getPlatformProxy } = (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ wranglerSpecifier
    )) as {
      getPlatformProxy: (options: {
        persist?: boolean
        configPath?: string
        remoteBindings?: boolean
      }) => Promise<{ env: CloudflareEnv }>
    }
    // PAYLOAD_MIGRATE_REMOTE=1 → open the *remote* production D1 (via the
    // migrate-only wrangler.migrate.jsonc whose D1 binding is remote:true) so the
    // gated CI migrate step applies pending migrations before the new Worker
    // serves traffic. Needs CLOUDFLARE_API_TOKEN. Everything else — local dev,
    // seed, local `migrate` — keeps using the emulated D1 exactly as before.
    if (process.env.PAYLOAD_MIGRATE_REMOTE === '1') {
      const proxy = await getPlatformProxy({
        configPath: path.resolve(dirname, '../wrangler.migrate.jsonc'),
        persist: false,
        remoteBindings: true,
      })
      return proxy.env
    }
    const proxy = await getPlatformProxy({ persist: true })
    return proxy.env
  }

  return null // build / typegen / importmap — no bindings needed
}

const env = await resolveCloudflareEnv()

const mediaBaseUrl = (env?.PUBLIC_MEDIA_BASE_URL ?? process.env.PUBLIC_MEDIA_BASE_URL ?? '').replace(/\/$/, '')

const allowedOrigins = (
  env?.VIEWER_ALLOWED_ORIGINS ??
  process.env.VIEWER_ALLOWED_ORIGINS ??
  'https://viewer.wear-run.help,http://localhost:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

// Transactional email (password resets, admin notifications). Configured only
// when a Resend API key is present, so local dev / builds without one fall back
// to Payload's console-logging email adapter instead of failing. Set the key
// with `wrangler secret put RESEND_API_KEY`; the from address/name are non-secret
// wrangler.jsonc vars. The sending domain must be verified in Resend.
const resendApiKey = env?.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? ''
const emailFromAddress =
  env?.EMAIL_FROM_ADDRESS ?? process.env.EMAIL_FROM_ADDRESS ?? 'noreply@wear-run.help'
const emailFromName = env?.EMAIL_FROM_NAME ?? process.env.EMAIL_FROM_NAME ?? 'RUN APPAREL'

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      titleSuffix: ' — RUN APPAREL CMS',
    },
  },
  collections: [Users, Media, RawUploads, Products, Events],
  globals: [SiteSettings],
  endpoints: [publicViewerEndpoint, healthEndpoint, eventsEndpoint, pipelinePlanEndpoint],
  cors: allowedOrigins,
  editor: lexicalEditor(),
  ...(resendApiKey
    ? {
        email: resendAdapter({
          apiKey: resendApiKey,
          defaultFromAddress: emailFromAddress,
          defaultFromName: emailFromName,
        }),
      }
    : {}),
  secret: env?.PAYLOAD_SECRET ?? process.env.PAYLOAD_SECRET ?? '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteD1Adapter({
    // Cast: the binding is absent only in CLI contexts that never open the DB.
    binding: env?.D1 as D1Database,
    // Drizzle "push" (auto-sync the dev database from the config) defaults to ON
    // outside production. It silently competes with the migrations below for the
    // role of source-of-truth, and it does not run their data backfills — on
    // 2026-07-29 `pnpm migrate` opened with "You're about to delete colourways
    // table with 3 items" instead of applying the migration that MOVES those
    // three rows onto their product. Off, so local and production apply the same
    // committed migrations. Schema changes now need `pnpm migrate:create`.
    push: false,
    // NOTE: migrations are NOT applied on the deployed Worker. They run in an
    // explicit, gated CI step (`.github/workflows/ci.yml` → the `migrate` job
    // applies pending migrations to the *remote* production D1 *before* the new
    // Worker is deployed). The old cold-start `prodMigrations` path is
    // deliberately removed — running migrations lazily on first request hung in
    // production once. Committed migrations in ./migrations remain the single
    // source of truth; `pnpm --filter @run-apparel/cms migrate` applies them to
    // the local emulated D1 for development.
  }),
  // No `sharp`: image transforms are unavailable on Workers — posters are
  // optimised by the asset pipeline before upload instead.
  graphQL: {
    disable: true,
  },
  // ⚠️ PAYLOAD v4: storage adapters move OUT of `plugins` and into a new
  // top-level `storage` key — "declaring adapters inside `plugins` no longer
  // works". That key does not exist in 3.86, so the move cannot be made early.
  // Keeping both adapters in this one array is the next best thing: the upgrade
  // becomes `plugins: []` + `storage: storageAdapters`, with nothing else to
  // untangle. See docs/RAW-UPLOAD-PIPELINE.md for the storage-r2 patch, which
  // also has to be re-tested against v4's shared upload-instructions endpoint.
  plugins: [
    r2Storage({
      bucket: env?.R2 as R2Bucket,
      collections: {
        media: mediaBaseUrl
          ? {
              // Public R2 domain configured: hand the browser direct,
              // long-lived media URLs.
              disablePayloadAccessControl: true,
              generateFileURL: ({ filename: name, prefix }) =>
                [mediaBaseUrl, prefix, name].filter(Boolean).join('/'),
            }
          : true, // fallback: media streams through the CMS (fine for dev)
      },
    }),
    // Separate, PRIVATE ingest bucket for un-processed raw CLO uploads. Kept off
    // the public media domain so a raw file is never buyer-facing (RawUploads is
    // admin/editor-only and this bucket has no custom domain). `clientUploads`
    // uploads the file straight to R2 in 5 MB chunks, so ~350 MB files bypass the
    // ~100 MB Worker body limit and show real progress instead of a dead spinner.
    r2Storage({
      bucket: env?.R2_INGEST as R2Bucket,
      // Chunked direct-to-R2 upload for this instance's collections. Access to
      // the signed multipart-upload endpoint defaults to each collection's
      // `create` access (admin/editor), so only authenticated staff can start an
      // upload. No public URL generation (this bucket has no custom domain).
      clientUploads: true,
      collections: {
        'raw-uploads': true,
      },
    }),
  ],
})
