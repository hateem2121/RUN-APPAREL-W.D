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

/** The clock's words; English unless a Russian page passes its own (lib/words.ts, 2026-11-16). */
export type TimeLeftWords = {
  readonly estimating: string
  readonly almostDone: string
  readonly secondsLeft: string
  readonly aboutMin: (minutes: number) => string
  readonly aboutSec: (seconds: number) => string
}

export const TIME_LEFT_EN: TimeLeftWords = {
  estimating: ESTIMATING,
  almostDone: 'Almost done',
  secondsLeft: 'Seconds left',
  aboutMin: (minutes) => `About ${minutes} min left`,
  aboutSec: (seconds) => `About ${seconds} sec left`,
}

export function createTimeLeft(say: TimeLeftWords = TIME_LEFT_EN): TimeLeft {
  const history: Array<[number, number]> = []
  let shown: number | null = null
  let shownAt = 0
  let sampledAt = Number.NEGATIVE_INFINITY
  let line = say.estimating

  return {
    read(fraction, now) {
      if (fraction >= 1) return ''
      if (now - sampledAt < SAMPLE_MS) return line
      sampledAt = now
      history.push([now, fraction])
      line = say.estimating
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
            ? say.almostDone
            : say.secondsLeft
          : value >= 90
            ? say.aboutMin(Math.ceil(value / 60))
            : say.aboutSec(value)
      return line
    },
  }
}
