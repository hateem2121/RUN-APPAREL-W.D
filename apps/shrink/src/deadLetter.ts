/**
 * The end of the line for a shrink job.
 *
 * `glb-shrink-dlq` has been configured as the dead-letter queue since
 * 2026-07-24 and, until now, nothing consumed it. A job that failed three times
 * left the raw-upload row saying "Automatic shrink failed" followed by whatever
 * the LAST transient error happened to be — typically a timeout — with no
 * indication that the system had given up. The only way to tell the difference
 * between "still working on it" and "this will never finish" was that nothing
 * ever changed again.
 *
 * The queue name is duplicated from apps/shrink/wrangler.jsonc and pinned by a
 * test, the same arrangement SIZE_WARNING_BYTES has: wrangler config is not
 * importable, and a consumer registered against the wrong queue name is a
 * silent no-op that looks exactly like working code.
 */
export const DEAD_LETTER_QUEUE = 'glb-shrink-dlq'

/**
 * The final message written onto the raw upload.
 *
 * Written for one non-technical reader who needs to know three things: that the
 * system has stopped, that they are not waiting for anything, and what they can
 * do next. The underlying error is kept because it is the only thing a developer
 * has to work from afterwards.
 */
export function deadLetterReport(detail: string | undefined): string {
  // A dead-letter message carries the ORIGINAL job body, not the error that
  // killed it — Cloudflare re-delivers what was enqueued. So the honest default
  // is to point at where the error actually is rather than print a placeholder.
  const cause =
    detail && detail.trim() !== ''
      ? detail.trim()
      : 'not carried on the dead-letter message. The error from the last attempt was in the previous ' +
        'report on this upload, and the full trace is in the Worker logs (`wrangler tail`).'
  return (
    'Automatic shrink has STOPPED TRYING for this file.\n\n' +
    'It was attempted three times and failed every time, so nothing further will happen on its ' +
    'own — you are not waiting for anything.\n\n' +
    'What to do: tick “Retry” to try once more (worth it if the problem was temporary), or upload ' +
    'the file again after re-exporting it from CLO at a lower mesh density. If it fails again, ' +
    'the export itself most likely needs a lighter mesh out of CLO.\n\n' +
    `Last error, for your developer:\n${cause}`
  )
}
