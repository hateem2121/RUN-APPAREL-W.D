/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the CMS worker, e.g. https://cms.wear-run.help */
  readonly VITE_API_BASE_URL?: string
  /** Cloudflare Web Analytics beacon token (optional). */
  readonly VITE_CF_BEACON_TOKEN?: string
  /** Sentry DSN for client error tracking (optional; unset = disabled). */
  readonly VITE_SENTRY_DSN?: string
  /** Release identifier tagged on Sentry events (optional). */
  readonly VITE_SENTRY_RELEASE?: string
}

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
