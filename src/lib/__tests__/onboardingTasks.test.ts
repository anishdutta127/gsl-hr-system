import { describe, expect, it } from 'vitest'
import {
  addDaysIso,
  applyTaskStatusChange,
  canUserSeeTask,
  daysUntilDue,
  generateOnboardingTasksForEmployee,
  isTaskOverdue,
  resolveAssignee,
  summariseOnboarding,
} from '../onboardingTasks'
import type {
  Employee,
  OnboardingTask,
  OnboardingTaskTemplate,
  User,
} from '../types'

const NOW = new Date('2026-05-09T00:00:00Z')

function emp(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    employeeCode: 'X/1',
    name: 'Test',
    email: 't@x',
    designation: 'X',
    department: 'Operations',
    location: 'Mumbai',
    dateOfJoining: '2026-05-01',
    status: 'Active',
    createdAt: '2026-05-01',
    createdBy: 'seed',
    auditLog: [],
    ...overrides,
  } as Employee
}

function tpl(overrides: Partial<OnboardingTaskTemplate> = {}): OnboardingTaskTemplate {
  return {
    id: 't',
    name: 'Task',
    category: 'HR Formalities',
    isMandatory: true,
    defaultAssignee: 'HR',
    daysFromJoining: 0,
    estimatedMinutes: 30,
    ...overrides,
  } as OnboardingTaskTemplate
}

const TEMPLATES: OnboardingTaskTemplate[] = [
  tpl({ id: 'ob-pre', daysFromJoining: -7, defaultAssignee: 'HR' }),
  tpl({ id: 'ob-day0', daysFromJoining: 0, defaultAssignee: 'IT' }),
  tpl({ id: 'ob-week1', daysFromJoining: 7, defaultAssignee: 'ReportingManager' }),
  tpl({ id: 'ob-3mo', daysFromJoining: 90, defaultAssignee: 'ReportingManager' }),
  tpl({ id: 'ob-optional', daysFromJoining: 0, isMandatory: false, defaultAssignee: 'HR' }),
]

const USERS: User[] = [
  {
    id: 'u-hr',
    email: 'hr@gsl.in',
    name: 'HR',
    role: 'HR',
    bcryptHash: 'x',
    createdAt: '2025-01-01',
    active: true,
    auditLog: [],
  },
  {
    id: 'u-admin',
    email: 'a@gsl.in',
    name: 'A',
    role: 'Admin',
    bcryptHash: 'x',
    createdAt: '2025-01-01',
    active: true,
    auditLog: [],
  },
]

