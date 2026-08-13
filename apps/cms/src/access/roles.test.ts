import type { Access, FieldAccess } from 'payload'
import { describe, expect, it } from 'vitest'
import { isAdmin, isAdminFieldLevel, isAdminOrEditor, isAuthenticated } from './roles'

/**
 * The whole authorisation surface of the CMS, asserted as a matrix.
 *
 * WHY THIS EXISTS. These four functions decide who may read, write and delete every
 * collection in the admin, and they were at 45% line coverage with no test of their
 * own — the collections that USE them are tested, which reads as coverage and is not.
 * The failure mode is silent in the direction that matters: `roleOf` returns `null`
 * for anything unexpected, so a bug that widened it (an added role string, a `role`
 * field renamed, a truthiness check replacing the equality check) grants access
 * rather than denying it, and nothing in the admin looks different afterwards.
 *
 * WHAT WOULD HAVE TO BREAK FOR THIS TO FAIL — the question CLAUDE.md says to ask
 * before writing a test. Concretely: `isAdmin` accepting `editor`; `isAuthenticated`
 * accepting `null`; `roleOf` accepting a role it does not know (the case that turns a
 * typo'd seed value into an admin); or any of them throwing rather than returning
 * false on a malformed user object, which in Payload surfaces as a 500 on the admin
 * list view instead of an empty one.
 *
 * The odd-shaped users at the bottom are not padding. `req.user` is whatever the auth
 * strategy put there, and this repo has two (the session cookie and the robot API
 * key), so "an object that is not a user" is a real state rather than a hypothetical.
 */

type Actor = { role?: unknown } | null

const call = (fn: Access | FieldAccess, user: Actor): unknown =>
  (fn as (args: { req: { user: Actor } }) => unknown)({ req: { user } })

const ADMIN = { role: 'admin' }
const EDITOR = { role: 'editor' }
const ANON = null

describe('role access matrix', () => {
  const cases: [
    string,
    Access | FieldAccess,
    { admin: boolean; editor: boolean; anon: boolean },
  ][] = [
    ['isAdmin', isAdmin, { admin: true, editor: false, anon: false }],
    ['isAdminOrEditor', isAdminOrEditor, { admin: true, editor: true, anon: false }],
    ['isAuthenticated', isAuthenticated, { admin: true, editor: true, anon: false }],
    ['isAdminFieldLevel', isAdminFieldLevel, { admin: true, editor: false, anon: false }],
  ]

  for (const [name, fn, expected] of cases) {
    it(`${name}: admin=${expected.admin} editor=${expected.editor} anonymous=${expected.anon}`, () => {
      expect(call(fn, ADMIN), `${name} for an admin`).toBe(expected.admin)
      expect(call(fn, EDITOR), `${name} for an editor`).toBe(expected.editor)
      expect(call(fn, ANON), `${name} for an anonymous visitor`).toBe(expected.anon)
    })
  }

  /**
   * Every shape below has reached `req.user` in some deployment of Payload: a user
   * row whose `role` column is null, a token whose payload carried no role at all,
   * and a role string that is close to a real one but is not one. All three must
   * DENY, and none may throw.
   */
  it.each([
    ['role is null', { role: null }],
    ['role is undefined', { role: undefined }],
    ['role key absent entirely', {}],
    ['role is an unknown string', { role: 'Admin' }],
    ['role is a near-miss string', { role: 'administrator' }],
    ['role is a number', { role: 1 }],
    ['role is an object', { role: { name: 'admin' } }],
  ])('denies admin rights when %s', (_label, user) => {
    expect(call(isAdmin, user as Actor)).toBe(false)
    expect(call(isAdminOrEditor, user as Actor)).toBe(false)
    expect(call(isAdminFieldLevel, user as Actor)).toBe(false)
  })

  /**
   * ⚠️ `isAuthenticated` is deliberately NOT in the block above and this is the one
   * asymmetry in the file. It asks "is anyone signed in", not "is the role known", so
   * a signed-in user with a broken role field is still authenticated. That is correct
   * — the collections that need a role use one of the other three — and it is pinned
   * here so nobody "consistency-fixes" it into a role check and locks out a user
   * whose role failed to load.
   */
  it('isAuthenticated accepts any signed-in user, including one with an unusable role', () => {
    expect(call(isAuthenticated, { role: null })).toBe(true)
    expect(call(isAuthenticated, {})).toBe(true)
    expect(call(isAuthenticated, null)).toBe(false)
  })
})
