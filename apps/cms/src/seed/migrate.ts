import { getPayload } from 'payload'
import config from '../payload.config'

// Migration runner used by the CLI scripts and the gated CI `migrate` job.
//
// Direction is chosen by env flag so `payload run` needs no extra args:
//   • default            → apply all pending migrations (`up`)
//   • PAYLOAD_MIGRATE_DOWN=1 → roll back the most recent batch (`down`)
//
// Target database is chosen upstream in payload.config.ts:
//   • PAYLOAD_LOCAL_D1=1                        → local emulated D1 (dev)
//   • PAYLOAD_LOCAL_D1=1 + PAYLOAD_MIGRATE_REMOTE=1 → remote production D1
//     (via wrangler.migrate.jsonc; needs CLOUDFLARE_API_TOKEN)
//
// The remote scripts run with NODE_ENV=production so Payload does NOT auto-push
// the schema on init (dev-mode behaviour). Pushing against the already-migrated
// production D1 fails with "index … already exists"; migrations are the source
// of truth there, so we only connect, then apply pending migrations explicitly.
//
// The explicit process.exit is required because the local wrangler platform
// proxy keeps a workerd process alive that would otherwise hang the run.
const payload = await getPayload({ config })

if (process.env.PAYLOAD_MIGRATE_DOWN === '1') {
  await payload.db.migrateDown()
  payload.logger.info('Migration rollback (down) complete.')
} else {
  await payload.db.migrate()
  payload.logger.info('Migrations complete.')
}

process.exit(0)
