import { describe, expect, it } from 'vitest'
import { buildAlertActions, isCategoryEnabled } from '../alerts'
import type {
  AlertLogEntry,
  AlertPreferences,
  Employee,
  EmployeeDocument,
  LeaveApplication,
  OffboardingTask,
  OffboardingTaskTemplate,
  OnboardingTask,
  OnboardingTaskTemplate,
} from '../types'

const NOW = new Date('2026-05-09T00:00:00Z')

const PREFS: AlertPreferences = {
  enabled: {},
  extraRecipients: [],
  globalEnabled: true,
  updatedAt: '',
}

function emp(o: Partial<Employee> = {}): Employee {
  return {
    id: o.id ?? 'e',
    employeeCode: o.employeeCode ?? 'X/0',
    name: o.name ?? 'Direct Report',
    email: o.email ?? 'd@gsl.in',
    designation: 'Eng',
    department: 'Tech',
    location: 'Mumbai',
    dateOfJoining: o.dateOfJoining ?? '2025-01-01',
    status: o.status ?? 'Active',
    createdAt: '2025-01-01',
    createdBy: 's',
    auditLog: [],
    ...o,
  } as Employee
}

const HR_RECIPIENTS = ['hr@gsl.in']

describe('isCategoryEnabled', () => {
  it('respects globalEnabled kill switch', () => {
    expect(
      isCategoryEnabled({ ...PREFS, globalEnabled: false }, 'document-expiry'),
    ).toBe(false)
  })
  it('defaults to enabled when key missing', () => {
    expect(isCategoryEnabled(PREFS, 'document-expiry')).toBe(true)
  })
  it('respects per-category disable', () => {
    expect(
      isCategoryEnabled({ ...PREFS, enabled: { 'document-expiry': false } }, 'document-expiry'),
    ).toBe(false)
  })
})

describe('buildAlertActions — document expiry', () => {
  const employees = [emp({ id: 'a', personalEmail: 'a@p.in' })]
  function docExpiringIn(days: number): EmployeeDocument {
    const date = new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return {
      id: 'doc1',
      employeeId: 'a',
      templateId: 'tpl-passport',
      uploadedAt: '2026-01-01',
      uploadedBy: 'hr',
      filePath: 'data/hr-documents/a/x.pdf',
      originalFileName: 'passport.pdf',
      fileSize: 100,
      expiresAt: date,
      verified: true,
      auditLog: [],
    }
  }

  it('fires at 30, 14, 7 days windows', () => {
    for (const days of [30, 14, 7]) {
      const actions = buildAlertActions({
        now: NOW,
        prefs: PREFS,
        log: [],
        employees,
        documents: [docExpiringIn(days)],
        onboardingTasks: [],
        onboardingTemplates: [],
        offboardingTasks: [],
        offboardingTemplates: [],
        leaveApplications: [],
        hrRecipients: HR_RECIPIENTS,
      })
      const docAlert = actions.find((a) => a.category === 'document-expiry')
      expect(docAlert, `${days}-day window`).toBeTruthy()
      expect(docAlert!.triggerKey).toContain(`${days}d`)
    }
  })

  it('does not fire on other days', () => {
    const actions = buildAlertActions({
      now: NOW,
      prefs: PREFS,
      log: [],
      employees,
      documents: [docExpiringIn(20)],
      onboardingTasks: [],
      onboardingTemplates: [],
      offboardingTasks: [],
      offboardingTemplates: [],
      leaveApplications: [],
      hrRecipients: HR_RECIPIENTS,
    })
    expect(actions.find((a) => a.category === 'document-expiry')).toBeUndefined()
  })

  it('idempotent — same triggerKey in log skips the alert', () => {
    const doc = docExpiringIn(30)
    const log: AlertLogEntry[] = [
      {
        id: 'al-1',
        category: 'document-expiry',
        triggerKey: `document-expiry:${doc.id}:30d:${NOW.toISOString().slice(0, 10)}`,
        recipients: ['hr@gsl.in'],
        firedAt: NOW.toISOString(),
      },
    ]
    const actions = buildAlertActions({
      now: NOW,
      prefs: PREFS,
      log,
      employees,
      documents: [doc],
      onboardingTasks: [],
      onboardingTemplates: [],
      offboardingTasks: [],
      offboardingTemplates: [],
      leaveApplications: [],
      hrRecipients: HR_RECIPIENTS,
    })
    expect(actions.find((a) => a.category === 'document-expiry')).toBeUndefined()
  })

  it('skips documents with null expiry (V5 edge state)', () => {
    const doc = { ...docExpiringIn(30), expiresAt: null }
    const actions = buildAlertActions({
      now: NOW,
      prefs: PREFS,
      log: [],
      employees,
      documents: [doc],
      onboardingTasks: [],
      onboardingTemplates: [],
      offboardingTasks: [],
      offboardingTemplates: [],
      leaveApplications: [],
      hrRecipients: HR_RECIPIENTS,
    })
    expect(actions.find((a) => a.category === 'document-expiry')).toBeUndefined()
  })

  it('skips when employee has no email AND no extraRecipients (V5)', () => {
    const employees = [emp({ id: 'a', email: '', personalEmail: null })]
    const actions = buildAlertActions({
      now: NOW,
      prefs: PREFS,
      log: [],
      employees,
      documents: [docExpiringIn(30)],
      onboardingTasks: [],
      onboardingTemplates: [],
      offboardingTasks: [],
      offboardingTemplates: [],
      leaveApplications: [],
      hrRecipients: [], // no HR fallback either
    })
    expect(actions.find((a) => a.category === 'document-expiry')).toBeUndefined()
  })
})

