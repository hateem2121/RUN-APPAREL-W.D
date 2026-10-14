import type { LoadPhase } from '../lib/loadProgress'

/**
 * The stage's loading line: "LOADING 3D MODEL · 42%", then "PREPARING 3D MODEL…".
 *
 * "3D MODEL", not "REFERENCE". The live region in Stage.tsx already said "the interactive 3D
 * model" while this line said "REFERENCE", so the sighted and the screen-reader visitor were given
 * different names for the same 23-second event — and "reference" is also what the whole page calls
 * itself.
 *
 * ⚠️ ONE STRING, NEVER TWO TEXT CHILDREN. This was `{words}{percent !== null && ` · ${percent}%`}`,
 * two text nodes side by side, and the moment every byte is in `describeLoad` drops the percent
 * (`lib/loadProgress.ts`) — so React removed the " · 100%" node on its own. A browser translating
 * the page has already replaced that node, the removal throws NotFoundError, and the error boundary
 * shows "This reference is no longer live" at the end of EVERY download on a translated page (found
 * beside the HD IMAGE crash, PostHog replay 2026-10-08; facebook/react#11538). A single string is
 * written as the element's whole text, which no translation can strand. `LoadingTitle.test.tsx`
 * plants a translation and drops the percent.
 */
export function LoadingTitle({ phase, percent }: { phase: LoadPhase; percent: number | null }) {
  const words = phase === 'preparing' ? 'PREPARING 3D MODEL…' : 'LOADING 3D MODEL'
  return (
    <span className="stage__loading-title">
      {percent === null ? words : `${words} · ${percent}%`}
    </span>
  )
}
