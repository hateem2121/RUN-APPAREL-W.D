import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findVisualProblems, mermaidBlocks } from '../scripts/check-doc-visuals.mjs'

/**
 * The owner asked (2026-09-26) that every human page carry pictures for 5th-grade
 * readers. These pin the checker that keeps those pictures honest: described for a
 * screen reader, and pointing at a file that exists.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const yes = () => true

describe('findVisualProblems', () => {
  it('flags a Markdown image with empty alt text', () => {
    expect(findVisualProblems('![](docs/images/a.png)', 'x.md', yes)).toHaveLength(1)
  })
  it('flags generic alt text a screen reader would read as noise', () => {
    expect(findVisualProblems('![image](a.png)', 'x.md', yes)).toHaveLength(1)
    expect(findVisualProblems('![screenshot](a.png)', 'x.md', yes)).toHaveLength(1)
  })
  it('accepts a described image', () => {
    expect(
      findVisualProblems('![A phone showing the wine shirt in 3D](a.png)', 'x.md', yes),
    ).toEqual([])
  })
  it('flags an <img> with no alt attribute', () => {
    expect(findVisualProblems('<img src="a.png" width="300">', 'x.md', yes)).toHaveLength(1)
  })
  it('flags a local picture that does not exist', () => {
    expect(
      findVisualProblems('![A real description](missing.png)', 'x.md', () => false),
    ).toHaveLength(1)
  })
  it('does not check remote pictures for existence', () => {
    expect(
      findVisualProblems('![CI status badge](https://img.shields.io/x.svg)', 'x.md', () => false),
    ).toEqual([])
  })
  it('ignores images inside code fences', () => {
    expect(findVisualProblems('```md\n![](a.png)\n```', 'x.md', yes)).toEqual([])
  })
  it('ignores an <img> written as inline code, which is prose about a tag', () => {
    // docs/SESSION-2026-08-05.md: "the `<img>` is a grid item" — found by the first run.
    expect(findVisualProblems('the `<img>` is a grid item', 'x.md', yes)).toEqual([])
    expect(findVisualProblems('write `![](a.png)` like this', 'x.md', yes)).toEqual([])
  })
})

describe('mermaidBlocks', () => {
  it('finds each mermaid fence with its line number', () => {
    const blocks = mermaidBlocks('# t\n\n```mermaid\nflowchart TB\n  A-->B\n```\n')
    expect(blocks).toEqual([{ line: 3, code: 'flowchart TB\n  A-->B' }])
  })
})

describe('every tracked Markdown file', () => {
  it('describes every picture and points only at pictures that exist', () => {
    const files = execFileSync('git', ['ls-files', '*.md'], { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && !f.startsWith('docs/archive/') && !f.includes('node_modules/'))
    const problems = files.flatMap((f) =>
      findVisualProblems(readFileSync(join(REPO_ROOT, f), 'utf8'), join(REPO_ROOT, f)),
    )
    expect(problems).toEqual([])
  })
})
