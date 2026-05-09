import { describe, expect, it } from 'vitest'
import {
  applyOffboardingTaskStatusChange,
  canEditExitInterview,
  canUserSeeOffboardingTask,
  canViewExitInterview,
  generateOffboardingTasksForEmployee,
  resolveOffboardingAssignee,
  summariseOffboarding,
} from '../offboardingTasks'
import type {
  Employee,
  OffboardingTask,
  OffboardingTaskTemplate,
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
    dateOfJoining: '2024-01-01',
    status: 'Active',
    createdAt: '2024-01-01',
    createdBy: 'seed',
    auditLog: [],
    ...overrides,
  } as Employee
}

function tpl(overrides: Partial<OffboardingTaskTemplate> = {}): OffboardingTaskTemplate {
  return {
    id: 't',
    name: 'Task',
    category: 'Notice Period',
    isMandatory: true,
    defaultAssignee: 'HR',
    daysFromNoticeStart: 1,
    estimatedMinutes: 15,
    ...overrides,
  } as OffboardingTaskTemplate
}

const TEMPLATES: OffboardingTaskTemplate[] = [
  tpl({ id: 'off-day1', daysFromNoticeStart: 1, defaultAssignee: 'HR' }),
  tpl({ id: 'off-day3', daysFromNoticeStart: 3, defaultAssignee: 'ReportingManager' }),
  tpl({ id: 'off-kt', daysFromNoticeStart: 7, pegToLwd: true, defaultAssignee: 'Employee' }),
  tpl({ id: 'off-lwd', daysFromNoticeStart: 0, pegToLwd: true, defaultAssignee: 'IT' }),
  tpl({ id: 'off-ff', daysFromNoticeStart: 30, defaultAssignee: 'Accounts', isMandatory: true }),
  tpl({ id: 'off-exit-interview', daysFromNoticeStart: 0, pegToLwd: true, defaultAssignee: 'HR', isMandatory: true }),
  tpl({ id: 'off-optional', daysFromNoticeStart: 5, defaultAssignee: 'HR', isMandatory: false }),
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

describe('resolveOffboardingAssignee', () => {
  it('Accounts falls back to HR (no Accounts role yet)', () => {
    expect(
      resolveOffboardingAssignee({
        defaultAssignee: 'Accounts',
        employee: emp(),
        users: USERS,
      }),
    ).toBe('u-hr')
  })

  it('ReportingManager -> employee.reportingManagerId', () => {
    expect(
      resolveOffboardingAssignee({
        defaultAssignee: 'ReportingManager',
        employee: emp({ reportingManagerId: 'mgr-9' }),
        users: USERS,
      }),
    ).toBe('mgr-9')
  })
})

describe('generateOffboardingTasksForEmployee', () => {
  const ctx = {
    noticeStartDate: '2026-05-01',
    lastWorkingDay: '2026-05-31',
  }

  it('non-pegged tasks compute due = noticeStart + (daysFromNoticeStart - 1)', () => {
    const tasks = generateOffboardingTasksForEmployee({
      employee: emp(),
      templates: TEMPLATES,
      users: USERS,
      existing: [],
      context: ctx,
      now: NOW,
    })
    expect(tasks.find((t) => t.templateId === 'off-day1')!.dueDate).toBe('2026-05-01')
    expect(tasks.find((t) => t.templateId === 'off-day3')!.dueDate).toBe('2026-05-03')
    expect(tasks.find((t) => t.templateId === 'off-ff')!.dueDate).toBe('2026-05-30')
  })

  it('pegToLwd tasks compute due = lastWorkingDay - daysFromNoticeStart', () => {
    const tasks = generateOffboardingTasksForEmployee({
      employee: emp(),
      templates: TEMPLATES,
      users: USERS,
      existing: [],
      context: ctx,
      now: NOW,
    })
    expect(tasks.find((t) => t.templateId === 'off-kt')!.dueDate).toBe('2026-05-24') // 7 days before LWD
    expect(tasks.find((t) => t.templateId === 'off-lwd')!.dueDate).toBe('2026-05-31') // 0 days = LWD itself
  })

  it('idempotent: returns existing tasks when already created', () => {
    const existing: OffboardingTask[] = [
      {
        id: 'pre-existing',
        employeeId: 'emp-1',
        templateId: 'off-day1',
        status: 'In Progress',
        assignedTo: 'u-hr',
        dueDate: '2026-05-01',
        completedAt: null,
        completedBy: null,
        notes: '',
        blockers: '',
        auditLog: [],
      },
    ]
    const tasks = generateOffboardingTasksForEmployee({
      employee: emp(),
      templates: TEMPLATES,
      users: USERS,
      existing,
      context: ctx,
      now: NOW,
    })
    expect(tasks).toEqual(existing)
  })
})

describe('summariseOffboarding', () => {
  it('isOffboarded when all mandatory tasks Completed/NA', () => {
    const tasks: OffboardingTask[] = [
      task('a', 'off-day1', 'Completed'),
      task('b', 'off-day3', 'Completed'),
      task('c', 'off-kt', 'N/A'),
      task('d', 'off-lwd', 'Completed'),
      task('e', 'off-ff', 'Completed'),
      task('f', 'off-exit-interview', 'Completed'),
      task('g', 'off-optional', 'Not Started'), // optional, doesn't block
    ]
    const s = summariseOffboarding({ templates: TEMPLATES, tasks })
    expect(s.isOffboarded).toBe(true)
    expect(s.mandatoryRemaining).toBe(0)
  })

  it('not isOffboarded when at least one mandatory remains', () => {
    const tasks: OffboardingTask[] = [
      task('a', 'off-day1', 'Completed'),
      task('b', 'off-day3', 'Blocked'), // mandatory + blocked = remaining
    ]
    const s = summariseOffboarding({ templates: TEMPLATES, tasks })
    expect(s.isOffboarded).toBe(false)
    expect(s.mandatoryRemaining).toBe(1)
  })
})

describe('canUserSeeOffboardingTask', () => {
  const employee = emp({ id: 'emp-1', reportingManagerId: 'mgr-7' })
  const template = TEMPLATES.find((t) => t.id === 'off-exit-interview')

  it('HOD never sees exit interview task even if their direct report', () => {
    const t = task('t', 'off-exit-interview', 'Not Started', { assignedTo: 'u-hr' })
    expect(
      canUserSeeOffboardingTask({
        task: t,
        template,
        user: { id: 'mgr-7', role: 'HOD' },
        employee,
      }),
    ).toBe(false)
  })

  it('HOD sees handover tasks for their direct reports', () => {
    const handoverTpl = TEMPLATES.find((t) => t.id === 'off-day3')
    const t = task('t', 'off-day3', 'Not Started', { assignedTo: 'u-hr' })
    expect(
      canUserSeeOffboardingTask({
        task: t,
        template: handoverTpl,
        user: { id: 'mgr-7', role: 'HOD' },
        employee,
      }),
    ).toBe(true)
  })

  it('HR sees everything including exit interview', () => {
    const t = task('t', 'off-exit-interview', 'Not Started', { assignedTo: 'u-hr' })
    expect(
      canUserSeeOffboardingTask({
        task: t,
        template,
        user: { id: 'u-hr', role: 'HR' },
        employee,
      }),
    ).toBe(true)
  })
})

describe('canViewExitInterview / canEditExitInterview', () => {
  const session = (overrides: Record<string, string>) => ({
    sub: 'u',
    email: 'x@gsl.in',
    name: 'X',
    role: 'HR',
    iat: 0,
    exp: 0,
    ...overrides,
  })

  it('HR + Admin can view + edit', () => {
    expect(canViewExitInterview(session({ role: 'HR' }))).toBe(true)
    expect(canViewExitInterview(session({ role: 'Admin' }))).toBe(true)
    expect(canEditExitInterview(session({ role: 'HR' }))).toBe(true)
    expect(canEditExitInterview(session({ role: 'Admin' }))).toBe(true)
  })

  it('HOD blocked from view AND edit', () => {
    expect(canViewExitInterview(session({ role: 'HOD' }))).toBe(false)
    expect(canEditExitInterview(session({ role: 'HOD' }))).toBe(false)
  })

  it('Leadership view only via GSL_INTERVIEW_VIEWERS allowlist', () => {
    delete process.env.GSL_INTERVIEW_VIEWERS
    expect(canViewExitInterview(session({ role: 'Leadership' }))).toBe(false)
    process.env.GSL_INTERVIEW_VIEWERS = 'ameet.z@getsetlearn.info'
    expect(
      canViewExitInterview(session({ role: 'Leadership', email: 'ameet.z@getsetlearn.info' })),
    ).toBe(true)
    expect(
      canViewExitInterview(session({ role: 'Leadership', email: 'random@getsetlearn.info' })),
    ).toBe(false)
    delete process.env.GSL_INTERVIEW_VIEWERS
  })

  it('Leadership cannot edit even if allowlisted', () => {
    process.env.GSL_INTERVIEW_VIEWERS = 'ameet.z@getsetlearn.info'
    expect(
      canEditExitInterview(session({ role: 'Leadership', email: 'ameet.z@getsetlearn.info' })),
    ).toBe(false)
    delete process.env.GSL_INTERVIEW_VIEWERS
  })
})

describe('applyOffboardingTaskStatusChange', () => {
  it('Completed sets completedAt + audits', () => {
    const initial = task('t', 'off-day1', 'Not Started')
    const next = applyOffboardingTaskStatusChange({
      task: initial,
      status: 'Completed',
      byUser: 'u-hr',
      now: '2026-05-09T10:00:00Z',
    })
    expect(next.status).toBe('Completed')
    expect(next.completedAt).toBe('2026-05-09T10:00:00Z')
    expect(next.completedBy).toBe('u-hr')
    expect(next.auditLog[0]!.action).toBe('offboarding.task.update')
  })
})

function task(
  id: string,
  templateId: string,
  status: OffboardingTask['status'],
  overrides: Partial<OffboardingTask> = {},
): OffboardingTask {
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