describe('addDaysIso', () => {
  it('adds positive days', () => {
    expect(addDaysIso('2026-05-01', 7)).toBe('2026-05-08')
  })
  it('subtracts negative days', () => {
    expect(addDaysIso('2026-05-01', -7)).toBe('2026-04-24')
  })
  it('crosses month boundaries', () => {
    expect(addDaysIso('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('resolveAssignee', () => {
  it('HR -> first active HR user id', () => {
    const id = resolveAssignee({
      defaultAssignee: 'HR',
      employee: emp(),
      users: USERS,
    })
    expect(id).toBe('u-hr')
  })

  it('Admin -> first active Admin id', () => {
    expect(
      resolveAssignee({
        defaultAssignee: 'Admin',
        employee: emp(),
        users: USERS,
      }),
    ).toBe('u-admin')
  })

  it('IT falls back to HR (no IT role yet)', () => {
    expect(
      resolveAssignee({
        defaultAssignee: 'IT',
        employee: emp(),
        users: USERS,
      }),
    ).toBe('u-hr')
  })

  it('ReportingManager -> employee.reportingManagerId', () => {
    expect(
      resolveAssignee({
        defaultAssignee: 'ReportingManager',
        employee: emp({ reportingManagerId: 'mgr-9' }),
        users: USERS,
      }),
    ).toBe('mgr-9')
  })

  it('ReportingManager -> null when employee has no manager', () => {
    expect(
      resolveAssignee({
        defaultAssignee: 'ReportingManager',
        employee: emp({ reportingManagerId: null }),
        users: USERS,
      }),
    ).toBeNull()
  })

  it('Employee -> employee.id', () => {
    expect(
      resolveAssignee({
        defaultAssignee: 'Employee',
        employee: emp({ id: 'emp-x' }),
        users: USERS,
      }),
    ).toBe('emp-x')
  })
})

describe('generateOnboardingTasksForEmployee', () => {
  it('returns one task per template for a fresh joiner', () => {
    const tasks = generateOnboardingTasksForEmployee({
      employee: emp({ dateOfJoining: '2026-05-15' }),
      templates: TEMPLATES,
      users: USERS,
      existing: [],
      now: NOW,
    })
    expect(tasks.length).toBe(TEMPLATES.length)
    expect(tasks.map((t) => t.dueDate)).toContain('2026-05-15') // day 0
    expect(tasks.map((t) => t.dueDate)).toContain('2026-05-08') // day -7
  })

  it('marks pre-joining tasks N/A when joining date is back-dated past their due', () => {
    const tasks = generateOnboardingTasksForEmployee({
      employee: emp({ dateOfJoining: '2026-04-01' }),
      templates: TEMPLATES,
      users: USERS,
      existing: [],
      now: NOW,
    })
    const preTask = tasks.find((t) => t.templateId === 'ob-pre')
    expect(preTask?.status).toBe('N/A')
    const day0Task = tasks.find((t) => t.templateId === 'ob-day0')
    // day-0 task was due on 2026-04-01 (in the past) but it's NOT a pre-joining
    // task — it's a day-of task. Our heuristic only N/A's pre-joining tasks.
    expect(day0Task?.status).toBe('Not Started')
  })

  it('returns empty for employee with no joining date', () => {
    const tasks = generateOnboardingTasksForEmployee({
      employee: emp({ dateOfJoining: null }),
      templates: TEMPLATES,
      users: USERS,
      existing: [],
      now: NOW,
    })
    expect(tasks).toEqual([])
  })

  it('returns empty for employee already past 6 months (skip onboarding)', () => {
    const tasks = generateOnboardingTasksForEmployee({
      employee: emp({ dateOfJoining: '2024-01-01' }),
      templates: TEMPLATES,
      users: USERS,
      existing: [],
      now: NOW,
    })
    expect(tasks).toEqual([])
  })

  it('idempotent: returns existing tasks when already created', () => {
    const existing: OnboardingTask[] = [
      {
        id: 'pre-existing',
        employeeId: 'emp-1',
        templateId: 'ob-pre',
        status: 'In Progress',
        assignedTo: 'u-hr',
        dueDate: '2026-04-24',
        completedAt: null,
        completedBy: null,
        notes: '',
        blockers: '',
        auditLog: [],
      },
    ]
    const tasks = generateOnboardingTasksForEmployee({
      employee: emp({ dateOfJoining: '2026-05-01' }),
      templates: TEMPLATES,
      users: USERS,
      existing,
      now: NOW,
    })
    expect(tasks).toEqual(existing)
    expect(tasks.length).toBe(1)
  })

  it('respects reporting manager assignment', () => {
    const tasks = generateOnboardingTasksForEmployee({
      employee: emp({ dateOfJoining: '2026-05-15', reportingManagerId: 'mgr-7' }),
      templates: TEMPLATES,
      users: USERS,
      existing: [],
      now: NOW,
    })
    const rmTask = tasks.find((t) => t.templateId === 'ob-week1')
    expect(rmTask?.assignedTo).toBe('mgr-7')
  })
})

describe('summariseOnboarding', () => {
  it('counts each status bucket correctly', () => {
    const tasks: OnboardingTask[] = [
      task('t1', 'ob-day0', 'Completed'),
      task('t2', 'ob-pre', 'N/A'),
      task('t3', 'ob-week1', 'Not Started'),
      task('t4', 'ob-3mo', 'In Progress'),
      task('t5', 'ob-optional', 'Blocked'),
    ]
    const s = summariseOnboarding({ templates: TEMPLATES, tasks })
    expect(s.total).toBe(5)
    expect(s.completed).toBe(1)
    expect(s.notApplicable).toBe(1)
    expect(s.notStarted).toBe(1)
    expect(s.inProgress).toBe(1)
    expect(s.blocked).toBe(1)
    // Mandatory remaining: ob-week1, ob-3mo (mandatory + not done) — ob-optional doesn't count.
    expect(s.mandatoryRemaining).toBe(2)
    expect(s.isOnboarded).toBe(false)
  })

  it('isOnboarded when all mandatory tasks Completed or N/A', () => {
    const tasks: OnboardingTask[] = [
      task('t1', 'ob-pre', 'Completed'),
      task('t2', 'ob-day0', 'Completed'),
      task('t3', 'ob-week1', 'N/A'),
      task('t4', 'ob-3mo', 'Completed'),
      task('t5', 'ob-optional', 'Not Started'), // optional, doesn't block
    ]
    const s = summariseOnboarding({ templates: TEMPLATES, tasks })
    expect(s.isOnboarded).toBe(true)
    expect(s.mandatoryRemaining).toBe(0)
  })

  it('empty task list -> not onboarded (no signal of progress)', () => {
    const s = summariseOnboarding({ templates: TEMPLATES, tasks: [] })
    expect(s.isOnboarded).toBe(false)
  })
})

describe('daysUntilDue + isTaskOverdue', () => {
  it('positive for tasks with future due dates', () => {
    const t = task('t', 'ob-pre', 'Not Started', { dueDate: '2026-05-20' })
    expect(daysUntilDue(t, NOW)).toBe(11)
    expect(isTaskOverdue(t, NOW)).toBe(false)
  })
  it('negative for tasks with past due dates', () => {
    const t = task('t', 'ob-pre', 'Not Started', { dueDate: '2026-05-01' })
    expect(daysUntilDue(t, NOW)).toBe(-8)
    expect(isTaskOverdue(t, NOW)).toBe(true)
  })
  it('Completed and N/A are never "overdue"', () => {
    const t1 = task('t', 'ob-pre', 'Completed', { dueDate: '2026-04-01' })
    const t2 = task('t', 'ob-pre', 'N/A', { dueDate: '2026-04-01' })
    expect(isTaskOverdue(t1, NOW)).toBe(false)
    expect(isTaskOverdue(t2, NOW)).toBe(false)
  })
})

describe('canUserSeeTask', () => {
  const employee = emp({ id: 'emp-1', reportingManagerId: 'mgr-7' })
  const task1: OnboardingTask = task('t', 'ob-pre', 'Not Started', { assignedTo: 'mgr-7' })
  const task2: OnboardingTask = task('t', 'ob-pre', 'Not Started', { assignedTo: 'someone-else' })

  it('Admin/HR/Leadership see all', () => {
    expect(canUserSeeTask({ task: task1, user: { id: 'u', role: 'Admin' }, employee })).toBe(true)
    expect(canUserSeeTask({ task: task1, user: { id: 'u', role: 'HR' }, employee })).toBe(true)
    expect(canUserSeeTask({ task: task1, user: { id: 'u', role: 'Leadership' }, employee })).toBe(true)
  })

  it('HOD sees task assigned to them', () => {
    expect(canUserSeeTask({ task: task1, user: { id: 'mgr-7', role: 'HOD' }, employee })).toBe(true)
  })

  it('HOD sees tasks for their direct reports even when assignee is someone else', () => {
    expect(canUserSeeTask({ task: task2, user: { id: 'mgr-7', role: 'HOD' }, employee })).toBe(true)
  })

  it('HOD does NOT see tasks for someone else\'s direct reports', () => {
    const otherEmp = emp({ id: 'emp-1', reportingManagerId: 'mgr-elsewhere' })
    expect(canUserSeeTask({ task: task2, user: { id: 'mgr-7', role: 'HOD' }, employee: otherEmp })).toBe(false)
  })
})

describe('applyTaskStatusChange', () => {
  it('Completed sets completedAt + completedBy and audits', () => {
    const initial = task('t', 'ob-pre', 'Not Started')
    const next = applyTaskStatusChange({
      task: initial,
      status: 'Completed',
      byUser: 'u-hr',
      now: '2026-05-09T10:00:00Z',
    })
    expect(next.status).toBe('Completed')
    expect(next.completedAt).toBe('2026-05-09T10:00:00Z')
    expect(next.completedBy).toBe('u-hr')
    expect(next.auditLog).toHaveLength(1)
    expect(next.auditLog[0]!.action).toBe('onboarding.task.update')
  })

  it('Blocked persists blockers', () => {
    const initial = task('t', 'ob-pre', 'Not Started')
    const next = applyTaskStatusChange({
      task: initial,
      status: 'Blocked',
      byUser: 'u-hr',
      blockers: 'Waiting for laptop delivery',
      now: '2026-05-09T10:00:00Z',
    })
    expect(next.status).toBe('Blocked')
    expect(next.blockers).toBe('Waiting for laptop delivery')
  })

  it('Re-opening clears completedAt', () => {
    const initial = task('t', 'ob-pre', 'Completed', {
      completedAt: '2026-05-08T00:00:00Z',
      completedBy: 'u-hr',
    })
    const next = applyTaskStatusChange({
      task: initial,
      status: 'In Progress',
      byUser: 'u-hr2',
      now: '2026-05-09T00:00:00Z',
    })
    expect(next.completedAt).toBeNull()
    expect(next.completedBy).toBeNull()
  })
})

// helpers
function task(
  id: string,
  templateId: string,
  status: OnboardingTask['status'],
  overrides: Partial<OnboardingTask> = {},
): OnboardingTask {
  return {
    id,
    employeeId: 'emp-1',
    templateId,
    status,
    assignedTo: 'u-hr',
    dueDate: '2026-05-15',
    completedAt: null,
    completedBy: null,
    notes: '',
    blockers: '',
    auditLog: [],
    ...overrides,
  }
}
