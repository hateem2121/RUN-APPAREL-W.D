import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'
import config from '../payload.config'
import { seed } from './seed'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const assetsDir =
  process.env.SEED_ASSETS_DIR ?? path.resolve(dirname, '../../../../tools/asset-pipeline/output')

const payload = await getPayload({ config })
await seed(payload, assetsDir)
process.exit(0)
