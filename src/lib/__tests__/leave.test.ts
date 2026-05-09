import { describe, expect, it } from 'vitest'
import {
  buildHolidayDateSetForEmployee,
  canApproveLeave,
  canReadLeave,
  computeTotalDays,
  eachDayIso,
  hasOverlapWithApproved,
  leaveYearForDate,
  proratedEntitlement,
  recalcBalance,
  splitPaidAndLOP,
} from '../leave'
import type { Employee, Holiday, LeaveApplication } from '../types'

describe('eachDayIso', () => {
  it('inclusive range', () => {
    expect(eachDayIso('2026-05-01', '2026-05-03')).toEqual(['2026-05-01', '2026-05-02', '2026-05-03'])
  })
  it('single day', () => {
    expect(eachDayIso('2026-05-09', '2026-05-09')).toEqual(['2026-05-09'])
  })
  it('end before start -> empty', () => {
    expect(eachDayIso('2026-05-09', '2026-05-08')).toEqual([])
  })
})

describe('leaveYearForDate', () => {
  it('Jan-Mar dates fall in the previous April-1 year', () => {
    expect(leaveYearForDate('2026-01-15')).toBe('2025-04-01')
    expect(leaveYearForDate('2026-03-31')).toBe('2025-04-01')
  })
  it('April 1 starts the new year', () => {
    expect(leaveYearForDate('2026-04-01')).toBe('2026-04-01')
    expect(leaveYearForDate('2026-04-15')).toBe('2026-04-01')
  })
  it('Dec dates fall in the same April-1 year', () => {
    expect(leaveYearForDate('2026-12-15')).toBe('2026-04-01')
  })
})

describe('computeTotalDays', () => {
  const noHols = new Set<string>()

  it('office-5day Mon-Fri spans 5 working days', () => {
    // 2026-05-04 Mon to 2026-05-08 Fri = 5 working days
    expect(
      computeTotalDays({
        startDate: '2026-05-04',
        endDate: '2026-05-08',
        workPattern: 'office-5day',
        hybridDays: [],
        holidayDateSet: noHols,
        isHalfDay: false,
      }),
    ).toBe(5)
  })

  it('office-5day spanning weekend skips Sat+Sun', () => {
    // 2026-05-08 Fri to 2026-05-11 Mon = Fri + Mon = 2 working days
    expect(
      computeTotalDays({
        startDate: '2026-05-08',
        endDate: '2026-05-11',
        workPattern: 'office-5day',
        hybridDays: [],
        holidayDateSet: noHols,
        isHalfDay: false,
      }),
    ).toBe(2)
  })

  it('trainer-6day skips only Sundays', () => {
    // 2026-05-04 Mon to 2026-05-10 Sun = 6 working days (Mon-Sat) + Sun off = 6
    expect(
      computeTotalDays({
        startDate: '2026-05-04',
        endDate: '2026-05-10',
        workPattern: 'trainer-6day',
        hybridDays: [],
        holidayDateSet: noHols,
        isHalfDay: false,
      }),
    ).toBe(6)
  })

  it('hybrid-2day Mon+Thu over a week counts only Mon and Thu', () => {
    expect(
      computeTotalDays({
        startDate: '2026-05-04',
        endDate: '2026-05-10',
        workPattern: 'hybrid-2day',
        hybridDays: [1, 4],
        holidayDateSet: noHols,
        isHalfDay: false,
      }),
    ).toBe(2)
  })

  it('field 6-day skips only Sunday', () => {
    expect(
      computeTotalDays({
        startDate: '2026-05-04',
        endDate: '2026-05-10',
        workPattern: 'field',
        hybridDays: [],
        holidayDateSet: noHols,
        isHalfDay: false,
      }),
    ).toBe(6)
  })

  it('remote 5-day skips Sat+Sun', () => {
    expect(
      computeTotalDays({
        startDate: '2026-05-04',
        endDate: '2026-05-10',
        workPattern: 'remote',
        hybridDays: [],
        holidayDateSet: noHols,
        isHalfDay: false,
      }),
    ).toBe(5)
  })

  it('holiday in the middle of a leave window does not count', () => {
    // Maharashtra Day 2026-05-01 Fri; office-5day; 2026-04-30 Thu to 2026-05-04 Mon
    // Thu, Fri (HOLIDAY skip), Sat (skip), Sun (skip), Mon = 2 working days
    const hols = new Set(['2026-05-01'])
    expect(
      computeTotalDays({
        startDate: '2026-04-30',
        endDate: '2026-05-04',
        workPattern: 'office-5day',
        hybridDays: [],
        holidayDateSet: hols,
        isHalfDay: false,
      }),
    ).toBe(2)
  })

  it('half-day on a weekday returns 0.5', () => {
    expect(
      computeTotalDays({
        startDate: '2026-05-04',
        endDate: '2026-05-04',
        workPattern: 'office-5day',
        hybridDays: [],
        holidayDateSet: noHols,
        isHalfDay: true,
      }),
    ).toBe(0.5)
  })

  it('half-day on a holiday returns 0', () => {
    expect(
      computeTotalDays({
        startDate: '2026-05-01',
        endDate: '2026-05-01',
        workPattern: 'office-5day',
        hybridDays: [],
        holidayDateSet: new Set(['2026-05-01']),
        isHalfDay: true,
      }),
    ).toBe(0)
  })

  it('half-day with start != end throws', () => {
    expect(() =>
      computeTotalDays({
        startDate: '2026-05-04',
        endDate: '2026-05-05',
        workPattern: 'office-5day',
        hybridDays: [],
        holidayDateSet: noHols,
        isHalfDay: true,
      }),
    ).toThrow()
  })
})

