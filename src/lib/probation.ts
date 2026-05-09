/*
 * Probation tracking. 6-month default per Riddhi's confirmation; configurable
 * per employee via the optional probationEndsAtOverride for extensions.
 *
 * Pure logic only — UI imports the resolver and renders the badge; the
 * confirm/extend API route applies the audit-logged mutation.
 */

import type { Employee } from './types'

export const PROBATION_MONTHS_DEFAULT = 6

export type ProbationKind =
  | 'probation' // currently in probation period
  | 'pending-review' // probation ended but no confirmation recorded yet
  | 'confirmed' // confirmation date in the past
  | 'na' // no joining date or already exited

export interface ProbationStatus {
  kind: ProbationKind
  /** Probation period end date. Null when joining date missing. */
  endsAt: string | null
  /** Days until probation ends. Negative when already past. */
  daysRemaining: number | null
}

function addMonthsIso(iso: string, months: number): string | null {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  // Use UTC math so DST-driven shifts don't drift the date by a day.
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()))
  return target.toISOString().slice(0, 10)
}

/**
 * Resolve probation status. The configurable months parameter lets HR
 * extend probation per employee in future without a code change.
 */
export function probationStatus(
  employee: Pick<Employee, 'dateOfJoining' | 'confirmationDate' | 'status'>,
  options: { months?: number; now?: Date } = {},
): ProbationStatus {
  const months = options.months ?? PROBATION_MONTHS_DEFAULT
  const now = options.now ?? new Date()

  if (employee.status === 'Exited') return { kind: 'na', endsAt: null, daysRemaining: null }
  if (!employee.dateOfJoining) return { kind: 'na', endsAt: null, daysRemaining: null }

  const endsAt = addMonthsIso(employee.dateOfJoining, months)
  if (!endsAt) return { kind: 'na', endsAt: null, daysRemaining: null }

  const endTime = new Date(`${endsAt}T00:00:00Z`).getTime()
  const nowTime = now.getTime()
  const daysRemaining = Math.ceil((endTime - nowTime) / (24 * 60 * 60 * 1000))

  if (employee.confirmationDate) {
    const confirmedTime = new Date(`${employee.confirmationDate}T00:00:00Z`).getTime()
    if (Number.isFinite(confirmedTime) && confirmedTime <= nowTime) {
      return { kind: 'confirmed', endsAt, daysRemaining }
    }
  }

  if (nowTime > endTime) return { kind: 'pending-review', endsAt, daysRemaining }
  return { kind: 'probation', endsAt, daysRemaining }
}

/** Short display label for the probation badge. */
export function probationBadgeLabel(status: ProbationStatus): string {
  switch (status.kind) {
    case 'confirmed':
      return 'Confirmed'
    case 'probation':
      return status.daysRemaining != null
        ? `Probation (${status.daysRemaining} days remaining)`
        : 'Probation'
    case 'pending-review':
      return 'Probation pending review'
    case 'na':
      return 'Probation N/A'
  }
}
