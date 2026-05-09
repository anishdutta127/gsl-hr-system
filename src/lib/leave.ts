/*
 * Leave management — pure helpers.
 *
 * The hard part is computing `totalDays` for an application: walk every
 * date from start to end, drop the days the employee was never expected
 * to be in (weekends per work pattern, national holidays + their
 * picked optionals, hybrid non-office days). Halves count as 0.5.
 *
 * Balance arithmetic also lives here — pure projection from
 * entitlement + applications. The /leave route persists totalDays
 * alongside the application so reports don't recompute.
 *
 * Leave year: April 1 to March 31 per Riddhi's policy.
 */

import fs from 'node:fs'
import path from 'node:path'
import { defaultHybridDays, expectedDayKind, holidayDateSet } from './roster'
import type {
  Employee,
  EmployeeOptionalHoliday,
  Holiday,
  LeaveApplication,
  LeaveBalanceRecord,
  LeaveBucket,
  LeaveStatus,
  LeaveType,
  WorkPattern,
} from './types'
import { LEAVE_ENTITLEMENT_DEFAULTS } from './types'

const APPS_FILE = path.join(process.cwd(), 'src', 'data', 'leave_applications.json')
const BAL_FILE = path.join(process.cwd(), 'src', 'data', 'leave_balances.json')

