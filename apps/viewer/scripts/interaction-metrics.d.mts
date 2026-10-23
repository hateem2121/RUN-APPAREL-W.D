export function totalBlockingTime(longTaskDurationsMs: number[]): number
export function worstLongTask(longTaskDurationsMs: number[]): number
export function worstInteraction(eventDurationsMs: number[]): number

export interface InteractionWalkthroughSamples {
  longTasks: number[]
  events: number[]
}

export interface InteractionWalkthroughCeilings {
  tbtCeilingMs: number
  inpCeilingMs: number
}

export interface InteractionWalkthroughResult {
  ok: boolean
  problems: string[]
  tbt: number
  worstTask: number
  inpProxy: number
}

export function evaluateInteractionWalkthrough(
  samples: InteractionWalkthroughSamples,
  ceilings: InteractionWalkthroughCeilings,
): InteractionWalkthroughResult

export function median(values: number[]): number

export interface RepeatedWalkthroughsResult {
  ok: boolean
  problems: string[]
  tbt: number
  inpProxy: number
  perWalk: { tbt: number; worstTask: number; inpProxy: number }[]
}

export function evaluateRepeatedWalkthroughs(
  walks: InteractionWalkthroughSamples[],
  ceilings: InteractionWalkthroughCeilings,
): RepeatedWalkthroughsResult
