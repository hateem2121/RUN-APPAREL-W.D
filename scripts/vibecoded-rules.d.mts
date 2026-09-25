/**
 * Types for `vibecoded-rules.mjs`, so TypeScript tests can import it — the same reason and
 * the same shape as `served-css-motion-probe.d.mts`.
 */
import type { CssRule, CssRuleViolation } from './served-css-motion-probe.mjs'

export type { CssRule, CssRuleViolation }

export declare function extractLeafRules(css: string): CssRule[]

export declare const BACKDROP_FILTER_ALLOW_LIST: string[]
export declare const COLOURED_EDGE_ALLOW_LIST: string[]
export declare function findColouredEdges(
  rules: CssRule[],
  allowList?: string[],
): CssRuleViolation[]
export declare function findBackdropFilters(
  rules: CssRule[],
  allowList?: string[],
): CssRuleViolation[]

export interface UiKitFingerprint {
  kit: string
  match: string
  context: string
}
export declare const UI_KIT_FINGERPRINTS: { kit: string; re: RegExp }[]
export declare function findUiKitFingerprints(text: string): UiKitFingerprint[]

export declare const FORBIDDEN_PACKAGES: RegExp[]
export declare function findForbiddenDependencies(manifest: {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}): string[]

export interface IconBoxGroup {
  parent: string
  children: number
  withIconAndHeading: number
}
export declare function findIconBoxRows(groups: IconBoxGroup[]): IconBoxGroup[]

export interface HeadlineNeighbour {
  where: string
  height: number
  radius: number
  hasBackground: boolean
  hasBorder: boolean
}
export declare function findHeadlineBadges(before: HeadlineNeighbour[]): HeadlineNeighbour[]

export declare function collectIconBoxGroups(rootSelector: string): IconBoxGroup[]
export declare function collectHeadlineNeighbours(): HeadlineNeighbour[]
