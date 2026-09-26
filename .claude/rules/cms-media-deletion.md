---
paths:
  - "apps/shrink/src/cms.ts"
  - "scripts/find-orphan-media.mjs"
  - "apps/cms/src/collections/**"
---

# Before you delete anything in the CMS

Moved from the root `CLAUDE.md` on 2026-09-26, word for word. It had stayed in the root
because it governs `apps/shrink/src/cms.ts` and `scripts/find-orphan-media.mjs` as well
as the CMS, and a nested `apps/cms/CLAUDE.md` would stop loading for the half that
deletes files. A `paths:` rule covers all three places, which is why it is one now.

`isMediaReferenced` (`apps/shrink/src/cms.ts`) and
`scripts/find-orphan-media.mjs` must agree on what "referenced" means — one
deletes, the other only reports. `apps/cms/src/collections/mediaReferences.test.ts`
fails if a new Media relationship is added without updating both.

🔴 **Until 2026-08-08 updating one of those two lists did nothing.**
`REFERENCE_PATHS` in `find-orphan-media.mjs` was declared and never read — the
four paths were hardcoded again 60 lines below it — while the guard test's own
failure message instructs you to add new relationships *to that constant*.
Following the instruction would have gone green and left the orphan finder blind
to the new field, and that script deletes files a published product may be using.
It is now the thing the script actually iterates. Found by the linter, as an
unused variable, on the day it was added.
