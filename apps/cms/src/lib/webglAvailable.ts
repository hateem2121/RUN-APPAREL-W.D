/**
 * Can this browser draw a WebGL frame? Both generations, tried the way cobe and three.js try them;
 * the probe context is released at once, so it never counts against the browser's context limit
 * (the oldest live context is the one a browser drops, and that would be a visible garment's).
 *
 * Used by the contact globe (no WebGL: the still picture stays) and by №03's live garment, whose
 * zoom switches on only where a frame is drawn (LiveGarment.tsx, "ZOOM WAITS FOR A CLICK").
 */
export function webglAvailable(): boolean {
  try {
    const probe = document.createElement('canvas')
    const gl = (probe.getContext('webgl2') ??
      probe.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}
