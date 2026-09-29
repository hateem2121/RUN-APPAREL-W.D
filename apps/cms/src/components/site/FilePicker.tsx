'use client'

import { useState } from 'react'
import { formatBytes, MAX_FILES, MAX_TOTAL_BYTES } from '../../lib/inquiryFiles'
import { INQUIRY_FILE_ACCEPT } from '../../lib/inquiryFileTypes'
import { pickProblem } from '../../lib/inquiryForm'

/**
 * The contact form's file field (owner, 2026-09-29: up to 5 files, 25 MB in total).
 *
 * ⚠️ A PLAIN `<input type="file">` FIRST. Without scripting it uploads as part of the one form
 * post, and the note under it is server-rendered, so the limits are known before anything is
 * picked. The script adds the list of what was chosen and stops a pick the server would refuse,
 * through `setCustomValidity` — so the browser's own validation blocks the send, exactly as it
 * does for an empty required field, and the buyer never waits on a 25 MB upload to be told no.
 *
 * ⚠️ THE SERVER STILL DECIDES. `checkFiles` in the route re-checks the count, the size and every
 * file's first bytes; this component cannot see those and does not pretend to.
 */
export function FilePicker() {
  const [chosen, setChosen] = useState<{ name: string; size: number }[]>([])
  const [problem, setProblem] = useState<string | null>(null)

  return (
    <div className="inquiry-form__field">
      <label>
        <span className="inquiry-form__label">Files (optional)</span>
        <input
          className="inquiry-form__input inquiry-form__file"
          type="file"
          name="files"
          multiple
          accept={INQUIRY_FILE_ACCEPT}
          aria-describedby="inquiry-files-note"
          onChange={(event) => {
            const input = event.currentTarget
            const files = [...(input.files ?? [])].map(({ name, size }) => ({ name, size }))
            const found = pickProblem(files)
            input.setCustomValidity(found ?? '')
            setChosen(files)
            setProblem(found)
          }}
        />
      </label>
      <p className="inquiry-form__note" id="inquiry-files-note">
        Up to {MAX_FILES} files, {MAX_TOTAL_BYTES / (1024 * 1024)} MB in total: photos, PDF, Office,
        Keynote, Illustrator or Photoshop. Larger? Paste a WeTransfer or Drive link in your message.
      </p>
      {chosen.length > 0 ? (
        <ul className="inquiry-files">
          {chosen.map((file, index) => (
            // Two files may share a name; the position is what tells them apart.
            // biome-ignore lint/suspicious/noArrayIndexKey: the list is replaced whole on each pick
            <li key={`${index}-${file.name}`} className="inquiry-files__item">
              <span className="inquiry-files__name">{file.name}</span>
              <span className="inquiry-files__size">{formatBytes(file.size)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {problem ? (
        <p className="form-notice form-notice--bad" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  )
}