describe('buildAlertActions — probation review', () => {
  it('fires 7 days before probation ends', () => {
    // Probation = 6 months from join. Joining 2025-11-16 -> probation ends 2026-05-16
    // 7 days before = 2026-05-09 = NOW.
    const employees = [
      emp({ id: 'a', dateOfJoining: '2025-11-16', confirmationDate: null, reportingManagerId: 'mgr' }),
      emp({ id: 'mgr', email: 'mgr@gsl.in' }),
    ]
    const actions = buildAlertActions({
      now: NOW,
      prefs: PREFS,
      log: [],
      employees,
      documents: [],
      onboardingTasks: [],
      onboardingTemplates: [],
      offboardingTasks: [],
      offboardingTemplates: [],
      leaveApplications: [],
      hrRecipients: HR_RECIPIENTS,
    })
    const probAlert = actions.find((a) => a.category === 'probation-review')
    expect(probAlert).toBeTruthy()
    expect(probAlert!.recipients).toContain('mgr@gsl.in')
  })
})

describe('buildAlertActions — onboarding overdue', () => {
  it('fires when task overdue by exactly 3 days', () => {
    const overdueDate = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const tasks: OnboardingTask[] = [
      {
        id: 'ot1',
        employeeId: 'a',
        templateId: 't1',
        status: 'Not Started',
        assignedTo: null,
        dueDate: overdueDate,
        completedAt: null,
        completedBy: null,
        notes: '',
        blockers: '',
        auditLog: [],
      },
    ]
    const tpls: OnboardingTaskTemplate[] = [
      { id: 't1', name: 'X', category: 'HR Formalities', isMandatory: true, defaultAssignee: 'HR', daysFromJoining: 0, estimatedMinutes: 10 },
    ]
    const actions = buildAlertActions({
      now: NOW,
      prefs: PREFS,
      log: [],
      employees: [emp({ id: 'a' })],
      documents: [],
      onboardingTasks: tasks,
      onboardingTemplates: tpls,
      offboardingTasks: [],
      offboardingTemplates: [],
      leaveApplications: [],
      hrRecipients: HR_RECIPIENTS,
    })
    expect(actions.find((a) => a.category === 'onboarding-overdue')).toBeTruthy()
  })

  it('skips Completed and N/A tasks', () => {
    const overdueDate = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const tasks: OnboardingTask[] = [
      {
        id: 'ot1',
        employeeId: 'a',
        templateId: 't1',
        status: 'Completed',
        assignedTo: null,
        dueDate: overdueDate,
        completedAt: '2026-04-01',
        completedBy: 'hr',
        notes: '',
        blockers: '',
        auditLog: [],
      },
    ]
    const actions = buildAlertActions({
      now: NOW,
      prefs: PREFS,
      log: [],
      employees: [emp({ id: 'a' })],
      documents: [],
      onboardingTasks: tasks,
      onboardingTemplates: [],
      offboardingTasks: [],
      offboardingTemplates: [],
      leaveApplications: [],
      hrRecipients: HR_RECIPIENTS,
    })
    expect(actions.find((a) => a.category === 'onboarding-overdue')).toBeUndefined()
  })
})

