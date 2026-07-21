import { getPayload } from 'payload'
import config from '../payload.config'

// Runs pending migrations then force-exits. The explicit exit is required
// because the local wrangler platform proxy (used for local D1 access in CLI
// contexts) keeps a workerd process alive that would otherwise hang the run.
const payload = await getPayload({ config })
await payload.db.migrate()
payload.logger.info('Migrations complete.')
process.exit(0)
