import type { FooterHours } from '../../lib/projectPublic'

/** Server-safe stub — replaced by the live clock island in the next task. */
export function FooterClock(_props: { hours: FooterHours | null }) {
  return (
    <span className="footer-clock">
      <i aria-hidden="true" />
      <span className="footer-clock__city">Sialkot · HQ &amp; works</span>
      <span className="footer-clock__time">
        <span>--:--</span>
        <small>PKT</small>
      </span>
    </span>
  )
}
