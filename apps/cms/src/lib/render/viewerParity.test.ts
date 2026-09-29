import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIVE_RENDER } from './liveRender'

/**
 * The home page's live garment (2026-09-29) renders with the viewer's own two fixes for the
 * print disappearing — the adaptive near plane and the decal depth bias — from VERBATIM copies
 * of the viewer's files, because an app may not import from another (biome.jsonc).
 *
 * ⚠️ WHY COPIES AND NOT A MOVE TO packages/shared: the viewer's coverage was 58.68% lines
 * against a 58% floor (measured 2026-09-29), these two are among its best-tested files, and a
 * floor must not be lowered to go green (.claude/rules/tests-and-fixtures.md). The copies are
 * the review tool's pattern (`tools/asset-pipeline/src/review-server.test.ts` holds its port
 * equal the same way).
 *
 * ⚠️ AND WHY THE WHOLE FILE, BYTE FOR BYTE. A rendering fix that reaches one renderer and not
 * the other is the failure this repo has paid for three times (`viewer-model-viewer.md`: "a
 * rendering fix here must be ported … or the owner judges a good garment as broken"). A
 * constant-by-constant check cannot see a new mechanism; equality of the text can.
 */
const VIEWER_LIB = join(import.meta.dirname, '..', '..', '..', '..', 'viewer', 'src', 'lib')

describe('the home page renders garments exactly as the viewer does', () => {
  for (const file of ['camera-near-plane.ts', 'decal-depth-bias.ts']) {
    it(`${file} is identical to the viewer's`, () => {
      const viewer = readFileSync(join(VIEWER_LIB, file), 'utf8')
      const site = readFileSync(join(import.meta.dirname, file), 'utf8')
      expect(
        site === viewer,
        `apps/cms/src/lib/render/${file} differs from apps/viewer/src/lib/${file}. Copy the ` +
          "viewer's file over this one — the viewer's is the original.",
      ).toBe(true)
    })
  }
})

/*
 * The lighting and decoders, which live as constants and attributes rather than files. Read as
 * text from the viewer, because an app may not import another's code.
 */
describe('the home page lights and decodes garments as the viewer does', () => {
  const VIEWER_SRC = join(VIEWER_LIB, '..')
  const stage = readFileSync(join(VIEWER_SRC, 'components', 'Stage.tsx'), 'utf8')
  const config = readFileSync(join(VIEWER_SRC, 'components', 'stageConfig.ts'), 'utf8')
  const motion = readFileSync(join(VIEWER_LIB, 'motion.ts'), 'utf8')

  it('uses the same decoder files and environment image', () => {
    expect(config).toContain(`MESHOPT_DECODER_URL = '${LIVE_RENDER.meshoptDecoderUrl}'`)
    expect(config).toContain(`DRACO_DECODER_URL = '${LIVE_RENDER.dracoDecoderUrl}'`)
    expect(config).toContain(`KTX2_TRANSCODER_URL = '${LIVE_RENDER.ktx2TranscoderUrl}'`)
    expect(config).toContain(`ENVIRONMENT_IMAGE = '${LIVE_RENDER.environmentImage}'`)
  })

  it('uses the same tone mapping, exposure, shadow and camera settle', () => {
    expect(stage).toContain(`tone-mapping="${LIVE_RENDER.toneMapping}"`)
    expect(stage).toContain(`exposure="${LIVE_RENDER.exposure}"`)
    expect(stage).toContain(`shadow-intensity="${LIVE_RENDER.shadowIntensity}"`)
    expect(stage).toContain(`shadow-softness="${LIVE_RENDER.shadowSoftness}"`)
    expect(motion).toContain(`CAMERA_DECAY_MS = ${LIVE_RENDER.cameraDecayMs}`)
  })
})
