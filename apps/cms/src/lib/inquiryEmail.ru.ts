import type { ReceiptWords } from './inquiryEmailHtml'
import { SUBJECT_LABELS_RU } from './inquiryForm.ru'

/**
 * The buyer's receipt in Russian (owner, 2026-11-15: "Translate it"), for an inquiry sent from
 * /ru/contact. Same shape as `RECEIPT_WORDS` in `inquiryEmailHtml.ts`; the English receipt is left
 * byte for byte as it was.
 *
 * «Запрос», not «заявка»: the contact page's own thank-you says «Мы получили ваш запрос», and the
 * receipt is the same moment in the buyer's inbox. «Заявка» stays the careers form's word.
 *
 * Reviewed 2026-11-15 by a helper briefed as a senior Russian B2B editor: the footer no longer says
 * this is the only email (the reply comes by email too), and no-break spaces keep «24 часов» and each
 * dash on their line.
 *
 * Its own moving header (owner, 2026-11-15): `inquiry-received-ru.gif`, drawn by
 * `scripts/make-receipt-gif.py --lang ru` in the site's Cyrillic companion faces, because the
 * English banner spells its steps in English. Words reviewed the same day: «ПРИНЯТО. спасибо.»,
 * «ПОЛУЧЕН / ЧИТАЕМ / ОТВЕТ ЗА 24 ЧАСА»; the alt text promises only what the letter does
 * («прочитает», not «сейчас читает»: the receipt goes out at any hour).
 */
/**
 * The Russian banner (owner, 2026-11-15), drawn by `scripts/make-receipt-gif.py --lang ru`. Defined
 * HERE, not beside RECEIPT_GIF: `inquiryEmailHtml.ts` imports this file, so a value imported back
 * from it is still undefined while these words are built (an import cycle; its test caught it).
 */
export const RECEIPT_GIF_RU = 'https://wear-run.com/email/inquiry-received-ru.gif'

export const RECEIPT_WORDS_RU: ReceiptWords = {
  lang: 'ru',
  subject: (ref) => `Мы получили ваш запрос\u00a0— RUN APPAREL (${ref})`,
  preview: (ref) => `Мы получили ваш запрос (${ref}) и ответим в течение 24\u00a0часов.`,
  gif: {
    src: RECEIPT_GIF_RU,
    alt: 'Запрос получен. Наша команда его прочитает и ответит в течение 24\u00a0часов.',
  },
  reference: 'Номер запроса',
  heading: ['Что', 'дальше'],
  askedAbout: 'Тема запроса',
  topic: (subject) => SUBJECT_LABELS_RU[subject],
  steps: [
    'Наша команда в Сиалкоте прочитает ваше сообщение и приложенные файлы.',
    'Мы ответим по электронной почте в течение 24\u00a0часов (а часто и раньше) или позвоним по указанному вами номеру.',
    'Чтобы что-то добавить\u00a0— эскиз, техпакет или сроки,\u00a0— просто ответьте на это письмо.',
  ],
  sooner: 'Нужно быстрее?',
  callUs: (phone) => `Позвоните или напишите в WhatsApp: ${phone}.`,
  whatsapp: 'Написать в WhatsApp',
  range: 'Посмотреть ассортимент\u00a0→',
  rangePath: '/ru/products',
  thanks: (ref) => `Спасибо. Мы получили ваш запрос (${ref}).`,
  textHeading: 'Что дальше',
  textSooner: (phone) =>
    `Нужно быстрее? Позвоните или напишите в WhatsApp по номеру ${phone} либо просто ответьте на это письмо.`,
  textRange: 'Ассортимент',
  why: (ref) =>
    `Это письмо отправлено один раз, автоматически, в ответ на ваш запрос с сайта wear-run.com. Если будете писать нам, укажите номер ${ref}.`,
}
