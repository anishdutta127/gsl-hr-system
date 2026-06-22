import { describe, expect, it } from 'vitest'
import {
  advanceStage,
  applyHrTaskUpdate,
  canEditHrTasks,
  canViewHrTasks,
  currentStageName,
  filterHrTasks,
  groupByStatus,
  loadHrTasks,
  summariseHrTasks,
} from '../hrTasks'
import { HR_TASK_STATUSES, type HrTask, type HrTaskStage, type SessionClaims } from '../types'

const NOW = '2026-06-22T00:00:00.000Z'

function stage(id: string, order: number, status: HrTaskStage['status'], name = id): HrTaskStage {
  return { id, name, order, status }
}

function task(overrides: Partial<HrTask> = {}): HrTask {
  return {
    id: 't1',
    title: 'Task',
    description: '',
    status: 'In progress',
    ownerUserId: 'u-hr',
    stages: [],
    currentStageId: null,
    dependency: null,
    blocked: false,
    blockerNote: '',
    dueDate: null,
    nextStep: 'do the thing',
    createdAt: NOW,
    createdBy: 'hr',
    updatedAt: NOW,
    auditLog: [],
    ...overrides,
  }
}

function session(role: SessionClaims['role']): SessionClaims {
  return { sub: 'u', email: 'x@gsl.in', name: 'X', role, iat: 0, exp: 0 }
}

describe('groupByStatus', () => {
  it('buckets tasks by status across all five columns', () => {
    const tasks = [task({ id: 'a', status: 'Done' }), task({ id: 'b', status: 'Blocked' }), task({ id: 'c', status: 'Done' })]
    const g = groupByStatus(tasks)
    expect(Object.keys(g)).toEqual([...HR_TASK_STATUSES])
    expect(g.Done.map((t) => t.id)).toEqual(['a', 'c'])
    expect(g.Blocked.map((t) => t.id)).toEqual(['b'])
    expect(g['Not started']).toEqual([])
  })
})

describe('filterHrTasks', () => {
  const tasks = [
    task({ id: 'a', ownerUserId: 'u1', blocked: true, stages: [stage('s1', 1, 'current', 'Ameet review')], currentStageId: 's1' }),
    task({ id: 'b', ownerUserId: 'u2', blocked: false, stages: [stage('s2', 1, 'current', 'Finalise')], currentStageId: 's2' }),
  ]
  it('filters by owner', () => {
    expect(filterHrTasks(tasks, { ownerUserId: 'u1' }).map((t) => t.id)).toEqual(['a'])
  })
  it('filters blocked only', () => {
    expect(filterHrTasks(tasks, { blockedOnly: true }).map((t) => t.id)).toEqual(['a'])
  })
  it('filters by current stage substring', () => {
    expect(filterHrTasks(tasks, { stageQuery: 'review' }).map((t) => t.id)).toEqual(['a'])
    expect(filterHrTasks(tasks, { stageQuery: 'fin' }).map((t) => t.id)).toEqual(['b'])
  })
})

describe('summariseHrTasks', () => {
  it('counts totals, per-status, blocked and open', () => {
    const s = summariseHrTasks([
      task({ status: 'Done' }),
      task({ status: 'Blocked', blocked: true }),
      task({ status: 'In progress' }),
    ])
    expect(s.total).toBe(3)
    expect(s.byStatus.Done).toBe(1)
    expect(s.blocked).toBe(1)
    expect(s.open).toBe(2)
  })
})

describe('applyHrTaskUpdate', () => {
  it('patches only provided fields and audits the change', () => {
    const next = applyHrTaskUpdate({
      task: task(),
      patch: { status: 'Blocked', blocked: true, blockerNote: 'Waiting on Accounts' },
      by: 'hr@gsl.in',
      now: '2026-06-23T00:00:00.000Z',
    })
    expect(next.status).toBe('Blocked')
    expect(next.blocked).toBe(true)
    expect(next.blockerNote).toBe('Waiting on Accounts')
    expect(next.title).toBe('Task') // untouched
    expect(next.updatedAt).toBe('2026-06-23T00:00:00.000Z')
    expect(next.auditLog.at(-1)!.action).toBe('hr-task.update')
  })

  it('supports clearing nextStep to null (no defined next step)', () => {
    const next = applyHrTaskUpdate({ task: task({ nextStep: 'something' }), patch: { nextStep: null }, by: 'hr', now: NOW })
    expect(next.nextStep).toBeNull()
  })
})

describe('advanceStage', () => {
  it('moves current to done and the next pending to current', () => {
    const t = task({
      stages: [stage('s1', 1, 'current'), stage('s2', 2, 'pending'), stage('s3', 3, 'pending')],
      currentStageId: 's1',
    })
    const next = advanceStage(t, 'hr', NOW)
    expect(next.stages.find((s) => s.id === 's1')!.status).toBe('done')
    expect(next.stages.find((s) => s.id === 's2')!.status).toBe('current')
    expect(next.currentStageId).toBe('s2')
    expect(next.auditLog.at(-1)!.action).toBe('hr-task.advance-stage')
  })

  it('clears currentStageId when advancing the final stage', () => {
    const t = task({ stages: [stage('s1', 1, 'done'), stage('s2', 2, 'current')], currentStageId: 's2' })
    const next = advanceStage(t, 'hr', NOW)
    expect(next.stages.find((s) => s.id === 's2')!.status).toBe('done')
    expect(next.currentStageId).toBeNull()
  })
})

describe('permissions', () => {
  it('all staff can view; only HR/Admin can edit', () => {
    for (const r of ['Admin', 'HR', 'HOD', 'Leadership'] as const) {
      expect(canViewHrTasks(session(r))).toBe(true)
    }
    expect(canViewHrTasks(null)).toBe(false)
    expect(canEditHrTasks(session('HR'))).toBe(true)
    expect(canEditHrTasks(session('Admin'))).toBe(true)
    expect(canEditHrTasks(session('HOD'))).toBe(false)
    expect(canEditHrTasks(session('Leadership'))).toBe(false)
  })
})

describe('currentStageName + seed', () => {
  it('returns the current stage name', () => {
    const t = task({ stages: [stage('s1', 1, 'current', 'Ameet review')], currentStageId: 's1' })
    expect(currentStageName(t)).toBe('Ameet review')
    expect(currentStageName(task())).toBeNull()
  })

  it('ships the seeded incentive-structure demo task (multi-stage + dependency)', () => {
    const seeded = loadHrTasks().find((t) => t.id === 'hrtask-incentive-structure-demo')
    expect(seeded).toBeDefined()
    expect(seeded!.stages.length).toBeGreaterThanOrEqual(6)
    expect(seeded!.dependency?.pendingWith).toContain('Ameet')
    expect(seeded!.nextStep).toBeTruthy()
    expect(seeded!.status).toBe('Waiting on input')
  })
})
