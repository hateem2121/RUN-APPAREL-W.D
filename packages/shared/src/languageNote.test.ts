import { describe, expect, it, vi } from 'vitest'
import type { ConsentStorage } from './consent.ts'
import {
  hasLanguageChoice,
  LANGUAGE_LINK_SELECTOR,
  LANGUAGE_NOTE_EVENTS,
  LANGUAGE_NOTE_STORAGE_KEY,
  LANGUAGE_NOTE_WORDS,
  liftClearOfNote,
  stepNoteBelow,
  offeredLanguage,
  PERSON_EVENTS,
  READ_IN_ENGLISH,
  rememberLanguageChoice,
  startLanguageNote,
  watchForPerson,
} from './languageNote.ts'
import { SITE_OTHER_LANGUAGE_EN } from './siteBar.ts'
import { CHROME_RU } from './siteChrome.ru.ts'

/** What a listener in languageNote.ts is handed. */
type Listened = { readonly isTrusted: boolean; readonly target?: unknown }

/** A storage that keeps what it is given, like the browser's. */
function memoryStorage(): ConsentStorage & { readonly kept: Map<string, string> } {
  const kept = new Map<string, string>()
  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
    removeItem: (key) => void kept.delete(key),
    key: (index) => [...kept.keys()][index] ?? null,
    get length() {
      return kept.size
    },
  }
}

describe('offeredLanguage: who is offered the other language', () => {
  it('offers Russian on an English page only when Russian is the FIRST language', () => {
    expect(offeredLanguage('en', ['ru-RU', 'ru', 'en-US'])).toBe('ru')
    expect(offeredLanguage('en', ['ru'])).toBe('ru')
    expect(offeredLanguage('en', ['RU_ru'])).toBe('ru')
  })

  it('offers nothing on an English page when Russian is listed second or not at all', () => {
    // The negative control for the rule above: Russian is present, but not first.
    expect(offeredLanguage('en', ['en-US', 'ru-RU'])).toBeNull()
    expect(offeredLanguage('en', ['uk-UA', 'ru'])).toBeNull()
    expect(offeredLanguage('en', ['en-GB'])).toBeNull()
    expect(offeredLanguage('en', ['de', 'fr'])).toBeNull()
  })

  it('offers English on a Russian page only when the browser lists no Russian at all', () => {
    expect(offeredLanguage('ru', ['en-US', 'en'])).toBe('en')
    expect(offeredLanguage('ru', ['de-DE'])).toBe('en')
  })

  it('offers nothing on a Russian page when Russian is anywhere in the list', () => {
    expect(offeredLanguage('ru', ['ru-RU'])).toBeNull()
    expect(offeredLanguage('ru', ['en-US', 'ru'])).toBeNull()
    expect(offeredLanguage('ru', ['kk', 'en', 'ru-KZ'])).toBeNull()
  })

  it('does not mistake another language that starts with the same letters for Russian', () => {
    // `rup` (Macedo-Romanian) and `run` (Rundi) are real tags; only the exact subtag `ru` counts.
    expect(offeredLanguage('en', ['rup'])).toBeNull()
    expect(offeredLanguage('ru', ['run'])).toBe('en')
  })

  it('still works when a browser gives ONE language (Chrome plans to cut the list)', () => {
    // A Russian-first visitor, list cut to one: the English page still offers Russian.
    expect(offeredLanguage('en', ['ru-RU'])).toBe('ru')
    // An English-first visitor who also reads Russian, list cut to one: the Russian page now
    // offers English. Accepted: a note they close once; it never hides the Russian offer.
    expect(offeredLanguage('ru', ['en-US'])).toBe('en')
  })

  it('falls back to navigator.language when the list is missing or empty', () => {
    expect(offeredLanguage('en', undefined, 'ru-RU')).toBe('ru')
    expect(offeredLanguage('en', [], 'ru')).toBe('ru')
    expect(offeredLanguage('ru', null, 'en-US')).toBe('en')
    expect(offeredLanguage('ru', [], 'ru-RU')).toBeNull()
  })

  it('guesses nothing when the browser says nothing, or says rubbish', () => {
    expect(offeredLanguage('en', undefined)).toBeNull()
    expect(offeredLanguage('ru', [])).toBeNull()
    expect(offeredLanguage('ru', [], '')).toBeNull()
    expect(offeredLanguage('ru', [null, 42, ''])).toBeNull()
    // The list wins over the single value when it has an entry.
    expect(offeredLanguage('en', ['en-US'], 'ru-RU')).toBeNull()
  })
})

