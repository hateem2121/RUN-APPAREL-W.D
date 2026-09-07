import type { Access } from 'payload'
import { describe, expect, it } from 'vitest'
import { Users } from './Users'

/**
 * The Users collection's access rules — audit FA-O-71.
 *
 * ⚠️ THE POINT OF THIS FILE IS THE OPERATION THAT IS EASY TO FORGET. `create`, `read`,
 * `update` and `delete` are the four anyone thinks to write, and Payload has a fifth on
 * an auth collection: `unlock`. It was absent, so Payload's default applied —
 * `collections/config/defaults.js` assigns `unlock: defaultAccess`, and
 * `auth/defaultAccess.js` is `({ req: { user } }) => Boolean(user)`, i.e. ANY
 * authenticated principal. That is GHSA-jg8r-5jh2-v2xj, unpatched at `payload <= 3.88.0`
 * with `first_patched_version: NONE` — there is no upgrade, only this configuration.
 *
 * ⚠️ AND THE PRINCIPAL THAT MAKES IT CONCRETE HERE IS NOT A PERSON. The shrink robot
 * authenticates as a user with `users API-Key` (see `auth.useAPIKey` above it). So the
 * capability to clear an admin's brute-force lockout sat behind a key that lives in a
 * Cloudflare secret on a different Worker, held for the entirely unrelated purpose of
 * writing a Media document.
 *
 * These call the access functions directly rather than through Payload. That is the
 * whole surface: an `Access` function is a pure predicate over `req.user`, so exercising
 * it is exercising the rule. What it cannot check is that the KEY IS SPELLED RIGHT and
 * reaches Payload at all — `access.unlokc` would leave the default in place and every
 * assertion below would still pass — so the last test asserts the operation is present
 * on the config by name.
 */

type Principal = { role?: string; id?: string } | null

/** The shape Payload passes an `Access` function; only `req.user` is consulted. */
const asUser = (user: Principal) => ({ req: { user } }) as unknown as Parameters<Access>[0]

const ADMIN: Principal = { role: 'admin', id: '1' }
const EDITOR: Principal = { role: 'editor', id: '2' }
/** The shrink robot: a real, authenticated user with an API key and the editor role. */
const ROBOT: Principal = { role: 'editor', id: '3' }
const ANONYMOUS: Principal = null

const run = (rule: Access | undefined, user: Principal) => {
  if (!rule) return undefined
  return rule(asUser(user))
}

describe('unlock — the unpatched advisory (FA-O-71)', () => {
  it('is declared at all, so Payload’s permissive default cannot apply', () => {
    expect(
      Users.access?.unlock,
      'Users.access has no `unlock`. Payload then uses defaultAccess — Boolean(user) — ' +
        'and any authenticated principal, including the shrink robot’s API key, can clear ' +
        'the lockout that maxLoginAttempts exists to impose. GHSA-jg8r-5jh2-v2xj has no ' +
        'patched version; this key is the whole mitigation.',
    ).toBeTypeOf('function')
  })

  it.each([
    ['an editor', EDITOR],
    ['the shrink robot', ROBOT],
    ['an anonymous request', ANONYMOUS],
  ])('refuses %s', (_name, user) => {
    expect(run(Users.access?.unlock, user)).toBe(false)
  })

  /*
   * The positive control. Every refusal above would also pass against `unlock: () => false`
   * — which would be a different bug: an admin locked out by the five-attempt rule would
   * have no route back except a D1 write against production. A second admin unlocking the
   * first is the recovery this operation exists for.
   */
  it('allows an admin, so a real lockout is still recoverable', () => {
    expect(run(Users.access?.unlock, ADMIN)).toBe(true)
  })
})

describe('the other four, so the fifth is not the only one anybody looks at', () => {
  it.each([
    ['create', 'create'],
    ['update', 'update'],
    ['delete', 'delete'],
  ])('%s is admin-only', (_name, key) => {
    const rule = Users.access?.[key as 'create' | 'update' | 'delete']
    expect(run(rule, ADMIN)).toBe(true)
    expect(run(rule, EDITOR)).toBe(false)
    expect(run(rule, ANONYMOUS)).toBe(false)
  })

  /*
   * `read` is the one that is not a boolean: an editor gets a QUERY constraint limiting
   * them to their own row, which the admin UI needs for the session. Asserting
   * `toBe(false)` here would be wrong, and asserting only `toBeTruthy()` would accept a
   * rule that returned every user.
   */
  it('read gives an editor their own record and nobody else’s', () => {
    expect(run(Users.access?.read, ADMIN)).toBe(true)
    expect(run(Users.access?.read, ANONYMOUS)).toBe(false)
    expect(run(Users.access?.read, EDITOR)).toEqual({ id: { equals: '2' } })
  })
})

describe('the lockout the unlock rule is protecting', () => {
  /*
   * Without these the unlock rule guards nothing: `maxLoginAttempts` is what creates a
   * lockout in the first place, and it has no default in Payload — omit it and the
   * account never locks, so there is nothing for anyone to clear.
   */
  it('still locks an account after five attempts, for ten minutes', () => {
    expect(Users.auth).toBeTypeOf('object')
    const auth = Users.auth as { maxLoginAttempts?: number; lockTime?: number }
    expect(auth.maxLoginAttempts).toBe(5)
    expect(auth.lockTime).toBe(10 * 60 * 1000)
  })

  it('still issues API keys, which is why the advisory had a non-human principal', () => {
    expect((Users.auth as { useAPIKey?: boolean }).useAPIKey).toBe(true)
  })
})
