'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import { HONEYPOT_FIELD, MAX_LENGTHS } from '../../lib/inquiry'
import { PROGRESS_HEADER } from '../../lib/inquiryForm'
import { TEMPLATE_FILE_NAME } from '../../lib/techPackTemplate'
import {
  TEMPLATE_DOWNLOAD_ACTION,
  TEMPLATE_FORM_ID,
  TEMPLATE_FORM_WORDS,
  TEMPLATE_PROBLEM_ID,
  type TemplateNotice,
  templateFieldError,
  UPDATES_VALUE,
} from '../../lib/templateDownload'

/**
 * The free tech-pack template's download form (C1, owner approved 6 Nov 2026), in the guide's "The
 * free template" section.
 *
 * ⚠️ IT WORKS WITH SCRIPTING OFF, as the contact form does (`contact/page.tsx` says why): a plain
 * `<form method="post">`, `required` and `type="email"` checked by the browser, and the answer to a
 * good post IS the workbook, which the browser saves while the page stays put. With scripting on,
 * this component checks the boxes in the contact form's words, posts the same form, and saves the
 * same bytes itself, so it can say so on the page.
 *
 * ⚠️ FOUR BOXES ARE NEEDED AND MARKED *, AND "OPTIONAL" IS WRITTEN NOWHERE (the owner's rule for the
 * contact form, Q17). The updates box starts unticked and sends `yes` only when ticked: the route
 * records a yes from that value alone (owner: "record each yes").
 *
 * ⚠️ THE LINE BESIDE THE BUTTON IS THE NOTICE THE LAW ASKS FOR WHERE THE DETAILS ARE TAKEN (GDPR
 * Art 13; the owner's approved words, 6 Nov 2026), with its link to the privacy page's section.
 */
const FIELDS = [
  {
    name: 'name',
    id: 'template-name',
    label: TEMPLATE_FORM_WORDS.labels.name,
    type: 'text',
    auto: 'name',
    max: MAX_LENGTHS.name,
    needed: true,
  },
  {
    name: 'email',
    id: 'template-email',
    label: TEMPLATE_FORM_WORDS.labels.email,
    type: 'email',
    auto: 'email',
    max: MAX_LENGTHS.email,
    needed: true,
  },
  {
    name: 'company',
    id: 'template-company',
    label: TEMPLATE_FORM_WORDS.labels.company,
    type: 'text',
    auto: 'organization',
    max: MAX_LENGTHS.company,
    needed: true,
  },
  {
    name: 'country',
    id: 'template-country',
    label: TEMPLATE_FORM_WORDS.labels.country,
    type: 'text',
    auto: 'country-name',
    max: MAX_LENGTHS.country,
    needed: true,
  },
  {
    name: 'jobTitle',
    id: 'template-job',
    label: TEMPLATE_FORM_WORDS.labels.jobTitle,
    type: 'text',
    auto: 'organization-title',
    max: MAX_LENGTHS.jobTitle,
    needed: false,
  },
  {
    name: 'whatsapp',
    id: 'template-whatsapp',
    label: TEMPLATE_FORM_WORDS.labels.whatsapp,
    type: 'tel',
    auto: 'tel',
    max: MAX_LENGTHS.phone,
    needed: false,
  },
] as const

/** Two boxes to a row, as the contact form pairs them (Q16). */
const PAIRS = [FIELDS.slice(0, 2), FIELDS.slice(2, 4), FIELDS.slice(4, 6)]

function Tick() {
  return (
    <svg className="inquiry-form__tick" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  )
}

type Done = { href: string } | null