describe('hasOverlapWithApproved', () => {
  const apps: LeaveApplication[] = [
    app('a1', 'emp-1', '2026-05-04', '2026-05-08', 'Approved'),
    app('a2', 'emp-1', '2026-06-01', '2026-06-03', 'Submitted'),
    app('a3', 'emp-1', '2026-07-10', '2026-07-12', 'Rejected'),
    app('a4', 'emp-2', '2026-05-04', '2026-05-08', 'Approved'),
  ]

  it('detects exact overlap', () => {
    expect(
      hasOverlapWithApproved({
        applications: apps,
        employeeId: 'emp-1',
        startDate: '2026-05-04',
        endDate: '2026-05-08',
      })?.id,
    ).toBe('a1')
  })

  it('detects partial overlap', () => {
    expect(
      hasOverlapWithApproved({
        applications: apps,
        employeeId: 'emp-1',
        startDate: '2026-05-07',
        endDate: '2026-05-10',
      })?.id,
    ).toBe('a1')
  })

  it('flags Submitted leaves too', () => {
    expect(
      hasOverlapWithApproved({
        applications: apps,
        employeeId: 'emp-1',
        startDate: '2026-06-02',
        endDate: '2026-06-05',
      })?.id,
    ).toBe('a2')
  })

  it('ignores Rejected leaves', () => {
    expect(
      hasOverlapWithApproved({
        applications: apps,
        employeeId: 'emp-1',
        startDate: '2026-07-10',
        endDate: '2026-07-12',
      }),
    ).toBeNull()
  })

  it('isolates by employee', () => {
    expect(
      hasOverlapWithApproved({
        applications: apps,
        employeeId: 'emp-3',
        startDate: '2026-05-04',
        endDate: '2026-05-08',
      }),
    ).toBeNull()
  })

  it('excludes the application itself', () => {
    expect(
      hasOverlapWithApproved({
        applications: apps,
        employeeId: 'emp-1',
        startDate: '2026-05-04',
        endDate: '2026-05-08',
        excludeApplicationId: 'a1',
      }),
    ).toBeNull()
  })
})

describe('splitPaidAndLOP', () => {
  it('all paid when balance >= applying', () => {
    expect(splitPaidAndLOP({ applyingDays: 3, availableBalance: 5 })).toEqual({ paid: 3, lop: 0 })
  })

  it('partial LOP when applying > balance', () => {
    expect(splitPaidAndLOP({ applyingDays: 7, availableBalance: 4 })).toEqual({ paid: 4, lop: 3 })
  })

  it('all LOP when balance is 0 or negative', () => {
    expect(splitPaidAndLOP({ applyingDays: 4, availableBalance: 0 })).toEqual({ paid: 0, lop: 4 })
    expect(splitPaidAndLOP({ applyingDays: 4, availableBalance: -2 })).toEqual({ paid: 0, lop: 4 })
  })

  it('half-day overflow', () => {
    expect(splitPaidAndLOP({ applyingDays: 0.5, availableBalance: 0 })).toEqual({ paid: 0, lop: 0.5 })
  })
})

