'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { formProgress } from '../../lib/inquiryForm'

/** The fields that make "done" on each step. `phoneCode` is filled for the buyer, so it is not. */
const REQUIRED = ['name', 'email', 'message'] as const
const OPTIONAL = ['company', 'jobTitle', 'country', 'phone', 'subject', 'files'] as const

const isFilled = (form: HTMLFormElement, name: string) => {
  const field = form.elements.namedItem(name)
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
    return field instanceof HTMLSelectElement && field.value !== ''
  }
  if (field instanceof HTMLInputElement && field.type === 'file')
    return (field.files?.length ?? 0) > 0
  // `checkValidity` too: an email the browser would refuse is not a done field.
  return field.value.trim() !== '' && field.checkValidity()
}

/**
 * The contact form in two steps with a progress bar (owner, 2026-09-29): name, email and message
 * first, then "Add details (optional)".
 *
 * ⚠️ THE SERVER RENDERS ONE COMPLETE FORM, AND ONLY THE MOUNTED SCRIPT SPLITS IT. `enhanced`
 * starts false, so the HTML every visitor receives has both fieldsets visible and a single
 * "Send inquiry" button — which is what a visitor without JavaScript uses, and what
 * `e2e/inquiry.spec.ts` checks with scripting off. The steps, the bar and "Step 1 of 2" appear
 * only after hydration.
 *
 * ⚠️ HIDING A STEP NEVER DROPS WHAT IS IN IT. `hidden` fieldsets still submit their fields
 * (only `disabled` ones are left out), so "Send inquiry" on step 1 sends anything typed on step 2
 * before the buyer went back. And because only step 1's fields carry `required`, the browser's
 * own validation of step 1 is the whole "may I go on" check.
 */
export function InquiryStepper({
  stepOne,
  stepTwo,
  emailHref,
}: {
  stepOne: ReactNode
  stepTwo: ReactNode
  emailHref: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const firstStep = useRef<HTMLFieldSetElement>(null)
  const secondStep = useRef<HTMLFieldSetElement>(null)
  const [enhanced, setEnhanced] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [started, setStarted] = useState(false)
  const [progress, setProgress] = useState(0)

  const measure = useCallback(() => {
    const form = root.current?.closest('form')
    if (!form) return
    setProgress(
      formProgress({
        started,
        requiredDone: REQUIRED.filter((name) => isFilled(form, name)).length,
        requiredTotal: REQUIRED.length,
        onStepTwo: step === 2,
        optionalDone: OPTIONAL.filter((name) => isFilled(form, name)).length,
        optionalTotal: OPTIONAL.length,
      }),
    )
  }, [started, step])

  useEffect(() => setEnhanced(true), [])

  useEffect(() => {
    const form = root.current?.closest('form')
    if (!form || !enhanced) return
    measure()
    const onFocus = () => setStarted(true)
    // A refused file on the hidden step: show that step, or the browser has nothing to point at.
    const onInvalid = (event: Event) => {
      if (secondStep.current?.contains(event.target as Node)) setStep(2)
    }
    form.addEventListener('input', measure)
    form.addEventListener('change', measure)
    form.addEventListener('focusin', onFocus)
    form.addEventListener('invalid', onInvalid, true)
    return () => {
      form.removeEventListener('input', measure)
      form.removeEventListener('change', measure)
      form.removeEventListener('focusin', onFocus)
      form.removeEventListener('invalid', onInvalid, true)
    }
  }, [enhanced, measure])

  const goToStepTwo = () => {
    const fields = firstStep.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input, textarea',
    )
    for (const field of fields ?? []) {
      if (!field.checkValidity()) {
        field.reportValidity()
        return
      }
    }
    setStep(2)
    // Focus moves with the step, so a keyboard or screen-reader user lands on its first field.
    requestAnimationFrame(() => secondStep.current?.querySelector<HTMLElement>('input')?.focus())
  }

  const goBack = () => {
    setStep(1)
    requestAnimationFrame(() => firstStep.current?.querySelector<HTMLElement>('textarea')?.focus())
  }

  return (
    <div ref={root} className="inquiry-stepper">
      {enhanced ? (
        <div className="inquiry-progress">
          <p className="inquiry-progress__step" aria-live="polite">
            Step {step} of 2
          </p>
          <div
            className="inquiry-progress__track"
            role="progressbar"
            aria-label="Form progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span
              className="inquiry-progress__fill"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>
        </div>
      ) : null}

      <fieldset
        ref={firstStep}
        className="inquiry-form__step"
        data-step="1"
        hidden={enhanced && step !== 1}
      >
        <legend className="inquiry-form__legend">Your inquiry</legend>
        {stepOne}
      </fieldset>

      <fieldset
        ref={secondStep}
        className="inquiry-form__step"
        data-step="2"
        hidden={enhanced && step !== 2}
      >
        <legend className="inquiry-form__legend">Add details (optional)</legend>
        {stepTwo}
      </fieldset>

      <div className="site-actions">
        {/*
         * ⚠️ EVERY BUTTON HAS ITS OWN `key`, AND THE STEPPER BREAKS WITHOUT THEM. Unkeyed, React
         * reuses the first <button> across steps and only flips its `type` — so the click on
         * "Next" (type=button) re-renders it as "Send inquiry" (type=submit) while that same
         * click is still being dispatched, and the browser's default action then SUBMITS the
         * form. Measured 2026-09-29 in Playwright: step 2 opened and the page came back on
         * step 1 as a sent inquiry. Keys make each a different element.
         */}
        {!enhanced ? (
          <button key="send-all" className="btn btn--primary" type="submit">
            Send inquiry
          </button>
        ) : step === 1 ? (
          <>
            {/*
             * "Send inquiry" is the primary action on BOTH steps: it is one of the site's agreed
             * primary labels (CT-08, `e2e/copy.spec.ts`), and sending stays the easy path while
             * the details stay optional (2026-09-29).
             */}
            <button key="send-now" className="btn btn--primary" type="submit">
              Send inquiry
            </button>
            <button key="next" className="btn btn--ghost" type="button" onClick={goToStepTwo}>
              Next: add details (optional)
            </button>
          </>
        ) : (
          <>
            <button key="send" className="btn btn--primary" type="submit">
              Send inquiry
            </button>
            <button key="back" className="btn btn--ghost" type="button" onClick={goBack}>
              Back
            </button>
          </>
        )}
        <a className="btn btn--ghost" href={emailHref}>
          Or email us instead
        </a>
      </div>
    </div>
  )
}
