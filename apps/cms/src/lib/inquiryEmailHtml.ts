import type { InquiryEmailExtras, InquiryInput } from './inquiry'
import { SUBJECTS } from './inquiryForm'

/**
 * The two designed inquiry emails (owner, 2026-11-10): the team's notice and the buyer's receipt.
 *
 * ⚠️ HTML NOW, AFTER A DELIBERATE "PLAIN TEXT ONLY". `formatInquiryEmail` (lib/inquiry.ts) explains
 * why the notice was text: every value is typed by a stranger, and one missed escape puts their
 * markup in the team's mail client. The owner asked for designed emails, so that risk is now held
 * by construction instead: EVERY typed value reaches the markup through `esc` (text) or `attr`
 * (attributes) and nowhere else, `inquiryEmailHtml.test.ts` plants markup in every field and finds
 * none of it live, and the plain-text version still goes in the same message for any client that
 * prefers it.
 *
 * ⚠️ THE BUYER'S RECEIPT REPEATS NOTHING THEY TYPED BUT A SUBJECT FROM THE FORM'S OWN LIST. A
 * receipt that echoes the message or the name turns the form into a free sender: a robot types a
 * stranger's address and its advert, and our domain delivers it, signed by us. So the receipt says
 * only fixed words, the reference, and the subject when it is one of `SUBJECTS`.
 *
 * ⚠️ BUILT FOR MAIL CLIENTS, NOT BROWSERS: tables, inline styles, Arial (the brand's email face),
 * no web fonts, no script. Motion is one animated GIF in the receipt (about 98% of clients play
 * one, caniemail.com, read 2026-11-10; CSS animation reaches about 34%, AMP about 16%). Outlook on
 * Windows shows only its FIRST frame, so the first frame says everything on its own.
 */

/** The Paper & Ink light theme (packages/ui/src/tokens.css), as literals: mail has no var(). */
const C = {
  paper: '#f1efea',
  surface: '#faf9f6',
  wash: '#e4e1d8',
  ink: '#1d1f1a',
  muted: '#62655a',
  voltDeep: '#586c05',
  volt: '#cdf345',
  danger: '#b3261e',
  line: '#d0cfc9', // ink at 18% on paper, flattened: Outlook ignores rgba borders
} as const
const SANS = "Arial, 'Helvetica Neue', Helvetica, sans-serif"
const SERIF = "Georgia, 'Times New Roman', serif"
const MONO = "Menlo, Consolas, 'Courier New', monospace"

/** The site, for links and the GIF. */
const SITE = 'https://wear-run.com'
/** The one number (owner, 2026-10-26), in the form WhatsApp's link wants. */
const OUR_WHATSAPP = '923361777313'
const OUR_PHONE = '+92 336 1777313'

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
/** Text content. The ONLY way a typed value reaches the markup as text. */
export const esc = (text: string): string => text.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch)
/** An attribute value; the caller has already chosen the URL's scheme. */
const attr = esc

/** "RA-00082": what both emails and the admin call one inquiry. */
export const inquiryReference = (id: string | number): string => `RA-${String(id).padStart(5, '0')}`

/** The time in Sialkot, where the team reads it. */
const pakistanTime = (at: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at)

/**
 * A wa.me link for the buyer's phone, only when it carries its country code: "+44 7481 353077" →
 * 447481353077. A number typed without one cannot be dialled from Pakistan, so it gets no button.
 */
export function whatsappLink(phone: string): string | null {
  if (!phone.startsWith('+')) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15 ? `https://wa.me/${digits}` : null
}

const button = (href: string, label: string, primary: boolean): string =>
  `<a href="${attr(href)}" style="display:inline-block;padding:14px 18px;margin:0 8px 8px 0;border-radius:10px;font-family:${MONO};font-size:12px;letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;${
    primary
      ? `background:${C.ink};color:${C.volt};border:1px solid ${C.ink};`
      : `background:${C.surface};color:${C.ink};border:1px solid ${C.ink};`
  }">${esc(label)}</a>`

const label = (text: string): string =>
  `<span style="font-family:${MONO};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${C.muted};">${esc(text)}</span>`

