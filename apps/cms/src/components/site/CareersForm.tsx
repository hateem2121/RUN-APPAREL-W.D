import { HONEYPOT_FIELD, MAX_LENGTHS, ROLE_OPTIONS, ROLE_OTHER } from '../../lib/application'
import { careersNotice, PHONE_HELP, PRIVACY_LINE, SEND_APPLICATION } from '../../lib/careersForm'
import { REQUIRED_KEY } from '../../lib/inquiryForm'
import { ApplicationProblem, ApplicationReceived } from './ApplicationOutcome'
import { CvPicker } from './CvPicker'
import { InquiryFormEnhancer } from './InquiryFormEnhancer'

/** The tick in a needed box once rightly filled (contact/page.tsx, polish MO5). Decoration. */
function Tick() {
  return (
    <svg className="inquiry-form__tick" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  )
}

/**
 * The careers application form (owner, F23 and the approved words of 2026-10-07), on /careers
 * under "How to apply". It is the contact form's markup and behaviour — a plain
 * `<form method="post">` that works without scripting, enhanced by `InquiryFormEnhancer`
 * (`form="careers"` for its words) — with the careers fields: name, phone and what you do are
 * needed; email, years, a note and ONE CV are not. It posts to `careers/submit/route.ts`, which
 * stores the application first and only then emails HR.
 *
 * ⚠️ PHONE, NOT EMAIL, IS THE WAY BACK: many floor applicants do not use email (F23), so the
 * phone is required and its help line says so; email is optional. The `pattern` lets the browser
 * refuse a phone with letters before sending; the route checks again (7–15 digits).
 */
