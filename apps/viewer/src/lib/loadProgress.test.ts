import { describe, expect, it } from 'vitest'
import {
  formatEta,
  formatMb,
  percentComplete,
  secondsRemaining,
  smoothRate,
  describeLoad,
} from './loadProgress'

/**
 * The arithmetic behind "how much is left", extracted rather than inlined for the
 * reason `colourwayPreview.ts` gives: every wrong answer here renders perfectly.
 * A time estimate that divides by zero shows `Infinity`, one that goes negative
 * shows `-3S LEFT`, and both look like a working feature in review.
 */
describe('secondsRemaining', () => {
  it('divides what is left by the measured rate', () => {
    // 27 MB total, 13.5 MB in, 1 MB/s -> 13.5 s left.
    expect(secondsRemaining(13_500_000, 27_000_000, 1_000_000)).toBeCloseTo(13.5, 3)
  })

  it('returns null before any rate has been measured', () => {
    // The first progress callback arrives with no elapsed time behind it, so the
    // rate is 0. `(total - loaded) / 0` is Infinity, which formats as "~INFINITYS
    // LEFT" — a real rendered string, which is why this needs its own branch
    // rather than trusting the division.
    expect(secondsRemaining(0, 27_000_000, 0)).toBeNull()
  })

  it('returns null when the server did not report a size', () => {
    // `content-length` is present on media.wear-run.help today (28,271,780) but a
    // future `content-encoding` would remove it. model-viewer's own code guards
    // the same case with `isFinite`; without this we would promise a countdown we
    // cannot compute.
    expect(secondsRemaining(1_000_000, 0, 500_000)).toBeNull()
  })

  it('never goes negative once the download overruns the reported size', () => {
    // Chunked transfer can deliver marginally more than `content-length`
    // advertised. Clamping here rather than in the formatter keeps the rule in
    // one place.
    expect(secondsRemaining(28_000_000, 27_000_000, 1_000_000)).toBe(0)
  })
})

describe('percentComplete', () => {
  it('reports the share of bytes that have arrived', () => {
    expect(percentComplete(13_500_000, 27_000_000)).toBe(50)
  })

  it('FLOORS rather than rounds, so it never reads 100% while bytes remain', () => {
    // The whole complaint restated. 99.6% rounds to 100, and a bar that says
    // "100%" while the garment is still arriving is exactly the dishonesty this
    // work exists to remove. Flooring is what makes 100 mean finished.
    expect(percentComplete(26_999_000, 27_000_000)).toBe(99)
  })

  it('reaches 100 only when every byte is in', () => {
    expect(percentComplete(27_000_000, 27_000_000)).toBe(100)
  })

  it('returns null when the server did not report a size', () => {
    expect(percentComplete(1_000_000, 0)).toBeNull()
  })

  it('clamps an overrun to 100 rather than reporting 104%', () => {
    expect(percentComplete(28_000_000, 27_000_000)).toBe(100)
  })
})

describe('formatMb', () => {
  it('renders one decimal place', () => {
    // 28,271,780 bytes is the real size of the N001 GLB. It must read as the
    // "27.0 MB" the owner was shown, not 28.3 — MB here is MiB, the convention
    // every file manager on their machine uses.
    expect(formatMb(28_271_780)).toBe('27.0')
  })

  it('keeps the trailing zero so the line does not reflow while counting', () => {
    // "16 / 27.0" and "16.7 / 27.0" have different widths, and the readout is
    // centred. Without a fixed decimal the whole line jitters left and right
    // several times a second.
    expect(formatMb(10_485_760)).toBe('10.0')
  })
})

