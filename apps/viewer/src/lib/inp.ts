/**
 * INTERACTION TO NEXT PAINT, from the browser's event-timing entries (visual audit VA-14, 2026-10-02).
 *
 * INP — how fast the page answers a tap — has been a Core Web Vital since March 2024, and the viewer
 * reported only LCP and CLS until now. This is the ARITHMETIC, kept apart from the observer
 * (`webVitals.ts`) so it can be tested with plain numbers. It follows the reference implementation
 * (GoogleChrome/web-vitals v6.2.2, `src/lib/InteractionManager.ts`, read 2026-10-02) and the metric's
 * own definition (web.dev/articles/inp, updated 2025-09-02):
 *
 *   - an INTERACTION is every event that shares one `interactionId` (a tap is a pointerdown, a
 *     pointerup and a click). Entries with no id — hover, scroll, the page's own timers — are not
 *     interactions and are ignored;
 *   - an interaction's LATENCY is the longest `duration` among its events, not their sum;
 *   - INP is the WORST interaction, except that a page with many interactions ignores one highest
 *     per 50 (about the 98th percentile): `index = min(candidates - 1, floor(count / 50))`;
 *   - only the ten longest are kept, because only they can ever be that index.
 *
 * ⚠️ `webVitals.ts` USED TO SAY "TAKE THE LIBRARY, DO NOT HAND-ROLL IT". It is hand-written after all,
 * for three concrete reasons. The audit scoped this change to webVitals.ts, the events endpoint and
 * one migration, and a library is a new dependency (a lockfile change on a branch being merged with
 * many others). `web-vitals`' `onINP` returns nothing — there is no way to stop it — while this
 * module's contract, and its tests', is that `initWebVitals()` removes everything it added. And it
 * would sit in the entry chunk (21.2 KB gzipped on 2026-10-02); the README's own size note is ~3 KB
 * brotli for the whole library. What the old warning feared was a WRONG number, and the rules above
 * are the whole of the algorithm, each pinned by `inp.test.ts` with a planted defect. If you would
 * rather take the library, `createInpTracker` is the one piece to replace with
 * `onINP(report, { reportAllChanges: true })`.
 */

/** The browser records no interaction shorter than this (ms) when asked; its own minimum is 16. */
export const INP_DURATION_THRESHOLD_MS = 40

/** Only the ten longest interactions can ever be the INP, so only ten are kept. */
const MAX_CANDIDATES = 10

/** One interaction is ignored for every 50 the page has seen. */
const INTERACTIONS_PER_IGNORED = 50

/** The two fields of an event-timing entry this reads. */
export interface InteractionEntry {
  /** 0 or absent for an event that is not part of an interaction. */
  interactionId?: number
  /** ms from the input to the next paint, in whole 8ms steps. */
  duration: number
}

type Interaction = { id: number; latency: number }

export interface InpTracker {
  add(entry: InteractionEntry): void
  /** The INP so far in ms, or null while no interaction has been seen. */
  value(): number | null
}

/**
 * @param interactionCount how many interactions the page has had, ALL of them, not only the long
 *   ones kept here: `performance.interactionCount` where the browser has it. Without it the caller
 *   passes a lower bound, and the estimate then errs high (a worse INP), never low.
 */
export function createInpTracker(interactionCount: () => number): InpTracker {
  const longest: Interaction[] = []
  const known = new Map<number, Interaction>()

  return {
    add(entry) {
      const id = entry.interactionId
      if (!id) return
      const existing = known.get(id)
      const shortest = longest.at(-1)
      // The library's own gate: an entry matters if it belongs to an interaction already kept,
      // the list is not full, or it beats the shortest one kept.
      if (
        !existing &&
        longest.length >= MAX_CANDIDATES &&
        entry.duration <= (shortest?.latency ?? 0)
      ) {
        return
      }
      if (existing) {
        if (entry.duration > existing.latency) existing.latency = entry.duration
      } else {
        const interaction = { id, latency: entry.duration }
        known.set(id, interaction)
        longest.push(interaction)
      }
      longest.sort((a, b) => b.latency - a.latency)
      for (const dropped of longest.splice(MAX_CANDIDATES)) known.delete(dropped.id)
    },

    value() {
      if (longest.length === 0) return null
      const ignored = Math.floor(interactionCount() / INTERACTIONS_PER_IGNORED)
      return longest[Math.min(longest.length - 1, ignored)]?.latency ?? null
    },
  }
}
