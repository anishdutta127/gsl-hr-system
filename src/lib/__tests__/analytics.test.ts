import { describe, expect, it } from 'vitest'
import {
  buildAttendanceWidget,
  buildAttritionWidget,
  buildHeadcountWidget,
  buildHrOpsMetricsWidget,
  buildLeaveUtilisationWidget,
} from '../analytics'
import type {
  AttendanceException,
  DocumentTemplate,
  Employee,
  EmployeeDocument,
  ExitInterview,
  LeaveApplication,
  OffboardingTask,
  OnboardingTask,
  OnboardingTaskTemplate,
} from '../types'

const NOW = new Date('2026-05-09T00:00:00Z')

function emp(o: Partial<Employee> = {}): Employee {
  return {
    id: o.id ?? 'e',
    employeeCode: o.employeeCode ?? 'X/0',
    name: o.name ?? 'X',
    email: o.email ?? 'x@x',
    designation: o.designation ?? 'Eng',
    department: o.department ?? 'Tech',
    location: o.location ?? 'Mumbai',
    dateOfJoining: o.dateOfJoining ?? '2025-01-01',
    status: o.status ?? 'Active',
    createdAt: '2025-01-01',
    createdBy: 's',
    auditLog: [],
    ...o,
  } as Employee
}

const FILTER = {
  rangeStart: '2025-05-09',
  rangeEnd: '2026-05-09',
}

describe('buildHeadcountWidget', () => {
  it('counts active vs exited and breaks down by dept', () => {
    const employees = [
      emp({ id: 'a', department: 'Tech' }),
      emp({ id: 'b', department: 'Tech' }),
      emp({ id: 'c', department: 'Sales' }),
      emp({ id: 'd', department: 'Sales', status: 'Exited' }),
    ]
    const w = buildHeadcountWidget({ employees, filter: FILTER, now: NOW })
    expect(w.active).toBe(3)
    expect(w.exited).toBe(1)
    expect(w.byDepartment).toEqual([
      { key: 'Tech', count: 2 },
      { key: 'Sales', count: 1 },
    ])
  })

  it('respects department filter', () => {
    const employees = [
      emp({ id: 'a', department: 'Tech' }),
      emp({ id: 'b', department: 'Sales' }),
    ]
    const w = buildHeadcountWidget({
      employees,
      filter: { ...FILTER, department: 'Tech' },
      now: NOW,
    })
    expect(w.active).toBe(1)
  })

  it('emits 12 trend points', () => {
    const w = buildHeadcountWidget({
      employees: [emp({ id: 'a', dateOfJoining: '2024-01-01' })],
      filter: FILTER,
      now: NOW,
    })
    expect(w.trend12Months).toHaveLength(12)
  })
})

describe('buildAttritionWidget', () => {
  const employees: Employee[] = [
    emp({
      id: 'a',
      status: 'Exited',
      dateOfJoining: '2023-01-01',
      exit: { lastWorkingDay: '2026-04-15', reason: 'Better opportunity', relievingLetterIssued: true, experienceLetterIssued: true },
    }),
    emp({ id: 'b', status: 'Active' }),
  ]
  const interviews: ExitInterview[] = [
    {
      employeeId: 'a',
      conductedAt: '2026-04-15',
      conductedBy: 'hr',
      reasonForLeaving: 'Better opportunity',
      wouldRecommend: 'Yes',
      satisfactionWithManager: 5,
      satisfactionWithRole: 4,
      topThingsToChange: '',
      freeText: '',
      auditLog: [],
    },
  ]

  it('counts exits in the last 90 days', () => {
    const w = buildAttritionWidget({ employees, exitInterviews: interviews, filter: FILTER, now: NOW })
    expect(w.exitsLast90Days).toBe(1)
    expect(w.attritionRate).toBeGreaterThan(0)
  })

  it('reports avg tenure at exit', () => {
    const w = buildAttritionWidget({ employees, exitInterviews: interviews, filter: FILTER, now: NOW })
    expect(w.avgTenureYearsAtExit).not.toBeNull()
    expect(w.avgTenureYearsAtExit!).toBeGreaterThan(2)
    expect(w.avgTenureYearsAtExit!).toBeLessThan(5)
  })

  it('rolls up reasons from interviews', () => {
    const w = buildAttritionWidget({ employees, exitInterviews: interviews, filter: FILTER, now: NOW })
    expect(w.topReasons[0]?.reason).toBe('Better opportunity')
  })

  it('zero-exit case returns 0 attrition rate', () => {
    const onlyActive = [emp({ id: 'a' })]
    const w = buildAttritionWidget({
      employees: onlyActive,
      exitInterviews: [],
      filter: FILTER,
      now: NOW,
    })
    expect(w.exitsLast90Days).toBe(0)
    expect(w.attritionRate).toBe(0)
  })
})

