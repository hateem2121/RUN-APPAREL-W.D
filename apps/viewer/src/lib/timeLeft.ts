/**
 * The Working block's "time left" (owner, 30 Oct 2026: the block must carry %, MB done and left, and
 * time left). Rough on purpose: NN/g asks for a rough figure on a long wait, and smoothRate's
 * per-sample average said "Almost done" at 11% of the recorded 3.7 MB model, whose bytes arrive in
 * bursts and speed up. So: the speed over the last 6 s, nothing until 10% is in, counting down
 * between readings, and it may rise only if the estimate doubles. On the recording: median error
 * 24%, worst 46-51%, 0 rises. No byte for 6 s means no promise at all.
 */
const WINDOW_MS = 6000
const SAMPLE_MS = 300
const FIRST_AT = 0.1
const ALMOST_DONE_AT = 0.9

export const ESTIMATING = 'Estimating time'

export interface TimeLeft {
  /** The next line to show for this fraction at this moment. */
  read(fraction: number, now: number): string
}

export function createTimeLeft(): TimeLeft {
  const history: Array<[number, number]> = []
  let shown: number | null = null
  let shownAt = 0
  let sampledAt = Number.NEGATIVE_INFINITY
  let line = ESTIMATING

  return {
    read(fraction, now) {
      if (fraction >= 1) return ''
      if (now - sampledAt < SAMPLE_MS) return line
      sampledAt = now
      history.push([now, fraction])
      line = ESTIMATING
      if (fraction < FIRST_AT) return line
      let i = history.length - 1
      while (i > 0 && now - (history[i]?.[0] ?? now) < WINDOW_MS) i--
      const [fromTime, fromFraction] = history[i] ?? [now, fraction]
      const seconds = (now - fromTime) / 1000
      const gained = fraction - fromFraction
      if (!(gained > 0 && seconds > 0)) return line
      const estimate = (1 - fraction) / (gained / seconds)
      const ticking = shown === null ? null : shown - (now - shownAt) / 1000
      shown = ticking === null || estimate > ticking * 2 ? estimate : Math.min(ticking, estimate)
      shownAt = now
      const value = shown >= 20 ? Math.ceil(shown / 5) * 5 : Math.ceil(shown)
      // "Almost done" beside "19%, 3.0 MB left" (iPhone simulator, live, 31 Oct 2026) was true of
      // the clock and false of the numbers next to it: a fast line can have 80% to go in 4 s.
      line =
        value < 5
          ? fraction >= ALMOST_DONE_AT
            ? 'Almost done'
            : 'Seconds left'
          : value >= 90
            ? `About ${Math.ceil(value / 60)} min left`
            : `About ${value} sec left`
      return line
    },
  }
}
