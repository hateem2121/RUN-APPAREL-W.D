import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Make the e2e suite runnable from a cold checkout. Run by the Playwright
 * webServer command BEFORE serve.mjs, so the built dist + fixtures exist by
 * the time Playwright polls the server:
 *  1. generate asset-pipeline fixtures (posters + merged GLB) if absent,
 *  2. build the viewer with an EMPTY api base so it calls the same-origin mock.
 */
const viewerDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(viewerDir, '..', '..')

if (!existsSync(join(repoRoot, 'tools', 'asset-pipeline', 'output', 'n001.glb'))) {
  execSync('pnpm seed:assets', { cwd: repoRoot, stdio: 'inherit' })
}
execSync('pnpm build', {
  cwd: viewerDir,
  stdio: 'inherit',
  env: { ...process.env, VITE_API_BASE_URL: '' },
})
