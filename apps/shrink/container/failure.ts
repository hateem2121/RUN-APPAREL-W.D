import { RasterProcessingRefusal } from '../../../tools/asset-pipeline/src/raster-processing-refusal'

/** A deterministic output refusal, kept distinct from infrastructure failures over HTTP. */
export class ModelImageRefusal extends Error {
  constructor(problems: readonly string[]) {
    super(`Model image verification failed: ${problems.join(' ')}`)
  }
}

export interface ContainerFailureReport {
  ok: false
  error: string
  code?: 'model-images-refused'
}

/** The body stays generic; only the private report header carries actionable detail. */
export function containerFailureResponse(error: unknown): {
  status: number
  headers: Record<string, string>
  body: string
} {
  const refused = error instanceof ModelImageRefusal || error instanceof RasterProcessingRefusal
  const report: ContainerFailureReport = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    ...(refused ? { code: 'model-images-refused' as const } : {}),
  }
  return {
    status: refused ? 422 : 500,
    headers: {
      'content-type': 'text/plain',
      'x-shrink-report': Buffer.from(JSON.stringify(report)).toString('base64'),
    },
    body: 'Shrink failed.',
  }
}
