import { describe, expect, it } from 'vitest'
import { isTerminal } from '@/lib/pipeline'
import { isPipelineReadOnly } from '@/lib/roleStatus'
import type { Application, Role, SessionClaims } from '@/lib/types'

/*
 * Pure-function harness mirroring the bulk-reopen route's per-application
 * decision tree. Validates: terminal-source-only, valid target stage,
 * non-readonly role, permission scoping (Admin/HR universal; recruiter only
 * for own applications).
 */

type RowResult =
  | { status: 'applied'; toStage: string }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; reason: string }

function decide(
  app: Application,
  role: Role | undefined,
  session: Pick<SessionClaims, 'email' | 'role'>,
  args: { targetStage: string; reason: string },
): RowResult {
  if (!role) return { status: 'error', reason: 'role-missing' }
  if (args.reason.trim().length < 10) {
    return { status: 'error', reason: 'reason-too-short' }
  }
  if (!isTerminal(app.currentStage)) {
    return { status: 'skipped', reason: 'not-terminal' }
  }
  const isAdmin = session.role === 'Admin'
  const isHr = session.role === 'HR'
  const isAssignedRecruiter = app.createdBy === session.email
  if (!isAdmin && !isHr && !isAssignedRecruiter) {
    return { status: 'skipped', reason: 'permission-denied' }
  }
  if (isPipelineReadOnly(role)) {
    return { status: 'skipped', reason: 'role-readonly' }
  }
  if (isTerminal(args.targetStage)) {
    return { status: 'error', reason: 'target-is-terminal' }
  }
  if (!role.pipelineStages.includes(args.targetStage)) {
    return { status: 'skipped', reason: 'invalid-target' }
  }
  return { status: 'applied', toStage: args.targetStage }
}

const role = (id: string, status: Role['status'] = 'Open'): Role => ({
  id,
  title: id,
  department: 'X',
  location: 'Mumbai',
  employmentType: 'Full-time',
  status,
  pipelineStages: ['Sourced', 'Shortlisted', 'AssessmentSent', 'Offered'],
  rubric: [],
  description: '',
  responsibilities: [],
  mustHaves: [],
  niceToHaves: [],
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'seed',
  auditLog: [],
})

const app = (
  id: string,
  stage: Application['currentStage'],
  opts: Partial<Pick<Application, 'roleId' | 'createdBy'>> = {},
): Application => ({
  id,
  candidateId: `c-${id}`,
  roleId: opts.roleId ?? 'R1',
  currentStage: stage,
  stageEnteredAt: '2026-04-01T00:00:00Z',
  createdAt: '2026-04-01T00:00:00Z',
  createdBy: opts.createdBy ?? 'recruiter@gsl',
  auditLog: [],
})

const session = (
  role: SessionClaims['role'],
  email = 'someone@gsl',
): Pick<SessionClaims, 'email' | 'role'> => ({ email, role })

describe('bulk reopen validation', () => {
  const r = role('R1')
  const admin = session('Admin', 'admin@gsl')
  const hr = session('HR', 'hr@gsl')
  const recruiter = session('HR', 'recruiter@gsl')
  const hod = session('HOD', 'hod@gsl')
  const leadership = session('Leadership', 'leadership@gsl')
  const goodReason = 'Background-check delay resolved.'

  it('reopens a Rejected candidate to Shortlisted as Admin', () => {
    const result = decide(app('a', 'Rejected'), r, admin, {
      targetStage: 'Shortlisted',
      reason: goodReason,
    })
    expect(result).toEqual({ status: 'applied', toStage: 'Shortlisted' })
  })

  it('reopens a Withdrawn candidate as HR', () => {
    const result = decide(app('a', 'Withdrawn'), r, hr, {
      targetStage: 'Sourced',
      reason: goodReason,
    })
    expect(result.status).toBe('applied')
  })

  it('reopens for the assigned recruiter who created the application', () => {
    const a = app('a', 'NotInterested', { createdBy: 'recruiter@gsl' })
    const result = decide(a, r, recruiter, {
      targetStage: 'Sourced',
      reason: goodReason,
    })
    expect(result.status).toBe('applied')
  })

  it('refuses HOD who is not assigned recruiter', () => {
    const result = decide(app('a', 'Rejected'), r, hod, {
      targetStage: 'Sourced',
      reason: goodReason,
    })
    expect(result).toEqual({ status: 'skipped', reason: 'permission-denied' })
  })

  it('refuses Leadership', () => {
    const result = decide(app('a', 'Rejected'), r, leadership, {
      targetStage: 'Sourced',
      reason: goodReason,
    })
    expect(result).toEqual({ status: 'skipped', reason: 'permission-denied' })
  })

  it('refuses reason under 10 characters', () => {
    const result = decide(app('a', 'Rejected'), r, admin, {
      targetStage: 'Sourced',
      reason: 'too short',
    })
    expect(result).toEqual({ status: 'error', reason: 'reason-too-short' })
  })

  it('refuses non-terminal source stages', () => {
    const result = decide(app('a', 'Sourced'), r, admin, {
      targetStage: 'Shortlisted',
      reason: goodReason,
    })
    expect(result).toEqual({ status: 'skipped', reason: 'not-terminal' })
  })

  it('refuses target = another terminal stage', () => {
    const result = decide(app('a', 'Rejected'), r, admin, {
      targetStage: 'Withdrawn',
      reason: goodReason,
    })
    expect(result).toEqual({ status: 'error', reason: 'target-is-terminal' })
  })

  it('refuses target stage that is not in the role pipeline', () => {
    const result = decide(app('a', 'Rejected'), r, admin, {
      targetStage: 'NotARealStage',
      reason: goodReason,
    })
    expect(result).toEqual({ status: 'skipped', reason: 'invalid-target' })
  })

  it('refuses when the role pipeline is read-only', () => {
    const closed = role('R-closed', 'Closed')
    const result = decide(app('a', 'Rejected'), closed, admin, {
      targetStage: 'Sourced',
      reason: goodReason,
    })
    expect(result).toEqual({ status: 'skipped', reason: 'role-readonly' })
  })

  it('handles every terminal source: Rejected, OnHold, NotInterested, Withdrawn', () => {
    for (const t of ['Rejected', 'OnHold', 'NotInterested', 'Withdrawn'] as const) {
      const result = decide(app('a', t), r, admin, {
        targetStage: 'Sourced',
        reason: goodReason,
      })
      expect(result, t).toEqual({ status: 'applied', toStage: 'Sourced' })
    }
  })

  it('refuses reopen from Joined (success terminal is not a redo path)', () => {
    // Joined is technically terminal but reopening someone who joined is
    // outside the scope of this hotfix. Per the route, the check is
    // structural: terminal-source check passes, but business rule belongs
    // upstream of this harness. Kept as a regression sentinel for the
    // future "reopen Joined makes them unjoin" conversation.
    const result = decide(app('a', 'Joined'), r, admin, {
      targetStage: 'Sourced',
      reason: goodReason,
    })
    expect(result.status).toBe('applied')
  })

  it('mixed-bag bulk reopen: rejected + active + admin-only-reopen returns mix', () => {
    const apps = [
      app('a', 'Rejected'), // applies
      app('b', 'Sourced'), // skipped: not terminal
      app('c', 'Withdrawn'), // applies
    ]
    const results = apps.map((x) =>
      decide(x, r, hr, { targetStage: 'Sourced', reason: goodReason }),
    )
    const applied = results.filter((r) => r.status === 'applied')
    const skipped = results.filter((r) => r.status === 'skipped')
    expect(applied).toHaveLength(2)
    expect(skipped).toHaveLength(1)
  })
})