describe('the words', () => {
  it('are written in the language they offer, and carry it for `lang`', () => {
    expect(LANGUAGE_NOTE_WORDS.ru.lang).toBe('ru')
    expect(LANGUAGE_NOTE_WORDS.en.lang).toBe('en')
    for (const text of Object.values(LANGUAGE_NOTE_WORDS.ru).slice(1)) {
      expect(text, 'a Russian note with Latin words').not.toMatch(/[A-Za-z]/)
    }
    for (const text of Object.values(LANGUAGE_NOTE_WORDS.en).slice(1)) {
      expect(text, 'an English note with Cyrillic words').not.toMatch(/[Ѐ-ӿ]/)
    }
  })

  it('are the owner-approved sentences (2026-11-16)', () => {
    expect(LANGUAGE_NOTE_WORDS.ru.text).toBe('Эта страница есть на русском.')
    expect(LANGUAGE_NOTE_WORDS.ru.close).toBe('Закрыть')
    expect(LANGUAGE_NOTE_WORDS.en.text).toBe('This page is also in English.')
    expect(LANGUAGE_NOTE_WORDS.en.close).toBe('Close')
  })

  it("reuse the bar's own names for the two links, so the note and the bar agree", () => {
    expect(LANGUAGE_NOTE_WORDS.ru.action).toBe(SITE_OTHER_LANGUAGE_EN.name)
    expect(LANGUAGE_NOTE_WORDS.en.action).toBe(READ_IN_ENGLISH)
    expect(CHROME_RU.otherLanguage.name).toBe(READ_IN_ENGLISH)
  })
})

describe('remembering the choice', () => {
  it('is not remembered until the visitor answers', () => {
    const storage = memoryStorage()
    expect(hasLanguageChoice(storage)).toBe(false)
    expect(storage.kept.size, 'reading must store nothing').toBe(0)
  })

  it('is remembered after an answer, under one key and nothing else', () => {
    const storage = memoryStorage()
    rememberLanguageChoice(storage)
    expect(hasLanguageChoice(storage)).toBe(true)
    expect([...storage.kept.keys()]).toEqual([LANGUAGE_NOTE_STORAGE_KEY])
  })

  it('fails closed on a value it did not write', () => {
    const storage = memoryStorage()
    storage.setItem(LANGUAGE_NOTE_STORAGE_KEY, 'true')
    expect(hasLanguageChoice(storage)).toBe(false)
  })

  it('survives a storage that throws (Safari with storage blocked)', () => {
    const broken: ConsentStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
      key: () => null,
      length: 0,
    }
    expect(hasLanguageChoice(broken)).toBe(false)
    expect(() => rememberLanguageChoice(broken)).not.toThrow()
  })
})

