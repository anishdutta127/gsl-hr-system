import { describe, expect, it } from 'vitest'
import { canTransition } from '@/lib/pipeline'
import { isPipelineReadOnly } from '@/lib/roleStatus'
import type { Application, Role } from '@/lib/types'

/*
 * Pure-function harness that mirrors the bulk-transition route's per-app
 * decision tree. Lets us regression-test "valid subset" and skipped-with-
 * reason behaviour without spinning up next/server.
 */

type RowResult =
  | { status: 'applied'; toStage: string }
  | { status: 'skipped'; reason: string }

function decide(
  app: Application,
  role: Role | undefined,
  args:
    | { targetStage: string; direction?: undefined }
    | { direction: 'forward' | 'backward'; targetStage?: undefined },
): RowResult {
  if (!role) return { status: 'skipped', reason: 'role-missing' }
  if (isPipelineReadOnly(role)) return { status: 'skipped', reason: 'role-readonly' }

  let toStage = ''
  if (args.targetStage) toStage = args.targetStage
  else {
    const idx = role.pipelineStages.indexOf(app.currentStage as string)
    if (args.direction === 'forward') {
      if (idx < 0 || idx >= role.pipelineStages.length - 1) {
        return { status: 'skipped', reason: 'no-next' }
      }
      toStage = role.pipelineStages[idx + 1] as string
    } else {
      if (idx <= 0) return { status: 'skipped', reason: 'no-prev' }
      toStage = role.pipelineStages[idx - 1] as string
    }
  }

  const validity = canTransition(role, app.currentStage, toStage)
  if (!validity.valid) {
    return { status: 'skipped', reason: validity.reason ?? 'invalid' }
  }
  return { status: 'applied', toStage }
}

const role = (id: string, status: Role['status'] = 'Open'): Role => ({
  id,
  title: id,
  department: 'X',
  location: 'Mumbai',
  employmentType: 'Full-time',
  status,
  pipelineStages: ['Sourced', 'Shortlisted', 'AssessmentSent', 'Offered', 'Joined'],
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
  roleId = 'R1',
): Application => ({
  id,
  candidateId: `c-${id}`,
  roleId,
  currentStage: stage,
  stageEnteredAt: '2026-04-01T00:00:00Z',
  createdAt: '2026-04-01T00:00:00Z',
  createdBy: 'seed',
  auditLog: [],
})

describe('bulk transition validation', () => {
  const r = role('R1')

  it('moves a Sourced candidate forward to Shortlisted', () => {
    const result = decide(app('a', 'Sourced'), r, { direction: 'forward' })
    expect(result).toEqual({ status: 'applied', toStage: 'Shortlisted' })
  })

  it('skips when at the end of the pipeline', () => {
    const result = decide(app('a', 'Joined'), r, { direction: 'forward' })
    expect(result.status).toBe('skipped')
  })

  it('skips when going backward from the first stage', () => {
    const result = decide(app('a', 'Sourced'), r, { direction: 'backward' })
    expect(result.status).toBe('skipped')
  })

  it('skips invalid transitions when role pipeline is read-only', () => {
    const closed = role('R-closed', 'Closed')
    const result = decide(app('a', 'Sourced'), closed, { direction: 'forward' })
    expect(result).toEqual({ status: 'skipped', reason: 'role-readonly' })
  })

  it('handles a mixed-bag bulk forward request', () => {
    const apps = [
      app('a', 'Sourced'),
      app('b', 'Shortlisted'),
      app('c', 'Joined'),
    ]
    const results = apps.map((x) => decide(x, r, { direction: 'forward' }))
    const applied = results.filter((r) => r.status === 'applied')
    const skipped = results.filter((r) => r.status === 'skipped')
    expect(applied).toHaveLength(2)
    expect(skipped).toHaveLength(1)
  })

  it('explicit targetStage of Rejected from any non-terminal is allowed', () => {
    const result = decide(app('a', 'Shortlisted'), r, { targetStage: 'Rejected' })
    expect(result.status).toBe('applied')
  })

  it('explicit targetStage of Joined from Joined is rejected (no-op)', () => {
    const result = decide(app('a', 'Joined'), r, { targetStage: 'Joined' })
    expect(result.status).toBe('skipped')
  })
})
