/**
 * What the R2 mirror (`scripts/backup-r2.mjs`) may print about an object.
 *
 * ⚠️ ITS LOG IS PUBLIC. The weekly mirror runs in GitHub Actions on a public repository. A buyer's
 * attached file is stored under the name the buyer gave it, so a failed or mismatched copy printed
 * that name, and a weekly count of attachments went out with every run (final review, 2026-09-29).
 * Buyer files are therefore named by position only and reported as saved or not, never counted.
 * Public product files keep their full key: the website already serves them, and a failed one must
 * be findable from the log.
 */
export const INQUIRY_BUCKET = 'run-apparel-inquiry-files'

/** `index` is the object's position in its bucket's list, from 0. */
export function objectLabel(bucket, key, index) {
  return bucket === INQUIRY_BUCKET ? `${bucket}/inquiry file #${index + 1}` : `${bucket}/${key}`
}

/** The closing line: public objects counted, buyer files only "all saved" or "N NOT saved". */
export function summaryLine({ saved, failed, inquiryFailed, unverified, mismatched }) {
  return (
    `[backup-r2] done: ${saved} saved, ${failed} failed` +
    (unverified > 0 ? `, ${unverified} saved but size-unverified` : '') +
    (mismatched > 0 ? `, ${mismatched} saved with a STALE CMS size record` : '') +
    `; inquiry files: ${inquiryFailed > 0 ? `${inquiryFailed} NOT saved` : 'all saved'}.`
  )
}
