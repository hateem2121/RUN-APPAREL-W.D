import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareSettings, EXPECTED, githubSettings, r2Settings } from './check-live-settings.mjs'

// Real answers, captured 2026-11-07 (GitHub REST and Cloudflare's R2 lifecycle API).
const LIFECYCLE_NOW = {
  rules: [
    {
      id: 'Default Multipart Abort Rule',
      enabled: true,
      conditions: {},
      abortMultipartUploadsTransition: { condition: { type: 'Age', maxAge: 604800 } },
    },
    {
      id: 'backup',
      enabled: true,
      conditions: { prefix: 'backups/' },
      deleteObjectsTransition: { condition: { type: 'Age', maxAge: 2592000 } },
    },
    {
      id: 'viewer-db-nightly-30d',
      enabled: true,
      conditions: { prefix: 'run-apparel-viewer-db/' },
      deleteObjectsTransition: { condition: { type: 'Age', maxAge: 2592000 } },
    },
    {
      id: 'viewer-db-predeploy-14d',
      enabled: true,
      conditions: { prefix: 'run-apparel-viewer-db/pre-deploy/' },
      deleteObjectsTransition: { condition: { type: 'Age', maxAge: 1209600 } },
    },
  ],
}
const GITHUB_NOW = {
  environment: {
    name: 'production',
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  },
  branchPolicies: { total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] },
  codeScanning: {
    state: 'configured',
    query_suite: 'extended',
    languages: ['actions', 'javascript', 'javascript-typescript', 'python', 'typescript'],
  },
}

test('today’s live settings match the notes', () => {
  assert.deepEqual(compareSettings(githubSettings(GITHUB_NOW), EXPECTED.github), [])
  assert.deepEqual(compareSettings(r2Settings(LIFECYCLE_NOW), EXPECTED.r2), [])
})

test('negative control: the environment as it really was until 2026-11-07 is caught', () => {
  const before = {
    ...GITHUB_NOW,
    environment: { name: 'production', deployment_branch_policy: null },
    branchPolicies: { branch_policies: [] },
  }
  const keys = compareSettings(githubSettings(before), EXPECTED.github).map((d) => d.key)
  assert.deepEqual(keys, [
    'production environment: branch policy',
    'production environment: allowed branches',
  ])
})

test('negative control: the bucket as it really was (only the other site’s rule) is caught', () => {
  const before = { rules: LIFECYCLE_NOW.rules.slice(0, 2) }
  const diffs = compareSettings(r2Settings(before), EXPECTED.r2)
  assert.equal(diffs.length, 2)
  assert.equal(diffs[0].live, '(absent)')
})

test('a rule that is disabled, or at a different age, is a difference', () => {
  const changed = structuredClone(LIFECYCLE_NOW)
  changed.rules[2].enabled = false
  changed.rules[3].deleteObjectsTransition.condition.maxAge = 90 * 86400
  assert.deepEqual(
    compareSettings(r2Settings(changed), EXPECTED.r2).map((d) => d.live),
    [
      'run-apparel-viewer-db/ after 30 days (DISABLED)',
      'run-apparel-viewer-db/pre-deploy/ after 90 days',
    ],
  )
})

test('a second allowed branch is a difference, not a pass', () => {
  const wider = {
    ...GITHUB_NOW,
    branchPolicies: {
      branch_policies: [
        { name: 'main', type: 'branch' },
        { name: 'dev', type: 'branch' },
      ],
    },
  }
  assert.equal(compareSettings(githubSettings(wider), EXPECTED.github).length, 1)
})
