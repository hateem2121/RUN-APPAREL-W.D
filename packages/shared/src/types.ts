/**
 * Public viewer API contract shared between apps/cms (producer) and
 * apps/viewer (consumer). Only published, public-safe data ever crosses
 * this boundary — no drafts, CMS users, internal notes or source files.
 */

export type VariantMode = 'single-glb-variants' | 'separate-glb-per-colour'

export type ProductCategory =
  | 'Sportswear'
  | 'Teamwear & Uniforms'
  | 'Casual Wear'
  | 'Outerwear'
  | 'Sports Accessories'

/** <model-viewer> camera configuration, CMS-controlled per product. */
export interface ViewerCameraConfig {
  /** e.g. "0deg 85deg 105%" */
  frontCameraOrbit: string
  /** e.g. "180deg 85deg 105%" */
  backCameraOrbit: string
  /** e.g. "90deg 85deg 105%" */
  sideCameraOrbit: string
  /** e.g. "auto auto auto" or "0m 1m 0m" */
  cameraTarget: string
  /** e.g. "30deg" */
  defaultFieldOfView: string
}

export interface ViewerMediaAsset {
  url: string
  alt: string
  width: number | null
  height: number | null
  mimeType: string | null
}

export interface ViewerCustomisationStep {
  number: number
  title: string
  body: string
}

export interface ViewerColourway {
  /** Structured ID, e.g. "N001-NAVY" — must match a KHR_materials_variants name in single-glb mode. */
  variantId: string
  /** e.g. "Navy" */
  displayName: string
  /** URL segment, e.g. "navy" */
  slug: string
  sequence: number
  /**
   * NULLABLE since 2026-08-21, when the stage stopped painting a photograph and the
   * publish gate stopped demanding one. A published colourway may legitimately have
   * no poster now; its only remaining consumer is the link-preview card built in
   * apps/viewer/worker/preview.ts, which already falls back when it is absent.
   */
  poster: ViewerMediaAsset | null
  /** Dedicated GLB — populated only when the parent product uses "separate-glb-per-colour". */
  glbUrl: string | null
  isDefault: boolean
  altText: string
  hexSwatch: string | null
}

export interface ViewerProduct {
  productCode: string
  slug: string
  productName: string
  category: ProductCategory
  variantMode: VariantMode
  /** Production merged GLB — populated only when variantMode is "single-glb-variants". */
  glbUrl: string | null
  posterFallback: ViewerMediaAsset | null
  fabricComposition: string
  gsm: string
  performanceFeatures: string[]
  garmentFit: string
  /**
   * A few sentences about this garment, shown under its name. Empty string when
   * the owner has not written one — every product created before 2026-08-17 is
   * in that state, so the viewer keeps a generic paragraph as its fallback.
   */
  shortDescription: string
  /**
   * Rich text serialised to sanitised HTML by the CMS endpoint.
   *
   * ⚠️ SOURCED FROM THE `build-process` GLOBAL SINCE 2026-08-17, not from the
   * product. The name and shape are unchanged on purpose — the viewer consumes
   * these exactly as it did, and the switch is entirely inside
   * apps/cms/src/endpoints/projectViewer.ts.
   */
  customisationIntroHtml: string
  customisationSteps: ViewerCustomisationStep[]
  camera: ViewerCameraConfig
  catalogueUrl: string
  retiredMessage: string
}

export interface ViewerSiteSettings {
  companyName: string
  email: string
  whatsappNumber: string
  catalogueUrl: string
  temporaryWordmark: string
  footerLine: string
  legalLine: string
}

export interface ViewerApiSuccess {
  product: ViewerProduct
  /** Active colourways only, sorted by sequence. */
  colourways: ViewerColourway[]
  /** The requested colourway if active, otherwise the default active colourway. */
  selectedColourway: ViewerColourway
  /** True when the QR-linked colourway is retired/missing and the default was substituted. */
  requestedColourwayUnavailable: boolean
  /** Display-safe notice shown when requestedColourwayUnavailable is true. */
  fallbackMessage: string | null
  siteSettings: ViewerSiteSettings
}

export interface ViewerApiError {
  error: 'not_found'
  message: string
}

export type ViewerApiResponse = ViewerApiSuccess | ViewerApiError

export function isViewerApiError(res: ViewerApiResponse): res is ViewerApiError {
  return 'error' in res
}

export const VIEWER_ANALYTICS_EVENTS = [
  'viewer_page_loaded',
  'model_loaded',
  'colourway_selected',
  'camera_front_selected',
  'camera_back_selected',
  'camera_side_selected',
  'email_clicked',
  'whatsapp_clicked',
  'catalogue_clicked',
  'retired_colourway_fallback',
  /*
   * Core Web Vitals, one report per visit, sent when the page is hidden.
   *
   * ⚠️ Adding a name here is the WHOLE integration. `apps/cms/src/endpoints/
   * events.ts` builds `KNOWN_ANALYTICS` from this array and rejects anything not in
   * it, so an event the viewer sends and this list does not carry is dropped
   * silently at ingest — no error, no row, and a dashboard that simply never fills
   * in. There is no schema or migration to change; there is also no second place
   * that would tell you if you forgot.
   */
  'web_vitals',
] as const

export type ViewerAnalyticsEvent = (typeof VIEWER_ANALYTICS_EVENTS)[number]
