/**
 * How the home page's live garment is lit and decoded — the viewer's own values, held equal to
 * `apps/viewer/src/components/stageConfig.ts` and the `<model-viewer>` attributes in
 * `apps/viewer/src/components/Stage.tsx` by `viewerParity.test.ts`. A garment must not look
 * one way on the home page and another a click later.
 */
export const LIVE_RENDER = {
  /** Same-origin decoder files, handed to the viewer Worker by `viewerForward.mjs`. */
  meshoptDecoderUrl: '/meshopt_decoder.js',
  dracoDecoderUrl: '/draco/',
  ktx2TranscoderUrl: '/basis/',
  environmentImage: '/env/studio-soft.hdr',
  toneMapping: 'neutral',
  exposure: '1',
  shadowIntensity: '0.6',
  shadowSoftness: '0.8',
  /** The viewer's camera settle, in ms (`apps/viewer/src/lib/motion.ts`). */
  cameraDecayMs: 50,
} as const