describe('proratedEntitlement', () => {
  it('full entitlement when joined before yearStart', () => {
    expect(
      proratedEntitlement({ fullEntitlement: 12, yearStart: '2026-04-01', joiningDate: '2025-01-15' }),
    ).toBe(12)
  })

  it('joined exactly on yearStart -> full', () => {
    expect(
      proratedEntitlement({ fullEntitlement: 12, yearStart: '2026-04-01', joiningDate: '2026-04-01' }),
    ).toBe(12)
  })

  it('joined Oct 1, 6 months remaining -> ~6', () => {
    const out = proratedEntitlement({
      fullEntitlement: 12,
      yearStart: '2026-04-01',
      joiningDate: '2026-10-01',
    })
    expect(out).toBeGreaterThan(5.9)
    expect(out).toBeLessThan(6.1)
  })

  it('null joining date -> full', () => {
    expect(
      proratedEntitlement({ fullEntitlement: 12, yearStart: '2026-04-01', joiningDate: null }),
    ).toBe(12)
  })

  it('joined past year-end -> 0', () => {
    expect(
      proratedEntitlement({
        fullEntitlement: 12,
        yearStart: '2026-04-01',
        joiningDate: '2027-04-15',
      }),
    ).toBe(0)
  })
})

describe('recalcBalance', () => {
  const yearStart = '2026-04-01'

  it('zero applications -> full balance', () => {
    const b = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: yearStart,
      applications: [],
    })
    expect(b.casual).toEqual({ entitlement: 12, taken: 0, pending: 0, balance: 12 })
    expect(b.sick).toEqual({ entitlement: 12, taken: 0, pending: 0, balance: 12 })
    expect(b.unpaid.taken).toBe(0)
  })

  it('sums Approved into taken, Submitted into pending', () => {
    const apps: LeaveApplication[] = [
      app('a', 'emp-1', '2026-05-04', '2026-05-05', 'Approved', { totalDays: 2 }),
      app('b', 'emp-1', '2026-06-04', '2026-06-04', 'Submitted', { totalDays: 1 }),
      app('c', 'emp-1', '2026-07-04', '2026-07-04', 'Rejected', { totalDays: 1 }),
    ]
    const b = recalcBalance({ employeeId: 'emp-1', leaveYearStart: yearStart, applications: apps })
    expect(b.casual.taken).toBe(2)
    expect(b.casual.pending).toBe(1)
    expect(b.casual.balance).toBe(9)
  })

  it('LOP days do not deplete the bucket', () => {
    const apps: LeaveApplication[] = [
      app('a', 'emp-1', '2026-05-04', '2026-05-08', 'Approved', { totalDays: 5, lossOfPayDays: 2 }),
    ]
    const b = recalcBalance({ employeeId: 'emp-1', leaveYearStart: yearStart, applications: apps })
    // 3 days deplete the casual bucket; 2 days go to unpaid via LOP overflow.
    expect(b.casual.taken).toBe(3)
    expect(b.casual.balance).toBe(9)
    expect(b.unpaid.taken).toBe(2)
  })

  it('respects custom (prorated) entitlement', () => {
    const b = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: yearStart,
      applications: [],
      entitlements: { casual: 6, sick: 6 },
    })
    expect(b.casual.entitlement).toBe(6)
    expect(b.casual.balance).toBe(6)
  })

  it('isolates by employee and year', () => {
    const apps: LeaveApplication[] = [
      app('a', 'emp-1', '2026-05-04', '2026-05-04', 'Approved', { totalDays: 1 }),
      app('b', 'emp-2', '2026-05-04', '2026-05-04', 'Approved', { totalDays: 1 }),
      app('c', 'emp-1', '2025-05-04', '2025-05-04', 'Approved', { totalDays: 1 }), // prior year
    ]
    const b = recalcBalance({ employeeId: 'emp-1', leaveYearStart: yearStart, applications: apps })
    expect(b.casual.taken).toBe(1)
  })
})

