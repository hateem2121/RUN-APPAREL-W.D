'use client'

import { useEffect, useRef, useState } from 'react'
import { countryByName, type DialState, editDialCode, nextDialCode } from '../../lib/dialCode'
import { careersFieldError } from '../../lib/careersForm'
import { fieldError, SENDING_LABEL, SUMMARY_HEADING } from '../../lib/inquiryForm'

type Checked = HTMLInputElement | HTMLTextAreaElement
type Problem = { id: string; text: string }

/** The fields that can be wrong: the three required ones and the file picker. */
const CHECKED = '[data-check]'

/**
 * The single-step contact form's behaviour (visual audit VA-02, owner-approved 2026-10-01),
 * mounted INSIDE the server-rendered `<form>` and acting on it.
 *
 * ⚠️ THE FORM IS COMPLETE WITHOUT THIS. The server sends every field, one Send button and the
 * browser's own checks (`required`, `type="email"`, `maxlength`), so a visitor without
 * JavaScript sends exactly as before. This adds four things on top:
 *
 * 1. A field LEFT wrongly filled says what is wrong underneath it (NN/g: show an error once
 *    the person has left the field, never while they are still typing), and the message
 *    disappears as soon as the value is right.
 * 2. Send with mistakes lists them at the top of the form, each a link to its field, and moves
 *    focus to that list (GOV.UK error summary, updated Feb 2025).
 * 3. While the inquiry is sending the button says "Sending…" and a second press does nothing.
 * 4. The browser's own pop-up bubbles are replaced by those sentences.
 * 5. Since polish D7 (2026-10-05): a whole country name fills the phone's code, which stays the
 *    buyer's to change (owner, 2026-09-29; the rule is `nextDialCode`, unit-tested); Send pressed
 *    with mistakes gives the button one small shake (MO5; not played with reduced motion,
 *    site.css); and `data-enhanced` on the form lets the styles put the drop area in place of the
 *    browser's grey file button (X6), which without scripting stays.
 *
 * ⚠️ VALIDATION STAYS THE BROWSER'S. No `noValidate`: the form still refuses to submit while a
 * required field is empty, which `e2e/inquiry.spec.ts` asserts with the constraint API. This
 * component only CANCELS the `invalid` events — that hides the bubbles and leaves the refusal.
 * It reads `validity.valid`, never `checkValidity()`, because `checkValidity()` fires `invalid`
 * again and would feed its own listener.
 */
