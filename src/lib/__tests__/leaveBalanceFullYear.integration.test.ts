/*
 * V3 critical math test: walks one full leave year for a single employee
 * and confirms the balance is rupee-perfect at every checkpoint.
 *
 * Inspired by the brief's "analogous to Pranav's recalc engine test."
 * The point is to catch silent off-by-one errors in date math, weekend
 * skipping, holiday handling, half-day arithmetic, and LOP overflow when
 * applied across many small applications.
 */

import { describe, expect, it } from 'vitest'
import {
  buildHolidayDateSetForEmployee,
  computeTotalDays,
  recalcBalance,
  splitPaidAndLOP,
} from '../leave'
import type { Holiday, LeaveApplication } from '../types'

const HOLIDAYS_2026: Holiday[] = [
  { id: 'h-new-year', date: '2026-01-01', name: 'New Year', type: 'mandatory', regions: ['national'], createdAt: 'x', createdBy: 'x', auditLog: [] },
  { id: 'h-republic', date: '2026-01-26', name: 'Republic Day', type: 'mandatory', regions: ['national'], createdAt: 'x', createdBy: 'x', auditLog: [] },
  { id: 'h-holi', date: '2026-03-03', name: 'Holi', type: 'mandatory', regions: ['national'], createdAt: 'x', createdBy: 'x', auditLog: [] },
  { id: 'h-maha', date: '2026-05-01', name: 'Maharashtra Day', type: 'mandatory', regions: ['national'], createdAt: 'x', createdBy: 'x', auditLog: [] },
  { id: 'h-janma', date: '2026-09-04', name: 'Janmashtami', type: 'mandatory', regions: ['national'], createdAt: 'x', createdBy: 'x', auditLog: [] },
  { id: 'h-ganesh', date: '2026-09-14', name: 'Ganesh Chaturthi', type: 'mandatory', regions: ['national'], createdAt: 'x', createdBy: 'x', auditLog: [] },
  { id: 'h-gandhi', date: '2026-10-02', name: 'Gandhi Jayanti', type: 'mandatory', regions: ['national'], createdAt: 'x', createdBy: 'x', auditLog: [] },
  { id: 'h-dussehra', date: '2026-10-20', name: 'Dussehra', type: 'mandatory', regions: ['national'], createdAt: 'x', createdBy: 'x', auditLog: [] },
  { id: 'h-govardhan', date: '2026-11-09', name: 'Govardhan Puja', type: 'mandatory', regions: ['national'], createdAt: 'x', createdBy: 'x', auditLog: [] },
  { id: 'h-diwali-1', date: '2026-11-10', name: 'Diwali Padwa New Year', type: 'mandatory', regions: ['national'], createdAt: 'x', createdBy: 'x', auditLog: [] },
  { id: 'h-diwali-2', date: '2026-11-11', name: 'Diwali Padwa Bhai Dhuj', type: 'mandatory', regions: ['national'], createdAt: 'x', createdBy: 'x', auditLog: [] },
]

const YEAR_START = '2026-04-01'

function leaveApp(overrides: Partial<LeaveApplication> & {
  id: string
  startDate: string
  endDate: string
  status: LeaveApplication['status']
  totalDays: number
  leaveType?: LeaveApplication['leaveType']
}): LeaveApplication {
  return {
    employeeId: 'emp-1',
    leaveType: overrides.leaveType ?? 'casual',
    reason: 'test',
    isHalfDay: false,
    appliedAt: '2026-04-01T00:00:00Z',
    appliedBy: 'emp-1',
    submittedAt: '2026-04-01T00:00:00Z',
    approvedBy: overrides.status === 'Approved' ? 'mgr-7' : null,
    approvedAt: overrides.status === 'Approved' ? '2026-04-02T00:00:00Z' : null,
    rejectionReason: null,
    recallReason: null,
    isEmergency: false,
    lossOfPayDays: 0,
    auditLog: [],
    ...overrides,
  }
}

