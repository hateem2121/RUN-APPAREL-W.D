# Agent skills

**`check-live/`, `deploy-preflight/` and `gates/` are ours** — written here, not
vendored, so nothing below about SHAs or the review date applies to them (the first
and last were added 2026-08-26). Everything else in this directory is third-party and
pinned; keep first-party skills clearly separated from vendored ones so the review
below stays a review of *other people's* instructions. `scripts/quoted-settings.mjs`
keeps the same list as `FIRST_PARTY_SKILLS`. A test fails on any skill here, copied or
linked, that is in none of that list, the table below and `skills-lock.json`.

## Vendored agent skills

Third-party skills, **present as real files and pinned to a commit** — never left as
a symlink an installer can re-resolve. Some were copied by hand, some placed by an
installer run with flags that produce the same result; see the note below the four
points for which, and why that distinction is smaller than it looks.

## Why vendored instead of `npx skills add`

1. **Reviewable.** They arrive in a pull-request diff like any other change. A skill
   is injected into an agent's context and shapes what it does, so it deserves at
   least as much review as code.
2. **Pinned.** An installer re-resolves to whatever upstream is today. These are
   fixed at the SHAs below and move only when someone changes them here.
3. **Scoped to this project.** `npx impeccable install` and friends write into 15+
   agent directories (`.cursor`, `.codex`, `.gemini`, `.trae`, …). Nothing here
   needs that.
4. **It does not recreate the mess we just cleaned up.** On 2026-08-06 an audit
   found 57 user-level skills in `~/.claude/skills`, **all 57 disabled**, 432 MB on
   disk. Global installs accumulate and go stale silently; a vendored copy in the
   repo is visible to everyone and dies with the branch if it turns out to be
   useless.

⚠️ **The 2026-08-13 rows below WERE added with `npx skills add`, and that is not a
reversal of the four points — it is the flags.** `--agent claude-code --copy`
installs project-scoped, for one agent, as real files rather than symlinks, which
satisfies 1, 3 and 4 directly. Measured after the run: `~/.claude/skills` still held
**0 entries**, and no `.cursor` / `.codex` / `.gemini` / `.amp` / `.opencode`
directory was created. Point 2 is the one the installer does **not** give you — see
"What the lockfile does not pin" below. Use these flags or vendor by hand; a bare
`npx skills add` is still the thing this section is against.

⚠️ **Eight entries ARE symlinks as of `fc16d6e` (2026-08-15), which the paragraph
above says never happens.** `npx skills add emilkowalski/skill` — run without
`--copy` — writes to `.agents/skills/`, its universal location shared with the other
harnesses on this checkout, and points `.claude/skills/` at it. They are tracked and
pinned by `skills-lock.json`, so points 1, 2 and 4 still hold; only "real files"
does not. The same run tried to replace `emil-design-eng` and `review-animations`
with symlinks and was reverted from git, so **re-running the installer can silently
overwrite a tracked skill — check `git status` after.** The eight: `animate`,
`animation-vocabulary`, `apple-design`, `ask-sonner`,
`find-animation-opportunities`, `improve-animations`, `pick-ui-library`,
`prototype`. Two of them (`pick-ui-library`, `prototype`) are
`disable-model-invocation: true`, so they never appear in a session's skill listing
— see the root `CLAUDE.md` entry on decisions that hide there.

The Motion kit was vendored by hand, because `npx motion-ai` **refuses to run
outside a real terminal** ("motion-ai is interactive — run it in a terminal", exit
0, nothing written). Verified in a throwaway git repo before it was pointed at this
one — an interactive installer whose first prompt is *project or global* is exactly
the keystroke point 4 is about.

## What is here

| Skill | Source | Licence |
|---|---|---|
| `performance-optimization` | `addyosmani/agent-skills` @ `f03b4a84b08b` | MIT |
| `observability-and-instrumentation` | `addyosmani/agent-skills` @ `f03b4a84b08b` | MIT |
| `emil-design-eng` | `emilkowalski/skills` @ `de33dbed0002` | MIT |
| `review-animations` | `emilkowalski/skills` @ `de33dbed0002` | MIT |
| `vercel-react-best-practices` | `vercel-labs/agent-skills` @ `b8caa260a420` | MIT |
| `vercel-composition-patterns` | `vercel-labs/agent-skills` @ `b8caa260a420` | MIT |
| `vercel-react-view-transitions` | `vercel-labs/agent-skills` @ `b8caa260a420` | MIT |
| `web-design-guidelines` | `vercel-labs/agent-skills` @ `b8caa260a420` | **unstated** — local only since 2026-09-10 |
| `writing-guidelines` | `vercel-labs/agent-skills` @ `b8caa260a420` | **unstated** — local only since 2026-09-10 |
| `motion` | `motiondivision/ai-kit` @ `1140efe9ad5e` | **unstated** — local only since 2026-09-10 |

