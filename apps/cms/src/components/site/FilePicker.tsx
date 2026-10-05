'use client'

import { useEffect, useRef, useState } from 'react'
import { formatBytes, MAX_FILES, MAX_TOTAL_BYTES } from '../../lib/inquiryFiles'
import { INQUIRY_FILE_ACCEPT } from '../../lib/inquiryFileTypes'
import { pickedFileProblem, pickProblem } from '../../lib/inquiryForm'

/**
 * The contact form's file field (owner, 2026-09-29: up to 5 files, 25 MB in total).
 *
 * ⚠️ A PLAIN `<input type="file">` FIRST. Without scripting it uploads as part of the one form
 * post, and the note under it is server-rendered, so the limits are known before anything is
 * picked. The script adds the list of what was chosen and stops a pick the server would refuse,
 * through `setCustomValidity` — so the browser's own validation blocks the send, exactly as it
 * does for an empty required field, and the buyer never waits on a 25 MB upload to be told no.
 *
 * ⚠️ IT READS EACH FILE'S FIRST BYTES TOO, with the server's own check (`pickedFileProblem`),
 * because a refusal after the upload cost the buyer their typed message. The count and size
 * answer at once; the byte check follows a moment later, and only the LATEST pick's answer is
 * applied, so a slow read of an earlier pick cannot clear or block a newer one.
 *
 * ⚠️ A PLACE TO DROP FILES, AND EACH ONE CAN BE TAKEN OFF AGAIN (polish D7 and X6, 2026-10-05).
 * The browser's grey "Choose Files / No file chosen" was one of the two plain grey controls left
 * on the site. The area is the input's own <label>, so pressing it opens the picker as the button
 * did; the input stays in the page, focusable and named, and goes out of sight only once the
 * form's script has run (`[data-enhanced]`, site.css), so without scripting the plain control
 * still shows. A drop, or a × on one file, rebuilds the input's own file list (MDN, "File drag
 * and drop", 22 Aug 2026) and fires `change`, so every check above runs exactly as for a pick.
 *
 * ⚠️ THE SERVER STILL DECIDES. `checkFiles` in the route re-checks everything.
 */
export function FilePicker() {
  const input = useRef<HTMLInputElement>(null)
  const [chosen, setChosen] = useState<{ name: string; size: number }[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const latest = useRef(0)

  /** Put these files in the input, as a pick would, and let every check see the change. */
  const place = (files: readonly File[]) => {
    const field = input.current
    if (!field) return
    const data = new DataTransfer()
    for (const file of files) data.items.add(file)
    field.files = data.files
    field.dispatchEvent(new Event('change', { bubbles: true }))
  }

  /*
   * A file dropped beside the area must not make the browser leave the page to open it (MDN): the
   * whole window takes a file drag while this form is on show, and only the area adds the files.
   */
  useEffect(() => {
    const hold = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    window.addEventListener('dragover', hold)
    window.addEventListener('drop', hold)
    return () => {
      window.removeEventListener('dragover', hold)
      window.removeEventListener('drop', hold)
    }
  }, [])

  return (
    <div className="inquiry-form__field">
      <span className="inquiry-form__label" aria-hidden="true">
        Files
      </span>
      <input
        ref={input}
        className="inquiry-form__input inquiry-form__file"
        // The id is where the form's list of mistakes links to; `data-check` puts this field
        // in that list (InquiryFormEnhancer.tsx), with the explanation shown just below.
        id="inquiry-files"
        data-check
        type="file"
        name="files"
        multiple
        accept={INQUIRY_FILE_ACCEPT}
        aria-describedby="inquiry-files-note"
        onChange={(event) => {
          const field = event.currentTarget
          const picked = [...(field.files ?? [])]
          const files = picked.map(({ name, size }) => ({ name, size }))
          const pick = ++latest.current
          const found = pickProblem(files)
          field.setCustomValidity(found ?? '')
          setChosen(files)
          setProblem(found)
          if (found) return
          void pickedFileProblem(picked).then((late) => {
            if (pick !== latest.current) return
            field.setCustomValidity(late ?? '')
            setProblem(late)
            // The form's list of mistakes listens for this (InquiryFormEnhancer.tsx).
            field.dispatchEvent(new Event('inquiry-checked', { bubbles: true }))
          })
        }}
      />
      <label
        className="inquiry-form__drop"
        htmlFor="inquiry-files"
        data-over={over ? '' : undefined}
        onDragEnter={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          const dropped = [...(event.dataTransfer?.files ?? [])]
          if (dropped.length === 0) return
          place([...(input.current?.files ?? []), ...dropped])
        }}
      >
        <b className="inquiry-form__drop-title">Drop sketches, tech packs or photos here</b>
        <span className="inquiry-form__drop-line">
          or <u>choose files</u> · up to {MAX_FILES} files, {MAX_TOTAL_BYTES / (1024 * 1024)} MB in
          total
        </span>
      </label>
      <p className="inquiry-form__note" id="inquiry-files-note">
        Photos, PDF, Office, Keynote, Illustrator or Photoshop. Larger? Paste a WeTransfer or Drive
        link in your message.
      </p>
      {chosen.length > 0 ? (
        <ul className="inquiry-files">
          {chosen.map((file, index) => (
            // Two files may share a name; the position is what tells them apart.
            // biome-ignore lint/suspicious/noArrayIndexKey: the list is replaced whole on each pick
            <li key={`${index}-${file.name}`} className="inquiry-files__item">
              <span className="inquiry-files__name">{file.name}</span>
              <span className="inquiry-files__size">{formatBytes(file.size)}</span>
              <button
                type="button"
                className="inquiry-files__remove"
                aria-label={`Remove ${file.name}`}
                onClick={() => {
                  const files = [...(input.current?.files ?? [])]
                  files.splice(index, 1)
                  place(files)
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
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
