/*
 * Employee master standardisation helpers.
 *
 * Pure, deterministic functions used by the muster migration script and by
 * any future bulk-import pipeline. Kept free of fs / network / queue access
 * so they're trivially unit-testable.
 *
 * The shape rules here come from Phase 4 HR-Ops brief and the actual data
 * in Employee_Muster_v2.xlsx (trailing spaces, dept-name drift, PHM as a
 * non-system reporting manager).
 */

import type {
  EmploymentStatus,
  LocationType,
  WorkPattern,
} from '@/lib/types'

/**
 * Trim leading/trailing whitespace and collapse internal whitespace runs.
 * The muster has values like `"Durgapur "`, `"Pune "`, `"Shubhangi "` with
 * trailing spaces that would otherwise create taxonomy duplicates.
 */
export function cleanString(raw: string | undefined | null): string {
  if (raw == null) return ''
  return String(raw).replace(/\s+/g, ' ').trim()
}

/**
 * Standardise a location string. Trims whitespace, then leaves the rest
 * as-is — the muster locations are already correct city names, just with
 * trailing spaces on three of them.
 */
export function standardiseLocation(raw: string | undefined | null): string {
  return cleanString(raw)
}

/** Cities that are formal GSL offices (HR/admin presence on-site). All
 * other locations are remote-field — individual employees based there but
 * no anchor office. Riddhi can promote a city later via the admin page. */
const OFFICE_LOCATIONS = new Set(['Mumbai', 'Kolkata'])

export function inferLocationType(location: string): LocationType {
  return OFFICE_LOCATIONS.has(cleanString(location)) ? 'office' : 'remote-field'
}

/**
 * Standardise a department string. Merges known duplicates flagged by
 * Riddhi, otherwise returns the trimmed value verbatim.
 *
 *   "STEM and Training" / "STEM & Training" -> "STEM & Training"
 *   "Product and Training" / "Product"      -> "Product"
 *
 * "Demonstration & Support" is NOT auto-merged — flagged for Anish/Riddhi
 * review (likely belongs under Operations or Sales).
 */
export function standardiseDepartment(raw: string | undefined | null): string {
  const cleaned = cleanString(raw)
  if (cleaned === 'STEM and Training') return 'STEM & Training'
  if (cleaned === 'Product and Training') return 'Product'
  return cleaned
}

/**
 * Departments that warrant a manual-review flag from the migration. These
 * aren't broken — they just need Riddhi to confirm the canonical home.
 */
export const FLAGGED_DEPARTMENTS = new Set(['Demonstration & Support'])

/**
 * Infer the work pattern from department + designation, per the brief:
 *   - Academics / STEM & Training       -> trainer-6day
 *   - Sales / Premium Sales / field     -> field
 *   - everyone else                     -> office-5day
 *
 * `hybrid-2day` and `remote` are never inferred; HR sets them manually.
 */
export function inferWorkPattern({
  department,
  designation,
}: {
  department: string
  designation: string
}): WorkPattern {
  const dept = cleanString(department).toLowerCase()
  const role = cleanString(designation).toLowerCase()
  const isTrainer =
    dept === 'academics' ||
    dept === 'stem & training' ||
    role.includes('trainer') ||
    role.includes('faculty')
  if (isTrainer) return 'trainer-6day'
  const isField =
    dept === 'sales' ||
    dept === 'premium sales' ||
    role.includes('field') ||
    role.includes('regional sales')
  if (isField) return 'field'
  return 'office-5day'
}

/**
 * Infer the employmentStatus marker from join + confirmation dates,
 * relative to a clock value (defaults to now). The brief's rule:
 *
 *   - confirmedAt in the past   -> Confirmed
 *   - confirmedAt in the future -> Probation
 *   - no confirmedAt yet        -> Active (legacy record, missing data)
 *
 * Already-exited records are caught by the caller before this runs.
 */
export function inferEmploymentStatus({
  confirmedAt,
  now = new Date(),
}: {
  confirmedAt: string | null | undefined
  now?: Date
}): EmploymentStatus {
  if (!confirmedAt) return 'Active'
  const cd = new Date(confirmedAt)
  if (Number.isNaN(cd.getTime())) return 'Active'
  return cd.getTime() <= now.getTime() ? 'Confirmed' : 'Probation'
}

/**
 * Resolve a free-text reporting-manager name to an employee id by matching
 * against a map of names -> ids. Case-insensitive, whitespace-normalised.
 *
 * "PHM" (Padmanabh H Mafatlal, chairman) is intentionally not in the
 * employee list, so any record whose manager is PHM resolves to null.
 * Audit-noted upstream.
 */
export function resolveReportingManagerId(
  rawName: string | null | undefined,
  nameToId: Map<string, string>,
): string | null {
  const cleaned = cleanString(rawName)
  if (!cleaned) return null
  if (cleaned.toUpperCase() === 'PHM') return null
  const lower = cleaned.toLowerCase()
  const exact = nameToId.get(lower)
  if (exact) return exact
  // Try the first token only — covers "Shubhangi" referencing "SHUBHANGI
  // GAJAKOSH" or "Balu R" referencing "BALU MAHENDRAN" when the lookup has
  // a unique first-name key. Caller is responsible for not adding ambiguous
  // first-name keys to the lookup.
  const firstToken = lower.split(/\s+/)[0] ?? ''
  if (firstToken && firstToken !== lower) {
    return nameToId.get(firstToken) ?? null
  }
  return null
}

/**
 * Excel stores dates as a number of days since 1900-01-00 (with the
 * 1900-leap-year bug). Convert to an ISO date string. Returns null when
 * input isn't a number or is non-positive.
 */
export function excelSerialToISO(serial: number | string | null | undefined): string | null {
  if (serial == null || serial === '') return null
  const n = typeof serial === 'number' ? serial : Number(serial)
  if (!Number.isFinite(n) || n <= 0) return null
  // Excel epoch: 1899-12-30 (offset by 2 to account for 1900-leap bug).
  const epoch = Date.UTC(1899, 11, 30)
  const ms = epoch + n * 24 * 60 * 60 * 1000
  const d = new Date(ms)
  return d.toISOString().slice(0, 10)
}

/** Default leave year start for an April-based policy. Returns ISO date. */
export function leaveYearStartFor(year: number): string {
  return `${year}-04-01`
}

/** GSL's default annual leave allotment per Riddhi's policy. */
export const DEFAULT_LEAVE_BALANCE = { casual: 12, sick: 12 } as const
