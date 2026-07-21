import type { Field } from 'payload'

/**
 * <model-viewer> camera value validation. An orbit/target is three
 * whitespace-separated tokens; each token is "auto" or a number with an
 * optional unit (deg, rad, %, m, cm, mm).
 */
const TOKEN = /^(auto|-?\d+(?:\.\d+)?(?:deg|rad|%|m|cm|mm)?)$/

const validateTriple =
  (label: string) =>
  (value: unknown): string | true => {
    if (typeof value !== 'string' || value.trim() === '') return `${label} is required.`
    const tokens = value.trim().split(/\s+/)
    if (tokens.length !== 3 || tokens.some((t) => !TOKEN.test(t))) {
      return `${label} must be three space-separated values like "0deg 82deg 105%" or "auto auto auto".`
    }
    return true
  }

const validateFov = (value: unknown): string | true => {
  if (typeof value !== 'string' || value.trim() === '') return 'Field of view is required.'
  return /^\d+(?:\.\d+)?(?:deg|rad)$/.test(value.trim())
    ? true
    : 'Field of view must be a value like "30deg".'
}

export const cameraFields: Field[] = [
  {
    type: 'collapsible',
    label: '3D camera configuration',
    admin: {
      initCollapsed: true,
      description:
        'Camera positions for the FRONT / BACK / SIDE controls on the public viewer. Orbit format: "<horizontal> <vertical> <distance>", e.g. "0deg 82deg 105%".',
    },
    fields: [
      {
        name: 'frontCameraOrbit',
        type: 'text',
        required: true,
        defaultValue: '0deg 82deg 105%',
        validate: validateTriple('Front camera orbit'),
      },
      {
        name: 'backCameraOrbit',
        type: 'text',
        required: true,
        defaultValue: '180deg 82deg 105%',
        validate: validateTriple('Back camera orbit'),
      },
      {
        name: 'sideCameraOrbit',
        type: 'text',
        required: true,
        defaultValue: '90deg 82deg 105%',
        validate: validateTriple('Side camera orbit'),
      },
      {
        name: 'cameraTarget',
        type: 'text',
        required: true,
        defaultValue: 'auto auto auto',
        validate: validateTriple('Camera target'),
      },
      {
        name: 'defaultFieldOfView',
        type: 'text',
        required: true,
        defaultValue: '30deg',
        validate: validateFov,
      },
    ],
  },
]
