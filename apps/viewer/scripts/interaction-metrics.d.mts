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
