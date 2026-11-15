/**
 * THE FOOTER'S CMS-HELD WORDS, IN RUSSIAN (Russian section, 2026-11-15).
 *
 * The footer's question, tab, promise, capacity lines and standards lines are the owner's, typed
 * in the CMS in English (read live from wear-run.com on 2026-11-15). Each Russian line is keyed by
 * the EXACT English it was translated from, so:
 *
 * ⚠️ WHEN THE OWNER EDITS ONE IN THE CMS, THE RUSSIAN FOOTER SHOWS THE NEW ENGLISH, never a
 * Russian line that no longer says the same thing. A stale translation would be a wrong claim; an
 * English line on a Russian page is only untranslated. Add the new line here to translate it.
 *
 * ⚠️ "SISTER COMPANY" IS «РОДСТВЕННАЯ КОМПАНИЯ», NEVER «ДОЧЕРНЯЯ» (subsidiary) OR «МАТЕРИНСКАЯ»
 * (parent): the owner ruled on 2026-11-04 that the two companies are sisters, not parent and
 * child, and both Russian words state exactly that relationship.
 */
export const FOOTER_RU: Readonly<Record<string, string>> = {
  'Start a conversation': 'Начать разговор',
  'Have a garment that needs making properly?': 'Есть изделие, которое нужно сшить на совесть?',
  'Send a tech pack, a sketch, or just the idea.': 'Пришлите техпакет, эскиз или просто идею.',
  'Reply within 24 hours': 'Ответим в течение 24 часов',
  'MOQ 50 pieces per style': 'Минимальная партия — 50 шт. на модель',
  'Lead time usually 2–4 weeks from order confirmation':
    'Срок производства — обычно 2–4 недели с момента подтверждения заказа',
  'Mon–Sat 08:00–17:00 PKT': 'Пн–сб 08:00–17:00 PKT',
  'Sister company: SEDEX-registered, SMETA-audited':
    'Родственная компания: зарегистрирована в SEDEX, прошла аудит SMETA',
  'Suppliers: ISO 9001, OEKO-TEX, GRS; amfori BSCI audits':
    'Поставщики: ISO 9001, OEKO-TEX, GRS; аудиты amfori BSCI',
  'Both companies: registered with the SECP': 'Обе компании: зарегистрированы в SECP',
  'SME Climate Hub: Committed': 'SME Climate Hub: взяли обязательство',
  '32.41° N · 74.46° E': '32.41° с. ш. · 74.46° в. д.',
}

/** The Russian for a CMS footer line, or the line itself when it has none (see above). */
export function ruFooter(english: string): string {
  return FOOTER_RU[english] ?? english
}