describe('buildAlertActions — offboarding LWD', () => {
  it('fires 14 days before LWD-pegged task due date', () => {
    const lwd = new Date(NOW.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const tpls: OffboardingTaskTemplate[] = [
      {
        id: 'off-lwd',
        name: 'Asset return',
        category: 'Last Day',
        isMandatory: true,
        defaultAssignee: 'IT',
        daysFromNoticeStart: 0,
        pegToLwd: true,
        estimatedMinutes: 30,
      },
    ]
    const tasks: OffboardingTask[] = [
      {
        id: 'oft1',
        employeeId: 'a',
        templateId: 'off-lwd',
        status: 'Not Started',
        assignedTo: null,
        dueDate: lwd,
        completedAt: null,
        completedBy: null,
        notes: '',
        blockers: '',
        auditLog: [],
      },
    ]
    const actions = buildAlertActions({
      now: NOW,
      prefs: PREFS,
      log: [],
      employees: [emp({ id: 'a', reportingManagerId: 'mgr' }), emp({ id: 'mgr', email: 'mgr@gsl.in' })],
      documents: [],
      onboardingTasks: [],
      onboardingTemplates: [],
      offboardingTasks: tasks,
      offboardingTemplates: tpls,
      leaveApplications: [],
      hrRecipients: HR_RECIPIENTS,
    })
    expect(actions.find((a) => a.category === 'offboarding-lwd')).toBeTruthy()
  })
})

describe('buildAlertActions — leave pending > 24h', () => {
  it('fires when Submitted at > 24h ago', () => {
    const submittedAt = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString()
    const apps: LeaveApplication[] = [
      {
        id: 'lv1',
        employeeId: 'a',
        leaveType: 'casual',
        startDate: '2026-05-15',
        endDate: '2026-05-15',
        totalDays: 1,
        reason: '',
        isHalfDay: false,
        status: 'Submitted',
        appliedAt: submittedAt,
        appliedBy: 'a',
        submittedAt,
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
        recallReason: null,
        isEmergency: false,
        lossOfPayDays: 0,
        auditLog: [],
      },
    ]
    const actions = buildAlertActions({
      now: NOW,
      prefs: PREFS,
      log: [],
      employees: [emp({ id: 'a' })],
      documents: [],
      onboardingTasks: [],
      onboardingTemplates: [],
      offboardingTasks: [],
      offboardingTemplates: [],
      leaveApplications: apps,
      hrRecipients: HR_RECIPIENTS,
    })
    expect(actions.find((a) => a.category === 'leave-pending-24h')).toBeTruthy()
  })

  it('skips fresh (< 24h) submissions', () => {
    const submittedAt = new Date(NOW.getTime() - 1 * 60 * 60 * 1000).toISOString()
    const apps: LeaveApplication[] = [
      {
        id: 'lv1',
        employeeId: 'a',
        leaveType: 'casual',
        startDate: '2026-05-15',
        endDate: '2026-05-15',
        totalDays: 1,
        reason: '',
        isHalfDay: false,
        status: 'Submitted',
        appliedAt: submittedAt,
        appliedBy: 'a',
        submittedAt,
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
        recallReason: null,
        isEmergency: false,
        lossOfPayDays: 0,
        auditLog: [],
      },
    ]
    const actions = buildAlertActions({
      now: NOW,
      prefs: PREFS,
      log: [],
      employees: [emp({ id: 'a' })],
      documents: [],
      onboardingTasks: [],
      onboardingTemplates: [],
      offboardingTasks: [],
      offboardingTemplates: [],
      leaveApplications: apps,
      hrRecipients: HR_RECIPIENTS,
    })
    expect(actions.find((a) => a.category === 'leave-pending-24h')).toBeUndefined()
  })
})

describe('buildAlertActions — daily HR digest', () => {
  it('always fires (once per day) when there are HR recipients', () => {
    const actions = buildAlertActions({
      now: NOW,
      prefs: PREFS,
      log: [],
      employees: [],
      documents: [],
      onboardingTasks: [],
      onboardingTemplates: [],
      offboardingTasks: [],
      offboardingTemplates: [],
      leaveApplications: [],
      hrRecipients: HR_RECIPIENTS,
    })
    const digest = actions.find((a) => a.category === 'daily-hr-digest')
    expect(digest).toBeTruthy()
    expect(digest!.triggerKey).toBe('daily-hr-digest:2026-05-09')
  })

  it('skipped twice on the same day (idempotent)', () => {
    const log: AlertLogEntry[] = [
      {
        id: 'd1',
        category: 'daily-hr-digest',
        triggerKey: 'daily-hr-digest:2026-05-09',
        recipients: ['hr@gsl.in'],
        firedAt: NOW.toISOString(),
      },
    ]
    const actions = buildAlertActions({
      now: NOW,
      prefs: PREFS,
      log,
      employees: [],
      documents: [],
      onboardingTasks: [],
      onboardingTemplates: [],
      offboardingTasks: [],
      offboardingTemplates: [],
      leaveApplications: [],
      hrRecipients: HR_RECIPIENTS,
    })
    expect(actions.find((a) => a.category === 'daily-hr-digest')).toBeUndefined()
  })

  it('skipped when no HR recipients (V5 edge)', () => {
    const actions = buildAlertActions({
      now: NOW,
      prefs: PREFS,
      log: [],
      employees: [],
      documents: [],
      onboardingTasks: [],
      onboardingTemplates: [],
      offboardingTasks: [],
      offboardingTemplates: [],
      leaveApplications: [],
      hrRecipients: [],
    })
    expect(actions.find((a) => a.category === 'daily-hr-digest')).toBeUndefined()
  })
})

describe('buildAlertActions — global kill switch', () => {
  it('zero alerts when globalEnabled=false', () => {
    const actions = buildAlertActions({
      now: NOW,
      prefs: { ...PREFS, globalEnabled: false },
      log: [],
      employees: [emp({ id: 'a' })],
      documents: [],
      onboardingTasks: [],
      onboardingTemplates: [],
      offboardingTasks: [],
      offboardingTemplates: [],
      leaveApplications: [],
      hrRecipients: HR_RECIPIENTS,
    })
    expect(actions).toHaveLength(0)
  })

  it('per-category disable suppresses just that category', () => {
    const actions = buildAlertActions({
      now: NOW,
      prefs: { ...PREFS, enabled: { 'daily-hr-digest': false } },
      log: [],
      employees: [],
      documents: [],
      onboardingTasks: [],
      onboardingTemplates: [],
      offboardingTasks: [],
      offboardingTemplates: [],
      leaveApplications: [],
      hrRecipients: HR_RECIPIENTS,
    })
    expect(actions.find((a) => a.category === 'daily-hr-digest')).toBeUndefined()
  })
})
