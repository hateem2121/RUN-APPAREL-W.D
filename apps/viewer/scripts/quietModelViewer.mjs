import { parseAst } from 'vite'

/**
 * Silence model-viewer's own debug printing in the production build — and nothing else.
 *
 * ⚠️ WHY (visual audit VA-10, 2026-10-02). `@google/model-viewer` 4.3.1 carries nine
 * `console.log` calls in its own library source (counted in the installed package: four in
 * `lib/model-viewer-base.js`, three in `lib/features/ar.js`, one each in
 * `lib/three-components/Renderer.js` and `ARRenderer.js`), and a garment page printed six of them
 * on every visit — "[$updateSource] called!", "[$updateSource] BAILING OUT EARLY!",
 * "IntersectionObserver fired!" and the like. A visitor who opens the console finds a library's
 * debugging among the site's own diagnostics.
 *
 * ⚠️ SCOPED BY MODULE, NOT BY CALL. A build-wide switch would also delete the site's own
 * `console.*`, which are its diagnostics, and Vite's build options page documents no per-package
 * form (read 2026-10-02). Its plugin API does document a `transform` hook with an `id` filter, so
 * this is a plugin that sees only files under `node_modules/@google/model-viewer/`. It removes
 * `console.log` and nothing else: the `console.warn` and `console.error` calls in those same
 * files are the library reporting real problems (a failed AR hand-off, a missing material) and
 * stay. `three`, which shares the `model-viewer` chunk, has one `console.log` of its own, in its
 * `log()` helper (`build/three.core.js`); that is not model-viewer's and is left alone.
 *
 * ⚠️ POSITIONS DO NOT MOVE. Each call is overwritten by `void 0`, padded with spaces to the call's
 * own length and keeping every newline where it was, so nothing after it shifts a line or a column
 * and the existing source map stays correct. That is what lets the hook return `map: null`, which
 * Rolldown documents as "the transformation does not relocate code" (rolldown.rs, source code
 * transformations, read 2026-10-02). The padding and the `void 0` are minified away with the rest.
 *
 * ⚠️ AN AST, NOT A REGEX. A call can span lines — the `[$updateSource]` message is a multi-line
 * template literal with `${…}` holes — and a string or comment can contain the words
 * "console.log(". Vite exports `parseAst`, so there is nothing new to install.
 *
 * Build only (`apply: 'build'`): production is what visitors see; the dev server is left as it
 * was.
 *
 * ⚠️ IF A FUTURE model-viewer STOPS PRINTING THESE, delete this file and its line in
 * `vite.config.ts`. `quietModelViewer.test.ts` reads the installed library and fails with those
 * words when it no longer finds what the plugin exists to remove.
 */

/** Every file of the package, in any package manager's layout (pnpm nests it under `.pnpm`). */
export const MODEL_VIEWER_MODULES = /[/\\]node_modules[/\\]@google[/\\]model-viewer[/\\]/

/** Only its JavaScript: the package also ships `.d.ts` and `.map` files beside it. */
export function isModelViewerModule(id) {
  const file = id.split('?')[0] ?? ''
  return MODEL_VIEWER_MODULES.test(file) && /\.[cm]?js$/.test(file)
}

const isConsoleLog = (node) =>
  node.type === 'CallExpression' &&
  node.callee.type === 'MemberExpression' &&
  !node.callee.computed &&
  node.callee.object.type === 'Identifier' &&
  node.callee.object.name === 'console' &&
  node.callee.property.type === 'Identifier' &&
  node.callee.property.name === 'log'

/** Every node of an ESTree, depth first. */
function* nodesOf(node) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) yield* nodesOf(child)
    return
  }
  if (typeof node.type === 'string') yield node
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue
    yield* nodesOf(node[key])
  }
}

/** `void 0`, then blanks, to exactly the length of `text` — newlines kept where they were. */
function placeholder(text) {
  const head = 'void 0'
  let padding = ''
  for (let i = head.length; i < text.length; i += 1) {
    padding += text[i] === '\n' || text[i] === '\r' ? text[i] : ' '
  }
  return head + padding
}

/**
 * @param {string} code
 * @param {(source: string) => unknown} [parse] injected so a test can show the parse is skipped
 * @returns {{ code: string, removed: number }}
 */
export function stripConsoleLog(code, parse = (source) => parseAst(source, { lang: 'js' })) {
  // Most files never say it: skip the parse for them.
  if (!code.includes('console.log')) return { code, removed: 0 }
  const calls = [...nodesOf(parse(code))].filter(isConsoleLog)
  if (calls.length === 0) return { code, removed: 0 }
  // A call inside another's argument list (`console.log(console.log(x))`) goes with the outer
  // one: replace in source order and skip anything already inside a replaced range.
  calls.sort((a, b) => a.start - b.start)
  let out = ''
  let cursor = 0
  let removed = 0
  for (const call of calls) {
    if (call.start < cursor) continue
    out += code.slice(cursor, call.start) + placeholder(code.slice(call.start, call.end))
    cursor = call.end
    removed += 1
  }
  return { code: out + code.slice(cursor), removed }
}

/** @returns {import('vite').Plugin} */
export function quietModelViewer() {
  return {
    name: 'run-quiet-model-viewer',
    apply: 'build',
    transform: {
      filter: { id: MODEL_VIEWER_MODULES },
      handler(code, id) {
        // The filter already did this before calling; an older bundler ignores a filter.
        if (!isModelViewerModule(id)) return null
        const result = stripConsoleLog(code)
        return result.removed === 0 ? null : { code: result.code, map: null }
      },
    },
  }
}
