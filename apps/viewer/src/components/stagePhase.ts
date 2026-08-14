/**
 * The 3D stage's lifecycle, as one value instead of three booleans.
 *
 * WHY. `<Stage>` tracked this with `fallback`, `modelLoaded` and `swapping` —
 * eight combinations, of which four are meaningless and one is actively wrong:
 * `fallback && modelLoaded` says "showing a photograph AND an interactive model
 * is loaded". That state shipped. The `webglcontextlost` handler set `fallback`
 * and left `modelLoaded` true, so the live region announced "Drag to rotate, use
 * scroll or pinch to zoom" over a static poster — the failure
 * apps/viewer/CLAUDE.md names as the most likely way the 3D dies in front of a
 * real buyer. Making it unrepresentable is cheaper than remembering.
 *
 * SCOPE IS DELIBERATELY NARROW. Only the flags that can contradict each other
 * live here. `libReady`, `notice` and `resolvedSrc` stay as they are: they are
 * orthogonal to the lifecycle — a notice is valid in any phase — and folding
 * them in would produce more states than the component has behaviours, which is
 * the failure mode this refactor is supposed to avoid rather than commit.
 */

export type PosterReason =
  | 'no-model'
  | 'no-webgl'
  | 'module-failed'
  | 'context-lost'
  | 'load-failed'

export type StagePhase =
  /** Downloading and decoding. The readout is showing real bytes. */
  | { kind: 'loading' }
  /** The model is on screen and interactive. */
  | { kind: 'live' }
  /** Live, but re-binding materials or swapping src for a colour change. */
  | { kind: 'swapping' }
  /** 3D is not available. The poster is the garment. TERMINAL. */
  | { kind: 'poster'; reason: PosterReason }

export type StageEvent =
  | { type: 'loaded' }
  | { type: 'swap-started' }
  | { type: 'context-lost' }
  | { type: 'load-failed'; reason: PosterReason }

/**
 * `poster` is TERMINAL, and that is the point rather than an oversight.
 *
 * A GPU that dropped the context does not hand it back because a stray `load`
 * event arrived on a torn-down element; the page has to be reloaded. Modelling
 * it as terminal stops a late event resurrecting a stage that has nothing behind
 * it — which is the same class of bug as the one this module exists to prevent,
 * approached from the other side.
 */
export function stagePhase(current: StagePhase, event: StageEvent): StagePhase {
  if (current.kind === 'poster') return current

  switch (event.type) {
    case 'loaded':
      return { kind: 'live' }
    case 'swap-started':
      // Only a live model can swap. From `loading`, a swap is just more loading.
      return current.kind === 'live' ? { kind: 'swapping' } : current
    case 'context-lost':
      return { kind: 'poster', reason: 'context-lost' }
    case 'load-failed':
      return { kind: 'poster', reason: event.reason }
    default:
      return current
  }
}

/** The model is on screen and can be interacted with. */
export const isLive = (phase: StagePhase): boolean =>
  phase.kind === 'live' || phase.kind === 'swapping'

/** 3D is unavailable; the poster IS the garment. */
export const isPoster = (phase: StagePhase): boolean => phase.kind === 'poster'

/** Mid colour change — still live, but the picture is about to change. */
export const isSwapping = (phase: StagePhase): boolean => phase.kind === 'swapping'
