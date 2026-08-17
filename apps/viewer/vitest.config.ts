import { coverage } from '../../vitest.coverage.mjs'
import { defineConfig } from 'vitest/config'

// jsdom-environment unit tests for the viewer's browser logic
// (theme, capabilities, router, api, telemetry).
export default defineConfig({
  test: {
    environment: 'jsdom',
    // `scripts/` is included because the CSP builder lives there and ships in every
    // response header. It had no tests at all until 2026-08-05, having already
    // caused two production incidents on its own.
    //
    // `.tsx` is matched as well as `.ts`. It was `.ts` only until 2026-08-07, which
    // meant a test file for a COMPONENT could be added, be syntactically valid, and
    // never run — vitest reports "no test files found" for the glob it was given and
    // says nothing about the file you wrote. Every component test would have been
    // silently absent.
    // `worker/` holds the link-preview logic. Only the PURE half is testable here
    // — worker/index.ts needs HTMLRewriter and a service binding, neither of
    // which exists under vitest — which is exactly why every decision lives in
    // worker/preview.ts instead.
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'scripts/**/*.test.ts',
      'worker/**/*.test.ts',
    ],
    // Installs a working localStorage/sessionStorage. Required from Node 25+,
    // where Node's own Web Storage global suppresses jsdom's — see the setup
    // file for the full explanation.
    setupFiles: ['./vitest.setup.ts'],
    coverage: coverage({
      include: ['src/**/*.ts', 'src/**/*.tsx', 'worker/**/*.ts', 'scripts/*.mjs'],
      exclude: [
        // Bootstrap: mounts React and nothing else. Exercised end to end by the
        // Playwright suite, which is where a broken mount actually shows.
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/styles/**',
        // Needs HTMLRewriter and a service binding, neither of which exists under
        // vitest — which is WHY every decision it makes lives in worker/preview.ts
        // instead. Covering it here is impossible; the post-deploy
        // smoke-viewer-preview.mjs check is what exercises it, against the edge.
        'worker/index.ts',
        // I/O shells around tested pure functions. `csp.mjs` is the pure policy
        // builder and IS counted; `gen-headers.mjs` only writes its output to disk.
        'scripts/gen-headers.mjs',
        'scripts/gen-env-hdr.mjs',
        'scripts/copy-decoders.mjs',
      ],
      /**
       * Measured 2026-08-13, and DELIBERATELY the lowest number in the repo.
       *
       * ⚠️ Do not "fix" this by excluding App.tsx and Stage.tsx — the bulk of the
       * uncovered lines are in those two, and dropping them from the denominator
       * would report a far higher number while testing exactly as much code. That
       * is the failure mode this whole measurement was added to prevent, and it
       * would be indistinguishable from real progress.
       *
       * ⚠️ The floor was NOT raised when RenderPage.tsx was deleted on 2026-08-17,
       * even though removing ~293 uncovered lines pushes the measured number up.
       * A threshold is a measurement, and raising it to whatever a deletion
       * happened to produce means the next change fails against a number nobody
       * measured. Re-measure deliberately or leave it.
       *
       * They are counted and they are honestly uncovered HERE, because what
       * actually exercises them is `apps/viewer/e2e/` — Playwright specs across
       * five browsers including WebKit, with a real WebGL context and an axe scan.
       * `<model-viewer>` cannot be meaningfully driven under jsdom (CLAUDE.md: `src`
       * is a property not an attribute, and `webglcontextlost` never reaches a host
       * listener), so a jsdom test of Stage.tsx would assert against a stub and pass
       * whatever production did. That is worse than an honest 42%.
       *
       * The right way to raise this number is to move logic OUT of those components
       * into `src/lib/` — which is where every 100%-covered module here came from.
       */
      thresholds: { lines: 42, functions: 42, branches: 32, statements: 41 },
    }),
  },
})
