import type { RequiredField } from './templateDownload'

/**
 * Russian twin of the tech-pack template form's words (`templateDownload.ts`, Russian section,
 * 2026-11-15): the language audit of that day found the whole form in English on
 * /ru/guides/tech-pack-template. Same keys; the labels and errors read as the contact form's
 * (`ui.ru.ts`, `inquiryForm.ru.ts`), so one site says one thing one way. The workbook itself is
 * English, like the posts.
 */
export const TEMPLATE_FORM_WORDS_RU = {
  key: ['Поля, отмеченные', '*', 'обязательны.'],
  labels: {
    name: 'Имя',
    email: 'Корпоративная почта',
    company: 'Компания',
    country: 'Страна',
    jobTitle: 'Должность',
    whatsapp: 'Номер WhatsApp',
  },
  updates: 'Присылайте мне новости время от времени',
  button: 'Скачать шаблон',
  notice:
    'Мы используем эти данные, чтобы предоставить вам шаблон и знать, кто его скачал. Мы храним их 2 года с момента нашего последнего контакта с вами и не пишем вам на почту, не отправляем сообщений и не звоним, если только вы не отметите пункт выше или не напишете нам первыми.',
  privacyLink: 'Уведомление о конфиденциальности.',
  downloading: 'Шаблон скачивается.',
  again: 'Скачать ещё раз',
  failed: 'Скачивание не началось. Проверьте подключение и попробуйте ещё раз.',
} as const

export const TEMPLATE_MISSING_RU: Record<RequiredField, string> = {
  name: 'Укажите имя.',
  email: 'Укажите корпоративный адрес электронной почты.',
  company: 'Укажите название компании.',
  country: 'Укажите страну.',
}

/** As the contact form's (`inquiryForm.ru.ts`). */
export const TEMPLATE_EMAIL_FORMAT_RU = 'Укажите адрес в виде name@company.com.'

/** The page's message after a refused download, by its code. */
export const TEMPLATE_NOTICES_RU = {
  'too-many':
    'Слишком много скачиваний за короткое время. Подождите несколько минут и попробуйте ещё раз.',
  storage:
    'Нам не удалось сохранить ваши данные, поэтому шаблон не скачался. Попробуйте ещё раз через несколько минут.',
  invalid: 'Не все обязательные поля заполнены. Проверьте форму и попробуйте ещё раз.',
} as const
