/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the CMS worker, e.g. https://cms.wear-run.help */
  readonly VITE_API_BASE_URL?: string
  /** Sentry DSN for client error tracking (optional; unset = disabled). */
  readonly VITE_SENTRY_DSN?: string
  /** Release identifier tagged on Sentry events (optional). CI sets the commit SHA. */
  readonly VITE_SENTRY_RELEASE?: string
  /**
   * Sentry environment. Explicit rather than derived from `MODE`, which is
   * 'production' for every `vite build` and so cannot tell a real deploy from a
   * local production build. Defaults to 'development' when unset.
   */
  readonly VITE_SENTRY_ENVIRONMENT?: string
}

// biome-ignore lint/correctness/noUnusedVariables: global augmentation, used by every import.meta.env read
interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Attributes we use on <model-viewer>. The element itself is typed by @google/model-viewer. */
interface ModelViewerAttributes {
  src?: string
  poster?: string
  alt?: string
  'camera-controls'?: boolean | ''
  'camera-orbit'?: string
  'camera-target'?: string
  'field-of-view'?: string
  /**
   * Floors how tight `field-of-view` can go — model-viewer's own default is
   * 12deg and it SILENTLY ignores anything tighter (see apps/viewer/CLAUDE.md;
   * tools/asset-pipeline/src/render.ts hit this on 2026-08-08 and lost the
   * ability to photograph any print smaller than roughly a hand). Stage.tsx
   * sets 1deg for exactly that reason — see MIN_FIELD_OF_VIEW there.
   */
  'min-field-of-view'?: string
  'min-camera-orbit'?: string
  'max-camera-orbit'?: string
  'interaction-prompt'?: string
  'interpolation-decay'?: string | number
  'touch-action'?: string
  /**
   * Turns off model-viewer's tap-to-recenter. Defaults to OFF (i.e. tap IS
   * live) — see DISABLE_TAP in Stage.tsx for why this page sets it.
   */
  'disable-tap'?: boolean | ''
  'disable-pan'?: boolean | ''
  /**
   * Scales two-finger pan. Defaults to 1; see PAN_SENSITIVITY in Stage.tsx for
   * the measured reason this page lowers it rather than disabling pan.
   */
  'pan-sensitivity'?: string | number
  'shadow-intensity'?: string | number
  'shadow-softness'?: string | number
  'environment-image'?: string
  'skybox-image'?: string
  'tone-mapping'?: 'auto' | 'neutral' | 'aces' | 'agx' | 'commerce' | 'legacy' | 'none'
  exposure?: string | number
  loading?: 'auto' | 'lazy' | 'eager'
  reveal?: 'auto' | 'manual'
  /**
   * AR. Added 2026-09-05 — iOS Quick Look ONLY, by decision; see
   * docs/DECISION-AR-SCOPE.md.
   *
   * ⚠️ `ar-modes` must NOT list `scene-viewer`. Android's Scene Viewer cannot read
   * a `blob:` URL, and Stage.tsx gives the element a blob because it fetches the
   * GLB itself to drive the byte-accurate progress readout. model-viewer's own
   * source says passing one "will cause Scene Viewer to crash or fail silently" —
   * so listing it would not degrade, it would break.
   */
  ar?: boolean | ''
  'ar-modes'?: string
  'ar-placement'?: 'floor' | 'wall'
  /** `fixed` keeps real-world size, which is the whole point for judging fit. */
  'ar-scale'?: 'auto' | 'fixed'
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & ModelViewerAttributes,
        HTMLElement
      >
    }
  }
}

export {}
