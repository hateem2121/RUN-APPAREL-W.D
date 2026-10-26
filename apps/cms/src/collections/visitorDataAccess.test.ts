import type { Access, PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'
import { isAdmin } from '../access/roles'
import { DocumentVisitEmails } from './DocumentVisitEmails'
import { DocumentVisits } from './DocumentVisits'
import { Events } from './Events'

/**
 * The PDF visitors' city, country and device (DocumentVisits), the weekly email log and the
 * site events are for a person in the admin, never for an API key (owner, 2026-10-26).
 *
 * WHAT WOULD HAVE TO BREAK FOR THIS TO FAIL. The robot in production is an ADMIN that signs in
 * with an API key (D1 `users`, read 2026-10-26; it needs admin to delete media). Until this day
 * the three used `isAdmin`, which admits that key: the fixture below is the robot as it really
 * is, not the editor older tests assumed. A collection switched back to `isAdmin` fails here
 * while `roles.test.ts` stays green, which is why this test is per collection.
 */

type Principal = { role?: string; _strategy?: string } | null
const ask = (rule: unknown, user: Principal) =>
  (rule as Access)({ req: { user } as unknown as PayloadRequest })

const adminPerson = { role: 'admin', _strategy: 'local-jwt' }
const adminRobot = { role: 'admin', _strategy: 'api-key' }
const editorPerson = { role: 'editor', _strategy: 'local-jwt' }

describe.each([
  ['DocumentVisits', DocumentVisits],
  ['DocumentVisitEmails', DocumentVisitEmails],
  ['Events', Events],
])('%s read access', (_name, collection) => {
  it('an admin signed in as a person can read it', () => {
    expect(ask(collection.access?.read, adminPerson)).toBe(true)
  })

  it('no API key can read it, not even the admin robot; nor an editor or a visitor', () => {
    expect(ask(collection.access?.read, adminRobot)).toBe(false)
    expect(ask(collection.access?.read, editorPerson)).toBe(false)
    expect(ask(collection.access?.read, null)).toBe(false)
  })
})

it('negative control: the rule these replaced admits the admin robot key', () => {
  expect(ask(isAdmin, adminRobot)).toBe(true)
})
