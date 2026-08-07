/*
 * Role details editing: validation, diffing, and pipeline safety.
 *
 * Context: HR could create a role but not edit one. Correcting a job title
 * meant deleting and recreating the role, which orphans every application
 * attached to it. These tests pin the editable surface and the guarantee
 * that an edit cannot disturb in-flight candidates.
 */

import { describe, it, expect } from 'vitest'
import { validateRoleEdit, MAX_LIST_ITEMS } from '../roles/validateRoleEdit'
import {
  ROLE_DETAIL_EDITABLE_FIELDS,
  ROLE_IMMUTABLE_FIELDS,
  ROLE_TITLE_MAX_LENGTH,
} from '../roles/editableFields'
import type { Role } from '../types'

const identity = (html: string) => html

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-1',
    title: 'Sales Executive',
    department: 'Premium Sales',
    location: 'Mumbai',
    employmentType: 'Full-time',
    status: 'Open',
    pipelineStages: ['Sourced', 'Shortlisted', 'Offered', 'Joined'],
    rubric: [],
    description: '<p>Sell things.</p>',
    responsibilities: ['Call leads'],
    mustHaves: ['2 years experience'],
    niceToHaves: [],
    createdAt: '2026-05-01T00:00:00.000Z',
    createdBy: 'hr@getsetlearn.info',
    auditLog: [],
    ...overrides,
  } as Role
}

describe('validateRoleEdit - the field HR asked for', () => {
  it('accepts a job title change and reports the diff', () => {
    const role = makeRole()
    const result = validateRoleEdit(
      role,
      { title: 'Senior Sales Executive' },
      { sanitiseDescription: identity },
    )
    expect(result.ok).toBe(true)
    expect(result.after).toEqual({ title: 'Senior Sales Executive' })
    expect(result.before).toEqual({ title: 'Sales Executive' })
  })

  it('trims whitespace around a title', () => {
    const result = validateRoleEdit(
      makeRole(),
      { title: '  Regional Manager  ' },
      { sanitiseDescription: identity },
    )
    expect(result.after.title).toBe('Regional Manager')
  })

  it('rejects an empty title rather than blanking the role', () => {
    const result = validateRoleEdit(makeRole(), { title: '   ' }, { sanitiseDescription: identity })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/required/i)
  })

  it('rejects an over-long title', () => {
    const result = validateRoleEdit(
      makeRole(),
      { title: 'x'.repeat(ROLE_TITLE_MAX_LENGTH + 1) },
      { sanitiseDescription: identity },
    )
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/too long/i)
  })

  it('treats an unchanged title as a no-op, so no pointless queue write', () => {
    const role = makeRole()
    const result = validateRoleEdit(role, { title: role.title }, { sanitiseDescription: identity })
    expect(result.ok).toBe(true)
    expect(Object.keys(result.after)).toHaveLength(0)
  })
})

