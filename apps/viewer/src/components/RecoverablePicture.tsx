import type { ViewerMediaAsset } from '@run-apparel/shared'
import { useState } from 'react'

/** At most one distinct small alternative; never fetch a full render automatically on a bad line. */
export function RecoverablePicture({
  pictures,
  description,
  className,
}: {
  pictures: (ViewerMediaAsset | null)[]
  description: string
  className: string
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const [attempt, setAttempt] = useState(0)
  const candidates = pictures
    .filter((picture): picture is ViewerMediaAsset => Boolean(picture))
    .filter((picture, index, all) => all.findIndex((other) => other.url === picture.url) === index)
    .slice(0, 2)
  const picture = candidates.find((candidate) => !failed.has(candidate.url))
  if (!picture)
    return candidates.length ? (
      <div className="stage__picture-recovery">
        <p role="status">The picture could not load.</p>
        <button
          type="button"
          className="stage__retry"
          onClick={(event) => {
            const stage = event.currentTarget.closest<HTMLElement>('.stage__canvas')
            if (stage) {
              stage.tabIndex = -1
              stage.focus({ preventScroll: true })
              stage.addEventListener('blur', () => stage.removeAttribute('tabindex'), {
                once: true,
              })
            }
            setFailed(new Set())
            setAttempt((previous) => previous + 1)
          }}
        >
          TRY PICTURE AGAIN
        </button>
      </div>
    ) : null
  return (
    <img
      key={`${picture.url}:${attempt}`}
      className={className}
      src={picture.url}
      alt={picture.alt || description}
      decoding="async"
      fetchPriority="high"
      draggable={false}
      onError={() => setFailed((previous) => new Set(previous).add(picture.url))}
      {...(picture.width && picture.height ? { width: picture.width, height: picture.height } : {})}
    />
  )
}
