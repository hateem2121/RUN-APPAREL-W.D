#!/usr/bin/env node
/**
 * THE RUSSIAN SECTION'S OUTSIDE CHECK (2026-11-15): every Russian string the site ships, read by
 * two checkers that are not its author.
 *
 * - Yandex Speller (https://yandex.ru/dev/speller/), Yandex's own free spelling service: the search
 *   engine the Russian section exists for, judging its Russian.
 * - LanguageTool (https://languagetool.org/http-api/), open-source grammar and style rules for
 *   ru-RU, through its free public API.
 *
 * Strings are pulled from the source by the Babel parser (string literals and template parts that
 * hold a Cyrillic letter), so nothing is imported or run. A flag listed in
 * `scripts/russian-text-allowlist.json` with its reason (a brand, a product code, a quoted English
 * legal phrase) passes; any other flag fails the run.
 *
 * ⚠️ NETWORK: it sends the site's PUBLIC Russian words to both services, nothing else. It is a local
 * check, not a CI step. Free limits respected: Speller ≤ 10,000 characters a request; LanguageTool
 * ≤ 18 KB a request and a pause between requests (20 a minute, 75 KB a minute).
 *
 * Usage: node scripts/check-russian-text.mjs [--speller-only] [--grammar-only] [--files a,b]
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const CYRILLIC = /[Ѐ-ӿ]/

/**
 * Every source file under apps/cms/src and packages/shared/src that holds Russian: the `*.ru*.ts` words files, the i18n
 * tables, the Russian routes, AND the components that write a Russian line beside its English one
 * (a headline pair, a label). Chosen by content since 2026-11-15, so a Russian line written in a
 * component is checked as surely as one in a words file.
 */
export function russianFiles(root = ROOT) {
  const out = []
  // The listing says what each entry is (withFileTypes), so nothing is checked and then read
  // separately: CodeQL's file-system race alert on a statSync before the read (PR #398).
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(path)
      } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        if (CYRILLIC.test(readFileSync(path, 'utf8'))) out.push(path)
      }
    }
  }
  walk(join(root, 'apps/cms/src'))
  // The site's own words and the garment pages' spec notes moved to packages/shared on 2026-11-16
  // (`siteChrome.ts`, `specNotes.ru.ts`), where the viewer can read them too: checked the same way.
  walk(join(root, 'packages/shared/src'))
  return out
}

/**
 * Every Cyrillic string in a source file, with its line. Pure: no network, nothing imported or run.
 * A small scanner rather than a parser (no parser is a dependency of the website app): it skips
 * comments, reads '…', "…" and `…` literals (a template's ${…} is code, skipped with its braces),
 * and treats the rest as code, where Cyrillic can only be JSX text between > and <.
 */
export function cyrillicStrings(source) {
  const found = []
  let line = 1
  let code = ''
  const add = (text, at) => {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (CYRILLIC.test(clean)) found.push({ text: clean, line: at })
  }
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    const next = source[i + 1]
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++
      line++
      code += '\n'
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line++
        i++
      }
      i++
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const at = line
      let text = ''
      i++
      while (i < source.length && source[i] !== c) {
        if (source[i] === '\\') {
          text += source[i + 1] === 'n' ? ' ' : (source[i + 1] ?? '')
          i += 2
          continue
        }
        if (c === '`' && source[i] === '$' && source[i + 1] === '{') {
          add(text, at)
          text = ''
          let depth = 0
          for (; i < source.length; i++) {
            if (source[i] === '{') depth++
            else if (source[i] === '}' && --depth === 0) break
            else if (source[i] === '\n') line++
          }
          i++
          continue
        }
        if (source[i] === '\n') line++
        text += source[i]
        i++
      }
      // A link `phrase` is a copy of words in its block's text, which is checked whole. Alone,
      // Speller misreads it (measured 2026-11-15: «руководстве по заказу» flagged, the same words
      // in their sentence clean), so it is skipped rather than allowlisted.
      if (!/phrase\s*:\s*$/.test(code.slice(-24))) add(text, at)
      code += ' "" '
      continue
    }
    if (c === '\n') line++
    code += c
  }
  let codeLine = 1
  for (const piece of code.split(/(\n)/)) {
    if (piece === '\n') {
      codeLine++
      continue
    }
    for (const match of piece.matchAll(/>([^<>{}]*[\u0400-\u04FF][^<>{}]*)</g))
      add(match[1] ?? '', codeLine)
  }
  return found
}

