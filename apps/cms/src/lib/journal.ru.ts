import type { JOURNAL_CLUSTERS, JOURNAL_HUB } from './journal'

/**
 * Russian twin of the journal hub's words (`journal.ts`, Russian section, 2026-11-15). The posts
 * themselves stay English (owner's decision: database text is English), so /ru/journal is a Russian
 * hub listing English posts, each labelled «на английском».
 */
export const JOURNAL_HUB_RU: { readonly [K in keyof typeof JOURNAL_HUB]: string } = {
  title: 'Журнал',
  metaTitle: 'Журнал: заметки с производства в Сиалкоте',
  eyebrow: '[ Журнал ]',
  heading: 'Заметки',
  headingAccent: 'с производства.',
  description:
    'Заметки с производства в Сиалкоте: ремесло и пошив, истории Сиалкота, устойчивое развитие, взгляд на отрасль и новости RUN APPAREL. Статьи на английском.',
}

/** The topics' names, by their stored value (the value stays as the CMS has it). */
export const JOURNAL_CLUSTER_NAMES_RU: Readonly<
  Record<(typeof JOURNAL_CLUSTERS)[number]['value'], string>
> = {
  'craft-and-making': 'Ремесло и пошив',
  'sialkot-stories': 'Истории Сиалкота',
  sustainability: 'Устойчивое развитие',
  'industry-insight': 'Взгляд на отрасль',
  'company-news': 'Новости компании',
}

/** The label beside an English post on a Russian page. */
export const IN_ENGLISH_RU = 'на английском'
