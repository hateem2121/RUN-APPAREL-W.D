import { FAMILY_NAMES_RU } from '../families.ru'
import { FAMILY_PAGES_RU } from '../familyPages.ru'
import type { FaqTopic } from '../faqs'
import { FAQ_INDEX_RU, FAQ_TOPICS_RU } from '../faqs.ru'
import { GLOSSARY_INDEX_RU } from '../glossary.ru'
import { LIBRARY_GUIDES_RU } from '../guideLibrary.ru'
import type { Guide } from '../guides'
import { GUIDES_INDEX_RU, GUIDES_RU } from '../guides.ru'
import { formatPostDate } from '../journal'

/**
 * RUSSIAN TITLES AND NAMES, LOOKED UP BY THE ENGLISH PATH OR NAME (Russian section, 2026-11-15).
 *
 * Every Russian words file keeps the English `path` (its parity test requires it), so a page that
 * links "Read next" or a family finds the Russian words here by the same key the English page
 * uses. A missing entry THROWS rather than falling back to English: a Russian page that quietly
 * shows an English title is the failure this section exists to prevent, and a throw is caught by
 * the browser tests that load every /ru page.
 */
const GUIDE_BY_PATH = new Map(
  [...GUIDES_RU, ...LIBRARY_GUIDES_RU].map((guide) => [guide.path, guide] as const),
)

export function guideAtRu(path: string): Guide {
  const guide = GUIDE_BY_PATH.get(path)
  if (!guide) throw new Error(`No Russian guide at ${path}`)
  return guide
}

export { GUIDES_INDEX_RU }

export function familyNameRu(englishName: string): string {
  const name = FAMILY_NAMES_RU[englishName]
  if (!name) throw new Error(`No Russian name for the family ${englishName}`)
  return name
}

/** A buyer page as a link: its Russian heading without the trailing comma, and its description. */
export function buyerPageRu(path: string | undefined) {
  const page = path ? FAMILY_PAGES_RU.find((entry) => entry.path === path) : undefined
  if (!page) return null
  return { href: page.path, name: page.heading.replace(/,\s*$/, ''), why: page.description }
}

export function faqTopicAtRu(path: string): FaqTopic {
  const topic = FAQ_TOPICS_RU.find((entry) => entry.path === path)
  if (!topic) throw new Error(`No Russian FAQ topic at ${path}`)
  return topic
}

export function faqTopicTitleRu(path: string): string {
  return faqTopicAtRu(path).title
}

export const FAQ_INDEX_PATH = FAQ_INDEX_RU.path
export const GLOSSARY_TITLE_RU = GLOSSARY_INDEX_RU.title

/**
 * The legal line under a guide's rules, in Russian. `checked` is the English date the guide
 * carries ("5 November 2026"), read as a date and written the Russian way.
 */
export function legalLineRu(checked: string): string {
  const day = new Date(`${checked} UTC`)
  const when = Number.isNaN(day.getTime())
    ? checked
    : formatPostDate(day.toISOString().slice(0, 10), 'ru')
  return `Проверено ${when}. Не является юридической или налоговой консультацией: уточните у своего таможенного брокера или консультанта.`
}