describe('watchForPerson: the note waits for a person', () => {
  function target() {
    const listeners = new Map<string, Set<(event: Listened) => void>>()
    return {
      listeners,
      addEventListener: (type: string, listener: (event: Listened) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)?.add(listener)
      },
      removeEventListener: (type: string, listener: (event: Listened) => void) => {
        listeners.get(type)?.delete(listener)
      },
      fire: (type: string, isTrusted: boolean) => {
        for (const listener of [...(listeners.get(type) ?? [])]) {
          listener({ isTrusted })
        }
      },
      count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    }
  }

  it('does nothing until something happens', () => {
    const page = target()
    const onPerson = vi.fn()
    watchForPerson(page, onPerson)
    expect(onPerson).not.toHaveBeenCalled()
  })

  it.each(PERSON_EVENTS)('fires once on a trusted %s, then stops listening', (type) => {
    const page = target()
    const onPerson = vi.fn()
    watchForPerson(page, onPerson)
    page.fire(type, true)
    page.fire(type, true)
    page.fire('keydown', true)
    expect(onPerson).toHaveBeenCalledTimes(1)
    expect(page.count(), 'listeners left behind').toBe(0)
  })

  it('ignores an event a script made (isTrusted false)', () => {
    const page = target()
    const onPerson = vi.fn()
    watchForPerson(page, onPerson)
    for (const type of PERSON_EVENTS) page.fire(type, false)
    expect(onPerson).not.toHaveBeenCalled()
  })

  it('never listens for scroll: anchors, restored positions and smooth scroll fire it unasked', () => {
    expect(PERSON_EVENTS).not.toContain('scroll')
    const page = target()
    const onPerson = vi.fn()
    watchForPerson(page, onPerson)
    page.fire('scroll', true)
    expect(onPerson).not.toHaveBeenCalled()
  })

  it('stops when told to, before anyone came', () => {
    const page = target()
    const onPerson = vi.fn()
    const stop = watchForPerson(page, onPerson)
    stop()
    page.fire('pointerdown', true)
    expect(onPerson).not.toHaveBeenCalled()
    expect(page.count()).toBe(0)
  })
})

describe('stepNoteBelow: at the top of a page the note moves, because the page cannot (2026-11-24)', () => {
  // The website at 375px: the two-row note under the bar, and a guide's label link beneath it.
  const note = { top: 68, bottom: 182, left: 8, right: 367 }
  const label = { top: 74, bottom: 119, left: 28, right: 136 }

  it('steps down to just under the element when the page is at its top', () => {
    expect(stepNoteBelow(note, label, 0, 700)).toBe(119 - 68 + 8)
    // Scrolled a little, but by less than the lift needs (182 - 74 + 8 = 116px).
    expect(stepNoteBelow(note, label, 100, 700)).toBe(119 - 68 + 8)
  })

  it('does not move when the page has room to scroll the element clear', () => {
    expect(stepNoteBelow(note, label, 116, 700)).toBe(0)
    expect(stepNoteBelow(note, label, 900, 700)).toBe(0)
  })

  it('does not move for an element that is not under the note', () => {
    expect(stepNoteBelow(note, { top: 200, bottom: 244, left: 28, right: 136 }, 0, 700)).toBe(0)
    expect(stepNoteBelow(note, { top: 74, bottom: 119, left: 380, right: 420 }, 0, 700)).toBe(0)
  })
})

describe('liftClearOfNote: a focused element is never left under the note (WCAG 2.4.11)', () => {
  // A note 60px tall under an 60px bar, centred in a 1280x800 window.
  const note = { top: 68, bottom: 128, left: 360, right: 920 }

  it('lifts an element hidden under the note clear of it, by the overlap and a gap', () => {
    const link = { top: 80, bottom: 110, left: 400, right: 500 }
    expect(liftClearOfNote(note, link, 800)).toBe(-(128 - 80 + 8))
  })

  it('lifts a partly covered element too', () => {
    const link = { top: 120, bottom: 164, left: 400, right: 500 }
    expect(liftClearOfNote(note, link, 800)).toBe(-(128 - 120 + 8))
  })

  it('leaves alone an element below, above or beside the note', () => {
    expect(liftClearOfNote(note, { top: 128, bottom: 172, left: 400, right: 500 }, 800)).toBe(0)
    expect(liftClearOfNote(note, { top: 10, bottom: 54, left: 400, right: 500 }, 800)).toBe(0)
    expect(liftClearOfNote(note, { top: 80, bottom: 110, left: 40, right: 300 }, 800)).toBe(0)
    expect(liftClearOfNote(note, { top: 80, bottom: 110, left: 940, right: 1200 }, 800)).toBe(0)
  })

  it('leaves alone an element taller than the room below the note (<main>, a whole section)', () => {
    // The cookie card's lesson (2026-10-01): <main> is focusable, and moving the page for it sent
    // every visit to the foot of the page.
    expect(liftClearOfNote(note, { top: 60, bottom: 4000, left: 0, right: 1280 }, 800)).toBe(0)
  })
})

