'use client'

import { useEffect, useRef, useState } from 'react'
import { countryByName, type DialState, editDialCode, nextDialCode } from '../../lib/dialCode'
import { careersFieldError } from '../../lib/careersForm'
import {
  announcedQuarter,
  fieldError,
  PROGRESS_HEADER,
  SENDING_LABEL,
  SUMMARY_HEADING,
  UPLOAD_DROPPED,
  UPLOAD_FINISHING,
  UPLOAD_UNCONFIRMED,
  uploadPercent,
  uploadProgressLabel,
} from '../../lib/inquiryForm'

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
 *    With files attached, a bar under it shows how much has gone (2026-10-14, below at `upload`).
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
    const ready = () => {
      sending = false
      if (button) {
        button.textContent = label
        button.removeAttribute('aria-disabled')
      }
    }

    /*
     * ⚠️ THE UPLOAD'S PROGRESS (2026-10-14). A buyer on a phone sent two tech packs (over 12 MB)
     * and watched "Sending…" for about 100 seconds with nothing moving (PostHog replay,
     * 2026-10-08); NN/g: past 10 seconds, show how much is done, or people press again or leave.
     * A plain post cannot report progress, so WITH FILES ATTACHED the page sends the form itself
     * with `XMLHttpRequest` (the one browser API with upload progress) and the route answers with
     * the result's address as data (`lib/formResult.ts`), which the page then opens — the same
     * panel, focus and count as the plain post. Without files, or without scripting, the form
     * posts exactly as before.
     *
     * Plain DOM, not React, like the button above: a browser translating the page replaces text
     * nodes, and React removing one it no longer finds is what crashed a garment page
     * (facebook/react#11538). `textContent` replaces the whole text and cannot be stranded.
     */
    const progress = document.createElement('div')
    progress.className = 'form-progress'
    progress.hidden = true
    const bar = document.createElement('progress')
    bar.className = 'form-progress__bar'
    bar.max = 100
    // The words beside it say the same; a screen reader hears them from `said`, by the quarter.
    bar.setAttribute('aria-hidden', 'true')
    const line = document.createElement('p')
    line.setAttribute('aria-hidden', 'true')
    const said = document.createElement('p')
    said.className = 'visually-hidden'
    said.setAttribute('role', 'status')
    // `replaceChildren` / `insertBefore`, not `append` / `after`: this package also loads the
    // Workers types, whose HTMLRewriter `Element` redeclares those two and shadows the DOM's.
    progress.replaceChildren(bar, line, said)
    const below = button?.closest('.site-actions') ?? button
    below?.parentNode?.insertBefore(progress, below.nextSibling)

    const attachedBytes = () =>
      [...form.querySelectorAll<HTMLInputElement>('input[type="file"]')]
        .flatMap((input) => [...(input.files ?? [])])
        .reduce((sum, file) => sum + file.size, 0)

    const upload = (bytes: number) => {
      let quarter = -1
      let arrived = false
      progress.classList.remove('form-notice', 'form-notice--bad')
      progress.hidden = false
      bar.hidden = false
      const show = (loaded: number, total: number) => {
        const percent = uploadPercent(loaded, total)
        bar.value = percent
        line.textContent = uploadProgressLabel(loaded, total)
        if (announcedQuarter(percent) !== quarter) {
          quarter = announcedQuarter(percent)
          said.textContent = line.textContent
        }
      }
      const fail = () => {
        ready()
        bar.hidden = true
        progress.classList.add('form-notice', 'form-notice--bad')
        // Once every byte is in, the server may well have stored it: never invite a second copy.
        line.textContent = arrived ? UPLOAD_UNCONFIRMED : UPLOAD_DROPPED
        said.textContent = line.textContent
      }
      show(0, bytes)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', form.action)
      xhr.setRequestHeader(PROGRESS_HEADER, '1')
      xhr.responseType = 'json'
      xhr.upload.addEventListener('progress', (event) =>
        show(event.loaded, event.lengthComputable ? event.total : bytes),
      )
      xhr.upload.addEventListener('load', () => {
        arrived = true
        bar.value = 100
        line.textContent = UPLOAD_FINISHING
        said.textContent = UPLOAD_FINISHING
      })
      xhr.addEventListener('load', () => {
        arrived = true
        const to = (xhr.response as { to?: unknown } | null)?.to
        // Only an address on this site, never a protocol-relative one: `//elsewhere.example`.
        if (xhr.status === 200 && typeof to === 'string' && /^\/(?!\/)/.test(to)) {
          window.location.assign(to)
          return
        }
        fail()
      })
      xhr.addEventListener('error', fail)
      xhr.addEventListener('abort', fail)
      xhr.addEventListener('timeout', fail)
      xhr.send(new FormData(form))
    }

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
      const bytes = attachedBytes()
      if (bytes > 0 && typeof XMLHttpRequest === 'function') {
        event.preventDefault()
        upload(bytes)
      }
    }
    // Back from the result page restores the form from the page cache: make it usable again.
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      ready()
      progress.hidden = true
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
      progress.remove()
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
