import { describe, expect, it } from 'vitest'
import { isLive, isPoster, isSwapping, type StagePhase, stagePhase } from './stagePhase'

/**
 * WHY THIS MODULE EXISTS.
 *
 * `<Stage>` tracked its lifecycle with three independent booleans — `fallback`,
 * `modelLoaded` and `swapping` — which is eight combinations, of which four are
 * meaningless and one is actively wrong: `fallback && modelLoaded`, i.e. "we are
 * showing a photograph AND an interactive model is loaded".
 *
 * That state is not hypothetical. It SHIPPED. The `webglcontextlost` handler set
 * `fallback` and left `modelLoaded` true, so the persistent live region fell
 * through to its `modelLoaded ?` branch and announced "Drag to rotate, use
 * scroll or pinch to zoom" over a static poster — in the exact failure
 * apps/viewer/CLAUDE.md names as the most likely way the 3D dies in front of a
 * real buyer. It was fixed by hand on 2026-08-14 by remembering to clear the
 * second flag. This module makes remembering unnecessary.
 *
 * SCOPE, deliberately narrow. Only the three flags that can CONTRADICT each
 * other move here. `libReady` (has the module downloaded), `notice` (is there a
 * message) and `resolvedSrc` (which URL) are genuinely orthogonal to the
 * lifecycle — a notice can be true in any phase — and folding them in would
 * produce a union with more states than the component has behaviours.
 */
describe('stagePhase', () => {
  it('cannot be live and poster at once — the contradiction that shipped', () => {
    const phases: StagePhase[] = [
      { kind: 'loading' },
      { kind: 'live' },
      { kind: 'swapping' },
      { kind: 'poster', reason: 'context-lost' },
    ]
    for (const phase of phases) {
      expect(isLive(phase) && isPoster(phase), `${phase.kind} reports both live and poster`).toBe(
        false,
      )
    }
  })

  it('a lost context leaves the poster, never a live model', () => {
    const after = stagePhase({ kind: 'live' }, { type: 'context-lost' })
    expect(after.kind).toBe('poster')
    expect(isLive(after)).toBe(false)
    // The reason survives, because a device limit and a broken file need
    // different responses and both used to arrive as `model-load-error`.
    expect(after.kind === 'poster' && after.reason).toBe('context-lost')
  })

  it('a load failure BEFORE anything loaded falls back to the poster', () => {
    const after = stagePhase({ kind: 'loading' }, { type: 'load-failed', reason: 'no-model' })
    expect(after.kind).toBe('poster')
  })

  it('a variant swap keeps the model live rather than tearing it down', () => {
    const swapping = stagePhase({ kind: 'live' }, { type: 'swap-started' })
    expect(isSwapping(swapping)).toBe(true)
    // Load-bearing: a swap must NOT read as poster, or the stage tears down to a
    // photograph every time a visitor changes colour.
    expect(isPoster(swapping)).toBe(false)
    expect(stagePhase(swapping, { type: 'loaded' }).kind).toBe('live')
  })

  it('is terminal at poster — nothing revives a lost context by itself', () => {
    // A visitor whose GPU dropped the context does not get the model back from a
    // later `load` event on a torn-down element; the page has to be reloaded.
    // Modelling that explicitly stops a stray event resurrecting a dead stage.
    const dead = stagePhase({ kind: 'live' }, { type: 'context-lost' })
    expect(stagePhase(dead, { type: 'loaded' }).kind).toBe('poster')
    expect(stagePhase(dead, { type: 'swap-started' }).kind).toBe('poster')
  })
})

/**
 * TRY 3D AGAIN — issue #41. A stalled download is the ONE poster a visitor may leave: a network route can
 * recover, a device that has no WebGL or lost its context cannot, so those stay terminal exactly as before.
 */
describe('retry', () => {
  it('leaves a stalled poster for loading', () => {
    expect(stagePhase({ kind: 'poster', reason: 'stalled' }, { type: 'retry' })).toEqual({
      kind: 'loading',
    })
  })

  it.each(['no-model', 'no-webgl', 'module-failed', 'context-lost', 'load-failed'] as const)(
    'cannot resurrect a %s poster',
    (reason) => {
      expect(stagePhase({ kind: 'poster', reason }, { type: 'retry' })).toEqual({
        kind: 'poster',
        reason,
      })
    },
  )

  it('is ignored outside a poster', () => {
    expect(stagePhase({ kind: 'loading' }, { type: 'retry' })).toEqual({ kind: 'loading' })
    expect(stagePhase({ kind: 'live' }, { type: 'retry' })).toEqual({ kind: 'live' })
    expect(stagePhase({ kind: 'swapping' }, { type: 'retry' })).toEqual({ kind: 'swapping' })
  })

  it('reaches a stalled poster through load-failed, like every other reason', () => {
    expect(stagePhase({ kind: 'loading' }, { type: 'load-failed', reason: 'stalled' })).toEqual({
      kind: 'poster',
      reason: 'stalled',
    })
  })
})
