import { useEffect, useState } from 'react'

/** Whether the device says it has a connection, kept current by the browser's own events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    // The state may have changed between the first render and this effect.
    update()
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}

/**
 * "Reload Page" for the two failures only a fresh page load can mend (2026-10-14): a
 * crash caught by `ErrorBoundary`, and the full-screen picture's code failing to arrive
 * (`HdImageButton`).
 *
 * ⚠️ A REAL RELOAD, NOT A RE-DRAW, AND THE REASON WAS MEASURED. On 2026-10-14, in
 * Chromium, a dynamic `import()` that failed once failed again for the same address
 * after the network came back (`Failed to fetch dynamically imported module`); only a
 * different address or a new page loaded it. React's `lazy()` also keeps the rejected
 * promise. So a "Try again" that re-drew the page would repeat the same crash on every
 * tap. A page translated by the browser (the 8 Oct 2026 crash, Spanish Safari,
 * facebook/react#11538) has the same shape: the translator has rewritten the page's
 * text, and only a new page gives React back a document it drew itself.
 *
 * ⚠️ NOT WHILE THE DEVICE SAYS IT IS OFFLINE. `UnreachableState` explains why it never
 * calls `location.reload()`: offline, a reload can replace a working page with the
 * browser's own error page. The service worker's offline copy of the garment page
 * (`scripts/sw.mjs`) catches that only once it is installed, which a first visit or a
 * private window never reaches. Here a reload is the only cure, so instead of not
 * reloading at all, the button waits: disabled while `navigator.onLine` is false, back
 * the moment the `online` event fires. `onLine` can say true on a network that reaches
 * nothing (a hotel login page); that case is a reload like any other, and no worse
 * than the browser's own reload button.
 *
 * ⚠️ NEVER RELOADS BY ITSELF, not even when the signal returns. `ErrorBoundary`'s "NO
 * AUTO-RESET" note is about this: a crash that repeats on every load would reload in a
 * loop, burning the battery and writing the same Events row each time. One tap, one load.
 */
export function ReloadPageButton({
  online,
  className = 'btn btn--primary',
  reload = () => window.location.reload(),
}: {
  online: boolean
  className?: string
  /** For the test, which cannot reload jsdom. */
  reload?: () => void
}) {
  return (
    <button type="button" className={className} onClick={reload} disabled={!online}>
      {online ? 'Reload Page' : 'Waiting for Connection…'}
    </button>
  )
}

/**
 * Why the button stopped working, said where a screen reader hears it. A disabled button
 * cannot take focus, so without this a screen-reader user would never learn why.
 *
 * ⚠️ ALWAYS MOUNTED, EMPTY WHILE ONLINE. A live region announces a CHANGE to its content;
 * one that appears already holding its words is, on several screen readers, never read.
 */
export function OfflineReloadNote({ online, className }: { online: boolean; className?: string }) {
  return (
    <p className={className} role="status">
      {online
        ? ''
        : 'This device is offline. The button will work again as soon as the signal returns.'}
    </p>
  )
}