⚠️ **THE THREE "UNSTATED" ROWS ARE NOT IN THE PUBLIC REPOSITORY — since 2026-09-10.**
The repository went public on 2026-09-09, and a file with no licence carries no
permission to republish it. They were taken out of git and out of its history and are
gitignored, so a session on the owner's machine still loads them while nobody else
receives a copy. A fresh clone does not have them: re-fetch at the pinned SHA if you need
them elsewhere. The licensed rows' notices are in `THIRD-PARTY-NOTICES.md`.

First four fetched 2026-08-06, from two upstreams active that week (82.2k ⭐ and
26.0k ⭐, last pushed 2026-08-05). The last six fetched **2026-08-13**;
`vercel-labs/agent-skills` was last pushed 2026-08-12 and `motiondivision/ai-kit`
2026-07-28, so the Motion pin is the oldest here by two weeks — expected for a kit
that tracks a hosted server rather than shipping the logic.

**"Unstated" is measured, not lazy.** The first three Vercel rows declare
`license: MIT` in their own frontmatter; the last two do not, and
`vercel-labs/agent-skills` has **no LICENSE file at its root** (GitHub's licence API
returns 404). `motiondivision/ai-kit` likewise ships no LICENSE, though its `motion-ai`
npm package declares MIT — a different artifact, so it is not evidence about these
files. Do not write "MIT" into those rows without a source that says so.

## What the lockfile does not pin

`skills-lock.json` at the repo root is written by the installer and records a
**SHA-256 of each `SKILL.md`'s content** — not the upstream commit. Those answer
different questions: a content hash detects drift after the fact; a commit SHA says
which version you took. The table above carries the commit, which is why both exist.

⚠️ **Two rows cannot be pinned at all, by construction.**
`web-design-guidelines` and `writing-guidelines` are 4 KB each because they do not
contain their rules — they contain a pointer to them:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
https://raw.githubusercontent.com/vercel-labs/writing-guidelines/main/command.md
```

Both instruct the agent to *"fetch fresh guidelines before each review"* from `main`.
So the hash pins forty lines that say "go and fetch the real rules", and the 100+
rules actually applied to your code are whatever Vercel published this morning. That
is point 2 of this file not holding for those two rows. They earn their place anyway
— the alternative is no interface-guidelines review at all — but they are the rows
the review date has a concrete reason to reconsider, and the ones to suspect first if
a review starts giving advice nobody recognises.

## When two skills disagree

Four pairs here overlap. Each ruling exists because the alternative is an agent
picking whichever it read most recently.

- **Animation advice.** `review-animations` (Emil Kowalski) and the `motion` skill's
  `best-practices/` both opine on the same code. **On mechanics they agree**, which
  is worth knowing before you go looking for a conflict: both prefer `transform` over
  Motion's `x`/`y`/`scale` shorthands, both want interruptible motion to use springs
  that retarget from the current state, both want GPU-composited properties. Where
  they part is **taste about duration**: Emil sets a hard *"sub-300ms on UI, or it is
  a finding"*, while Motion's index says a softer brief *"can use softer curves and
  slightly longer durations."* **`docs/DESIGN.md` wins** — the same ruling this file
  already made for `emil-design-eng`: an **advisor, not a gate**. Motion's kit also
  ships a MotionScore reviewer agent that was deliberately **not** installed; see
  below.
- **View transitions vs Motion.** `vercel-react-view-transitions` teaches the
  browser's native `startViewTransition`. This repo already ships **`motion` 13.1.0**
  (`apps/viewer/src/polish/Cursor.tsx`). Prefer the installed library for component
  motion; reach for view transitions only for cross-page navigation, and **do not add
  a second animation system for a job Motion already does** — the bundle budget in
  `scripts/check-bundle-budget.mjs` is measured, and a duplicate runtime spends it for
  nothing.
- **Writing style.** `writing-guidelines` encodes Vercel's handbook. **The root
  `CLAUDE.md` wins.** Its house style — comments that explain *why*, citing the
  incident; "prefer stating a measurement over an adjective" — is load-bearing here,
  and several traps in that file are only discoverable from those comments. A
  handbook that optimises for brevity would delete exactly the sentences that keep
  costing sessions. Invoke this skill deliberately; never let it gate a doc change.
- **Vercel-platform advice.** `vercel-react-best-practices` is 416 KB of React rules
  with ISR, Edge Config, Fluid Compute and `vercel deploy` woven through. **A repo-wide
  grep for `vercel` returns zero hits** — this is Cloudflare Workers + D1 + R2. Take
  the React rules, ignore the platform ones. The four Vercel *deployment* skills
  (`deploy-to-vercel`, `vercel-cli-with-tokens`, `vercel-optimize`) and
  `vercel-react-native-skills` were deliberately **not** installed for this reason;
  see the `browser-testing-with-devtools` note below for why that matters more than
  it looks.

## The Motion MCP server

`.mcp.json` gained one entry, `Motion` → `https://mcp.motion.dev`. This is a
**change of posture, not a formality**: the offline half of the skill
(`best-practices/`) needs no server, but documentation and example search send the
query off this machine. Nothing else does — no code is uploaded unless a MotionScore
audit runs, and audits are Motion+ only.

