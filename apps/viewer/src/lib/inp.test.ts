import { describe, expect, it } from 'vitest'
import { INP_DURATION_THRESHOLD_MS, createInpTracker } from './inp'

/**
 * VA-14 (visual audit, 2026-10-02): the viewer reported how fast a garment page APPEARED and
 * never how fast it ANSWERED a tap. `inp.ts` is the arithmetic of that number, written to follow
 * GoogleChrome/web-vitals' `InteractionManager` rule for rule; these pin each rule, because a
 * wrong INP is worse than none: it reads as a measurement.
 *
 * What would have to break for these to fail: an interaction's latency summed instead of taken as
 * its longest event, an event that belongs to no interaction counted as one, the one-in-fifty
 * rule dropped or applied to the wrong list, the list kept longer than ten, or the page's
 * interaction count read once instead of when the answer is wanted.
 */

/** A tracker over a fixed interaction count (the browser's own `performance.interactionCount`). */
const tracker = (count = 0) => createInpTracker(() => count)

describe('the INP arithmetic (VA-14)', () => {
  it('has no answer before any interaction has been seen', () => {
    expect(tracker().value()).toBeNull()
  })

  it('does not ask the browser for more than 40ms: its own floor is 16', () => {
    // Pinned because `durationThreshold` is rounded to a multiple of 8 and may not go below 16
    // (W3C Event Timing, 19 March 2026): a threshold outside that is silently another number.
    expect(INP_DURATION_THRESHOLD_MS).toBe(40)
    expect(INP_DURATION_THRESHOLD_MS % 8).toBe(0)
    expect(INP_DURATION_THRESHOLD_MS).toBeGreaterThanOrEqual(16)
  })

  it('ignores an event that belongs to no interaction (hover, scroll, a timer)', () => {
    const inp = tracker()
    inp.add({ duration: 900 })
    inp.add({ interactionId: 0, duration: 900 })
    expect(inp.value(), 'an entry with no interaction id is not a tap').toBeNull()
  })

  it("takes an interaction's LONGEST event as its latency, never their sum", () => {
    // A tap is a pointerdown, a pointerup and a click; each is its own entry with the same id.
    const inp = tracker()
    inp.add({ interactionId: 1, duration: 100 })
    inp.add({ interactionId: 1, duration: 150 })
    inp.add({ interactionId: 1, duration: 120 })
    expect(inp.value()).toBe(150)
  })

  it('never lowers an interaction that a shorter event arrives for afterwards', () => {
    const inp = tracker()
    inp.add({ interactionId: 7, duration: 320 })
    inp.add({ interactionId: 7, duration: 48 })
    expect(inp.value()).toBe(320)
  })

  it('is the WORST interaction while the page has had fewer than 50', () => {
    const inp = tracker(5)
    for (const [interactionId, duration] of [
      [1, 120],
      [2, 480],
      [3, 96],
      [4, 200],
      [5, 64],
    ] as const) {
      inp.add({ interactionId, duration })
    }
    expect(inp.value()).toBe(480)
  })

  it('ignores one worst interaction for every 50 the page has had', () => {
    const durations = [900, 500, 300, 200, 100]
    const answerAt = (count: number) => {
      const inp = tracker(count)
      durations.forEach((duration, index) => {
        inp.add({ interactionId: index + 1, duration })
      })
      return inp.value()
    }
    expect(answerAt(49), 'under 50 interactions: nothing is ignored').toBe(900)
    expect(answerAt(50), '50 interactions: the single worst is ignored').toBe(500)
    expect(answerAt(99)).toBe(500)
    expect(answerAt(100), '100 interactions: the two worst are ignored').toBe(300)
    expect(answerAt(200)).toBe(100)
  })

  it('reads the page interaction count when the answer is wanted, not when a tap arrives', () => {
    // The browser's count grows with every tap, including the quick ones this never sees; a tracker
    // that took it once would freeze the one-in-fifty rule at the first slow tap.
    let count = 0
    const inp = createInpTracker(() => count)
    for (const [interactionId, duration] of [
      [1, 700],
      [2, 400],
    ] as const) {
      inp.add({ interactionId, duration })
    }
    expect(inp.value()).toBe(700)
    count = 50
    expect(inp.value(), 'the count moved after the entries arrived').toBe(400)
  })

  it('keeps ten interactions, so a very long visit still answers with the tenth worst', () => {
    // Index = floor(1000 / 50) = 20, past the ten kept: the library answers with the last it has.
    const inp = tracker(1000)
    for (let id = 1; id <= 15; id += 1) inp.add({ interactionId: id, duration: id * 8 })
    // 15 interactions of 8..120ms; the ten longest are 48..120, so the tenth worst is 48.
    expect(inp.value()).toBe(48)
  })

  it('does not answer with an interaction that fell out of the ten when it is seen again', () => {
    const inp = tracker()
    // Twelve interactions, 8ms apart: ids 1 and 2 are the shortest and fall out of the ten.
    for (let id = 1; id <= 12; id += 1) inp.add({ interactionId: id, duration: id * 8 })
    // A short event for a dropped interaction must not displace anything or break the list.
    inp.add({ interactionId: 1, duration: 16 })
    expect(inp.value(), 'the worst is still interaction 12').toBe(96)
    // A longer event for it brings it back, as the library's own gate lets it.
    inp.add({ interactionId: 1, duration: 400 })
    expect(inp.value()).toBe(400)
  })

  it('agrees with a plain reckoning over many random visits, ties and all', () => {
    // A small seeded generator, so a failure names a visit that can be replayed.
    let seed = 20261002
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 2 ** 32
    }
    for (let visit = 0; visit < 300; visit += 1) {
      const count = Math.floor(random() * 450) // index at most 8: inside the ten kept
      const inp = createInpTracker(() => count)
      const longestOf = new Map<number, number>()
      const entries = 1 + Math.floor(random() * 60)
      for (let n = 0; n < entries; n += 1) {
        // Multiples of 8, because the browser rounds to them; that makes ties common.
        const entry = {
          interactionId: 1 + Math.floor(random() * 25),
          duration: 8 * (5 + Math.floor(random() * 60)),
        }
        inp.add(entry)
        longestOf.set(
          entry.interactionId,
          Math.max(longestOf.get(entry.interactionId) ?? 0, entry.duration),
        )
      }
      const worstFirst = [...longestOf.values()].sort((a, b) => b - a)
      const expected = worstFirst[Math.min(worstFirst.length - 1, Math.floor(count / 50))]
      expect(inp.value(), `visit ${visit}, count ${count}, ${entries} entries`).toBe(expected)
    }
  })
})
