/*
 * Holiday calendar reads + helpers.
 *
 * Phase 1 surface: read 15 holidays for 2026 (11 mandatory + 4 optional),
 * track per-employee optional picks (default budget: 2/year per Riddhi).
 * The roster engine (Step 5) imports `isHoliday(date)` to drop holidays
 * from expected-presence days; the leave system (Phase 3) does the same
 * to prevent leave overlap with company holidays.
 */

import fs from 'node:fs'
import path from 'node:path'
import type {
  EmployeeOptionalHoliday,
  Holiday,
  HolidayType,
} from './types'
import { OPTIONAL_HOLIDAY_BUDGET_PER_YEAR } from './types'

const HOLIDAYS_FILE = path.join(process.cwd(), 'src', 'data', 'holidays.json')
const PICKS_FILE = path.join(process.cwd(), 'src', 'data', 'employee_optional_holidays.json')

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

export function loadHolidays(): Holiday[] {
  return readJsonArray<Holiday>(HOLIDAYS_FILE)
}

export function loadEmployeeOptionalHolidays(): EmployeeOptionalHoliday[] {
  return readJsonArray<EmployeeOptionalHoliday>(PICKS_FILE)
}

/** Sort holidays chronologically, breaking ties by name. */
export function sortHolidays(list: Holiday[]): Holiday[] {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.name.localeCompare(b.name)
  })
}

export function holidaysInYear(list: Holiday[], year: number): Holiday[] {
  return list.filter((h) => h.date.startsWith(`${year}-`))
}

/**
 * Day-of-week resolver for a holiday date string. Used by the list view
 * column. Returns 'Mon' .. 'Sun' for any valid YYYY-MM-DD.
 */
export function holidayDayOfWeek(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return days[d.getUTCDay()] ?? ''
}

/** Return true when the given ISO date is on a holiday in `list`. The
 *  type filter restricts to mandatory or optional. Used by the roster
 *  engine and Phase-3 leave validation. */
export function isHolidayOn(
  list: Holiday[],
  dateIso: string,
  filter: { types?: HolidayType[] } = {},
): boolean {
  const types = filter.types
  return list.some((h) => h.date === dateIso && (!types || types.includes(h.type)))
}

/** Return holidays a particular employee should observe: all mandatory in
 *  the year, plus their picked optionals. */
export function holidaysForEmployee({
  employeeId,
  year,
  holidays,
  picks,
}: {
  employeeId: string
  year: number
  holidays: Holiday[]
  picks: EmployeeOptionalHoliday[]
}): Holiday[] {
  const inYear = holidaysInYear(holidays, year)
  const pickedIds = new Set(
    picks
      .filter((p) => p.employeeId === employeeId && p.year === year)
      .map((p) => p.holidayId),
  )
  return inYear.filter((h) => h.type === 'mandatory' || pickedIds.has(h.id))
}

/**
 * Apply / unapply a pick. Pure: takes the current picks list, returns
 * the next list. Throws when the pick would push the employee over the
 * annual budget.
 */
export function togglePick({
  picks,
  employeeId,
  holidayId,
  year,
  selectedBy,
  now,
  budget = OPTIONAL_HOLIDAY_BUDGET_PER_YEAR,
}: {
  picks: EmployeeOptionalHoliday[]
  employeeId: string
  holidayId: string
  year: number
  selectedBy: string
  now: string
  budget?: number
}): { next: EmployeeOptionalHoliday[]; action: 'added' | 'removed' } {
  const existing = picks.find(
    (p) => p.employeeId === employeeId && p.holidayId === holidayId && p.year === year,
  )
  if (existing) {
    return {
      next: picks.filter(
        (p) =>
          !(p.employeeId === employeeId && p.holidayId === holidayId && p.year === year),
      ),
      action: 'removed',
    }
  }
  const yearPicks = picks.filter((p) => p.employeeId === employeeId && p.year === year)
  if (yearPicks.length >= budget) {
    throw new Error(
      `Pick budget exhausted: ${employeeId} has ${yearPicks.length}/${budget} optional holidays picked for ${year}.`,
    )
  }
  return {
    next: [
      ...picks,
      {
        employeeId,
        holidayId,
        year,
        selectedAt: now,
        selectedBy,
      },
    ],
    action: 'added',
  }
}

export function pickedCountForEmployee(
  picks: EmployeeOptionalHoliday[],
  employeeId: string,
  year: number,
): number {
  return picks.filter((p) => p.employeeId === employeeId && p.year === year).length
}