export function TemplateDownload({ notice }: { notice: TemplateNotice | null }) {
  const form = useRef<HTMLFormElement>(null)
  const problem = useRef<HTMLDivElement>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Done>(null)
  const [failed, setFailed] = useState(false)

  // The script checks the boxes itself, in the contact form's words, so the browser's own bubbles
  // stay away; without the script they are the check.
  useEffect(() => {
    if (form.current) form.current.noValidate = true
  }, [])

  // A refused post lands on its notice: focus it, and take the code out of the address after `load`
  // (the contact form's arrival, `InquiryOutcome.tsx`, for the same reasons).
  useEffect(() => {
    if (!notice) return
    problem.current?.focus()
    const tidy = () =>
      window.history.replaceState(null, '', `${window.location.pathname}#${TEMPLATE_FORM_ID}`)
    if (document.readyState === 'complete') tidy()
    else window.addEventListener('load', tidy, { once: true })
    return () => window.removeEventListener('load', tidy)
  }, [notice])

  // The file is saved by the panel's own "Download it again" link, clicked once when it appears, so
  // the link a buyer can press again is the one that saved it. Its address is freed when it goes.
  const again = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (!done) return
    again.current?.click()
    return () => URL.revokeObjectURL(done.href)
  }, [done])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const element = event.currentTarget
    const found: Record<string, string> = {}
    for (const field of FIELDS) {
      const input = element.elements.namedItem(field.name)
      if (!(input instanceof HTMLInputElement)) continue
      const message = templateFieldError(field.name, input.validity)
      if (message) found[field.name] = message
    }
    setErrors(found)
    const first = FIELDS.find((field) => found[field.name])
    if (first) {
      document.getElementById(first.id)?.focus()
      return
    }
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch(element.action, {
        method: 'POST',
        body: new FormData(element),
        headers: { [PROGRESS_HEADER]: '1' },
      })
      if ((res.headers.get('content-type') ?? '').includes('application/json')) {
        // A refusal: go where a plain post would have gone, so the page shows the same notice.
        const { to } = (await res.json()) as { to: string }
        window.location.assign(to)
        return
      }
      if (!res.ok) throw new Error(`answered ${res.status}`)
      setDone({ href: URL.createObjectURL(await res.blob()) })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="template-download">
      {notice ? (
        <div
          ref={problem}
          id={TEMPLATE_PROBLEM_ID}
          className="form-notice form-notice--bad"
          role="alert"
          tabIndex={-1}
        >
          {notice.text}
        </div>
      ) : null}

      <form
        ref={form}
        className="inquiry-form template-form"
        id={TEMPLATE_FORM_ID}
        method="post"
        action={TEMPLATE_DOWNLOAD_ACTION}
        onSubmit={onSubmit}
      >
        <p className="inquiry-form__key">
          {TEMPLATE_FORM_WORDS.key[0]}{' '}
          <span className="inquiry-form__req">{TEMPLATE_FORM_WORDS.key[1]}</span>{' '}
          {TEMPLATE_FORM_WORDS.key[2]}
        </p>

        {PAIRS.map((pair) => (
          <div className="inquiry-form__pair" key={pair.map((field) => field.name).join('-')}>
            {pair.map((field) => {
              const errorId = `${field.id}-error`
              const input = (
                <input
                  className="inquiry-form__input"
                  id={field.id}
                  type={field.type}
                  name={field.name}
                  required={field.needed}
                  maxLength={field.max}
                  autoComplete={field.auto}
                  {...(field.type === 'email' ? { spellCheck: false, autoCapitalize: 'off' } : {})}
                  {...(field.needed
                    ? {
                        'aria-describedby': errorId,
                        'aria-invalid': errors[field.name] ? true : undefined,
                      }
                    : {})}
                  onInput={() =>
                    errors[field.name] && setErrors(({ [field.name]: _gone, ...rest }) => rest)
                  }
                />
              )
              return (
                <div className="inquiry-form__field" key={field.name}>
                  <label className="inquiry-form__label" htmlFor={field.id}>
                    {field.label}
                    {field.needed ? (
                      <>
                        {' '}
                        <span className="inquiry-form__req" aria-hidden="true">
                          *
                        </span>
                      </>
                    ) : null}
                  </label>
                  {field.needed ? (
                    <>
                      <div className="inquiry-form__control">
                        {input}
                        <Tick />
                      </div>
                      <p className="inquiry-form__error" id={errorId} hidden={!errors[field.name]}>
                        {errors[field.name]}
                      </p>
                    </>
                  ) : (
                    input
                  )}
                </div>
              )
            })}
          </div>
        ))}

        <div className="template-form__updates">
          <input id="template-updates" type="checkbox" name="updates" value={UPDATES_VALUE} />
          <label htmlFor="template-updates">{TEMPLATE_FORM_WORDS.updates}</label>
        </div>

        <div className="site-actions">
          {/* One of the site's agreed primary labels (CT-08, `e2e/copy.spec.ts`). */}
          <button className="btn btn--primary" type="submit" disabled={busy} aria-busy={busy}>
            {TEMPLATE_FORM_WORDS.button}
          </button>
        </div>

        <p className="template-form__notice">
          {TEMPLATE_FORM_WORDS.notice}{' '}
          <a href="/privacy#template-downloads">{TEMPLATE_FORM_WORDS.privacyLink}</a>
        </p>

        <div className="inquiry-form__trap" aria-hidden="true">
          <label htmlFor="template-website">Website</label>
          <input
            id="template-website"
            type="text"
            name={HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
      </form>

      {/* A live region from the start, so the change is spoken (it is empty until there is news). */}
      <div className="template-download__status" role="status">
        {done ? (
          <p className="form-notice form-notice--ok">
            {TEMPLATE_FORM_WORDS.downloading}{' '}
            <a ref={again} href={done.href} download={TEMPLATE_FILE_NAME}>
              {TEMPLATE_FORM_WORDS.again}
            </a>
          </p>
        ) : failed ? (
          <p className="form-notice form-notice--bad">{TEMPLATE_FORM_WORDS.failed}</p>
        ) : null}
      </div>
    </div>
  )
}
