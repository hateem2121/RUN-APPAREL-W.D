import { defineConfig } from 'vitest/config'

// Node-environment unit tests for the pure, security-critical logic
// (publish gating + the public API projection). No Payload/Next bootstrap.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