export function CareersForm({
  query,
}: {
  query: { sent?: string; error?: string; reason?: string }
}) {
  const notice = careersNotice(query)
  return (
    <>
      {notice?.kind === 'ok' ? (
        <ApplicationReceived thanks={notice.text} />
      ) : notice ? (
        <ApplicationProblem>{notice.text}</ApplicationProblem>
      ) : null}

      <form
        className="inquiry-form"
        id="application-form"
        method="post"
        action="/careers/submit"
        encType="multipart/form-data"
        hidden={notice?.kind === 'ok'}
      >
        <InquiryFormEnhancer form="careers" />

        <p className="inquiry-form__key">
          {REQUIRED_KEY.split('*')[0]}
          <span className="inquiry-form__req">*</span>
          {REQUIRED_KEY.split('*')[1]}
        </p>

        <div className="inquiry-form__pair">
          <div className="inquiry-form__field">
            <label className="inquiry-form__label" htmlFor="application-name">
              Name{' '}
              <span className="inquiry-form__req" aria-hidden="true">
                *
              </span>
            </label>
            <div className="inquiry-form__control">
              <input
                className="inquiry-form__input"
                id="application-name"
                type="text"
                name="name"
                required
                maxLength={MAX_LENGTHS.name}
                autoComplete="name"
                data-check
              />
              <Tick />
            </div>
            <p className="inquiry-form__error" id="application-name-error" hidden />
          </div>

          <div className="inquiry-form__field">
            <label className="inquiry-form__label" htmlFor="application-phone">
              Phone{' '}
              <span className="inquiry-form__req" aria-hidden="true">
                *
              </span>
            </label>
            <div className="inquiry-form__phone">
              <label className="visually-hidden" htmlFor="application-phone-code">
                Country code
              </label>
              <input
                className="inquiry-form__code"
                id="application-phone-code"
                type="text"
                name="phoneCode"
                inputMode="tel"
                autoComplete="tel-country-code"
                maxLength={5}
                defaultValue="+92"
              />
              <input
                className="inquiry-form__number"
                id="application-phone"
                type="tel"
                name="phone"
                required
                // Escaped for the `v` mode browsers now read `pattern` in, where ( ) - inside a
                // class are syntax: unescaped, the whole pattern is ignored without a word.
                pattern="[0-9+\(\)\- ]{7,}"
                autoComplete="tel-national"
                maxLength={40}
                aria-describedby="application-phone-note application-phone-error"
                data-check
              />
            </div>
            <p className="inquiry-form__note" id="application-phone-note">
              {PHONE_HELP}
            </p>
            <p className="inquiry-form__error" id="application-phone-error" hidden />
          </div>
        </div>

        <div className="inquiry-form__field">
          <label className="inquiry-form__label" htmlFor="application-email">
            Email
          </label>
          <input
            className="inquiry-form__input"
            id="application-email"
            type="email"
            name="email"
            maxLength={MAX_LENGTHS.email}
            autoComplete="email"
            spellCheck={false}
            data-check
          />
          <p className="inquiry-form__error" id="application-email-error" hidden />
        </div>

        {/*
         * WHAT YOU DO: the owner's roles as answers to tap, the last opening a box for the
         * applicant's own words — the contact form's Subject pattern, revealed by CSS alone
         * (`.inquiry-form__subject:has(input[value="other"]:checked)`), so it works without
         * scripting. Needed: `required` on a radio makes the group needed.
         */}
        <fieldset className="inquiry-form__subject">
          <legend className="inquiry-form__label">
            What you do{' '}
            <span className="inquiry-form__req" aria-hidden="true">
              *
            </span>
          </legend>
          <div className="inquiry-form__answers">
            {/*
             * ⚠️ ONE `data-check` FOR THE GROUP, on the first answer, with the group's id: every
             * radio of a group shares one validity, and the form's list of mistakes counts each
             * checked field once — on all eight it said "Choose what you do." eight times.
             */}
            {ROLE_OPTIONS.map((option, index) => (
              <label className="filter-chip inquiry-form__answer" key={option.value}>
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  required
                  {...(index === 0
                    ? {
                        id: 'application-role',
                        'data-check': true,
                        'aria-describedby': 'application-role-error',
                      }
                    : {})}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <div className="inquiry-form__own">
            <label className="inquiry-form__label" htmlFor="application-role-own">
              What do you do?
            </label>
            <input
              className="inquiry-form__input"
              id="application-role-own"
              type="text"
              name="roleOther"
              maxLength={MAX_LENGTHS.roleOther}
              // Needed only while "Something else" is chosen: the enhancer switches `required`
              // with the choice (a required box out of sight would block every other role).
              data-check
              data-needed-when={`role=${ROLE_OTHER}`}
            />
            <p className="inquiry-form__error" id="application-role-own-error" hidden />
          </div>
          <p className="inquiry-form__error" id="application-role-error" hidden />
        </fieldset>

        <div className="inquiry-form__field">
          <label className="inquiry-form__label" htmlFor="application-years">
            Years of experience
          </label>
          <input
            className="inquiry-form__input"
            id="application-years"
            type="number"
            name="years"
            min={0}
            max={60}
            step={1}
            inputMode="numeric"
          />
        </div>

        <div className="inquiry-form__field">
          <label className="inquiry-form__label" htmlFor="application-note">
            Anything else we should know
          </label>
          <textarea
            className="inquiry-form__input inquiry-form__textarea"
            id="application-note"
            name="note"
            rows={4}
            maxLength={MAX_LENGTHS.note}
          />
        </div>

        <CvPicker />

        <div className="site-actions">
          {/* An agreed primary label (CT-08, `e2e/copy.spec.ts`; owner, F23, 2026-10-07). */}
          <button className="btn btn--primary" type="submit">
            {SEND_APPLICATION}
          </button>
        </div>
        <p className="inquiry-form__note">
          {PRIVACY_LINE.replace(' See our privacy notice.', ' See our ')}
          <a href="/privacy#job-applications">privacy notice</a>.
        </p>

        {/* The contact form's honeypot, word for word (contact/page.tsx says why each attribute). */}
        <div className="inquiry-form__trap" aria-hidden="true">
          <label htmlFor={HONEYPOT_FIELD}>Website</label>
          <input
            id={HONEYPOT_FIELD}
            type="text"
            name={HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
      </form>
    </>
  )
}
