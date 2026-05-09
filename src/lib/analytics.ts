/*
 * Analytics — pure aggregation helpers for the /analytics dashboard.
 *
 * Each widget has a dedicated builder. The page calls all five with the
 * same filter context and renders the results. Pure: takes already-loaded
 * data and a filter, returns a structured record. Easy to unit-test.
 */

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
} from './types'

export interface AnalyticsFilter {
  /** Inclusive YYYY-MM-DD lower bound; default: 365 days back from today. */
  rangeStart: string
  /** Inclusive YYYY-MM-DD upper bound; default: today. */
  rangeEnd: string
  department?: string
  location?: string
}

// --- Headcount -----------------------------------------------------------

export interface HeadcountWidget {
  total: number
  active: number
  exited: number
  onProbation: number
  byDepartment: Array<{ key: string; count: number }>
  byLocation: Array<{ key: string; count: number }>
  byEmploymentStatus: Array<{ key: string; count: number }>
  trend12Months: Array<{ month: string; activeCount: number }>
}

export function buildHeadcountWidget({
  employees,
  filter,
  now,
}: {
  employees: Employee[]
  filter: AnalyticsFilter
  now: Date
}): HeadcountWidget {
  const filtered = applyEmpFilter(employees, filter)
  const active = filtered.filter((e) => e.status !== 'Exited')
  const exited = filtered.filter((e) => e.status === 'Exited')

  const byDepartment = countBy(active, (e) => e.department || '—')
  const byLocation = countBy(active, (e) => e.location || '—')
  const byEmploymentStatus = countBy(active, (e) => e.employmentStatus ?? 'Active')

  const onProbation = active.filter((e) => {
    if (!e.dateOfJoining) return false
    const probEnd = monthsLater(e.dateOfJoining, 6)
    return e.confirmationDate == null && probEnd >= now.toISOString().slice(0, 10)
  }).length

  // Trend: count active employees as of each month-end for the last 12 months.
  const trend12Months: HeadcountWidget['trend12Months'] = []
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0)) // last day of that month
    const iso = dt.toISOString().slice(0, 10)
    const month = iso.slice(0, 7)
    const headcount = filtered.filter((e) => {
      if (!e.dateOfJoining) return false
      if (e.dateOfJoining > iso) return false
      if (e.exit?.lastWorkingDay && e.exit.lastWorkingDay <= iso) return false
      return true
    }).length
    trend12Months.push({ month, activeCount: headcount })
  }

  return {
    total: filtered.length,
    active: active.length,
    exited: exited.length,
    onProbation,
    byDepartment: byDepartment.sort((a, b) => b.count - a.count).slice(0, 12),
    byLocation: byLocation.sort((a, b) => b.count - a.count).slice(0, 12),
    byEmploymentStatus,
    trend12Months,
  }
}

// --- Attrition -----------------------------------------------------------

export interface AttritionWidget {
  exitsLast90Days: number
  attritionRate: number // %
  byDepartment: Array<{ key: string; count: number }>
  topReasons: Array<{ reason: string; count: number }>
  avgTenureYearsAtExit: number | null
}

export function buildAttritionWidget({
  employees,
  exitInterviews,
  filter,
  now,
}: {
  employees: Employee[]
  exitInterviews: ExitInterview[]
  filter: AnalyticsFilter
  now: Date
}): AttritionWidget {
  const filtered = applyEmpFilter(employees, filter)
  const ninety = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const exitedRecently = filtered.filter(
    (e) => e.status === 'Exited' && e.exit?.lastWorkingDay && e.exit.lastWorkingDay >= ninety,
  )
  const active = filtered.filter((e) => e.status !== 'Exited')
  const attritionRate =
    active.length === 0 ? 0 : (exitedRecently.length / (active.length + exitedRecently.length)) * 100

  const byDepartment = countBy(exitedRecently, (e) => e.department || '—').sort((a, b) => b.count - a.count)

  // Top reasons from exit interviews (joined on employeeId from the same window).
  const interviewByEmp = new Map(exitInterviews.map((i) => [i.employeeId, i]))
  const reasonCounts = new Map<string, number>()
  for (const e of exitedRecently) {
    const interview = interviewByEmp.get(e.id)
    const reason =
      interview?.reasonForLeaving?.trim() || e.exit?.reason?.trim() || 'Not recorded'
    // Normalise to first 60 chars for grouping.
    const key = reason.slice(0, 60)
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1)
  }
  const topReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Avg tenure at exit (years).
  const tenures: number[] = []
  for (const e of exitedRecently) {
    if (e.dateOfJoining && e.exit?.lastWorkingDay) {
      const start = new Date(`${e.dateOfJoining}T00:00:00Z`).getTime()
      const end = new Date(`${e.exit.lastWorkingDay}T00:00:00Z`).getTime()
      tenures.push((end - start) / (1000 * 60 * 60 * 24 * 365))
    }
  }
  const avgTenureYearsAtExit =
    tenures.length === 0 ? null : Math.round((tenures.reduce((a, b) => a + b, 0) / tenures.length) * 10) / 10

  return {
    exitsLast90Days: exitedRecently.length,
    attritionRate: Math.round(attritionRate * 10) / 10,
    byDepartment: byDepartment.slice(0, 8),
    topReasons,
    avgTenureYearsAtExit,
  }
}