/** The page around each email: paper ground, one 600px panel, a hidden preview line. */
function frame(preview: string, inner: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>RUN APPAREL</title>
</head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.paper};">${esc(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.surface};border:1px solid ${C.line};border-radius:18px;">
${inner}
</table>
<p style="margin:16px 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${C.muted};">RUN APPAREL (PVT) LTD · 13 Km Daska Road, Sialkot 51040, Pakistan · <a href="${SITE}" style="color:${C.muted};">wear-run.com</a></p>
</td></tr>
</table>
</body>
</html>`
}

const row = (content: string, padding = '0 28px 20px'): string =>
  `<tr><td style="padding:${padding};font-family:${SANS};color:${C.ink};">${content}</td></tr>`

/* ---------------------------------------------------------------- the team's notice */

export type TeamEmailInput = {
  value: InquiryInput
  id: string | number
  receivedAt: Date
  extras?: InquiryEmailExtras
}

/** The notice's subject: reference first, so a thread and the admin row match at a glance. */
export function teamSubject(value: InquiryInput, id: string | number): string {
  const who = value.company || value.name
  const where = value.country ? ` (${value.country})` : ''
  const what = value.subject ? ` — ${value.subject}` : ''
  return `${inquiryReference(id)} · ${who}${where}${what}`.slice(0, 160)
}

export function teamEmailHtml({ value, id, receivedAt, extras = {} }: TeamEmailInput): string {
  const ref = inquiryReference(id)
  const who = value.company || value.name
  const replySubject = `Re: your inquiry to RUN APPAREL (${ref})`
  const whatsapp = whatsappLink(value.phone)
  const details: [string, string][] = (
    [
      ['Name', value.name],
      ['Job', value.jobTitle],
      ['Company', value.company],
      ['Country', value.country],
      ['Email', value.email],
      ['Phone', value.phone],
    ] as [string, string][]
  ).filter(([, text]) => text)
  const files = extras.files ?? []

  const buttons = [
    button(
      `mailto:${encodeURIComponent(value.email).replace(/%40/g, '@')}?subject=${encodeURIComponent(replySubject)}`,
      `Reply to ${value.name.split(' ')[0] || 'buyer'}`,
      true,
    ),
    whatsapp ? button(whatsapp, 'WhatsApp', false) : '',
    extras.adminUrl ? button(extras.adminUrl, 'Open in CMS', false) : '',
  ].join('')

  return frame(
    `${who}${value.country ? `, ${value.country}` : ''}: ${value.message.slice(0, 90)}`,
    [
      row(
        `${label(`[ New inquiry ]  ${ref}`)}<br>${label(`${pakistanTime(receivedAt)} PKT`)}`,
        '24px 28px 12px',
      ),
      row(
        `<h1 style="margin:0;font-family:${SANS};font-weight:900;font-size:28px;line-height:1.05;letter-spacing:0.01em;text-transform:uppercase;color:${C.ink};">${esc(who)}${
          value.country
            ? ` <span style="font-family:${SERIF};font-style:italic;font-weight:400;text-transform:none;color:${C.voltDeep};">from ${esc(value.country)}</span>`
            : ''
        }</h1>`,
        '0 28px 14px',
      ),
      value.subject
        ? row(
            `<span style="display:inline-block;padding:6px 10px;border-radius:6px;background:${C.volt};color:${C.ink};font-family:${MONO};font-size:12px;letter-spacing:0.06em;">${esc(value.subject)}</span>`,
            '0 28px 18px',
          )
        : '',
      row(buttons, '0 28px 12px'),
      row(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};">${details
          .map(
            ([name, text]) =>
              `<tr><td width="96" style="padding:10px 0;border-bottom:1px solid ${C.line};vertical-align:top;">${label(name)}</td><td style="padding:10px 0;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:15px;line-height:1.4;color:${C.ink};">${esc(text)}</td></tr>`,
          )
          .join('')}</table>`,
      ),
      row(
        `${label('Message')}<div style="margin-top:8px;padding:16px 18px;border-radius:12px;background:${C.wash};font-family:${SANS};font-size:15px;line-height:1.55;color:${C.ink};">${esc(value.message).replace(/\n/g, '<br>')}</div>`,
      ),
      files.length > 0
        ? row(
            `${label(`Files (${files.length})`)}<p style="margin:8px 0 0;font-size:14px;line-height:1.5;">${files
              .map(
                (file) =>
                  `${esc(file.name)} <span style="color:${C.muted};">(${esc(file.size)})</span>`,
              )
              .join(
                '<br>',
              )}</p><p style="margin:6px 0 0;font-size:13px;color:${C.muted};">Files stay private: open them from the CMS.</p>`,
          )
        : '',
      extras.filesError
        ? row(
            `<p style="margin:0;font-size:14px;color:${C.danger};"><strong>Files NOT saved:</strong> ${esc(extras.filesError)}</p>`,
          )
        : '',
      row(
        `<p style="margin:0;font-size:12px;line-height:1.5;color:${C.muted};">Pressing Reply in your mail app answers ${esc(value.email)} directly.</p>`,
        '4px 28px 24px',
      ),
    ].join('\n'),
  )
}

/* ---------------------------------------------------------------- the buyer's receipt */

export type BuyerReceipt = { subject: string; html: string; text: string }