describe('the fixed names', () => {
  it('uses the three event names the owner approved, valid for Google Analytics', () => {
    expect(LANGUAGE_NOTE_EVENTS).toEqual({
      shown: 'note_shown',
      used: 'note_used',
      closed: 'note_closed',
    })
    for (const name of Object.values(LANGUAGE_NOTE_EVENTS))
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it("counts only the bar's and the footer's language links as a choice", () => {
    expect(LANGUAGE_LINK_SELECTOR).toBe('.notch-shell a[hreflang], .site-footer a[hreflang]')
  })
})

describe('startLanguageNote: the wiring both apps share', () => {
  function page() {
    const listeners = new Map<string, Set<(event: Listened) => void>>()
    const side = {
      addEventListener: (type: string, listener: (event: Listened) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)?.add(listener)
      },
      removeEventListener: (type: string, listener: (event: Listened) => void) => {
        listeners.get(type)?.delete(listener)
      },
    }
    const fire = (type: string, target: unknown = null) => {
      for (const listener of [...(listeners.get(type) ?? [])]) {
        listener({ isTrusted: true, target })
      }
    }
    const count = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0)
    return { side, fire, count }
  }
  /** A clicked element inside (or outside) the bar's language link. */
  const element = (insideLanguageLink: boolean) => ({
    closest: (selector: string) =>
      selector === LANGUAGE_LINK_SELECTOR && insideLanguageLink ? {} : null,
  })

  function begin(over: { webdriver?: boolean; chosen?: boolean } = {}) {
    const storage = memoryStorage()
    if (over.chosen) rememberLanguageChoice(storage)
    const { side, fire, count } = page()
    const onPerson = vi.fn()
    const onChoice = vi.fn()
    const stop = startLanguageNote({
      webdriver: over.webdriver ?? false,
      storage: () => storage,
      win: side,
      doc: side,
      onPerson,
      onChoice,
    })
    return { storage, fire, count, onPerson, onChoice, stop }
  }

  it('tells the page when a person arrives, and stores nothing for being shown', () => {
    const run = begin()
    expect(run.onPerson).not.toHaveBeenCalled()
    run.fire('keydown')
    expect(run.onPerson).toHaveBeenCalledTimes(1)
    expect(run.storage.kept.size, 'showing the note is not a choice').toBe(0)
  })

  it('does nothing at all under automation: no listener, nothing stored', () => {
    const run = begin({ webdriver: true })
    expect(run.count()).toBe(0)
    run.fire('pointerdown')
    run.fire('click', element(true))
    expect(run.onPerson).not.toHaveBeenCalled()
    expect(run.storage.kept.size).toBe(0)
  })

  it('does nothing once a choice is stored', () => {
    const run = begin({ chosen: true })
    expect(run.count()).toBe(0)
    run.fire('pointerdown')
    expect(run.onPerson).not.toHaveBeenCalled()
  })

  it("counts a click on the bar's language link as the choice, and remembers it", () => {
    const run = begin()
    run.fire('click', element(true))
    expect(run.onChoice).toHaveBeenCalledTimes(1)
    expect(hasLanguageChoice(run.storage)).toBe(true)
  })

  it('does not count a click anywhere else', () => {
    const run = begin()
    run.fire('click', element(false))
    run.fire('click', null)
    expect(run.onChoice).not.toHaveBeenCalled()
    expect(run.storage.kept.size).toBe(0)
  })

  it('removes every listener when stopped', () => {
    const run = begin()
    expect(run.count()).toBeGreaterThan(0)
    run.stop()
    expect(run.count()).toBe(0)
  })
})