/** Group strings into requests no longer than `limit` characters, one string per line. */
export function batches(items, limit) {
  const out = []
  let current = []
  let size = 0
  for (const item of items) {
    if (size + item.text.length + 1 > limit && current.length) {
      out.push(current)
      current = []
      size = 0
    }
    current.push(item)
    size += item.text.length + 1
  }
  if (current.length) out.push(current)
  return out
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function speller(items) {
  const flags = []
  for (const group of batches(items, 9000)) {
    const body = new URLSearchParams({ lang: 'ru', options: '14' })
    for (const item of group) body.append('text', item.text)
    const res = await fetch('https://speller.yandex.net/services/spellservice.json/checkTexts', {
      method: 'POST',
      body,
    })
    if (!res.ok) throw new Error(`Yandex Speller answered ${res.status}`)
    const answers = await res.json()
    answers.forEach((errors, i) => {
      for (const error of errors)
        flags.push({
          ...group[i],
          tool: 'speller',
          word: error.word,
          hint: `code ${error.code}: ${(error.s ?? []).slice(0, 3).join(', ')}`,
        })
    })
  }
  return flags
}

async function grammar(items) {
  const flags = []
  // Each string is its own paragraph (a blank line between). Joined by one newline, LanguageTool
  // read two unrelated strings as one: a label with no full stop, then the next string's capital,
  // came back as «пропущена точка» (61 of 749 flags, measured 2026-11-15), and 76 flags matched
  // across two strings, such as «Главная» twice as a repeated word.
  const GAP = '\n\n'
  const groups = batches(items, 18000)
  for (const [n, group] of groups.entries()) {
    const text = group.map((item) => item.text).join(GAP)
    const res = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      // UPPERCASE_SENTENCE_START is off: the scanner cuts a template at each ${…}, so a piece such as
      // «в 3D» or a plural form («вопроса») starts mid-sentence by design (117 such flags, 2026-11-15).
      body: new URLSearchParams({
        text,
        language: 'ru-RU',
        level: 'default',
        disabledRules: 'UPPERCASE_SENTENCE_START',
      }),
    })
    if (res.status === 429) {
      await pause(65000)
      groups.splice(n + 1, 0, group)
      continue
    }
    if (!res.ok) throw new Error(`LanguageTool answered ${res.status}`)
    const { matches } = await res.json()
    const starts = []
    let at = 0
    for (const item of group) {
      starts.push(at)
      at += item.text.length + GAP.length
    }
    for (const match of matches) {
      let i = starts.length - 1
      while (i > 0 && starts[i] > match.offset) i--
      const item = group[i]
      flags.push({
        ...item,
        tool: 'grammar',
        word: text.slice(match.offset, match.offset + match.length),
        hint: `${match.rule.id}: ${match.message}`,
      })
    }
    if (n < groups.length - 1) await pause(4000)
  }
  return flags
}

async function main() {
  const args = process.argv.slice(2)
  const only = args
    .find((arg) => arg.startsWith('--files='))
    ?.slice(8)
    .split(',')
  const files = russianFiles().filter((file) => !only || only.some((part) => file.includes(part)))
  const items = files.flatMap((file) =>
    cyrillicStrings(readFileSync(file, 'utf8')).map((item) => ({
      ...item,
      file: relative(ROOT, file),
    })),
  )
  const chars = items.reduce((sum, item) => sum + item.text.length, 0)
  console.log(`${files.length} files, ${items.length} Russian strings, ${chars} characters`)
  const allow = JSON.parse(readFileSync(join(ROOT, 'scripts/russian-text-allowlist.json'), 'utf8'))
  const allowed = (flag) =>
    allow.some((entry) => entry.tool === flag.tool && entry.word === flag.word)
  const flags = [
    ...(args.includes('--grammar-only') ? [] : await speller(items)),
    ...(args.includes('--speller-only') ? [] : await grammar(items)),
  ]
  const open = flags.filter((flag) => !allowed(flag))
  for (const flag of open)
    console.log(`${flag.tool}\t${flag.file}:${flag.line}\t«${flag.word}»\t${flag.hint}`)
  console.log(
    `speller ${flags.filter((f) => f.tool === 'speller').length} flags, grammar ${flags.filter((f) => f.tool === 'grammar').length} flags; ${flags.length - open.length} allowlisted; ${open.length} open`,
  )
  process.exitCode = open.length ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main()
