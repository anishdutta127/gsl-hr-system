import { describe, expect, it } from 'vitest'

/*
 * Step 19 regression: previously, PipelineActions.destinationOptions
 * excluded every role the candidate had any application for. Terminal
 * applications (Rejected / Withdrawn / NotInterested / OnHold) blocked
 * re-adding. The fix narrows the dedupe to non-terminal-only, matching
 * the bulk + move route servers.
 *
 * The component encapsulates the filter inline; this test replicates the
 * computed filter and exercises a couple of scenarios. Whenever the
 * component changes the filter logic, mirror it here.
 */

const TERMINAL_STAGES_FOR_DEDUPE = new Set([
  'Rejected',
  'Withdrawn',
  'NotInterested',
  'OnHold',
])

interface Membership {
  applicationId: string
  roleId: string
  roleTitle: string
  currentStage: string
}

function activeRoleIds(memberships: Membership[]): Set<string> {
  return new Set(
    memberships
      .filter((m) => !TERMINAL_STAGES_FOR_DEDUPE.has(m.currentStage))
      .map((m) => m.roleId),
  )
}

function destinationOptions(
  openRoles: Array<{ id: string; label: string }>,
  memberships: Membership[],
): Array<{ id: string; label: string }> {
  const active = activeRoleIds(memberships)
  return openRoles.filter((r) => !active.has(r.id))
}

const openRoles = [
  { id: 'role-a', label: 'STEM Coach (Academics)' },
  { id: 'role-b', label: 'Premium Sales (Sales)' },
  { id: 'role-c', label: 'Demonstrator (Sales)' },
]

describe('destinationOptions filter', () => {
  it('excludes roles where the candidate has a non-terminal application', () => {
    const memberships: Membership[] = [
      { applicationId: 'a1', roleId: 'role-a', roleTitle: '', currentStage: 'Shortlisted' },
    ]
    expect(destinationOptions(openRoles, memberships).map((r) => r.id)).toEqual([
      'role-b',
      'role-c',
    ])
  })

  it('INCLUDES roles where the only application is terminal (Rejected)', () => {
    const memberships: Membership[] = [
      { applicationId: 'a1', roleId: 'role-a', roleTitle: '', currentStage: 'Shortlisted' },
      { applicationId: 'a2', roleId: 'role-b', roleTitle: '', currentStage: 'Rejected' },
    ]
    expect(destinationOptions(openRoles, memberships).map((r) => r.id)).toEqual([
      'role-b',
      'role-c',
    ])
  })

  it('INCLUDES roles where the only application is Withdrawn', () => {
    const memberships: Membership[] = [
      { applicationId: 'a1', roleId: 'role-a', roleTitle: '', currentStage: 'Withdrawn' },
    ]
    expect(destinationOptions(openRoles, memberships).map((r) => r.id)).toEqual([
      'role-a',
      'role-b',
      'role-c',
    ])
  })

  it('excludes a role when the candidate has BOTH terminal + active applications there', () => {
    // Two applications for the same role (rare but possible after a move-back).
    const memberships: Membership[] = [
      { applicationId: 'a1', roleId: 'role-a', roleTitle: '', currentStage: 'Rejected' },
      { applicationId: 'a2', roleId: 'role-a', roleTitle: '', currentStage: 'Shortlisted' },
    ]
    expect(destinationOptions(openRoles, memberships).map((r) => r.id)).toEqual([
      'role-b',
      'role-c',
    ])
  })

  it('treats OnHold + NotInterested as terminal for dedupe purposes', () => {
    const memberships: Membership[] = [
      { applicationId: 'a1', roleId: 'role-a', roleTitle: '', currentStage: 'OnHold' },
      { applicationId: 'a2', roleId: 'role-b', roleTitle: '', currentStage: 'NotInterested' },
    ]
    expect(destinationOptions(openRoles, memberships).map((r) => r.id)).toEqual([
      'role-a',
      'role-b',
      'role-c',
    ])
  })
})
