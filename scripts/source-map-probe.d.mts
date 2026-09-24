/** Types for `source-map-probe.mjs`, so a TypeScript test can import it. */

export type MapResponseShape = 'genuine-404' | 'spa-fallback'

export interface MapResponseInput {
  status: number
  contentType: string | null
  body?: string | null
}

export interface MapResponseVerdict {
  ok: boolean
  reason: string
}

export declare const SITE_ORIGIN: string
export declare const VIEWER_ORIGIN: string
export declare const SITE_PAGE: string
export declare const VIEWER_PAGE: string

export declare function findScriptSrc(html: string, pathPrefix: string): string | null
export declare function evaluateMapResponse(
  shape: MapResponseShape,
  input: MapResponseInput,
): MapResponseVerdict