/** The receipt's moving header, served by the site (apps/cms/public/email/). */
export const RECEIPT_GIF = `${SITE}/email/inquiry-received.gif`
/**
 * The ink wordmark (owner, 2026-11-10), as a PNG because Gmail and Outlook do not draw SVG in mail.
 * Rendered at 3x (243 x 84) from the brand's own `run-apparel-wordmark-ink.svg` by Chromium, on
 * the panel's `surface` colour rather than transparent, so a dark-mode client never shows ink on a
 * dark ground. Shown 28px tall: above the brand's 24px minimum, with its clear space around it.
 */
export const RECEIPT_LOGO = `${SITE}/email/run-apparel-wordmark.png`
export const RECEIPT_GIF_ALT =
  'Inquiry received. Next, our team reads it. Then we reply within 24 hours.'

/** A subject the form itself offers, or nothing: never words the sender typed (see top). */
const offeredSubject = (subject: string): string | null =>
  (SUBJECTS as readonly string[]).includes(subject) ? subject : null

export function buyerReceipt({
  id,
  subject,
}: {
  id: string | number
  subject: string
}): BuyerReceipt {
  const ref = inquiryReference(id)
  const topic = offeredSubject(subject)

  const steps: [string, string][] = [
    ['№01', 'Our team in Sialkot reads your message and any files you sent.'],
    ['№02', 'We reply by email within 24 hours, often sooner, or call you on the number you gave.'],
    ['№03', 'Reply to this email to add anything: a sketch, a tech pack or a deadline.'],
  ]

  const html = frame(
    `We have your inquiry (${ref}). We reply within 24 hours.`,
    [
      // The wordmark first (owner, 2026-11-10: "Run logo must also be present").
      `<tr><td style="padding:22px 28px 18px;"><a href="${SITE}" style="text-decoration:none;"><img src="${RECEIPT_LOGO}" width="81" height="28" alt="RUN APPAREL" style="display:block;width:81px;height:28px;border:0;color:${C.ink};font-family:${SANS};font-weight:900;font-size:16px;"></a></td></tr>`,
      `<tr><td style="padding:0;"><img src="${RECEIPT_GIF}" width="600" alt="${attr(RECEIPT_GIF_ALT)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>`,
      row(label(`[ Your reference ]  ${ref}`), '24px 28px 12px'),
      row(
        `<h1 style="margin:0;font-family:${SANS};font-weight:900;font-size:30px;line-height:1.02;text-transform:uppercase;color:${C.ink};">What happens <span style="font-family:${SERIF};font-style:italic;font-weight:400;text-transform:none;color:${C.voltDeep};">next.</span></h1>`,
        '0 28px 16px',
      ),
      topic
        ? row(
            `${label('You asked about')}<br><span style="display:inline-block;margin-top:6px;padding:6px 10px;border-radius:6px;background:${C.volt};color:${C.ink};font-family:${MONO};font-size:12px;letter-spacing:0.06em;">${esc(topic)}</span>`,
            '0 28px 18px',
          )
        : '',
      row(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:0;border-top:1px solid ${C.line};">${steps
          .map(
            ([n, text]) =>
              `<tr><td width="52" style="padding:12px 0;border-bottom:1px solid ${C.line};vertical-align:top;font-family:${MONO};font-size:12px;color:${C.voltDeep};">${n}</td><td style="padding:12px 0;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:15px;line-height:1.5;color:${C.ink};">${esc(text)}</td></tr>`,
          )
          .join('')}</table>`,
      ),
      row(
        `${label('Need us sooner?')}<p style="margin:8px 0 12px;font-size:15px;line-height:1.5;">Call or WhatsApp ${OUR_PHONE}.</p>${button(`https://wa.me/${OUR_WHATSAPP}`, 'WhatsApp us', true)}${button(`${SITE}/products`, 'See the range →', false)}`,
      ),
      row(
        `<p style="margin:0;font-size:12px;line-height:1.5;color:${C.muted};">You get this one email because you sent an inquiry on wear-run.com. Quote ${ref} if you write to us.</p>`,
        '4px 28px 24px',
      ),
    ].join('\n'),
  )

  const text = [
    `Thank you. We have your inquiry (${ref}).`,
    ...(topic ? ['', `You asked about: ${topic}`] : []),
    '',
    'What happens next',
    ...steps.map(([n, step]) => `${n}  ${step}`),
    '',
    `Need us sooner? Call or WhatsApp ${OUR_PHONE}, or reply to this email.`,
    `See the range: ${SITE}/products`,
    '',
    'RUN APPAREL (PVT) LTD · 13 Km Daska Road, Sialkot 51040, Pakistan · wear-run.com',
    `You get this one email because you sent an inquiry on wear-run.com. Quote ${ref} if you write to us.`,
  ].join('\n')

  return { subject: `We have your inquiry — RUN APPAREL (${ref})`, html, text }
}
