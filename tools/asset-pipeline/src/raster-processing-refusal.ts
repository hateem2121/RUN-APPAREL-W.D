/** A confirmed input defect; retrying the same bytes cannot repair it. */
export class RasterProcessingRefusal extends Error {
  constructor(texture: string, cause: unknown) {
    super(
      `Could not process texture ${texture}. The original is preserved. Re-export oversized artwork or prepare it in a bounded local job.`,
      { cause },
    )
  }
}

/** Fail closed, but only stop queue retries when the decoder identifies an input defect. */
export function rasterProcessingError(texture: string, cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : String(cause)
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : ''
  // Native decoders can wrap allocation failures in a "corrupt header" message.
  // Resource evidence takes precedence; unfamiliar failures also retain retry.
  const resourceFailure =
    /ENOMEM|EAGAIN|ENOSPC|EMFILE|ENFILE|EIO|allocat|out of memory|resource|temporar|thread|worker/i.test(
      `${code} ${message}`,
    )
  const inputDefect =
    /^(?:Input image exceeds pixel limit|Input buffer contains unsupported image format|Input buffer has corrupt header:)/.test(
      message,
    ) ||
    /(?:pngload_buffer|jpegload_buffer|webpload_buffer|VipsJpeg):[^\n]*(?:corrupt|invalid|truncat|end of stream|end of input|premature|unexpected end)/i.test(
      message,
    )
  if (!resourceFailure && inputDefect) return new RasterProcessingRefusal(texture, cause)
  return new Error(
    `Could not process texture ${texture}. The original is preserved. Processing stopped and the job may be retried. ${message}`,
    { cause },
  )
}