// --- Attendance ----------------------------------------------------------

export interface AttendanceWidget {
  presentRate: number // % across all (employees x days) in window
  byDepartmentExceptionRate: Array<{ key: string; rate: number }>
  topExceptions: Array<{ type: string; count: number }>
  /** Distribution of late-arrival count by hour-of-day bucket; we only have
   *  the 'late' exception type (no clock-in time), so this is a count by
   *  date in the window — caller renders as a heatmap of late counts per
   *  day of week. */
  lateByDayOfWeek: Array<{ dow: number; count: number }>
}

export function buildAttendanceWidget({
  employees,
  exceptions,
  filter,
}: {
  employees: Employee[]
  exceptions: AttendanceException[]
  filter: AnalyticsFilter
}): AttendanceWidget {
  const filteredEmps = applyEmpFilter(employees, filter)
  const empIds = new Set(filteredEmps.map((e) => e.id))
  const filteredEx = exceptions.filter(
    (ex) =>
      empIds.has(ex.employeeId) &&
      ex.date >= filter.rangeStart &&
      ex.date <= filter.rangeEnd,
  )

  // Approximate denominator: working days in window per employee. Use 22
  // working days/month as a rough rate denominator. Refinement is logged
  // in TODOs (proper denominator = sum of office-expected days from roster).
  const days = daysBetween(filter.rangeStart, filter.rangeEnd) + 1
  const totalEmpDays = days * filteredEmps.length
  const exceptionDays = filteredEx.length
  const presentRate = totalEmpDays === 0 ? 0 : ((totalEmpDays - exceptionDays) / totalEmpDays) * 100

  // Per-department exception rate.
  const empDept = new Map(filteredEmps.map((e) => [e.id, e.department || '—']))
  const byDeptCounts = new Map<string, { exceptions: number; emps: number }>()
  for (const e of filteredEmps) {
    const k = e.department || '—'
    const cur = byDeptCounts.get(k) ?? { exceptions: 0, emps: 0 }
    cur.emps += 1
    byDeptCounts.set(k, cur)
  }
  for (const ex of filteredEx) {
    const dept = empDept.get(ex.employeeId)
    if (!dept) continue
    const cur = byDeptCounts.get(dept) ?? { exceptions: 0, emps: 0 }
    cur.exceptions += 1
    byDeptCounts.set(dept, cur)
  }
  const byDepartmentExceptionRate = [...byDeptCounts.entries()]
    .map(([key, v]) => ({
      key,
      rate: v.emps === 0 ? 0 : Math.round((v.exceptions / (v.emps * days)) * 1000) / 10,
    }))
    .sort((a, b) => b.rate - a.rate)

  const topExceptions = countBy(filteredEx, (ex) => ex.type)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((c) => ({ type: c.key, count: c.count }))

  const lateByDayOfWeek = Array.from({ length: 7 }, (_, dow) => ({ dow, count: 0 }))
  for (const ex of filteredEx) {
    if (ex.type !== 'late') continue
    const dow = new Date(`${ex.date}T00:00:00Z`).getUTCDay()
    lateByDayOfWeek[dow]!.count += 1
  }

  return {
    presentRate: Math.round(presentRate * 10) / 10,
    byDepartmentExceptionRate,
    topExceptions,
    lateByDayOfWeek,
  }
}

// --- Leave utilisation ---------------------------------------------------

export interface LeaveUtilisationWidget {
  totalEntitled: number
  totalTaken: number
  totalLOP: number
  utilisationPct: number
  byDepartment: Array<{ key: string; takenAvg: number; entitlementAvg: number }>
  predictedYearEndUtilisationPct: number
  balanceDistribution: Array<{ bucket: string; count: number }>
}

