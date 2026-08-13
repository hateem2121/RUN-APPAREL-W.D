/**
 * The arithmetic behind an honest loading readout.
 *
 * Extracted rather than inlined for the reason `colourwayPreview.ts` gives: every
 * wrong answer in here renders perfectly. A division by zero shows
 * `~INFINITYS LEFT`, a negative shows `~-3S LEFT`, and both look like a working
 * feature in review. `<model-viewer>` cannot be exercised under jsdom, so this is
 * the layer where the numbers can actually be proven.
 */

/**
 * Seconds until the download completes, or `null` when that cannot honestly be
 * said yet.
 *
 * Null rather than a guess is the whole point. The readout promises "how much is
 * left", so a value it cannot compute must be absent from the line rather than
 * rendered as a placeholder the visitor would read as real.
 */
export function secondsRemaining(
  loaded: number,
  total: number,
  bytesPerSecond: number,
): number | null {
  // No size means no denominator. `content-length` is present on
  // media.wear-run.help today (28,271,780 bytes, no content-encoding) but a
  // future edge setting could remove it, and model-viewer's own loader guards
  // the same case with `isFinite`.
  if (!(total > 0)) return null
  // The first callback arrives with no elapsed time behind it, so the rate is 0.
  if (!(bytesPerSecond > 0)) return null
  // Chunked transfer can deliver marginally more than advertised; clamp here so
  // the formatter never has to think about it.
  return Math.max(0, (total - loaded) / bytesPerSecond)
}

/**
 * Exponentially-smoothed transfer rate, in bytes per second.
 *
 * Mobile throughput is bursty, and the per-chunk rate swings hard enough to make
 * a raw ETA flick between "~4S LEFT" and "~40S LEFT" several times a second. A
 * countdown that jumps like that is worse than none: it reads as a broken
 * estimate rather than a slow network. `alpha` is how much of each new
 * measurement to admit — lower is steadier and slower to react.
 */
export function smoothRate(previous: number | null, sample: number, alpha = 0.25): number {
  // Nothing to average against on the first sample. Seeding with 0 instead would
  // make the opening estimate enormous and then visibly collapse.
  if (previous === null) return sample
  return previous + alpha * (sample - previous)
}

/**
 * Whole-percent complete, or `null` when the size is unknown.
 *
 * FLOORED, deliberately. Rounding lets 99.6% display as "100%" while megabytes
 * are still arriving, which is the complaint this whole change exists to answer:
 * the number must not claim to be finished before it is.
 */
export function percentComplete(loaded: number, total: number): number | null {
  if (!(total > 0)) return null
  if (loaded >= total) return 100
  return Math.max(0, Math.floor((loaded / total) * 100))
}

/** One binary megabyte — what a file manager means by "MB". */
const MB = 1024 * 1024

/**
 * Bytes as a fixed one-decimal megabyte string.
 *
 * The decimal is never dropped. The readout is centred, so a value that changes
 * width — "16" then "16.7" — shifts the entire line sideways several times a
 * second while counting.
 */
export function formatMb(bytes: number): string {
  return (bytes / MB).toFixed(1)
}

/**
 * The time-remaining clause, or `null` when there is no honest estimate.
 *
 * Rounds to nearest but never below one second. A countdown that reaches
 * "0S LEFT" while the file is still arriving is the same lie as a bar that reads
 * 100% early, just in a different unit — and rounding UP instead would overstate
 * every estimate by up to a second, which reads as a countdown that stalls.
 */
export function formatEta(seconds: number | null): string | null {
  if (seconds === null) return null
  const total = Math.max(1, Math.round(seconds))
  if (total < 60) return `~${total}S LEFT`
  // The measured wait is 45.2 s on weak 4G and 150.8 s on 3G. "~151S LEFT" is a
  // number nobody converts in their head.
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `~${minutes}M ${rest}S LEFT`
}

export type LoadPhase = 'downloading' | 'preparing' | 'ready'

export interface LoadDescription {
  phase: LoadPhase
  /** Whole percent, or null when no honest percentage exists. */
  percent: number | null
  /** The figures clause, or null when there is nothing truthful to add. */
  detail: string | null
}

/**
 * The two-stage readout, decided in one place.
 *
 * Stage one is the download, where every byte is countable. Stage two is decode
 * and shader compile, where NOTHING is: model-viewer caps its own number at 0.76
 * through the download and spends the remaining quarter here, with no byte-level
 * signal to offer. Attaching a percentage to that stage would be inventing one
 * again — the precise habit this change exists to remove — so it gets a sentence
 * instead, and the bar goes indeterminate.
 */
export function describeLoad(args: {
  bytesLoaded: number
  bytesTotal: number
  modelLoaded: boolean
  bytesPerSecond: number | null
}): LoadDescription {
  const { bytesLoaded, bytesTotal, modelLoaded, bytesPerSecond } = args
  if (modelLoaded) return { phase: 'ready', percent: null, detail: null }

  const everyByteIn = bytesTotal > 0 && bytesLoaded >= bytesTotal
  if (everyByteIn) return { phase: 'preparing', percent: null, detail: null }

  const clauses: string[] = []
  clauses.push(
    bytesTotal > 0
      ? `${formatMb(bytesLoaded)} / ${formatMb(bytesTotal)} MB`
      : `${formatMb(bytesLoaded)} MB`,
  )
  const eta = formatEta(secondsRemaining(bytesLoaded, bytesTotal, bytesPerSecond ?? 0))
  if (eta) clauses.push(eta)

  return {
    phase: 'downloading',
    percent: percentComplete(bytesLoaded, bytesTotal),
    // ` · ` is the stage's own idiom for joining peer facts on one line.
    detail: clauses.join(' · '),
  }
}