describe('canReadLeave / canApproveLeave', () => {
  const employee: Employee = {
    id: 'emp-1',
    employeeCode: 'X/1',
    name: 'Direct Report',
    email: 'd@gsl',
    designation: 'Eng',
    department: 'Tech',
    location: 'Mumbai',
    reportingManagerId: 'mgr-7',
    dateOfJoining: '2026-04-01',
    status: 'Active',
    createdAt: '2026-04-01',
    createdBy: 's',
    auditLog: [],
  } as Employee

  const a = app('lv', 'emp-1', '2026-05-04', '2026-05-04', 'Submitted')

  it('Admin/HR/Leadership read all', () => {
    expect(canReadLeave({ app: a, user: { id: 'x', role: 'Admin' }, employee })).toBe(true)
    expect(canReadLeave({ app: a, user: { id: 'x', role: 'HR' }, employee })).toBe(true)
    expect(canReadLeave({ app: a, user: { id: 'x', role: 'Leadership' }, employee })).toBe(true)
  })

  it('Employee reads only their own', () => {
    expect(canReadLeave({ app: a, user: { id: 'emp-1', role: 'Employee' }, employee })).toBe(true)
    expect(canReadLeave({ app: a, user: { id: 'emp-2', role: 'Employee' }, employee })).toBe(false)
  })

  it('HOD reads only their direct reports', () => {
    expect(canReadLeave({ app: a, user: { id: 'mgr-7', role: 'HOD' }, employee })).toBe(true)
    expect(canReadLeave({ app: a, user: { id: 'mgr-elsewhere', role: 'HOD' }, employee })).toBe(false)
  })

  it('canApproveLeave: HOD can approve direct reports but not themselves', () => {
    expect(canApproveLeave({ app: a, user: { id: 'mgr-7', role: 'HOD' }, employee })).toBe(true)
    const selfApp = app('lv', 'mgr-7', '2026-05-04', '2026-05-04', 'Submitted')
    expect(canApproveLeave({ app: selfApp, user: { id: 'mgr-7', role: 'HOD' }, employee })).toBe(false)
  })

  it('Employee never approves anything', () => {
    expect(canApproveLeave({ app: a, user: { id: 'emp-2', role: 'Employee' }, employee })).toBe(false)
  })

  it('canApproveLeave: Leadership cannot approve (read-only on dashboards)', () => {
    expect(canApproveLeave({ app: a, user: { id: 'x', role: 'Leadership' }, employee })).toBe(false)
  })
})

describe('buildHolidayDateSetForEmployee', () => {
  const holidays: Holiday[] = [
    { id: 'h-mand', date: '2026-05-01', name: 'Maharashtra Day', type: 'mandatory', regions: ['national'], createdAt: 'x', createdBy: 'x', auditLog: [] },
    { id: 'h-opt', date: '2026-12-25', name: 'Christmas', type: 'optional', regions: ['national'], createdAt: 'x', createdBy: 'x', auditLog: [] },
  ]

  it('mandatory always included; optional only when picked', () => {
    const set = buildHolidayDateSetForEmployee({
      holidays,
      picks: [{ employeeId: 'e1', holidayId: 'h-opt', year: 2026, selectedAt: 'x', selectedBy: 'x' }],
      employeeId: 'e1',
      year: 2026,
    })
    expect(set.has('2026-05-01')).toBe(true)
    expect(set.has('2026-12-25')).toBe(true)
  })

  it('different employee\'s pick does not bleed', () => {
    const set = buildHolidayDateSetForEmployee({
      holidays,
      picks: [{ employeeId: 'e2', holidayId: 'h-opt', year: 2026, selectedAt: 'x', selectedBy: 'x' }],
      employeeId: 'e1',
      year: 2026,
    })
    expect(set.has('2026-12-25')).toBe(false)
  })
})

// helper
function app(
  id: string,
  employeeId: string,
  startDate: string,
  endDate: string,
  status: LeaveApplication['status'],
  overrides: Partial<LeaveApplication> = {},
): LeaveApplication {
  return {
    id,
    employeeId,
    leaveType: 'casual',
    startDate,
    endDate,
    totalDays: 1,
    reason: 'test',
    isHalfDay: false,
    status,
    appliedAt: '2026-04-01T00:00:00Z',
    appliedBy: employeeId,
    submittedAt: status === 'Draft' ? null : '2026-04-01T00:00:00Z',
    approvedBy: status === 'Approved' ? 'mgr-7' : null,
    approvedAt: status === 'Approved' ? '2026-04-02T00:00:00Z' : null,
    rejectionReason: null,
    recallReason: null,
    isEmergency: false,
    lossOfPayDays: 0,
    auditLog: [],
    ...overrides,
  }
}
