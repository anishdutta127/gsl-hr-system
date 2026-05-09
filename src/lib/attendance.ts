/*
 * Attendance — exception logging only. System assumes everyone is present
 * unless an exception is recorded. Auto-derived states (on-leave from
 * approved leaves, holidays from calendar) are surfaced via query, not
 * stored as exceptions. HR logs only the divergent days.
 */

import fs from 'node:fs'
import path from 'node:path'
import type {
  AttendanceException,
  AttendanceExceptionType,
} from './types'

const FILE_PATH = path.join(process.cwd(), 'src', 'data', 'attendance_exceptions.json')

export function loadAttendanceExceptions(): AttendanceException[] {
  try {
    if (!fs.existsSync(FILE_PATH)) return []
    const text = fs.readFileSync(FILE_PATH, 'utf-8').trim()
    if (!text) return []
    const parsed = JSON.parse(text) as unknown
    return Array.isArray(parsed) ? (parsed as AttendanceException[]) : []
  } catch {
    return []
  }
}

/** Build the (employeeId, date) -> exception map for a window. Latest
 *  loggedAt wins if duplicates exist. */
export function indexExceptions(
  list: AttendanceException[],
  windowStart: string,
  windowEnd: string,
): Map<string, AttendanceException> {
  const out = new Map<string, AttendanceException>()
  for (const ex of list) {
    if (ex.date < windowStart || ex.date > windowEnd) continue
    const key = `${ex.employeeId}|${ex.date}`
    const existing = out.get(key)
    if (!existing || ex.loggedAt > existing.loggedAt) out.set(key, ex)
  }
  return out
}

/** Resolved attendance label for a single (employee, date). Auto-derives
 *  on-leave + holiday from upstream data; HR-logged exceptions otherwise. */
export type AttendanceLabel =
  | { kind: 'present' } // default assumption
  | { kind: 'off' } // weekend per work pattern
  | { kind: 'holiday' }
  | { kind: 'on-leave'; leaveType?: string }
  | { kind: 'exception'; type: AttendanceExceptionType; notes: string }

export type AttendanceColor = 'green' | 'blue' | 'amber' | 'red' | 'grey'

export function colorForLabel(label: AttendanceLabel): AttendanceColor {
  switch (label.kind) {
    case 'present':
      return 'green'
    case 'on-leave':
    case 'holiday':
    case 'off':
      return 'grey'
    case 'exception':
      switch (label.type) {
        case 'work-from-home':
          return 'blue'
        case 'on-field':
          return 'blue'
        case 'late':
        case 'half-day':
          return 'amber'
        case 'absent':
          return 'red'
        case 'holiday-worked':
          return 'green'
      }
  }
}

/** Permission helper. HOD sees only their direct reports' attendance. */
export function canSeeAttendanceFor({
  user,
  employeeReportingManagerId,
}: {
  user: { id: string; role: string }
  employeeReportingManagerId: string | null | undefined
}): boolean {
  if (user.role === 'Admin' || user.role === 'HR' || user.role === 'Leadership') return true
  if (user.role === 'HOD' && employeeReportingManagerId === user.id) return true
  return false
}

export function canEditAttendance(role: string): boolean {
  return role === 'Admin' || role === 'HR'
}
