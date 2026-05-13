/*
 * Pure filter for the /employees list view. Server-side called from the
 * page; isolated so we can pin behaviour in tests without standing up the
 * Server Component.
 *
 * Search is matched case-insensitively against name, designation, employee
 * code, email, department, and location concatenated with single spaces.
 * Department dropdown is exact-match. Both filters are AND'd.
 */

import type { Employee } from '../types'

export interface EmployeeFilterArgs {
  query?: string
  department?: string
}

export function filterEmployees(employees: Employee[], args: EmployeeFilterArgs): Employee[] {
  const q = (args.query ?? '').trim().toLowerCase()
  const dept = (args.department ?? '').trim()
  return employees.filter((e) => {
    if (dept && e.department !== dept) return false
    if (!q) return true
    const hay = [e.name, e.designation, e.employeeCode, e.email, e.department, e.location]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}