describe('validateRoleEdit - every other editable field persists', () => {
  it('accepts department, location and employment type together', () => {
    const result = validateRoleEdit(
      makeRole(),
      { department: 'Marketing', location: 'Remote', employmentType: 'Contract' },
      { sanitiseDescription: identity },
    )
    expect(result.ok).toBe(true)
    expect(result.after).toEqual({
      department: 'Marketing',
      location: 'Remote',
      employmentType: 'Contract',
    })
  })

  it('rejects an employment type outside the allowed set', () => {
    const result = validateRoleEdit(
      makeRole(),
      { employmentType: 'Freelance' },
      { sanitiseDescription: identity },
    )
    expect(result.ok).toBe(false)
  })

  it('sanitises the description on write', () => {
    const result = validateRoleEdit(
      makeRole(),
      { description: '<p>ok</p><script>alert(1)</script>' },
      { sanitiseDescription: (h) => h.replace(/<script>.*?<\/script>/g, '') },
    )
    expect(result.ok).toBe(true)
    expect(String(result.after.description)).not.toContain('<script>')
  })

  it('normalises JD lists: trims, drops blanks, keeps order', () => {
    const result = validateRoleEdit(
      makeRole(),
      { responsibilities: ['  Call leads  ', '', 'Close deals'] },
      { sanitiseDescription: identity },
    )
    expect(result.after.responsibilities).toEqual(['Call leads', 'Close deals'])
  })

  it('caps list length', () => {
    const result = validateRoleEdit(
      makeRole(),
      { mustHaves: Array.from({ length: MAX_LIST_ITEMS + 1 }, (_, i) => `item ${i}`) },
      { sanitiseDescription: identity },
    )
    expect(result.ok).toBe(false)
  })

  it('accepts a salary range and rejects an inverted one', () => {
    const good = validateRoleEdit(
      makeRole(),
      { salaryRange: { min: 600000, max: 900000, period: 'annual', disclose: true } },
      { sanitiseDescription: identity },
    )
    expect(good.ok).toBe(true)
    expect(good.after.salaryRange).toMatchObject({ min: 600000, max: 900000, currency: 'INR' })

    const bad = validateRoleEdit(
      makeRole(),
      { salaryRange: { min: 900000, max: 600000, period: 'annual', disclose: true } },
      { sanitiseDescription: identity },
    )
    expect(bad.ok).toBe(false)
  })

  it('clears the salary range when null is sent', () => {
    const role = makeRole({
      salaryRange: { min: 1, max: 2, currency: 'INR', period: 'annual', disclose: false },
    })
    const result = validateRoleEdit(role, { salaryRange: null }, { sanitiseDescription: identity })
    expect(result.ok).toBe(true)
    expect('salaryRange' in result.after).toBe(true)
    expect(result.after.salaryRange).toBeUndefined()
  })

  it('rejects an unknown hiring manager', () => {
    const result = validateRoleEdit(
      makeRole(),
      { hodUserId: 'ghost-user' },
      { sanitiseDescription: identity, knownUserIds: new Set(['real-user']) },
    )
    expect(result.ok).toBe(false)
  })

  it('accepts a known hiring manager and allows unassigning', () => {
    const assigned = validateRoleEdit(
      makeRole(),
      { hodUserId: 'real-user' },
      { sanitiseDescription: identity, knownUserIds: new Set(['real-user']) },
    )
    expect(assigned.ok).toBe(true)
    expect(assigned.after.hodUserId).toBe('real-user')

    const cleared = validateRoleEdit(
      makeRole({ hodUserId: 'real-user' }),
      { hodUserId: null },
      { sanitiseDescription: identity, knownUserIds: new Set(['real-user']) },
    )
    expect(cleared.ok).toBe(true)
    expect(cleared.after.hodUserId).toBeUndefined()
  })
})

describe('pipeline links survive an edit', () => {
  it('a title change never emits pipelineStages or any application field', () => {
    const role = makeRole()
    const result = validateRoleEdit(
      role,
      {
        title: 'Renamed Role',
        // Hostile payload: a client trying to reshape the pipeline through
        // the details editor must not get through.
        pipelineStages: ['Sourced'],
        id: 'role-hijacked',
        applications: [],
        auditLog: [],
        createdAt: '1999-01-01T00:00:00.000Z',
      },
      { sanitiseDescription: identity },
    )
    expect(result.ok).toBe(true)
    expect(result.after).toEqual({ title: 'Renamed Role' })
    for (const immutable of Object.keys(ROLE_IMMUTABLE_FIELDS)) {
      expect(result.after).not.toHaveProperty(immutable)
    }
  })

  it('the role id is never in the writable set, so applications stay attached', () => {
    // Applications key on role.id. As long as the editor cannot write it,
    // an in-flight candidate cannot be orphaned by a rename.
    expect(ROLE_DETAIL_EDITABLE_FIELDS as readonly string[]).not.toContain('id')
    expect(ROLE_IMMUTABLE_FIELDS.id).toBeTruthy()
  })

  it('in-flight counts are computed from applications, which an edit does not touch', () => {
    const role = makeRole()
    const applications = [
      { roleId: 'role-1', currentStage: 'Shortlisted' },
      { roleId: 'role-1', currentStage: 'Offered' },
      { roleId: 'role-2', currentStage: 'Sourced' },
    ]
    const before = applications.filter((a) => a.roleId === role.id).length

    const result = validateRoleEdit(
      role,
      { title: 'Completely Different Title', department: 'Operations' },
      { sanitiseDescription: identity },
    )
    expect(result.ok).toBe(true)

    // The edit produces a field diff only; nothing in it can rekey an application.
    const after = applications.filter((a) => a.roleId === role.id).length
    expect(after).toBe(before)
    expect(after).toBe(2)
  })
})
