import { LOOM_MARK_BANDS, LOOM_MARK_PATHS, LOOM_MARK_VIEWBOX } from '@run-apparel/shared'

/**
 * S4, the woven mark: five picks laid, held, passed through. `id` is fixed by the caller so the
 * markup of index.html's copy can equal the component's. No inline style: the CSP has no room for
 * one in index.html, so each band's order is its class.
 */
export function LoomMark({ id }: { id: string }) {
  return (
    <svg className="loom-mark" viewBox={LOOM_MARK_VIEWBOX} aria-hidden="true">
      <defs>
        <g id={`${id}-m`}>
          {LOOM_MARK_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        {LOOM_MARK_BANDS.map(([y, h], i) => (
          <clipPath id={`${id}-${i}`} key={y}>
            <rect
              className={`loom-mark__pick loom-mark__pick--${i}`}
              x="0"
              y={y}
              width="8000"
              height={h + 40}
            />
          </clipPath>
        ))}
      </defs>
      <use className="loom-mark__bed" href={`#${id}-m`} />
      {LOOM_MARK_BANDS.map(([y], i) => (
        <g clipPath={`url(#${id}-${i})`} key={y}>
          <use href={`#${id}-m`} />
        </g>
      ))}
    </svg>
  )
}