describe('formatEta', () => {
  it('reads in whole seconds under a minute', () => {
    expect(formatEta(8.4)).toBe('~8S LEFT')
  })

  it('switches to minutes once the wait is long, and spells the unit', () => {
    // Not hypothetical: the measured wait is 45.2 s on weak 4G and 150.8 s on 3G,
    // and "~151S LEFT" is a number nobody converts in their head.
    //
    // ⚠️ "MIN", not "M", since 2026-08-14. This renders into a line that reads
    // "16.7 / 27.0 MB · ~2M 31S LEFT", so M meant megabytes and minutes eight
    // characters apart — in a mono font, at 10px, on a phone.
    //
    // Rounded UP, unlike the seconds branch: this file's rule is that the
    // countdown must never claim to be closer to done than it is, and dropping
    // the seconds would otherwise round 150.8s down to "~2 MIN".
    expect(formatEta(150.8)).toBe('~3 MIN LEFT')
    expect(formatEta(60)).toBe('~1 MIN LEFT')
    // Never reads "~0 MIN LEFT" at the boundary.
    expect(formatEta(61)).toBe('~2 MIN LEFT')
  })

  it('says nothing at all when there is no estimate', () => {
    // Paired with `secondsRemaining` returning null. The absent case must produce
    // an absent string, never "~?S LEFT" or "~0S LEFT".
    expect(formatEta(null)).toBeNull()
  })

  it('rounds up rather than down, so it never promises zero while work remains', () => {
    expect(formatEta(0.3)).toBe('~1S LEFT')
  })
})

describe('smoothRate', () => {
  it('adopts the first measurement outright', () => {
    // Nothing to average against yet. Seeding with 0 instead would make the
    // first ETA wildly long and then visibly collapse, which reads as broken.
    expect(smoothRate(null, 1_000_000)).toBe(1_000_000)
  })

  it('moves only part way toward a sudden spike', () => {
    // Mobile throughput is bursty. Feeding the raw per-chunk rate straight into
    // the ETA makes the countdown jump between "~4S" and "~40S" several times a
    // second — the specific jitter the plan promised to avoid.
    const next = smoothRate(1_000_000, 5_000_000, 0.25)
    expect(next).toBe(2_000_000)
    expect(next).toBeLessThan(5_000_000)
  })

  it('converges on a steady rate rather than drifting', () => {
    let rate = smoothRate(null, 1_000_000)
    for (let i = 0; i < 40; i++) rate = smoothRate(rate, 2_000_000, 0.25)
    // Relative, not absolute: `toBeCloseTo(2_000_000, 0)` demands ±0.5 on a
    // two-million value, which no exponential average reaches in finite steps.
    // Within 0.1% is what "converged" means for an ETA measured in seconds.
    expect(Math.abs(rate - 2_000_000) / 2_000_000).toBeLessThan(0.001)
  })
})

describe('describeLoad', () => {
  const base = {
    bytesLoaded: 0,
    bytesTotal: 28_271_780,
    modelLoaded: false,
    bytesPerSecond: 1_000_000,
  }

  it('reports real figures while bytes are still arriving', () => {
    const d = describeLoad({ ...base, bytesLoaded: 14_135_890 })
    expect(d.phase).toBe('downloading')
    expect(d.percent).toBe(50)
    expect(d.detail).toBe('13.5 / 27.0 MB · ~14S LEFT')
  })

  it('switches to PREPARING once every byte is in but the model is not ready', () => {
    // The honest half of the two-stage readout. model-viewer caps its own number
    // at 0.76 during download and spends the remaining quarter on decode and
    // shader compile, which has no byte-level signal at all. Showing a percentage
    // there would be inventing one again — the exact habit this work removes.
    const d = describeLoad({ ...base, bytesLoaded: 28_271_780 })
    expect(d.phase).toBe('preparing')
    expect(d.percent).toBeNull()
    expect(d.detail).toBeNull()
  })

  it('is ready once the model reports itself loaded', () => {
    const d = describeLoad({ ...base, bytesLoaded: 28_271_780, modelLoaded: true })
    expect(d.phase).toBe('ready')
  })

  it('still shows megabytes when the server gave no size', () => {
    // No percentage and no ETA are possible, but the bytes arriving are real and
    // worth showing — it is the difference between "something is happening" and
    // a frozen screen.
    const d = describeLoad({ ...base, bytesTotal: 0, bytesLoaded: 5_242_880 })
    expect(d.phase).toBe('downloading')
    expect(d.percent).toBeNull()
    expect(d.detail).toBe('5.0 MB')
  })

  it('omits the ETA clause before a rate exists', () => {
    const d = describeLoad({ ...base, bytesLoaded: 1_048_576, bytesPerSecond: null })
    expect(d.detail).toBe('1.0 / 27.0 MB')
  })
})