describe('Full leave year — office-5day employee, 12 casual + 12 sick', () => {
  // Build a sequence of leaves across the year. After each application,
  // the balance is recomputed and confirmed against a hand-computed
  // expected value.
  const holidaySet = buildHolidayDateSetForEmployee({
    holidays: HOLIDAYS_2026,
    picks: [],
    employeeId: 'emp-1',
    year: 2026,
  })

  function days(start: string, end: string, halfDay = false): number {
    return computeTotalDays({
      startDate: start,
      endDate: end,
      workPattern: 'office-5day',
      hybridDays: [],
      holidayDateSet: holidaySet,
      isHalfDay: halfDay,
    })
  }

  it('Checkpoint 1: zero applications -> 12/12 balance', () => {
    const b = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: YEAR_START,
      applications: [],
    })
    expect(b.casual).toEqual({ entitlement: 12, taken: 0, pending: 0, balance: 12 })
    expect(b.sick).toEqual({ entitlement: 12, taken: 0, pending: 0, balance: 12 })
  })

  it('Checkpoint 2: 1 casual day approved -> 11 casual balance', () => {
    // 2026-04-13 Mon, weekday, no holiday
    const td = days('2026-04-13', '2026-04-13')
    expect(td).toBe(1)
    const apps: LeaveApplication[] = [
      leaveApp({ id: 'a1', startDate: '2026-04-13', endDate: '2026-04-13', status: 'Approved', totalDays: 1 }),
    ]
    const b = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: YEAR_START,
      applications: apps,
    })
    expect(b.casual.taken).toBe(1)
    expect(b.casual.balance).toBe(11)
  })

  it('Checkpoint 3: half-day morning casual -> 10.5 casual balance', () => {
    const td = days('2026-04-20', '2026-04-20', true)
    expect(td).toBe(0.5)
    const apps: LeaveApplication[] = [
      leaveApp({ id: 'a1', startDate: '2026-04-13', endDate: '2026-04-13', status: 'Approved', totalDays: 1 }),
      leaveApp({
        id: 'a2',
        startDate: '2026-04-20',
        endDate: '2026-04-20',
        status: 'Approved',
        totalDays: 0.5,
        isHalfDay: true,
        halfDaySession: 'morning',
      }),
    ]
    const b = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: YEAR_START,
      applications: apps,
    })
    expect(b.casual.taken).toBe(1.5)
    expect(b.casual.balance).toBe(10.5)
  })

  it('Checkpoint 4: 5-day window spanning Maharashtra Day holiday -> 4 casual deducted', () => {
    // 2026-04-29 Wed to 2026-05-05 Tue: weekdays Wed Thu Fri (Mahar.skip)
    // Mon Tue. So Mon-Tue + Wed-Thu + Fri = 5 weekdays minus Fri (holiday)
    // = Wed Thu Mon Tue = 4 working days
    const td = days('2026-04-29', '2026-05-05')
    expect(td).toBe(4)
    const apps: LeaveApplication[] = [
      leaveApp({ id: 'a1', startDate: '2026-04-13', endDate: '2026-04-13', status: 'Approved', totalDays: 1 }),
      leaveApp({
        id: 'a2',
        startDate: '2026-04-20',
        endDate: '2026-04-20',
        status: 'Approved',
        totalDays: 0.5,
        isHalfDay: true,
        halfDaySession: 'morning',
      }),
      leaveApp({ id: 'a3', startDate: '2026-04-29', endDate: '2026-05-05', status: 'Approved', totalDays: 4 }),
    ]
    const b = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: YEAR_START,
      applications: apps,
    })
    expect(b.casual.taken).toBe(5.5)
    expect(b.casual.balance).toBe(6.5)
  })

  it('Checkpoint 5: pending submission counted in pending, balance reduces', () => {
    const apps: LeaveApplication[] = [
      leaveApp({ id: 'a1', startDate: '2026-04-13', endDate: '2026-04-13', status: 'Approved', totalDays: 1 }),
      leaveApp({
        id: 'a2',
        startDate: '2026-04-20',
        endDate: '2026-04-20',
        status: 'Approved',
        totalDays: 0.5,
        isHalfDay: true,
      }),
      leaveApp({ id: 'a3', startDate: '2026-04-29', endDate: '2026-05-05', status: 'Approved', totalDays: 4 }),
      leaveApp({ id: 'a4', startDate: '2026-06-01', endDate: '2026-06-03', status: 'Submitted', totalDays: 3 }),
    ]
    const b = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: YEAR_START,
      applications: apps,
    })
    expect(b.casual.taken).toBe(5.5)
    expect(b.casual.pending).toBe(3)
    expect(b.casual.balance).toBe(3.5)
  })

  it('Checkpoint 6: rejection clears pending, balance returns', () => {
    const apps: LeaveApplication[] = [
      leaveApp({ id: 'a1', startDate: '2026-04-13', endDate: '2026-04-13', status: 'Approved', totalDays: 1 }),
      leaveApp({
        id: 'a2',
        startDate: '2026-04-20',
        endDate: '2026-04-20',
        status: 'Approved',
        totalDays: 0.5,
        isHalfDay: true,
      }),
      leaveApp({ id: 'a3', startDate: '2026-04-29', endDate: '2026-05-05', status: 'Approved', totalDays: 4 }),
      leaveApp({
        id: 'a4',
        startDate: '2026-06-01',
        endDate: '2026-06-03',
        status: 'Rejected',
        totalDays: 3,
      }),
    ]
    const b = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: YEAR_START,
      applications: apps,
    })
    expect(b.casual.pending).toBe(0)
    expect(b.casual.balance).toBe(6.5)
  })

  it('Checkpoint 7: sick leaves are independent of casual', () => {
    const apps: LeaveApplication[] = [
      leaveApp({ id: 'a1', startDate: '2026-04-13', endDate: '2026-04-13', status: 'Approved', totalDays: 1 }),
      leaveApp({
        id: 'a2',
        startDate: '2026-04-20',
        endDate: '2026-04-20',
        status: 'Approved',
        totalDays: 0.5,
        isHalfDay: true,
      }),
      leaveApp({ id: 'a3', startDate: '2026-04-29', endDate: '2026-05-05', status: 'Approved', totalDays: 4 }),
      leaveApp({
        id: 's1',
        startDate: '2026-07-15',
        endDate: '2026-07-17',
        status: 'Approved',
        totalDays: 3,
        leaveType: 'sick',
      }),
    ]
    const b = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: YEAR_START,
      applications: apps,
    })
    expect(b.casual.taken).toBe(5.5)
    expect(b.sick.taken).toBe(3)
    expect(b.sick.balance).toBe(9)
  })

  it('Checkpoint 8: heavy LOP scenario — exhaust casual, overflow into unpaid', () => {
    // Casual entitlement = 12. Use them all + 5 more days as LOP.
    const apps: LeaveApplication[] = [
      leaveApp({ id: 'a-block-1', startDate: '2026-04-13', endDate: '2026-04-24', status: 'Approved', totalDays: 10 }),
      leaveApp({ id: 'a-block-2', startDate: '2026-04-27', endDate: '2026-04-28', status: 'Approved', totalDays: 2 }),
      // LOP application: total 5, paid 0, lop 5
      leaveApp({
        id: 'a-lop',
        startDate: '2026-05-04',
        endDate: '2026-05-08',
        status: 'Approved',
        totalDays: 5,
        lossOfPayDays: 5,
      }),
    ]
    const b = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: YEAR_START,
      applications: apps,
    })
    expect(b.casual.taken).toBe(12)
    expect(b.casual.balance).toBe(0)
    expect(b.unpaid.taken).toBe(5)
  })

  it('Checkpoint 9: splitPaidAndLOP arithmetic matches recalcBalance', () => {
    // We have 8 casual remaining; apply 11 days. 8 paid + 3 LOP.
    const split = splitPaidAndLOP({ applyingDays: 11, availableBalance: 8 })
    expect(split).toEqual({ paid: 8, lop: 3 })
    const apps: LeaveApplication[] = [
      // First, take 4 days to leave 8 in balance.
      leaveApp({ id: 'pre', startDate: '2026-04-13', endDate: '2026-04-16', status: 'Approved', totalDays: 4 }),
      // Then the 11-day mixed application.
      leaveApp({
        id: 'mixed',
        startDate: '2026-05-04',
        endDate: '2026-05-22',
        status: 'Approved',
        totalDays: 11,
        lossOfPayDays: 3,
      }),
    ]
    const b = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: YEAR_START,
      applications: apps,
    })
    expect(b.casual.taken).toBe(12)
    expect(b.casual.balance).toBe(0)
    expect(b.unpaid.taken).toBe(3)
  })

  it('Checkpoint 10: cancellation removes the leave from taken', () => {
    const apps: LeaveApplication[] = [
      leaveApp({ id: 'a-cancel', startDate: '2026-04-13', endDate: '2026-04-13', status: 'Cancelled', totalDays: 1 }),
      leaveApp({ id: 'a-keep', startDate: '2026-04-20', endDate: '2026-04-20', status: 'Approved', totalDays: 1 }),
    ]
    const b = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: YEAR_START,
      applications: apps,
    })
    expect(b.casual.taken).toBe(1)
    expect(b.casual.balance).toBe(11)
  })

  it('Checkpoint 11: leave-year boundary — March 30 leaves count against the OLD year, April 2 against the NEW', () => {
    const apps: LeaveApplication[] = [
      leaveApp({ id: 'march', startDate: '2026-03-30', endDate: '2026-03-30', status: 'Approved', totalDays: 1 }),
      leaveApp({ id: 'april', startDate: '2026-04-02', endDate: '2026-04-02', status: 'Approved', totalDays: 1 }),
    ]
    // 2025-04-01 leave year (March falls in this year)
    const oldYear = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: '2025-04-01',
      applications: apps,
    })
    expect(oldYear.casual.taken).toBe(1)
    expect(oldYear.casual.balance).toBe(11)

    // 2026-04-01 leave year (April falls in this year)
    const newYear = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: '2026-04-01',
      applications: apps,
    })
    expect(newYear.casual.taken).toBe(1)
    expect(newYear.casual.balance).toBe(11)
  })

  it('Checkpoint 12: stress test — 30 random sub-2-day approved leaves still balance to whole-day arithmetic', () => {
    // Build 30 single-day approved leaves, all alternating Monday/Tuesday
    // through April-March, never stepping on a holiday or weekend.
    const apps: LeaveApplication[] = []
    let used = 0
    let monday = new Date(Date.UTC(2026, 3, 6)) // 2026-04-06 Mon
    for (let i = 0; i < 30; i++) {
      const iso = monday.toISOString().slice(0, 10)
      // Skip if it's one of our holidays
      if (!holidaySet.has(iso)) {
        apps.push(
          leaveApp({
            id: `r-${i}`,
            startDate: iso,
            endDate: iso,
            status: 'Approved',
            totalDays: 1,
            leaveType: i % 2 === 0 ? 'casual' : 'sick',
          }),
        )
        used++
      }
      monday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000)
    }
    const b = recalcBalance({
      employeeId: 'emp-1',
      leaveYearStart: YEAR_START,
      applications: apps,
    })
    // Half went to casual, half to sick — so casual.taken + sick.taken = used.
    expect(b.casual.taken + b.sick.taken).toBe(used)
    // Floats came out clean (no fractional drift)
    expect(b.casual.taken % 1).toBe(0)
    expect(b.sick.taken % 1).toBe(0)
  })
})
