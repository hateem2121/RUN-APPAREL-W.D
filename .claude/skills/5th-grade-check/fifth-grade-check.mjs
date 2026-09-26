#!/usr/bin/env node
/**
 * The 5th-grader test for a Markdown document — the counting half of `/5th-grade-check`.
 *
 * WHY A SCRIPT. The owner asked (2026-09-26) for every human document to pass a
 * 5th-grader test: Flesch-Kincaid grade 5-6, sentences under 20 words, every acronym
 * defined on first use, a "What is this?" box, a "Why it matters" part, and a picture per
 * major section. A model judging that by eye gives a different answer each month; a
 * script gives the same one, so the monthly run shows real change. The judging half —
 * "is this word jargon?", "would a child follow this diagram?" — stays with Claude, in
 * SKILL.md.
 *
 * WHAT IT COUNTS AS PROSE. Paragraphs, list items (each item is one sentence, full stop
 * or not) and blockquotes. NOT counted: fenced code, tables, headings, HTML comments,
 * front matter and link URLs — code and tables are the "pictures" of a technical page, and
 * scoring them as sentences would punish exactly what the test asks for.
 *
 * Usage: node .claude/skills/5th-grade-check/fifth-grade-check.mjs <file.md> [...] [--json]
 * Exits 1 when any file FAILS the grade, so a sweep can gate on it.
 */

import { readFileSync, realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const LIMITS = {
  /** The owner's target band is grade 5-6; above 6 is a FAIL, not a warning. */
  maxGrade: 6,
  maxSentenceWords: 20,
}

/** English syllable estimate. Good to about ±1 per long word, which is what FK assumes. */
export function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length === 0) return 0
  if (w.length <= 3) return 1
  // Drop a SILENT ending only: "-ed" after t/d is spoken ("created"), and so is "-es"
  // after s/x/z/h ("boxes"); a final "-le" is spoken too ("table").
  w = w
    .replace(/([^aeiouytd])ed$/, '$1')
    .replace(/([^aeiouysxzh])es$/, '$1')
    .replace(/([^aeiouyl])e$/, '$1')
    .replace(/^y/, '')
  const groups = w.match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

