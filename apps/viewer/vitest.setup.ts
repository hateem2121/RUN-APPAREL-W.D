// Give the tests a working Web Storage, on every Node version.
//
// THE PROBLEM. Node 22.4+ ships an experimental Web Storage API. It is opt-in on
// Node 24 (what CI pins) but ON BY DEFAULT from Node 25. When it is on, Node
// defines a global `localStorage` that evaluates to `undefined` unless the process
// was started with `--localstorage-file`. That global wins over the one jsdom would
// otherwise install — `window.localStorage` comes back undefined too — so
// `localStorage.clear()` in a `beforeEach` throws
// "Cannot read properties of undefined (reading 'clear')".
//
// The effect was six failures in src/lib/theme.test.ts for anyone on Node 25+,
// while CI stayed green, because the root package.json allows `node: ">=24"`.
//
// WHY THIS SHAPE. Two tidier-looking fixes do not actually work here:
//   - `poolOptions.forks.execArgv: ['--no-experimental-webstorage']` is silently
//     ignored by Vitest 4.1.10 — the flag never reaches the worker (verified).
//   - Putting NODE_OPTIONS in the `test` script does work, but only for `pnpm test`;
//     a bare `vitest run`, or an IDE's Vitest integration, would still fail.
// A setup file runs inside the worker, so it fixes every entry point, needs no
// flags, and does not depend on which pool Vitest happens to default to.
//
// This borrows jsdom's real Storage rather than hand-rolling one, and installs it
// unconditionally so Node 24 and Node 26 exercise the identical implementation —
// a local pass then means the same thing CI's pass means.
//
// Safe to delete once the repo pins a Node major below 25, or once Node's own
// Web Storage is usable without --localstorage-file. See docs/AI-TOOLING.md.

import { JSDOM } from 'jsdom'

// A non-opaque origin is required for jsdom to expose Storage at all.
const { localStorage, sessionStorage } = new JSDOM('', { url: 'http://localhost' }).window

for (const [name, storage] of Object.entries({ localStorage, sessionStorage })) {
  Object.defineProperty(globalThis, name, {
    value: storage,
    configurable: true,
    writable: true,
  })
}
