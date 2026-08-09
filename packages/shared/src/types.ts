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
  poster: ViewerMediaAsset
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
  /** Rich text serialised to sanitised HTML by the CMS endpoint. */
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
] as const

export type ViewerAnalyticsEvent = (typeof VIEWER_ANALYTICS_EVENTS)[number]