/** Split a Markdown document into its prose sentences and its structural facts. */
export function analyse(markdown) {
  const lines = markdown
    .replace(/^---\n[\s\S]*?\n---\n/, '') // front matter
    .replace(/<!--[\s\S]*?-->/g, '') // HTML comments (stripped for readers too)
    .split('\n')

  const sentences = []
  const sections = [] // one per ## heading: { title, hasVisual }
  const headings = []
  let inFence = false
  let fenceIsMermaid = false
  let paragraph = []
  let mermaidCount = 0
  let tableCount = 0
  let imageCount = 0
  let lastWasTable = false

  const flush = () => {
    if (paragraph.length === 0) return
    const text = paragraph.join(' ')
    paragraph = []
    for (const piece of splitSentences(text)) sentences.push(piece)
  }
  const markVisual = () => {
    const current = sections.at(-1)
    if (current) current.hasVisual = true
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const fence = line.match(/^\s*(```|~~~)\s*([\w-]*)/)
    if (fence) {
      if (!inFence) {
        flush()
        inFence = true
        fenceIsMermaid = fence[2] === 'mermaid'
        if (fenceIsMermaid) mermaidCount++
        markVisual() // any code block is a concrete example; a mermaid one is a diagram
      } else {
        inFence = false
      }
      continue
    }
    if (inFence) continue

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flush()
      headings.push({ level: heading[1].length, title: heading[2].trim() })
      if (heading[1].length === 2) sections.push({ title: heading[2].trim(), hasVisual: false })
      continue
    }
    if (/^\s*\|/.test(line)) {
      flush()
      if (!lastWasTable) tableCount++
      lastWasTable = true
      markVisual()
      continue
    }
    lastWasTable = false
    if (/!\[[^\]]*\]\([^)]+\)|<img\s/i.test(line)) {
      imageCount++
      markVisual()
    }
    if (line.trim() === '') {
      flush()
      continue
    }
    const item = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/)
    if (item) {
      flush()
      paragraph.push(item[1])
      flush() // a list item is its own sentence
      continue
    }
    paragraph.push(line.replace(/^\s*>\s?/, ''))
  }
  flush()

  return { sentences, sections, headings, mermaidCount, tableCount, imageCount }
}

/** Plain words from one prose sentence: link text kept, URLs and inline code reduced. */
export function wordsOf(sentence) {
  return sentence
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`[^`]*`/g, ' code ') // a file name or command reads as one short word
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/[*_~]/g, '')
    .split(/[\s/—–]+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => /\p{L}/u.test(w))
}

function splitSentences(text) {
  const protectedText = text.replace(/\b(e\.g|i\.e|etc|vs|approx)\./gi, '$1')
  // An emoji can open a sentence too: the picture-first pages lead lines with one
  // (2026-09-26), and without it five short lines in the code-of-conduct box were
  // read as ONE 41-word sentence.
  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(*`[]|\p{Extended_Pictographic})/u)
    .map((s) => s.trim())
    .filter((s) => wordsOf(s).length > 0)
}

/** Acronyms (2+ capitals) whose FIRST use is not beside a bracketed explanation. */
export function undefinedAcronyms(sentences) {
  const seen = new Map()
  for (const sentence of sentences) {
    const plain = sentence.replace(/`[^`]*`/g, ' ').replace(/\([^)]*https?:[^)]*\)/g, ' ')
    for (const match of plain.matchAll(/\b([A-Z][A-Z0-9]{1,}s?)\b/g)) {
      const acronym = match[1].replace(/s$/, '')
      if (seen.has(acronym)) continue
      const after = plain.slice(match.index + match[0].length, match.index + match[0].length + 3)
      const before = plain.slice(Math.max(0, match.index - 1), match.index)
      const defined =
        /^\s*\(/.test(after) || before === '(' || /\bmeans\b|\bstands for\b/i.test(plain)
      seen.set(acronym, defined)
    }
  }
  return [...seen].filter(([, defined]) => !defined).map(([acronym]) => acronym)
}

export function score(markdown) {
  const doc = analyse(markdown)
  const perSentence = doc.sentences.map((s) => {
    const words = wordsOf(s)
    return { text: s, words: words.length, syllables: words.reduce((n, w) => n + syllables(w), 0) }
  })
  const wordCount = perSentence.reduce((n, s) => n + s.words, 0)
  const syllableCount = perSentence.reduce((n, s) => n + s.syllables, 0)
  const sentenceCount = perSentence.length
  const grade =
    sentenceCount === 0 || wordCount === 0
      ? null
      : 0.39 * (wordCount / sentenceCount) + 11.8 * (syllableCount / wordCount) - 15.59
  const top = markdown.split('\n').slice(0, 30).join('\n')
  const passive = doc.sentences.filter((s) =>
    /\b(?:is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?\w+(?:ed|en)\b/i.test(s),
  )
  return {
    grade: grade === null ? null : Math.round(grade * 10) / 10,
    sentences: sentenceCount,
    words: wordCount,
    longSentences: perSentence
      .filter((s) => s.words > LIMITS.maxSentenceWords)
      .map((s) => ({ words: s.words, text: s.text.slice(0, 140) })),
    passiveSentences: passive.length,
    undefinedAcronyms: undefinedAcronyms(doc.sentences),
    hasWhatIsThis: /what is this\??/i.test(top),
    hasWhyItMatters: /why it matters/i.test(markdown),
    hasGlossary: doc.headings.some((h) => /glossary|plain words|words to know/i.test(h.title)),
    sectionsWithoutVisual: doc.sections.filter((s) => !s.hasVisual).map((s) => s.title),
    visuals: { mermaid: doc.mermaidCount, tables: doc.tableCount, images: doc.imageCount },
  }
}

export function verdict(result) {
  if (result.grade === null) return 'NO PROSE'
  return result.grade <= LIMITS.maxGrade ? 'PASS' : 'FAIL'
}

function report(file, result) {
  const v = verdict(result)
  const lines = [
    `${file}`,
    `  grade ${result.grade ?? '—'} (target 5-6, max ${LIMITS.maxGrade}) → ${v}   ${result.sentences} sentences, ${result.words} words`,
    `  sentences over ${LIMITS.maxSentenceWords} words: ${result.longSentences.length}   passive-looking: ${result.passiveSentences}`,
    `  "What is this?" near the top: ${result.hasWhatIsThis ? 'yes' : 'NO'}   "Why it matters": ${result.hasWhyItMatters ? 'yes' : 'NO'}   glossary: ${result.hasGlossary ? 'yes' : 'NO'}`,
    `  visuals: ${result.visuals.mermaid} diagrams, ${result.visuals.tables} tables, ${result.visuals.images} images`,
  ]
  if (result.sectionsWithoutVisual.length > 0)
    lines.push(`  sections with no visual: ${result.sectionsWithoutVisual.join(' | ')}`)
  if (result.undefinedAcronyms.length > 0)
    lines.push(`  acronyms not defined at first use: ${result.undefinedAcronyms.join(', ')}`)
  for (const s of result.longSentences.slice(0, 8)) lines.push(`    [${s.words}w] ${s.text}`)
  if (result.longSentences.length > 8)
    lines.push(`    … and ${result.longSentences.length - 8} more`)
  return lines.join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const files = args.filter((a) => a !== '--json')
  if (files.length === 0) {
    console.error('usage: fifth-grade-check.mjs <file.md> [...] [--json]')
    process.exit(2)
  }
  const results = files.map((file) => ({ file, ...score(readFileSync(file, 'utf8')) }))
  if (json) console.log(JSON.stringify(results, null, 2))
  else console.log(results.map((r) => report(r.file, r)).join('\n\n'))
  process.exit(results.some((r) => verdict(r) === 'FAIL') ? 1 : 0)
}