export function buildLeaveUtilisationWidget({
  employees,
  applications,
  filter,
  now,
}: {
  employees: Employee[]
  applications: LeaveApplication[]
  filter: AnalyticsFilter
  now: Date
}): LeaveUtilisationWidget {
  const filtered = applyEmpFilter(employees, filter).filter((e) => e.status !== 'Exited')
  const today = now.toISOString().slice(0, 10)
  const yearStart = leaveYearStartFor(today)
  const yearEnd = monthsLater(yearStart, 12)

  // Totals for current year.
  const totalEntitled = filtered.length * 24 // 12 casual + 12 sick per employee per Riddhi
  let totalTaken = 0
  let totalLOP = 0
  for (const a of applications) {
    if (a.status !== 'Approved') continue
    if (a.startDate < yearStart || a.startDate >= yearEnd) continue
    if (!filtered.find((e) => e.id === a.employeeId)) continue
    if (a.leaveType === 'casual' || a.leaveType === 'sick') {
      totalTaken += a.totalDays - a.lossOfPayDays
      totalLOP += a.lossOfPayDays
    } else if (a.leaveType === 'unpaid') {
      totalLOP += a.totalDays
    }
  }
  const utilisationPct = totalEntitled === 0 ? 0 : (totalTaken / totalEntitled) * 100

  // By department: avg taken / avg entitled.
  const byDeptEnt = new Map<string, { taken: number; entitled: number; emps: number }>()
  for (const e of filtered) {
    const k = e.department || '—'
    const cur = byDeptEnt.get(k) ?? { taken: 0, entitled: 0, emps: 0 }
    cur.entitled += 24
    cur.emps += 1
    byDeptEnt.set(k, cur)
  }
  for (const a of applications) {
    if (a.status !== 'Approved') continue
    if (a.startDate < yearStart || a.startDate >= yearEnd) continue
    const emp = filtered.find((e) => e.id === a.employeeId)
    if (!emp) continue
    if (a.leaveType !== 'casual' && a.leaveType !== 'sick') continue
    const k = emp.department || '—'
    const cur = byDeptEnt.get(k)!
    cur.taken += a.totalDays - a.lossOfPayDays
  }
  const byDepartment = [...byDeptEnt.entries()]
    .map(([key, v]) => ({
      key,
      takenAvg: v.emps === 0 ? 0 : Math.round((v.taken / v.emps) * 10) / 10,
      entitlementAvg: v.emps === 0 ? 0 : Math.round((v.entitled / v.emps) * 10) / 10,
    }))
    .sort((a, b) => b.takenAvg - a.takenAvg)
    .slice(0, 10)

  // Predicted year-end: extrapolate the run-rate so far.
  const yearMs = new Date(`${yearEnd}T00:00:00Z`).getTime() - new Date(`${yearStart}T00:00:00Z`).getTime()
  const elapsedMs = now.getTime() - new Date(`${yearStart}T00:00:00Z`).getTime()
  const elapsedFraction = Math.max(0.01, Math.min(1, elapsedMs / yearMs))
  const predictedYearEndUtilisationPct = Math.round((utilisationPct / elapsedFraction) * 10) / 10

  // Balance distribution buckets.
  const balanceDistribution = [
    { bucket: '0', count: 0 },
    { bucket: '1-4', count: 0 },
    { bucket: '5-12', count: 0 },
    { bucket: '13-24', count: 0 },
  ]
  for (const e of filtered) {
    const taken = applications
      .filter(
        (a) =>
          a.employeeId === e.id &&
          a.status === 'Approved' &&
          a.startDate >= yearStart &&
          a.startDate < yearEnd &&
          (a.leaveType === 'casual' || a.leaveType === 'sick'),
      )
      .reduce((acc, a) => acc + (a.totalDays - a.lossOfPayDays), 0)
    const remaining = Math.max(0, 24 - taken)
    if (remaining === 0) balanceDistribution[0]!.count++
    else if (remaining <= 4) balanceDistribution[1]!.count++
    else if (remaining <= 12) balanceDistribution[2]!.count++
    else balanceDistribution[3]!.count++
  }

  return {
    totalEntitled,
    totalTaken: Math.round(totalTaken * 10) / 10,
    totalLOP: Math.round(totalLOP * 10) / 10,
    utilisationPct: Math.round(utilisationPct * 10) / 10,
    byDepartment,
    predictedYearEndUtilisationPct,
    balanceDistribution,
  }
}

// --- HR ops metrics ------------------------------------------------------

export interface HrOpsMetricsWidget {
  avgDaysToOnboardingComplete: number | null
  pctOnboardingTasksOnTime: number
  documentComplianceRate: number
  openOffboardingTasks: number
}