describe('buildAttendanceWidget', () => {
  it('present rate goes down as exceptions go up', () => {
    const employees = [emp({ id: 'a' }), emp({ id: 'b' })]
    const exceptions: AttendanceException[] = [
      { id: 'x1', employeeId: 'a', date: '2026-05-01', type: 'late', notes: '', loggedBy: 'hr', loggedAt: '2026-05-01T00:00:00Z', auditLog: [] },
      { id: 'x2', employeeId: 'a', date: '2026-05-02', type: 'absent', notes: '', loggedBy: 'hr', loggedAt: '2026-05-02T00:00:00Z', auditLog: [] },
    ]
    const w = buildAttendanceWidget({
      employees,
      exceptions,
      filter: { rangeStart: '2026-05-01', rangeEnd: '2026-05-02' },
    })
    // 2 emps × 2 days = 4 emp-days; 2 exceptions; rate = 50%
    expect(w.presentRate).toBe(50)
  })

  it('groups top exception types', () => {
    const employees = [emp({ id: 'a' })]
    const exceptions: AttendanceException[] = [
      { id: '1', employeeId: 'a', date: '2026-05-01', type: 'late', notes: '', loggedBy: 'hr', loggedAt: '', auditLog: [] },
      { id: '2', employeeId: 'a', date: '2026-05-02', type: 'late', notes: '', loggedBy: 'hr', loggedAt: '', auditLog: [] },
      { id: '3', employeeId: 'a', date: '2026-05-03', type: 'absent', notes: '', loggedBy: 'hr', loggedAt: '', auditLog: [] },
    ]
    const w = buildAttendanceWidget({
      employees,
      exceptions,
      filter: { rangeStart: '2026-05-01', rangeEnd: '2026-05-31' },
    })
    expect(w.topExceptions[0]).toEqual({ type: 'late', count: 2 })
  })
})

describe('buildLeaveUtilisationWidget', () => {
  const employees = [emp({ id: 'a' }), emp({ id: 'b' })]
  const apps: LeaveApplication[] = [
    {
      id: '1',
      employeeId: 'a',
      leaveType: 'casual',
      startDate: '2026-04-15',
      endDate: '2026-04-15',
      totalDays: 1,
      reason: '',
      isHalfDay: false,
      status: 'Approved',
      appliedAt: '2026-04-01',
      appliedBy: 'a',
      submittedAt: '2026-04-01',
      approvedBy: 'mgr',
      approvedAt: '2026-04-02',
      rejectionReason: null,
      recallReason: null,
      isEmergency: false,
      lossOfPayDays: 0,
      auditLog: [],
    },
  ]

  it('totals + utilisation %', () => {
    const w = buildLeaveUtilisationWidget({ employees, applications: apps, filter: FILTER, now: NOW })
    expect(w.totalEntitled).toBe(48) // 2 emps × 24
    expect(w.totalTaken).toBe(1)
    expect(w.utilisationPct).toBeCloseTo((1 / 48) * 100, 1)
  })

  it('predicted year-end utilisation extrapolates run-rate', () => {
    const w = buildLeaveUtilisationWidget({ employees, applications: apps, filter: FILTER, now: NOW })
    expect(w.predictedYearEndUtilisationPct).toBeGreaterThanOrEqual(w.utilisationPct)
  })

  it('balance distribution buckets cover everyone', () => {
    const w = buildLeaveUtilisationWidget({ employees, applications: apps, filter: FILTER, now: NOW })
    const total = w.balanceDistribution.reduce((acc, b) => acc + b.count, 0)
    expect(total).toBe(2)
  })
})

describe('buildHrOpsMetricsWidget', () => {
  const employees = [
    emp({ id: 'a', dateOfJoining: '2026-04-01' }),
    emp({ id: 'b', dateOfJoining: '2026-04-05' }),
  ]
  const onbTpls: OnboardingTaskTemplate[] = [
    { id: 't', name: 'X', category: 'HR Formalities', isMandatory: true, defaultAssignee: 'HR', daysFromJoining: 1, estimatedMinutes: 10 },
  ]
  const onbTasks: OnboardingTask[] = [
    {
      id: 'ot1',
      employeeId: 'a',
      templateId: 't',
      status: 'Completed',
      assignedTo: null,
      dueDate: '2026-04-02',
      completedAt: '2026-04-02T00:00:00Z',
      completedBy: 'hr',
      notes: '',
      blockers: '',
      auditLog: [],
    },
  ]
  const offTasks: OffboardingTask[] = []
  const docTpls: DocumentTemplate[] = [
    { id: 'd-pan', name: 'PAN', category: 'identity', isMandatory: true, hasExpiry: false },
  ]
  const docs: EmployeeDocument[] = [
    {
      id: 'doc1',
      employeeId: 'a',
      templateId: 'd-pan',
      uploadedAt: '2026-04-01',
      uploadedBy: 'hr',
      filePath: 'data/hr-documents/a/x.pdf',
      originalFileName: 'pan.pdf',
      fileSize: 100,
      verified: true,
      auditLog: [],
    },
  ]

  it('on-time tasks pct + document compliance', () => {
    const w = buildHrOpsMetricsWidget({
      employees,
      onboardingTasks: onbTasks,
      onboardingTemplates: onbTpls,
      offboardingTasks: offTasks,
      documents: docs,
      documentTemplates: docTpls,
      filter: FILTER,
      now: NOW,
    })
    expect(w.pctOnboardingTasksOnTime).toBe(100)
    // 1 of 2 employees has the mandatory PAN
    expect(w.documentComplianceRate).toBe(50)
  })
})