export function InquiryFormEnhancer({
  form: which = 'inquiry',
}: {
  /**
   * Whose words a field's sentence comes from: the contact form's by default; the careers form's
   * owner-approved words (`careersFieldError`, 2026-10-07) otherwise. A NAME, not a function: the
   * pages that draw this are server components, and a function cannot cross into a client one.
   */
  form?: 'inquiry' | 'careers'
} = {}) {
  const messages = which === 'careers' ? careersFieldError : fieldError
  const anchor = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const focusList = useRef(false)

  useEffect(() => {
    const form = anchor.current?.closest('form')
    if (!form) return
    const fields = () => [...form.querySelectorAll<Checked>(CHECKED)]
    const touched = new WeakSet<Element>()
    let batch: number | null = null
    let sending = false
    form.dataset.enhanced = ''

    /*
     * ⚠️ A BOX NEEDED FOR ONE ANSWER ONLY — the careers form's "Something else" (2026-10-07).
     * `required` on a box out of sight would block every other answer, and no `required` let an
     * empty "Something else" reach the server, whose refusal reloaded the page and cost the
     * applicant everything typed (found in the owner's picture). So `data-needed-when="role=other"`
     * is switched here with the choice; without scripting the server still refuses it.
     */
    const needed = () => [...form.querySelectorAll<HTMLInputElement>('[data-needed-when]')]
    const syncNeeded = () => {
      for (const box of needed()) {
        const [group, value] = (box.dataset.neededWhen ?? '').split('=')
        box.required =
          form.querySelector<HTMLInputElement>(`[name="${group}"]:checked`)?.value === value
      }
    }
    // Also on a form restored by Back, which keeps its choice.
    syncNeeded()

    /*
     * ⚠️ THE CODE FIELD IS NEVER CONTROLLED, ON PURPOSE (it was PhoneField's rule, kept): a value
     * reset on hydration would wipe a code a quick buyer typed before the script arrived.
     */
    let dial: DialState = { dial: '', edited: false }
    const code = form.querySelector<HTMLInputElement>('[name="phoneCode"]')
    const onCountry = (event: Event) => {
      const field = event.target as HTMLInputElement
      if (field.name === 'phoneCode') {
        dial = editDialCode(field.value)
        return
      }
      if (field.name !== 'country' || !code) return
      dial = nextDialCode(dial, countryByName(field.value)?.code ?? '')
      if (!dial.edited) code.value = dial.dial ? `+${dial.dial}` : ''
    }

    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')
    /** One small shake of the Send button (MO5), restarted if pressed again while it plays. */
    const shake = () => {
      if (!button) return
      button.classList.remove('is-refused')
      // Reading the size makes the browser drop the old animation before the class returns.
      void button.offsetWidth
      button.classList.add('is-refused')
    }
    const onShaken = (event: AnimationEvent) => {
      if (event.animationName === 'inquiry-shake') button?.classList.remove('is-refused')
    }

    /** Show or clear one field's sentence, and say so to assistive technology. */
    const mark = (field: Checked): string | null => {
      const text = messages(field.name, field.validity, field.validationMessage)
      // The file picker shows its own sentence, so it has no note here; it still joins the list.
      const note = document.getElementById(`${field.id}-error`)
      if (!note) return text
      // Only this note's id is added or removed, so a field's other descriptions survive.
      const others = (field.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter((id) => id && id !== note.id)
      if (text) {
        note.textContent = text
        note.hidden = false
        field.setAttribute('aria-invalid', 'true')
        field.setAttribute('aria-describedby', [...others, note.id].join(' '))
      } else {
        note.textContent = ''
        note.hidden = true
        field.removeAttribute('aria-invalid')
        if (others.length > 0) field.setAttribute('aria-describedby', others.join(' '))
        else field.removeAttribute('aria-describedby')
      }
      return text
    }

    /** The list at the top: every field that is still wrong, in page order. */
    const collect = (): Problem[] =>
      fields().flatMap((field) => {
        const text = messages(field.name, field.validity, field.validationMessage)
        return text ? [{ id: field.id, text }] : []
      })

    const onInvalid = (event: Event) => {
      const field = event.target as Checked
      if (!field.matches?.(CHECKED)) return
      event.preventDefault()
      touched.add(field)
      mark(field)
      // One list per attempt: every `invalid` of one Send fires before this timer runs.
      if (batch === null) {
        shake()
        batch = window.setTimeout(() => {
          batch = null
          focusList.current = true
          setProblems(collect())
        }, 0)
      }
    }

    const onInput = (event: Event) => {
      const field = event.target as Checked
      if (!field.matches?.(CHECKED)) return
      touched.add(field)
      // Corrections are acknowledged at once; new complaints wait for the field to be left.
      if (field.getAttribute('aria-invalid') === 'true' && field.validity.valid) {
        mark(field)
        setProblems((open) => (open.length > 0 ? collect() : open))
      }
    }

    /** One field's sentence again, and the list again if it is showing. */
    const refresh = (field: Checked) => {
      mark(field)
      setProblems((open) => (open.length > 0 ? collect() : open))
    }

    const onLeave = (event: Event) => {
      const field = event.target as Checked
      if (!field.matches?.(CHECKED) || !touched.has(field)) return
      refresh(field)
    }

    /*
     * ⚠️ THE FILE PICKER DECIDES TWICE, AND BOTH ANSWERS ARRIVE AFTER `change` REACHES THIS FORM.
     * Its count-and-size check runs in React's own `change` handler, which sits at the page's
     * root, ABOVE this form — so this listener runs first and would read the previous pick; a
     * zero timer waits for it. Its byte check finishes later still and announces itself with
     * `inquiry-checked` (FilePicker.tsx). Without both, a corrected pick left the list showing
     * the old file's refusal (caught by `e2e/inquiry.spec.ts` on 2026-10-01).
     */
    const onChange = (event: Event) => {
      const field = event.target as Checked
      if (field.type === 'radio') {
        syncNeeded()
        // A sentence already showing goes when its need goes; a new one waits for Send or a leave.
        for (const box of needed()) if (box.getAttribute('aria-invalid') === 'true') refresh(box)
      }
      if (field.matches?.(CHECKED) && field.type === 'file') {
        touched.add(field)
        window.setTimeout(() => refresh(field), 0)
      }
    }
    const onChecked = (event: Event) => {
      const field = event.target as Checked
      if (field.matches?.(CHECKED)) refresh(field)
    }

    const label = button?.textContent ?? ''
    const onSubmit = (event: SubmitEvent) => {
      if (sending) {
        event.preventDefault()
        return
      }
      sending = true
      if (button) {
        button.textContent = SENDING_LABEL
        button.setAttribute('aria-disabled', 'true')
      }
    }
    // Back from the result page restores the form from the page cache: make it usable again.
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      sending = false
      if (button) {
        button.textContent = label
        button.removeAttribute('aria-disabled')
      }
    }

    form.addEventListener('invalid', onInvalid, true)
    form.addEventListener('input', onInput)
    form.addEventListener('focusout', onLeave)
    form.addEventListener('change', onChange)
    form.addEventListener('inquiry-checked', onChecked)
    form.addEventListener('submit', onSubmit)
    form.addEventListener('input', onCountry)
    button?.addEventListener('animationend', onShaken)
    window.addEventListener('pageshow', onShow)
    return () => {
      if (batch !== null) window.clearTimeout(batch)
      delete form.dataset.enhanced
      form.removeEventListener('input', onCountry)
      button?.removeEventListener('animationend', onShaken)
      form.removeEventListener('invalid', onInvalid, true)
      form.removeEventListener('input', onInput)
      form.removeEventListener('focusout', onLeave)
      form.removeEventListener('change', onChange)
      form.removeEventListener('inquiry-checked', onChecked)
      form.removeEventListener('submit', onSubmit)
      window.removeEventListener('pageshow', onShow)
    }
  }, [messages])

  useEffect(() => {
    if (focusList.current && problems.length > 0) list.current?.focus()
    focusList.current = false
  }, [problems])

  return (
    <div ref={anchor} className="inquiry-summary-slot">
      {problems.length > 0 ? (
        <div
          ref={list}
          className="form-notice form-notice--bad inquiry-summary"
          role="alert"
          tabIndex={-1}
          aria-labelledby="inquiry-summary-title"
        >
          <p className="inquiry-summary__title" id="inquiry-summary-title">
            {SUMMARY_HEADING}
          </p>
          <ul className="inquiry-summary__list">
            {problems.map((problem) => (
              <li key={problem.id}>
                <a
                  href={`#${problem.id}`}
                  onClick={(event) => {
                    // A link to an input scrolls to it in every browser but focuses it in few.
                    event.preventDefault()
                    const field = document.getElementById(problem.id)
                    field?.closest('label')?.scrollIntoView({ block: 'center' })
                    field?.focus({ preventScroll: true })
                  }}
                >
                  {problem.text}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