export function buildHrOpsMetricsWidget({
  employees,
  onboardingTasks,
  onboardingTemplates,
  offboardingTasks,
  documents,
  documentTemplates,
  filter,
  now,
}: {
  employees: Employee[]
  onboardingTasks: OnboardingTask[]
  onboardingTemplates: OnboardingTaskTemplate[]
  offboardingTasks: OffboardingTask[]
  documents: EmployeeDocument[]
  documentTemplates: DocumentTemplate[]
  filter: AnalyticsFilter
  now: Date
}): HrOpsMetricsWidget {
  const filtered = applyEmpFilter(employees, filter)
  const filteredIds = new Set(filtered.map((e) => e.id))

  // Onboarding cycle time: per employee, days from first task createdAt
  // -> last mandatory task completedAt, where ALL mandatory tasks are
  // marked Completed or N/A.
  const tplById = new Map(onboardingTemplates.map((t) => [t.id, t]))
  const cycles: number[] = []
  let onTimeDone = 0
  let totalDoneTasks = 0
  for (const emp of filtered) {
    const empTasks = onboardingTasks.filter((t) => t.employeeId === emp.id)
    if (empTasks.length === 0) continue
    const allMandatoryDone = empTasks
      .filter((t) => tplById.get(t.templateId)?.isMandatory)
      .every((t) => t.status === 'Completed' || t.status === 'N/A')
    if (!allMandatoryDone) continue
    if (!emp.dateOfJoining) continue
    const completedAt = empTasks
      .map((t) => t.completedAt)
      .filter((x): x is string => !!x)
      .sort()
      .at(-1)
    if (!completedAt) continue
    const days =
      (new Date(completedAt).getTime() - new Date(`${emp.dateOfJoining}T00:00:00Z`).getTime()) /
      (1000 * 60 * 60 * 24)
    cycles.push(days)
  }
  for (const t of onboardingTasks) {
    if (!filteredIds.has(t.employeeId)) continue
    if (t.status !== 'Completed' && t.status !== 'N/A') continue
    totalDoneTasks++
    if (t.status === 'N/A') {
      onTimeDone++
      continue
    }
    if (t.completedAt && t.completedAt.slice(0, 10) <= t.dueDate) {
      onTimeDone++
    }
  }
  const avgDaysToOnboardingComplete =
    cycles.length === 0 ? null : Math.round((cycles.reduce((a, b) => a + b, 0) / cycles.length) * 10) / 10
  const pctOnboardingTasksOnTime =
    totalDoneTasks === 0 ? 0 : Math.round((onTimeDone / totalDoneTasks) * 1000) / 10

  // Document compliance: % of active employees who have all mandatory docs uploaded.
  const mandatoryTplIds = new Set(documentTemplates.filter((t) => t.isMandatory).map((t) => t.id))
  const activeEmployees = filtered.filter((e) => e.status !== 'Exited')
  let compliant = 0
  for (const e of activeEmployees) {
    const empDocs = documents.filter((d) => d.employeeId === e.id)
    const haveTemplates = new Set(empDocs.map((d) => d.templateId))
    let allCovered = true
    for (const tplId of mandatoryTplIds) {
      if (!haveTemplates.has(tplId)) {
        allCovered = false
        break
      }
    }
    if (allCovered) compliant++
  }
  const documentComplianceRate =
    activeEmployees.length === 0 ? 0 : Math.round((compliant / activeEmployees.length) * 1000) / 10

  // Open offboarding tasks (status not Completed/NA, employee in filter).
  const openOffboardingTasks = offboardingTasks.filter(
    (t) => filteredIds.has(t.employeeId) && t.status !== 'Completed' && t.status !== 'N/A',
  ).length

  void now
  return {
    avgDaysToOnboardingComplete,
    pctOnboardingTasksOnTime,
    documentComplianceRate,
    openOffboardingTasks,
  }
}

// --- Helpers -------------------------------------------------------------

function applyEmpFilter(employees: Employee[], filter: AnalyticsFilter): Employee[] {
  return employees.filter((e) => {
    if (filter.department && e.department !== filter.department) return false
    if (filter.location && e.location !== filter.location) return false
    return true
  })
}

function countBy<T>(list: T[], key: (x: T) => string): Array<{ key: string; count: number }> {
  const m = new Map<string, number>()
  for (const x of list) {
    const k = key(x)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].map(([k, count]) => ({ key: k, count }))
}

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime()
  const b = new Date(`${end}T00:00:00Z`).getTime()
  return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)))
}

function monthsLater(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()))
    .toISOString()
    .slice(0, 10)
}

function leaveYearStartFor(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const year = d.getUTCFullYear()
  const aprilFirst = Date.UTC(year, 3, 1)
  return d.getTime() >= aprilFirst ? `${year}-04-01` : `${year - 1}-04-01`
}
