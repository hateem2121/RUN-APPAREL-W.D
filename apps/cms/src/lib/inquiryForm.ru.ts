import { checkFiles, MAX_FILES, MAX_TOTAL_BYTES } from './inquiryFiles'
import type { FieldValidity, Notice, SUBJECTS } from './inquiryForm'

/**
 * Russian twin of `inquiryForm.ts` (Russian section, 2026-11-15): the contact form's words on
 * /ru/contact, one for each English one, the limits computed from the same constants. What the form
 * POSTS stays English (the subject's value, the field names), so the server and the team's inquiry
 * email read exactly what they read today; only what a visitor sees is Russian.
 *
 * The client islands (`InquiryFormEnhancer`, `FilePicker`) import this, so it ships in the contact
 * page's script: keep it to the form's own words.
 */

/** «1,5 МБ», «300 КБ»: the Russian units and decimal comma (`formatBytes` writes "1.5 MB"). */
export function formatBytesRu(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`
  return `${Math.max(1, Math.round(size / 1024))} КБ`
}

export const LIMIT_RU = `${MAX_TOTAL_BYTES / (1024 * 1024)} МБ`

export const REQUIRED_KEY_RU =
  'Поля, отмеченные *, обязательны. Остальные помогут нам ответить быстрее.'

/** Each subject's label by its English value, which is what the form sends. */
export const SUBJECT_LABELS_RU: Readonly<Record<(typeof SUBJECTS)[number], string>> = {
  'Request a quote': 'Запросить расчёт стоимости',
  'Develop a new product': 'Разработать новое изделие',
  Samples: 'Образцы',
  'Private label & branding': 'Private label и брендирование',
  'Repeat or bulk order': 'Повторный или серийный заказ',
}
export const SUBJECT_OTHER_LABEL_RU = 'Другое…'
export const SUMMARY_HEADING_RU = 'Проверьте перед отправкой:'
export const SENDING_LABEL_RU = 'Отправляем…'

/** «Отправлено 1,2 МБ из 8,0 МБ (15%)». */
export function uploadProgressLabelRu(loaded: number, total: number): string {
  const percent = total <= 0 ? 0 : Math.min(100, Math.max(0, Math.floor((loaded / total) * 100)))
  return `Отправлено ${formatBytesRu(loaded)} из ${formatBytesRu(total)} (${percent}%)`
}
export const UPLOAD_FINISHING_RU = 'Файлы получены. Завершаем…'
export const UPLOAD_DROPPED_RU =
  'Соединение прервалось до того, как файлы дошли, поэтому ничего не отправлено. Проверьте соединение и снова нажмите «Отправить».'
export const UPLOAD_UNCONFIRMED_RU =
  'Файлы до нас дошли, но соединение прервалось до подтверждения. Прежде чем отправлять ещё раз, напишите нам на почту, чтобы проверить.'
export const RECEIVED_HEADING_RU = 'Получили.'
export const SEND_ANOTHER_RU = 'Отправить ещё один запрос'
export const NEED_US_SOONER_RU = 'Нужен ответ быстрее?'

const MISSING_RU: Record<string, string> = {
  name: 'Укажите имя.',
  email: 'Укажите адрес электронной почты.',
  message: 'Расскажите, что вам нужно сшить. Достаточно одного предложения.',
  phone: 'Укажите телефон, по которому можно позвонить или написать в WhatsApp.',
}

/** `fieldError` in Russian: the same cases, in the same order. */
export function fieldErrorRu(
  name: string,
  validity: FieldValidity,
  customMessage = '',
): string | null {
  if (validity.valid) return null
  if (name === 'files') return customMessage || null
  if (validity.valueMissing) return MISSING_RU[name] ?? null
  if (name === 'email' && validity.typeMismatch) return 'Укажите адрес в виде name@company.com.'
  return null
}

/** `pickProblem` in Russian. */
export function pickProblemRu(files: readonly { size: number }[]): string | null {
  if (files.length > MAX_FILES)
    return `Выбрано файлов: ${files.length}. Можно приложить не больше ${MAX_FILES}. Остальные пришлите на почту или вставьте в сообщение ссылку WeTransfer или Google Drive.`
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (total > MAX_TOTAL_BYTES)
    return `Общий размер этих файлов — ${formatBytesRu(total)}. Всего можно приложить до ${LIMIT_RU}. Для более крупных файлов вставьте в сообщение ссылку WeTransfer или Google Drive.`
  return null
}

export const ACCEPTED_KINDS_RU =
  'фотографии (JPG, PNG, WebP, HEIC), PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), Keynote, файлы Illustrator и Photoshop'

export const FILE_BOX_NOTE_RU =
  'Фото, PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), Keynote, Illustrator или Photoshop. Файл слишком большой? Вставьте в сообщение ссылку WeTransfer или Google Drive.'

/** `pickedFileProblem` in Russian. */
export async function pickedFileProblemRu(files: readonly File[]): Promise<string | null> {
  const counted = pickProblemRu(files)
  if (counted) return counted
  const check = await checkFiles(files)
  if (check.ok) return null
  if (check.reason === 'empty') return `Файл «${check.name}» пустой. Выберите его ещё раз.`
  if (check.reason === 'type')
    return `Файл «${check.name}» — неподдерживаемого формата, или его содержимое не соответствует расширению. Мы принимаем: ${ACCEPTED_KINDS_RU}.`
  return pickProblemRu(files)
}

const NOT_SENT_RU = 'Сообщение не отправлено.'

const WRONG_KIND_RU = `${NOT_SENT_RU} Один из файлов неподдерживаемого формата, или его не удалось прочитать. Мы принимаем: ${ACCEPTED_KINDS_RU}.`

const FILE_REASONS_RU: Record<string, string> = {
  'too-many': `${NOT_SENT_RU} Можно приложить не больше ${MAX_FILES} файлов. Отправьте ещё раз с меньшим числом файлов или пришлите остальные на почту.`,
  'too-big': `${NOT_SENT_RU} Общий размер файлов больше ${LIMIT_RU}. Отправьте ещё раз с файлами поменьше или вставьте в сообщение ссылку WeTransfer или Google Drive.`,
  empty: `${NOT_SENT_RU} Один из файлов пустой. Выберите его ещё раз и отправьте.`,
  type: WRONG_KIND_RU,
}

/** `inquiryNotice` in Russian: the same query, the same cases. */
export function inquiryNoticeRu(query: {
  sent?: string
  error?: string
  reason?: string
}): Notice | null {
  if (query.sent) {
    return { kind: 'ok', text: 'Спасибо. Мы получили ваш запрос и ответим в течение 24 часов.' }
  }
  if (!query.error) return null
  if (query.error === 'files') {
    return { kind: 'bad', text: FILE_REASONS_RU[query.reason ?? ''] ?? WRONG_KIND_RU }
  }
  if (query.error === 'too-many') {
    return {
      kind: 'bad',
      text: 'Слишком много запросов за короткое время. Подождите несколько минут или напишите нам на почту.',
    }
  }
  if (query.error === 'storage') {
    return {
      kind: 'bad',
      text: 'Не удалось сохранить сообщение. Напишите нам на почту, чтобы оно не потерялось.',
    }
  }
  return {
    kind: 'bad',
    text: 'Одно из полей формы не заполнено. Проверьте форму и отправьте её ещё раз.',
  }
}
