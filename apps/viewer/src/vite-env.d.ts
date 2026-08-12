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
   * 12deg and it SILENTLY ignores anything tighter (see RenderPage.tsx and
   * apps/viewer/CLAUDE.md; tools/asset-pipeline/src/render.ts hit this on
   * 2026-08-08 and lost the ability to photograph any print smaller than
   * roughly a hand). '/render' sets this to 1deg for exactly that reason.
   */
  'min-field-of-view'?: string
  'min-camera-orbit'?: string
  'max-camera-orbit'?: string
  'interaction-prompt'?: string
  'interpolation-decay'?: string | number
  'touch-action'?: string
  'shadow-intensity'?: string | number
  'shadow-softness'?: string | number
  'environment-image'?: string
  'skybox-image'?: string
  'tone-mapping'?: 'auto' | 'neutral' | 'aces' | 'agx' | 'commerce' | 'legacy' | 'none'
  exposure?: string | number
  loading?: 'auto' | 'lazy' | 'eager'
  reveal?: 'auto' | 'manual'
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
