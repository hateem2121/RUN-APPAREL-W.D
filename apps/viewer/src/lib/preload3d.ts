/**
 * The two files every 3D load needs, requested as the app starts (RO-08).
 *
 * They were `<link rel="preload">` tags in index.html (audit LIVE-10: fetched ALONGSIDE
 * the model instead of after the 287 KB model-viewer chunk, measured 0.5 s). On slow 3G
 * that put 78 KB on the wire in the same second as the one render-blocking stylesheet,
 * which is all the loading screen now waits for (index.html draws it before React). Asked
 * for here, right after the app mounts, they still start long before model-viewer asks.
 *
 * And not at all on Save-Data, where no 3D is drawn: index.html could not know that.
 * `canRender3D()` also tests WebGL, which costs a context; Stage makes that call anyway.
 *
 * The attributes are the ones the old tags carried, and they are load-bearing: the
 * decoder is injected by model-viewer as a classic script (`as="script"`), and three's
 * FileLoader reads the lighting map over fetch in CORS mode, so its preload must say
 * `as="fetch" crossorigin="anonymous"` or the browser opens a second request.
 */
export const PRELOADS_3D = [
  { href: '/meshopt_decoder.js', as: 'script' },
  { href: '/env/studio-soft.hdr', as: 'fetch', crossOrigin: 'anonymous' },
] as const

export function preload3DAssets(doc: Document = document): string[] {
  const connection = (doc.defaultView?.navigator as { connection?: { saveData?: boolean } })
    ?.connection
  if (connection?.saveData) return []
  for (const file of PRELOADS_3D) {
    const link = doc.createElement('link')
    link.rel = 'preload'
    link.href = file.href
    link.as = file.as
    if ('crossOrigin' in file) link.crossOrigin = file.crossOrigin
    doc.head.append(link)
  }
  return PRELOADS_3D.map((file) => file.href)
}
