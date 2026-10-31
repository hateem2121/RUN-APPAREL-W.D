/**
 * The garment's real edge, traced on its picture's alpha (Moore-neighbour boundary following). Taking
 * each row's outermost pixels filled the gap between sleeve and body and drew a tombstone, not a
 * pullover (filmed 30 Oct 2026). Pure, on an alpha array, so vitest reaches it.
 *
 * Returns points in the alpha map's pixels, starting at the top-left of the shape; empty when the
 * picture has no shape to trace or nothing transparent around it (an opaque photo would trace its
 * own rectangle, which is no garment).
 */
export function traceContour(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
): Array<[number, number]> {
  const on = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && (alpha[y * width + x] ?? 0) > 40
  if (on(0, 0) && on(width - 1, 0) && on(0, height - 1) && on(width - 1, height - 1)) return []
  let startX = -1
  let startY = -1
  for (let y = 0; y < height && startX < 0; y++) {
    for (let x = 0; x < width; x++) {
      if (on(x, y)) {
        startX = x
        startY = y
        break
      }
    }
  }
  if (startX < 0) return []
  const around: Array<[number, number]> = [
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
  ]
  const points: Array<[number, number]> = [[startX, startY]]
  let x = startX
  let y = startY
  let backX = startX - 1
  let backY = startY
  for (let guard = width * height; guard > 0; guard--) {
    let from = 0
    for (let q = 0; q < 8; q++) {
      const step = around[q]
      if (step && x + step[0] === backX && y + step[1] === backY) from = q
    }
    let moved = false
    for (let t = 1; t <= 8; t++) {
      const index = (from + t) % 8
      const step = around[index] as [number, number]
      if (on(x + step[0], y + step[1])) {
        const before = around[(index + 7) % 8] as [number, number]
        backX = x + before[0]
        backY = y + before[1]
        x += step[0]
        y += step[1]
        moved = true
        break
      }
    }
    if (!moved || (x === startX && y === startY)) break
    points.push([x, y])
  }
  return points
}

/** The dark or light thread that stands out more on this dye, as a machinist would choose. */
export function threadFor(rgb: readonly [number, number, number]): [number, number, number] {
  const luminance = (c: readonly number[]) =>
    c
      .map((v) => {
        const n = v / 255
        return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
      })
      .reduce((sum, v, i) => sum + v * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0)
  const dark: [number, number, number] = [29, 31, 26]
  const light: [number, number, number] = [241, 239, 234]
  const ground = luminance(rgb)
  const contrast = (c: readonly number[]) => {
    const l = luminance(c)
    return (Math.max(l, ground) + 0.05) / (Math.min(l, ground) + 0.05)
  }
  return contrast(dark) >= contrast(light) ? dark : light
}

/**
 * The address the seam reads its picture from: the same file, kept apart in the browser's cache.
 *
 * ⚠️ THE PAGE'S PLAIN IMAGE POISONS ITS OWN ADDRESS. Media sends `Vary: Origin` only to a request that
 * has an Origin, so the browser keeps the plain copy without it and answers a cross-origin request from
 * that copy, which has no permission header. Live Chromium, 31 Oct 2026: 4 of 4 garment pages refused,
 * no seam since #296, and a console error that failed Lighthouse 5 runs of 5. Retrying after the refusal
 * (#302) drew the seam but kept the error. Costs one second copy of the picture, 57 KB on r-vpj.
 */
export function seamPictureUrl(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}seam=1`
}