**Upstream's `mcp.json` declares two servers; only the free one was taken.** The
second, `Motion+` → `https://mcp.motion.dev/plus`, needs a **£299 one-time
membership**. An MCP server that cannot authenticate is not inert — it prints a
"requires authentication" banner into every session, as the `cloudflare` entry
already does. If a membership is ever bought, add it beside `Motion` in the same
shape and nothing else changes.

Also dropped from upstream: `rules/motion.mdc` (Cursor's rules format — nothing
reads `.mdc` here), `.cursor-plugin/`, and `assets/` (three images).

## Not installed: `motion-reviewer`

The kit ships an agent, `agents/motion-reviewer.md`, that audits a directory and
assigns every animation a MotionScore tier. It was copied in on 2026-08-13 and
**removed the same hour, before it was ever committed** — which is the
`browser-testing-with-devtools` lesson applied *early* rather than after the fact.

It cannot work here, by its own instructions. It is told to fetch its grading
methodology from `motion://skills/performance-audit` on the **Motion+** MCP server
and, *"if the read is refused, return the skill's refusal guidance as your whole
report rather than improvising grades."* The audit file it depends on is blunter
still: *"Signed in without Motion+: MotionScore audits are a Motion+ capability. Say
so plainly… Do not improvise a MotionScore grade from general knowledge."* Without
the £299 membership there is no fallback path — the agent's only reachable output is
a message telling you to buy one.

This is not a criticism of the agent; it is honest about its own dependency, which
is how the problem was caught before committing rather than after. **The rest of the
`motion` skill is unaffected** — `best-practices/` needs no server at all, and
search and CSS spring generation run on the free `Motion` server.

To restore it if a membership is ever bought, add the `Motion+` server to
`.mcp.json` and copy the one file back at the pinned SHA:

```bash
curl -sL https://raw.githubusercontent.com/motiondivision/ai-kit/1140efe9ad5e03c689ea6bb19d9d3850a4dae5f7/plugins/motion/agents/motion-reviewer.md -o .claude/agents/motion-reviewer.md
```

Then delete the "Animation review" ruling's premise above and re-read it — with two
*working* reviewers, `docs/DESIGN.md` breaking ties starts to matter.

## Why these, and not the rest

Most of what these repos offer duplicates something already here:
`/code-review` and the `code-reviewer` agent, `/simplify`, `/commit`, and the
built-in planning and debugging skills. Each row below maps to a gap that was
actually measured.

From the 2026-08-06 audit:

- **`performance-optimization`** — the viewer ships a **multi-megabyte GLB to a
  phone over mobile data**, and the only performance gate is a Lighthouse assertion
  that *warns* at `minScore 0.5` and blocks nothing. (The audit said 27 MB; measured
  2026-09-05 the eleven live models are **1.9-8.2 MB**, 53.69 MB in total. The
  finding stands — the gate still blocks nothing — but the number does not.)
- **`observability-and-instrumentation`** — Sentry and a diagnostics digest exist,
  but no written practice for using them.