function readJsonArray<T>(file: string): T[] {
  try {
    if (!fs.existsSync(file)) return []
    const text = fs.readFileSync(file, 'utf-8').trim()
    if (!text) return []
    const parsed = JSON.parse(text) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export function loadLeaveApplications(): LeaveApplication[] {
  return readJsonArray<LeaveApplication>(APPS_FILE)
}

export function loadLeaveBalances(): LeaveBalanceRecord[] {
  return readJsonArray<LeaveBalanceRecord>(BAL_FILE)
}

// --- Date math -----------------------------------------------------------

export function eachDayIso(start: string, end: string): string[] {
  const out: string[] = []
  const startMs = new Date(`${start}T00:00:00Z`).getTime()
  const endMs = new Date(`${end}T00:00:00Z`).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return out
  const day = 24 * 60 * 60 * 1000
  for (let t = startMs; t <= endMs; t += day) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

/** Active leave year for a given date: April 1 of the previous calendar
 *  year if the date is before April 1, otherwise April 1 of the current
 *  calendar year. */
export function leaveYearForDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const year = d.getUTCFullYear()
  const aprilFirst = Date.UTC(year, 3, 1)
  return d.getTime() >= aprilFirst
    ? `${year}-04-01`
    : `${year - 1}-04-01`
}

// --- totalDays computation ----------------------------------------------

export interface ComputeTotalDaysInput {
  startDate: string
  endDate: string
  workPattern: WorkPattern
  hybridDays: number[]
  holidayDateSet: Set<string>
  isHalfDay: boolean
}

/**
 * Walk start..end and count how many days the employee would otherwise
 * have been working. Half-days count as 0.5 and force a single-day window.
 *
 *   office-5day   Mon-Fri only
 *   trainer-6day  Mon-Sat only
 *   hybrid-2day   only the configured 2 weekday-of-week values
 *   field         all weekdays Mon-Sat (Riddhi: leave is leave; field
 *                 staff still take leave from their working days)
 *   remote        all weekdays Mon-Fri
 *
 * Holidays are NEVER counted (Riddhi: no sandwich rule).
 */
export function computeTotalDays(input: ComputeTotalDaysInput): number {
  if (input.isHalfDay) {
    if (input.startDate !== input.endDate) {
      throw new Error('Half-day leave must start and end on the same date.')
    }
    // Half-day on a holiday or weekend = 0.
    const kind = expectedDayKind({
      workPattern: input.workPattern,
      dateIso: input.startDate,
      holidayDates: input.holidayDateSet,
      hybridDays: input.hybridDays,
    })
    if (kind === 'holiday' || isNonWorking(input.workPattern, input.hybridDays, input.startDate)) {
      return 0
    }
    return 0.5
  }
  let count = 0
  for (const day of eachDayIso(input.startDate, input.endDate)) {
    if (input.holidayDateSet.has(day)) continue
    if (isNonWorking(input.workPattern, input.hybridDays, day)) continue
    count += 1
  }
  return count
}

function isNonWorking(
  workPattern: WorkPattern,
  hybridDays: number[],
  iso: string,
): boolean {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay() // 0=Sun..6=Sat
  switch (workPattern) {
    case 'office-5day':
      return dow === 0 || dow === 6
    case 'trainer-6day':
      return dow === 0
    case 'hybrid-2day':
      // Hybrid: only the configured two weekdays count. Anything else is
      // a non-working day for leave purposes.
      return !hybridDays.includes(dow)
    case 'field':
      return dow === 0 // field 6-day Mon-Sat
    case 'remote':
      return dow === 0 || dow === 6
  }
}

/** Convenience for callers that don't already have an exit-set built. */
export function buildHolidayDateSetForEmployee({
  holidays,
  picks,
  employeeId,
  year,
}: {
  holidays: Holiday[]
  picks: EmployeeOptionalHoliday[]
  employeeId: string
  year: number
}): Set<string> {
  const pickedIds = new Set(
    picks.filter((p) => p.employeeId === employeeId && p.year === year).map((p) => p.holidayId),
  )
  return holidayDateSet(holidays, pickedIds)
}

// --- Balance recalc ------------------------------------------------------

export interface RecalcInput {
  employeeId: string
  /** April-1 of the leave year. */
  leaveYearStart: string
  applications: LeaveApplication[]
  /** Override the default 12 casual + 12 sick. Optional per-employee
   *  prorated entitlement on a mid-year joiner. */
  entitlements?: { casual: number; sick: number }
}

/** Compute the balance record from scratch given the application list.
 *  Pure: doesn't read storage. Used both in the API (after every write)
 *  and in the integration tests. */
export function recalcBalance(input: RecalcInput): LeaveBalanceRecord {
  const ent = input.entitlements ?? { ...LEAVE_ENTITLEMENT_DEFAULTS }
  const yearStart = input.leaveYearStart
  const yearEnd = addYearIso(yearStart)

  const casual = bucketSum(
    'casual',
    input.applications,
    yearStart,
    yearEnd,
    ent.casual,
    input.employeeId,
  )
  const sick = bucketSum(
    'sick',
    input.applications,
    yearStart,
    yearEnd,
    ent.sick,
    input.employeeId,
  )
  const unpaidTaken = sumByStatus(
    input.applications,
    'unpaid',
    'Approved',
    yearStart,
    yearEnd,
    input.employeeId,
  )
  // LOP days from any leave that overflowed balance count toward unpaid.
  const lopFromOverflow = input.applications
    .filter(
      (a) =>
        a.employeeId === input.employeeId &&
        a.status === 'Approved' &&
        a.startDate >= yearStart &&
        a.startDate < yearEnd,
    )
    .reduce((acc, a) => acc + (a.lossOfPayDays || 0), 0)

  return {
    employeeId: input.employeeId,
    leaveYearStart: yearStart,
    casual,
    sick,
    unpaid: { taken: unpaidTaken + lopFromOverflow },
    updatedAt: new Date().toISOString(),
  }
}

function bucketSum(
  type: LeaveType,
  apps: LeaveApplication[],
  yearStart: string,
  yearEnd: string,
  entitlement: number,
  employeeId: string,
): LeaveBucket {
  const taken = sumByStatus(apps, type, 'Approved', yearStart, yearEnd, employeeId)
  const pending = sumByStatus(apps, type, 'Submitted', yearStart, yearEnd, employeeId)
  return {
    entitlement,
    taken,
    pending,
    balance: round2(entitlement - taken - pending),
  }
}

function sumByStatus(
  apps: LeaveApplication[],
  type: LeaveType,
  status: LeaveStatus,
  yearStart: string,
  yearEnd: string,
  employeeId: string,
): number {
  let total = 0
  for (const a of apps) {
    if (a.employeeId !== employeeId) continue
    if (a.leaveType !== type) continue
    if (a.status !== status) continue
    // The application's start date determines which leave year it counts
    // against. (Cross-year-boundary leaves are rare; the brief doesn't
    // call out a special rule, so we count against start-year.)
    if (a.startDate < yearStart || a.startDate >= yearEnd) continue
    total += a.totalDays - (status === 'Approved' ? a.lossOfPayDays : 0)
  }
  return round2(total)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function addYearIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10)
}

// --- Overlap detection ---------------------------------------------------

export function hasOverlapWithApproved({
  applications,
  employeeId,
  startDate,
  endDate,
  excludeApplicationId,
}: {
  applications: LeaveApplication[]
  employeeId: string
  startDate: string
  endDate: string
  excludeApplicationId?: string
}): LeaveApplication | null {
  for (const a of applications) {
    if (a.employeeId !== employeeId) continue
    if (a.id === excludeApplicationId) continue
    if (a.status !== 'Approved' && a.status !== 'Submitted') continue
    // Overlap: !(end < other.start || start > other.end)
    if (endDate < a.startDate) continue
    if (startDate > a.endDate) continue
    return a
  }
  return null
}

// --- Loss-of-pay split ---------------------------------------------------

/**
 * Given how many days are being applied for and the available balance,
 * split into "paid days from balance" vs "lossOfPay days that overflow".
 * Used at submit-time so the application persists the split.
 */
export function splitPaidAndLOP({
  applyingDays,
  availableBalance,
}: {
  applyingDays: number
  availableBalance: number
}): { paid: number; lop: number } {
  if (availableBalance <= 0) return { paid: 0, lop: applyingDays }
  if (applyingDays <= availableBalance) return { paid: applyingDays, lop: 0 }
  return { paid: availableBalance, lop: round2(applyingDays - availableBalance) }
}

// --- Permission helpers --------------------------------------------------

/** Who can READ a leave application?
 *  Admin/HR: always.
 *  Employee: only their own.
 *  HOD (Reporting Manager): their direct reports' applications.
 *  Leadership: read all (informational dashboards).
 */
export function canReadLeave({
  app,
  user,
  employee,
}: {
  app: LeaveApplication
  user: { id: string; role: string }
  employee: Employee | null
}): boolean {
  if (user.role === 'Admin' || user.role === 'HR' || user.role === 'Leadership') return true
  if (app.employeeId === user.id) return true
  if (user.role === 'HOD' && employee?.reportingManagerId === user.id) return true
  return false
}

/** Who can APPROVE/REJECT a leave?
 *  Admin/HR: always.
 *  HOD: only their direct reports' applications.
 *  Self-approval: never (caller redirects to skip-level when the manager
 *  IS the employee).
 */
export function canApproveLeave({
  app,
  user,
  employee,
}: {
  app: LeaveApplication
  user: { id: string; role: string }
  employee: Employee | null
}): boolean {
  if (app.employeeId === user.id) return false
  if (user.role === 'Admin' || user.role === 'HR') return true
  if (user.role === 'HOD' && employee?.reportingManagerId === user.id) return true
  return false
}

/** Compute a prorated entitlement for a mid-year joiner. Returns the
 *  full entitlement when joining date is at or before yearStart. */
export function proratedEntitlement({
  fullEntitlement,
  yearStart,
  joiningDate,
}: {
  fullEntitlement: number
  yearStart: string
  joiningDate: string | null
}): number {
  if (!joiningDate) return fullEntitlement
  if (joiningDate <= yearStart) return fullEntitlement
  // Days from joining date to year-end / 365 * fullEntitlement.
  const yEnd = addYearIso(yearStart)
  const startMs = new Date(`${joiningDate}T00:00:00Z`).getTime()
  const endMs = new Date(`${yEnd}T00:00:00Z`).getTime()
  const yearMs = endMs - new Date(`${yearStart}T00:00:00Z`).getTime()
  const remainingMs = Math.max(0, endMs - startMs)
  const ratio = remainingMs / yearMs
  return round2(fullEntitlement * ratio)
}
