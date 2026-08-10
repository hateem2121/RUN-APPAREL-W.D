'use client'

import type { DefaultCellComponentProps } from 'payload'
import { useEffect, useState } from 'react'

// Exported (not just used locally) so views/Dashboard.tsx can label the same
// four statuses the same way instead of typing "Queued" / "Processing…" a
// second time somewhere a future edit here would not reach.
export const LABELS: Record<string, string> = {
  queued: 'Queued',
  processing: 'Processing…',
  ready: 'Ready to review',
  failed: 'Failed',
}

/**
 * The status column, polling while there is something to watch.
 *
 * docs/FIRST-GARMENT-UPLOAD.md step 3 instructed the owner to "watch the Status
 * column, refreshing every minute or so" — i.e. the screen was known to be stale
 * and the manual was written around it. For a job that takes 1-2 minutes that
 * reads as a system that has hung.
 *
 * Polls ONLY while queued or processing and stops for good on a terminal status,
 * so an idle list makes no requests at all.
 */
export const RawUploadStatusCell: React.FC<DefaultCellComponentProps> = ({ cellData, rowData }) => {
  const [status, setStatus] = useState<string>(typeof cellData === 'string' ? cellData : '')
  const id = (rowData as { id?: string | number } | undefined)?.id

  useEffect(() => {
    if (id == null) return
    if (status !== 'queued' && status !== 'processing') return
    let cancelled = false
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/raw-uploads/${id}?depth=0`, { credentials: 'include' })
        if (!res.ok) return
        const doc = (await res.json()) as { status?: unknown }
        if (!cancelled && typeof doc.status === 'string') setStatus(doc.status)
      } catch {
        // A dropped poll is not worth reporting — the next one is 5s away.
      }
    }, 5000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [id, status])

  const spinning = status === 'queued' || status === 'processing'
  return (
    <span aria-live="polite">
      {LABELS[status] ?? status}
      {spinning ? ' ⏳' : ''}
    </span>
  )
}
