'use client'

import { useEffect, useId, useState } from 'react'
import { RU_GLOSSARY_FILTER } from '../../lib/i18n/islandWords'
import { useLocale } from '../../lib/i18n/uiClient'

/**
 * The glossary's "Filter terms" box (PLAN.md D6). The page is complete without it: every term is
 * server-rendered, and the box does not exist until the script runs (nothing to type into that
 * would do nothing). With it, each keystroke hides the terms whose name and definition do not
 * contain the words, and a category with none left. It moves no focus and reloads nothing.
 */
export function GlossaryFilter({ total }: { total: number }) {
  const id = useId()
  // Russian section (2026-11-15): the page's language from its address, no words as props.
  const ru = useLocale() === 'ru'
  const [ready, setReady] = useState(false)
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(total)

  useEffect(() => setReady(true), [])

  useEffect(() => {
    const words = query.trim().toLowerCase()
    let count = 0
    for (const term of document.querySelectorAll<HTMLElement>('[data-glossary-term]')) {
      const match = !words || (term.textContent ?? '').toLowerCase().includes(words)
      term.hidden = !match
      if (match) count++
    }
    for (const group of document.querySelectorAll<HTMLElement>('[data-glossary-group]')) {
      group.hidden = !group.querySelector('[data-glossary-term]:not([hidden])')
    }
    setShown(count)
  }, [query])

  if (!ready) return null
  return (
    <div className="glossary-filter">
      <label className="inquiry-form__label" htmlFor={id}>
        {ru ? RU_GLOSSARY_FILTER.label : 'Filter terms'}
      </label>
      <input
        className="inquiry-form__input glossary-filter__input"
        id={id}
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <p className="glossary-filter__count" aria-live="polite">
        {ru ? RU_GLOSSARY_FILTER.count(shown, total) : `${shown} of ${total} terms`}
      </p>
    </div>
  )
}
