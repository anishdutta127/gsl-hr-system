/*
 * Roster engine — Phase 1 planning tool.
 *
 * Given an employee's work pattern + the holiday calendar, project which
 * days of a month are expected office days. NO exception logging in Phase
 * 1 per Riddhi's explicit ask; this is purely the planning side. Phase 4
 * adds attendance + exception tracking.
 *
 * "Office day" means "expected to be physically in a GSL office". Field
 * and remote staff therefore have no office days even when they are
 * working. Trainers run a 6-day Mon-Sat pattern. Hybrid employees have
 * 2 office days/week, configured per-employee or defaulted by department.
 */

import type { Holiday, WorkPattern } from './types'

export type DayKind = 'office' | 'off' | 'holiday'

/** ISO day-of-week, 0=Sun ... 6=Sat. */
export function dayOfWeek(dateIso: string): number {
  return new Date(`${dateIso}T00:00:00Z`).getUTCDay()
}

/**
 * Default hybrid-2day office days per department. Matches the brief's
 * suggestion (Academics = Mon+Thu, others = Tue+Thu). Returns weekday
 * indices: 1=Mon, 2=Tue, ..., 4=Thu.
 */
export function defaultHybridDays(department: string): number[] {
  const dept = (department ?? '').trim().toLowerCase()
  if (dept === 'academics' || dept === 'stem & training') return [1, 4]
  return [2, 4]
}

/**
 * Resolve the day-kind for a single date.
 *
 *   office-5day  : Mon-Fri office, Sat/Sun off
 *   trainer-6day : Mon-Sat office, Sun off
 *   hybrid-2day  : two configured days per week (defaults from department)
 *   field        : no expected office presence (primarily out-of-office)
 *   remote       : no expected office presence
 *
 * Holidays trump every pattern; they appear as 'holiday' regardless of
 * whether the employee was scheduled in.
 */
export function expectedDayKind({
  workPattern,
  dateIso,
  holidayDates,
  hybridDays,
}: {
  workPattern: WorkPattern
  dateIso: string
  holidayDates: Set<string>
  hybridDays: number[]
}): DayKind {
  if (holidayDates.has(dateIso)) return 'holiday'
  const dow = dayOfWeek(dateIso)
  switch (workPattern) {
    case 'office-5day':
      return dow >= 1 && dow <= 5 ? 'office' : 'off'
    case 'trainer-6day':
      return dow >= 1 && dow <= 6 ? 'office' : 'off'
    case 'hybrid-2day':
      return hybridDays.includes(dow) ? 'office' : 'off'
    case 'field':
    case 'remote':
      return 'off'
  }
}

/** All ISO date strings in the given calendar month (YYYY-MM). */
export function daysInMonth(year: number, month1to12: number): string[] {
  const out: string[] = []
  // last day = first day of next month - 1
  const last = new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
  for (let d = 1; d <= last; d++) {
    out.push(
      `${year}-${String(month1to12).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    )
  }
  return out
}

/**
 * Build a date -> dayKind map for a given employee over a month. Used by
 * the grid view and CSV export.
 */
export function monthGridForEmployee({
  workPattern,
  hybridDays,
  year,
  month1to12,
  holidayDates,
}: {
  workPattern: WorkPattern
  hybridDays: number[]
  year: number
  month1to12: number
  holidayDates: Set<string>
}): Array<{ date: string; kind: DayKind }> {
  return daysInMonth(year, month1to12).map((date) => ({
    date,
    kind: expectedDayKind({ workPattern, dateIso: date, holidayDates, hybridDays }),
  }))
}

/** Projection of "how many office days" + holiday count this month. */
export function summariseMonth(
  cells: Array<{ kind: DayKind }>,
): { office: number; off: number; holiday: number } {
  return cells.reduce(
    (acc, c) => {
      acc[c.kind]++
      return acc
    },
    { office: 0, off: 0, holiday: 0 },
  )
}

/** Build the holiday-date Set used by the grid resolver. Mandatory + the
 *  employee's own picked optionals only. */
export function holidayDateSet(
  holidays: Holiday[],
  pickedOptionalIds: Set<string>,
): Set<string> {
  const set = new Set<string>()
  for (const h of holidays) {
    if (h.type === 'mandatory' || pickedOptionalIds.has(h.id)) {
      set.add(h.date)
    }
  }
  return set
}

/** Render a single cell to its short text label for grids and CSVs. */
export function cellSymbol(kind: DayKind): string {
  switch (kind) {
    case 'office':
      return 'O'
    case 'off':
      return '-'
    case 'holiday':
      return 'H'
  }
}
