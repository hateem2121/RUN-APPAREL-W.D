'use client'

import { useRef, useState } from 'react'
import { APPLICATION_FILE_ACCEPT } from '../../lib/applicationFileTypes'
import { CV_HELP, pickedCvProblem } from '../../lib/careersForm'

/**
 * The careers form's CV: ONE optional file (owner, F23, 2026-10-07). A plain file box, so it
 * works without scripting; with it, the pick is checked at once by the SERVER's own byte check
 * (`pickedCvProblem`), so a wrong file is refused while the applicant's typing is still on the
 * screen — the contact form's FilePicker reasoning, for one file and none of its drag-and-drop.
 *
 * The sentence goes into the box's custom validity, so the form's list of mistakes
 * (`InquiryFormEnhancer`, `form="careers"`) shows it under the box and at the top, and Send
 * is refused until it is fixed.
 */
export function CvPicker() {
  const latest = useRef(0)
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <div className="inquiry-form__field">
      <label className="inquiry-form__label" htmlFor="application-cv">
        CV
      </label>
      <p className="inquiry-form__note" id="application-cv-hint">
        {CV_HELP}
      </p>
      <input
        className="inquiry-form__input inquiry-form__cv"
        id="application-cv"
        data-check
        type="file"
        name="cv"
        accept={APPLICATION_FILE_ACCEPT}
        aria-describedby="application-cv-hint application-cv-error"
        onChange={(event) => {
          const field = event.currentTarget
          const pick = ++latest.current
          void pickedCvProblem([...(field.files ?? [])]).then((found) => {
            if (pick !== latest.current) return
            field.setCustomValidity(found ?? '')
            setProblem(found)
            // The form's list of mistakes listens for this (InquiryFormEnhancer.tsx).
            field.dispatchEvent(new Event('inquiry-checked', { bubbles: true }))
          })
        }}
      />
      <p className="inquiry-form__error" id="application-cv-error" hidden={!problem}>
        {problem}
      </p>
    </div>
  )
}
