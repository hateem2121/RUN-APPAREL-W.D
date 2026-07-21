import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { r2Storage } from '@payloadcms/storage-r2'
import { buildConfig } from 'payload'

import { Colourways } from './collections/Colourways'
import { Media } from './collections/Media'
import { Products } from './collections/Products'
import { Users } from './collections/Users'
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
      getPlatformProxy: (options: { persist: boolean }) => Promise<{ env: CloudflareEnv }>
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
  collections: [Users, Media, Products, Colourways],
  globals: [SiteSettings],
  endpoints: [publicViewerEndpoint],
  cors: allowedOrigins,
  editor: lexicalEditor(),
  secret: env?.PAYLOAD_SECRET ?? process.env.PAYLOAD_SECRET ?? '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteD1Adapter({
    // Cast: the binding is absent only in CLI contexts that never open the DB.
    binding: env?.D1 as D1Database,
  }),
  // No `sharp`: image transforms are unavailable on Workers — posters are
  // optimised by the asset pipeline before upload instead.
  graphQL: {
    disable: true,
  },
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
  ],
})
