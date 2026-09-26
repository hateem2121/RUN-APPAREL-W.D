---
name: 5th-grade-check
description: Test a Markdown document against the owner's 5th-grader standard — reading grade 5-6, short sentences, defined acronyms, a "What is this?" box and a picture per section — then explain the result in plain words.
argument-hint: "[file.md ...]"
disable-model-invocation: true
allowed-tools: Bash(node .claude/skills/5th-grade-check/fifth-grade-check.mjs:*)
---

# /5th-grade-check

The owner asked on 2026-09-26 that every human document here pass a 5th-grader test.
This skill applies it to the files named in `$ARGUMENTS` (default: `README.md`).

## 1. Count

Run the counting script. It is deterministic, so this month's number can be compared
with last month's:

```bash
node .claude/skills/5th-grade-check/fifth-grade-check.mjs $ARGUMENTS
```

It reports, per file: the Flesch-Kincaid grade (PASS at 6 or below), sentences over 20
words, passive-looking sentences, acronyms not explained at first use, whether a
"What is this?" box, a "Why it matters" part and a glossary exist, and which `##`
sections have no visual (a Mermaid diagram, table, image or code example). It skips code,
tables and headings when scoring, because those are the page's pictures, not its prose.

## 2. Judge what a script cannot

For each file, read it and decide:

- **Jargon.** Which words would stop a 10-year-old? The script only catches acronyms;
  words like "deploy", "repository" or "cache" need a plain meaning at first use too.
- **Pictures.** Does each diagram explain ONE idea a child could say back? A table of
  twelve columns is a visual only on paper.
- **Accuracy.** Simplifying must not make a sentence false. Check every rewritten claim
  against the code before suggesting it; if you cannot verify one, mark it
  `<!-- TODO: verify -->` rather than guessing.

## 3. Report

Give the owner one short table per file (grade, verdict, the three worst problems) and
then, for the worst sentences, a before → after rewrite. **Change nothing** unless the
owner says so: this skill reports, it does not edit.
