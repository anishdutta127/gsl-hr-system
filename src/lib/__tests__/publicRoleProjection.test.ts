/*
 * Guard: the public /careers payload may contain ONLY allowlisted keys.
 *
 * THE INCIDENT (live in production, found 2026-08-08). /careers is
 * unauthenticated. Its index page passed whole Role records into
 * CareersBrowser, which is 'use client', so every field was serialised into
 * the RSC payload and served to every anonymous visitor. The live payload
 * carried role auditLog arrays including internal staff email addresses
 * ("Hiring@getsetlearn.info"), plus rubric, pipelineStages and createdBy.
 * None of it was rendered. A field can be invisible on screen and still be in
 * the payload.
 *
 * These tests compare the EMITTED KEY SET against the allowlist, so adding a
 * field to Role cannot silently reach the public. They fail on an unexpected
 * key rather than on a missing one, which is the direction that matters.
 */

import { describe, expect, it } from 'vitest'
import {
  NEVER_PUBLIC_ROLE_FIELDS,
  PUBLIC_ROLE_DETAIL_FIELDS,
  PUBLIC_ROLE_SUMMARY_FIELDS,
  toPublicRole,
  toPublicRoleSummary,
} from '../roles/publicRole'
import type { Role } from '../types'

/**
 * A role carrying every internal field, including ones invented here that the
 * model does not have. If the projection ever spreads its input instead of
 * building explicitly, these surface immediately.
 */
function fullRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-1',
    title: 'Regional Manager',
    department: 'Premium Sales',
    location: 'Mumbai',
    employmentType: 'Full-time',
    status: 'Open',
    description: '<p>Lead the region.</p>',
    responsibilities: ['Own the number'],
    mustHaves: ['5 years experience'],
    niceToHaves: ['Hindi'],
    pipelineStages: ['Sourced', 'Offered'],
    rubric: [{ id: 'c1', label: 'Ownership', weight: 5 }],
    hodUserId: 'user-hod-1',
    hodRound2UserId: 'user-hod-2',
    pauseReason: 'budget freeze',
    closeOutcome: 'Position Filled',
    closeNotes: 'Hired Priya, internal transfer',
    salaryRange: { min: 1200000, max: 1800000, currency: 'INR', period: 'annual', disclose: false },
    createdAt: '2026-08-07T12:41:33.879Z',
    createdBy: 'Hiring@getsetlearn.info',
    auditLog: [
      {
        timestamp: '2026-08-07T12:41:33.879Z',
        user: 'Hiring@getsetlearn.info',
        action: 'role.create',
        notes: 'Created via UI',
      },
    ],
    // Deliberately not on the Role type: stands in for a field somebody adds
    // to the model later without thinking about the public surface.
    unmodelledFutureField: 'internal secret',
    ...overrides,
  } as unknown as Role
}

describe('public role summary projection (the /careers index payload)', () => {
  it('emits exactly the allowlisted keys, no more and no fewer', () => {
    const keys = Object.keys(toPublicRoleSummary(fullRole())).sort()
    expect(keys).toEqual([...PUBLIC_ROLE_SUMMARY_FIELDS].sort())
  })

  it('excludes every field that must never be public, by name', () => {
    const projected = toPublicRoleSummary(fullRole()) as unknown as Record<string, unknown>
    for (const field of NEVER_PUBLIC_ROLE_FIELDS) {
      expect(projected, `${field} must not reach the public payload`).not.toHaveProperty(field)
    }
  })

  it('drops a field the model gains later without anyone allowlisting it', () => {
    // The whole point of an allowlist. A blocklist would ship this.
    expect(toPublicRoleSummary(fullRole())).not.toHaveProperty('unmodelledFutureField')
  })

  it('carries no internal email address anywhere in its serialised form', () => {
    // The concrete thing that leaked: staff addresses inside auditLog entries.
    const serialised = JSON.stringify(toPublicRoleSummary(fullRole()))
    expect(serialised).not.toContain('@getsetlearn.info')
    expect(serialised).not.toContain('Hired Priya')
  })
})

describe('public role detail projection (the /careers/[roleId] payload)', () => {
  it('emits exactly the allowlisted keys, no more and no fewer', () => {
    const keys = Object.keys(toPublicRole(fullRole())).sort()
    expect(keys).toEqual([...PUBLIC_ROLE_DETAIL_FIELDS].sort())
  })

  it('excludes every field that must never be public, by name', () => {
    const projected = toPublicRole(fullRole()) as unknown as Record<string, unknown>
    for (const field of NEVER_PUBLIC_ROLE_FIELDS) {
      expect(projected, `${field} must not reach the public payload`).not.toHaveProperty(field)
    }
  })

  it('never serialises anything internal, checked on the whole JSON string', () => {
    // Key-level assertions miss a value nested inside an allowed field. This
    // checks the payload the browser would actually receive.
    const serialised = JSON.stringify(toPublicRole(fullRole()))
    for (const secret of [
      '@getsetlearn.info',
      'Hired Priya',
      'budget freeze',
      'user-hod-1',
      'Ownership',
      'internal secret',
      'role.create',
    ]) {
      expect(serialised, `"${secret}" must not appear in the public payload`).not.toContain(secret)
    }
  })
})

describe('salary disclosure', () => {
  it('omits the figures entirely when the range is not disclosed', () => {
    // Not merely unrendered: absent. An undisclosed range in the payload is a
    // leak even if the page prints "Shared at first interview."
    const projected = toPublicRole(fullRole())
    expect(projected.salary).toBeNull()
    expect(JSON.stringify(projected)).not.toContain('1200000')
    expect(JSON.stringify(projected)).not.toContain('1800000')
  })

  it('includes the figures when the range IS disclosed', () => {
    // Positive control. Without this, a projection that always returned null
    // would pass the test above while silently breaking the feature.
    const projected = toPublicRole(
      fullRole({
        salaryRange: { min: 1200000, max: 1800000, currency: 'INR', period: 'annual', disclose: true },
      }),
    )
    expect(projected.salary).toEqual({ min: 1200000, max: 1800000, period: 'annual' })
  })

  it('never exposes the disclose flag itself', () => {
    expect(JSON.stringify(toPublicRole(fullRole()))).not.toContain('disclose')
  })
})

describe('the projection is an allowlist, structurally', () => {
  it('a role with only the required fields still projects cleanly', () => {
    const minimal = {
      id: 'r', title: 't', department: 'd', location: 'l', employmentType: 'Full-time',
    } as unknown as Role
    expect(Object.keys(toPublicRoleSummary(minimal)).sort()).toEqual([...PUBLIC_ROLE_SUMMARY_FIELDS].sort())
    // Missing list fields become empty arrays rather than undefined, so the
    // detail page can render without guards.
    const detail = toPublicRole(minimal)
    expect(detail.responsibilities).toEqual([])
    expect(detail.mustHaves).toEqual([])
    expect(detail.niceToHaves).toEqual([])
    expect(detail.description).toBe('')
  })

  it('the summary allowlist is a subset of the detail allowlist', () => {
    for (const field of PUBLIC_ROLE_SUMMARY_FIELDS) {
      expect(PUBLIC_ROLE_DETAIL_FIELDS as readonly string[]).toContain(field)
    }
  })

  it('no field appears in both the allowlist and the never-public list', () => {
    for (const field of PUBLIC_ROLE_DETAIL_FIELDS) {
      expect(NEVER_PUBLIC_ROLE_FIELDS as readonly string[]).not.toContain(field)
    }
  })
})