- **`emil-design-eng` / `review-animations`** — the viewer imports `motion` and
  `lenis` and has a hand-built token system; animation is real code here. Treat
  these as an **advisor, not a gate**: they encode one person's taste, and where
  they disagree with `docs/DESIGN.md`, DESIGN.md wins.

Added 2026-08-13 — 5 of the 9 skills in `vercel-labs/agent-skills`, plus Motion:

- **`vercel-react-best-practices` / `vercel-composition-patterns`** — `apps/viewer`
  is React 19.2.8 and `apps/cms` is Next 16.3.0. These apply to code that exists.
- **`web-design-guidelines`** — overlaps the `accesslint` plugin, which audits a
  rendered page against WCAG. This reviews *source* against a broader interface
  checklist, so the two see different things. Kept for that reason; drop it if it
  starts repeating accesslint.
- **`vercel-react-view-transitions` / `writing-guidelines`** — both borderline, both
  taken deliberately, both with a ruling above that says when to ignore them.
- **`motion`** — the strongest fit of the set: `motion` 13.1.0 is already a shipped
  dependency, and its offline `best-practices/` half needs no server or account.

## Removed: `browser-testing-with-devtools`

Vendored 2026-08-06, **dropped the same day**. Its own frontmatter says it
*"requires the chrome-devtools MCP server to be configured"*, and this setup does
not have that server — it has the in-app Browser pane and Claude-in-Chrome. It was
kept for a few hours "for the method", with the mismatch written down.

That was the wrong call, and the reason is the same one the rest of this repo keeps
learning: **a skill is an instruction, not a document.** It is injected into the
agent's context and tells it to call tools by name. Naming tools that do not exist
does not degrade to "use the equivalent" — it spends context teaching a vocabulary
that cannot be spoken here, and the most likely outcome is an agent reporting that
it cannot verify something it had a perfectly good way to verify.

The method itself (check console, network and DOM before declaring a fix works) is
already the house style — see the verification workflow the Browser pane tools
carry, and `docs/QA-CHECKLIST.md`. Nothing was lost by removing the file.

If a `chrome-devtools` MCP server is ever configured here, re-vendor it at a fresh
SHA rather than resurrecting this note.

## Scanned before committing

Checked for network/exfil calls, credential access, and instruction-override
patterns. The only matches were the skills instructing the agent *not* to do those
things — e.g. `emil-design-eng` telling it not to invent design tokens, which is
the right default.

Repeated 2026-08-13 on all six new skills, on the same three axes, plus a check for
executable files. Results, stated rather than summarised:

- **Credential access: none.** No `process.env`, `~/.ssh`, `AWS_`, `*_TOKEN`,
  `*_SECRET`, `API_KEY`, `.env`, `localStorage` or `document.cookie` in any file.
- **Instruction-override: none.** No "ignore previous instructions", no
  "disregard", no "do not tell the user".
- **Executables: none.** Everything is `.md` or `.json`. The one non-markdown file
  in the Motion kit was `rules/motion.mdc`, which was dropped.
- **Endpoints: all first-party or documentation.** Motion's kit reaches only
  `motion.dev` hosts (plus the W3C SVG namespace in a logo). The Vercel skills cite
  MDN, react.dev and Vercel blog posts as prose references — with the **two live
  rule fetches** noted above, which are the only URLs any of these skills instruct
  an agent to actually retrieve.

The installer runs a scan of its own and reported "Safe, 0 alerts" for all five
Vercel skills. That is corroboration, not the check — it is the vendor grading its
own homework, and the four bullets above were run independently.

## Updating

Re-fetch at a new SHA and update the table in the same commit. Do not edit the
vendored files in place — a local edit that upstream does not have is
indistinguishable from drift.

**Review by 2026-11-13 (three months).** Not a rule about staleness — pinned files
do not rot — but about *relevance*: point 4 above describes 57 skills that nobody
ever decided to remove, and the only thing that stops this table becoming that is
a date on which someone has to justify each row again. Either bump the SHAs and
move this date, or delete the rows that no longer earn their place.

Moved from 2026-11-06 when the table went from four rows to ten. A week's delay on
the original four buys one review of the whole table instead of two a week apart —
and the table growing 2.5× in a day is the argument *for* reviewing it together, not
for tracking six dates. Three rows have a named thing to check on that date:
`web-design-guidelines` and `writing-guidelines` (their rules are fetched live, so
they cannot drift-detect) and `web-design-guidelines` again (whether it has started
repeating `accesslint`).
