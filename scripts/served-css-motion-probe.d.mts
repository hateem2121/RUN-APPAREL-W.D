/**
 * Types for `served-css-motion-probe.mjs`, so TypeScript tests can import it — the same
 * reason and the same shape as `contrast-rules.d.mts`.
 */

export interface CssRule {
  selector: string
  body: string
}

export interface CssRuleViolation extends CssRule {
  reason?: string
  declaration?: string
}

export declare const WILL_CHANGE_ALLOW_LIST: string[]
export declare const LAYOUT_TRANSITION_ALLOW_LIST: string[]

export declare function extractLeafRules(css: string): CssRule[]
export declare function findHoverOpacityFades(rules: CssRule[]): CssRuleViolation[]
export declare function findForbiddenWillChangeOrTransitionAll(
  rules: CssRule[],
  allowList?: string[],
): CssRuleViolation[]
export declare function findLayoutPropertyTransitions(
  rules: CssRule[],
  allowList?: string[],
): CssRuleViolation[]
