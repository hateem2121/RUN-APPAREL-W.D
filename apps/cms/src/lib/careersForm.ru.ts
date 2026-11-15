import { RECEIVED_TEXT } from './careersForm'

/**
 * Russian twin of `careersForm.ts`: every exported sentence with an `_RU` suffix, and
 * `CAREERS_MESSAGES_RU`, the Russian of every sentence `careersFieldError` and `careersNotice` can
 * return (with the one static line of `pickedCvProblem` that reaches `careersFieldError` as its
 * custom message), keyed by the EXACT English the function returns, so the page looks the English
 * up and shows the Russian. A sentence missing here shows in English, never as a wrong Russian.
 *
 * ⚠️ THE OWNER APPROVED THE ENGLISH ON 2026-10-07; these say the same thing and nothing more.
 * "Application" is «заявка», "CV" is «резюме», "HR team" is «отдел кадров». The example phone
 * number and email address are the English ones, unchanged.
 */

export const SEND_APPLICATION_RU = 'Отправить заявку'
export const PHONE_HELP_RU = 'Мы позвоним вам по этому номеру.'
export const CV_HELP_RU = 'Нужно для офисных должностей. PDF, Word (.docx), JPG или PNG, до 10 МБ.'
export const RECEIVED_TEXT_RU =
  'Спасибо — ваша заявка передана в наш отдел кадров. Хороших кандидатов мы сохраняем в базе для будущих вакансий.'
export const SEND_ANOTHER_APPLICATION_RU = 'Отправить ещё одну заявку'

/**
 * The words the privacy line links, at its end before the full stop: the English page swaps
 * " See our privacy notice." for a link (`CareersForm.tsx`); the Russian line ends on these words
 * so it can be split the same way.
 */
export const PRIVACY_LINK_RU = 'уведомлении о конфиденциальности'
export const PRIVACY_LINE_RU = `Мы храним вашу заявку до 12 месяцев, затем удаляем её. Подробнее — в нашем ${PRIVACY_LINK_RU}.`

/** The English sentence each Russian one translates, exactly as the functions return it. */
export const CAREERS_MESSAGES_RU: Record<string, string> = {
  // careersFieldError: an empty box (`MISSING`).
  'Enter your name.': 'Введите ваше имя.',
  'Enter a phone number we can call.': 'Введите номер телефона, по которому мы можем позвонить.',
  'Choose what you do.': 'Выберите, чем вы занимаетесь.',
  'Tell us what you do.': 'Расскажите, чем вы занимаетесь.',
  // careersFieldError: a box filled the wrong way.
  'Enter a phone number with its country code, like +92 300 1234567.':
    'Введите номер телефона с кодом страны, например +92 300 1234567.',
  'Enter an email address like name@company.com.':
    'Введите адрес электронной почты, например name@company.com.',
  // careersFieldError's custom message for the CV: `pickedCvProblem`'s one fixed sentence.
  'Choose one file only.': 'Выберите только один файл.',
  // careersNotice.
  [RECEIVED_TEXT]: RECEIVED_TEXT_RU,
  'Your application has not been sent. Choose one file only.':
    'Ваша заявка не отправлена. Выберите только один файл.',
  'Your application has not been sent. Up to 10 MB can be attached — please send a smaller file.':
    'Ваша заявка не отправлена. Можно приложить файл размером до 10 МБ — пожалуйста, отправьте файл поменьше.',
  'Your application has not been sent. Your CV is empty — please choose it again.':
    'Ваша заявка не отправлена. Файл резюме пуст — пожалуйста, выберите его ещё раз.',
  'Your application has not been sent. Your CV is not a kind we accept, or its contents do not match its name. We accept PDF, Word (.docx), JPG or PNG.':
    'Ваша заявка не отправлена. Мы не принимаем файлы такого типа, или содержимое резюме не соответствует названию файла. Мы принимаем PDF, Word (.docx), JPG или PNG.',
  'That is several applications in a short time. Please wait a few minutes and try again.':
    'За короткое время отправлено несколько заявок. Пожалуйста, подождите несколько минут и попробуйте снова.',
  'We could not save your application — please try again later, or write to us at the address below.':
    'Нам не удалось сохранить вашу заявку — пожалуйста, попробуйте позже или напишите нам по адресу ниже.',
  'Your application has not been sent. Something in the form was not filled in. Please check and send again.':
    'Ваша заявка не отправлена. В форме что-то не заполнено. Пожалуйста, проверьте и отправьте снова.',
}

/** The Russian for a careers message, or the English itself when it has none (see above). */
export function careersMessageRu(english: string): string {
  return CAREERS_MESSAGES_RU[english] ?? english
}
