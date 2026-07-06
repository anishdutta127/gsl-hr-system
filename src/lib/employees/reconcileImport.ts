/*
 * Shared employee bulk-import reconcile service.
 *
 * PURE (no fs / network / queue) so the SAME create-or-reactivate, validate and
 * classify logic is used by BOTH the one-shot import script
 * (scripts/import_employees.ts) and the in-app HR bulk-upload API. The caller
 * supplies parsed rows + context (existing employees, a manager-name lookup and
 * the canonical taxonomy) and persists the results via its own write path (the
 * queue for the serverless API; a queue-file drain for the local script).
 *
 * Classification per row:
 *   - error      : a required field is missing / a date won't parse / the code
 *                  is duplicated within the file. Nothing is written.
 *   - create     : the code isn't in the system yet -> a fresh Active record.
 *   - reactivate : the code exists but is Exited/inactive -> set Active, fill
 *                  only EMPTY fields (never clobber populated data unless the
 *                  caller opts in via applyOverwrites + the field is ticked).
 *   - update     : the code exists and is already Active -> fill empty fields;
 *                  populated-field conflicts surface as fieldDiffs (a warning),
 *                  applied only when applyOverwrites is set.
 *
 * Taxonomy + links are resolved against EXISTING data only - the service never
 * invents a department, location or manager. Unresolved values are flagged.
 */

import {
  cleanString,
  DEFAULT_LEAVE_BALANCE,
  inferEmploymentStatus,
  inferLocationType,
  inferWorkPattern,
  leaveYearStartFor,
  resolveReportingManagerId,
  standardiseDepartment,
  standardiseLocation,
} from './standardise'
import type { AuditEntry, Employee } from '../types'

export interface ImportRow {
  employeeCode: string
  title: string
  name: string
  gender: string
  /** ISO yyyy-mm-dd, or '' when absent. */
  dateOfBirth: string
  dateOfJoining: string
  designation: string
  department: string
  reportingManager: string
  location: string
  confirmationDate: string
  officialEmail: string
  /** Sheet + row reference, for the report only. */
  rowRef: string
}

export type RowClassification = 'create' | 'reactivate' | 'update' | 'error'

export interface FieldDiff {
  field: string
  existing: unknown
  incoming: unknown
  /** Whether this overwrite was applied (only when the caller opts in). */
  applied: boolean
}

export interface RowResult {
  rowRef: string
  code: string
  name: string
  classification: RowClassification
  errors: string[]
  warnings: string[]
  resolvedDepartment: string | null
  resolvedLocation: string | null
  resolvedManager: { id: string; name: string } | null
  /** The record to persist for create/reactivate/update; null for error. */
  employee: Employee | null
  fieldDiffs: FieldDiff[]
}

export interface ReconcileContext {
  existingByCode: Map<string, Employee>
  existingByEmail: Map<string, Employee>
  /** lower-cased full name (and unique first names) -> employee id. */
  managerNameToId: Map<string, string>
  /** employee id -> display name, for reporting the resolved manager. */
  managerIdToName: Map<string, string>
  /** Canonical department names (from taxonomy.json). */
  validDepartments: Set<string>
  /** Canonical location names (from taxonomy.json). */
  validLocations: Set<string>
  now: string
  actor: string
  /** Deterministic id from an employee code (stable across runs). */
  idFor: (code: string) => string
  /** UI-parity onboarding checklist for fresh records. */
  defaultOnboardingChecklist?: () => Employee['onboardingChecklist']
  /** Opt-in overwrite of populated fields on existing records. Keys are
   *  `${employeeCode}:${field}` so the preview can tick individual cells. */
  overwriteFields?: Set<string>
}

const REQUIRED: Array<[keyof ImportRow, string]> = [
  ['employeeCode', 'Employee Code'],
  ['name', 'Employee Name'],
  ['dateOfJoining', 'DOJ'],
  ['designation', 'Designation'],
  ['department', 'Department'],
]

/** Title -> expected gender, for the conflict check. Only flags an outright
 *  contradiction (Mr. vs Female); never guesses or rewrites gender. */
function titleGenderConflict(title: string, gender: string): boolean {
  const t = cleanString(title).toLowerCase().replace(/\.$/, '')
  const g = cleanString(gender).toLowerCase()
  if (!t || !g) return false
  const male = new Set(['mr', 'shri', 'sri'])
  const female = new Set(['mrs', 'ms', 'miss', 'smt'])
  if (male.has(t) && g.startsWith('f')) return true
  if (female.has(t) && g.startsWith('m')) return true
  return false
}

function isIsoDate(s: string): boolean {
  if (!s) return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime())
}

/** Build the projected field set shared by create + reactivate/update. */
function project(row: ImportRow, ctx: ReconcileContext, warnings: string[]) {
  const rawDept = cleanString(row.department)
  const department = standardiseDepartment(rawDept)
  if (department && !ctx.validDepartments.has(department)) {
    warnings.push(`department "${rawDept}" not in canonical taxonomy - left as "${department}", not created.`)
  }

  const rawLoc = cleanString(row.location)
  const location = standardiseLocation(rawLoc)
  let resolvedLocation: string | null = location || null
  if (location && !ctx.validLocations.has(location)) {
    warnings.push(`location "${location}" not in canonical taxonomy - kept on the record + flagged, not created.`)
  }

  const managerRaw = cleanString(row.reportingManager)
  const managerId = resolveReportingManagerId(managerRaw, ctx.managerNameToId)
  if (managerRaw && !managerId) {
    warnings.push(`reporting manager "${managerRaw}" did not resolve to an employee - link left unset.`)
  } else if (!managerRaw) {
    warnings.push('reporting manager not provided - link left unset.')
  }
  const resolvedManager = managerId
    ? { id: managerId, name: ctx.managerIdToName.get(managerId) ?? managerRaw }
    : null

  if (titleGenderConflict(row.title, row.gender)) {
    warnings.push(
      `title "${cleanString(row.title)}" conflicts with gender "${cleanString(row.gender)}" - imported as-is, needs a human decision (drives letter pronouns).`,
    )
  }
  if (!isIsoDate(row.dateOfBirth)) warnings.push('date of birth missing - left blank.')
  if (!cleanString(row.location)) warnings.push('location not provided - left blank.')
  if (!isIsoDate(row.confirmationDate)) {
    warnings.push('confirmation date not provided.')
  } else if (isIsoDate(row.dateOfJoining)) {
    const months =
      (new Date(`${row.confirmationDate}T00:00:00Z`).getTime() -
        new Date(`${row.dateOfJoining}T00:00:00Z`).getTime()) /
      (1000 * 60 * 60 * 24 * 30.44)
    if (months > 9) {
      warnings.push(
        `confirmation date ${row.confirmationDate} is ~${Math.round(months)}mo after DOJ ${row.dateOfJoining} (usual ~6) - verify.`,
      )
    }
  }

  const designation = cleanString(row.designation)
  const email = cleanString(row.officialEmail).toLowerCase()

  return {
    department,
    location,
    resolvedLocation,
    resolvedManager,
    managerId,
    managerRaw,
    designation,
    email,
    projection: {
      employeeCode: cleanString(row.employeeCode),
      title: cleanString(row.title) || null,
      name: cleanString(row.name),
      email,
      phone: null as string | null,
      designation,
      department,
      reportingTo: managerRaw || null,
      reportingManagerId: managerId,
      location,
      locationType: inferLocationType(location),
      dateOfJoining: isIsoDate(row.dateOfJoining) ? row.dateOfJoining : null,
      confirmationDate: isIsoDate(row.confirmationDate) ? row.confirmationDate : null,
      dateOfBirth: isIsoDate(row.dateOfBirth) ? row.dateOfBirth : null,
      age: null as number | null,
      gender: cleanString(row.gender) || null,
      maritalStatus: null as string | null,
      address: null as string | null,
      personalEmail: null as string | null,
      employmentStatus: inferEmploymentStatus({
        confirmedAt: isIsoDate(row.confirmationDate) ? row.confirmationDate : null,
        now: new Date(ctx.now),
      }),
      workPattern: inferWorkPattern({ department, designation }),
      leaveBalance: { ...DEFAULT_LEAVE_BALANCE },
      leaveYearStart: leaveYearStartFor(new Date(ctx.now).getUTCFullYear()),
      officialEmailMissing: !email,
    },
  }
}

function freshEmployee(row: ImportRow, ctx: ReconcileContext, warnings: string[]): Employee {
  const { projection } = project(row, ctx, warnings)
  const code = projection.employeeCode
  const audit: AuditEntry = {
    timestamp: ctx.now,
    user: ctx.actor,
    action: 'employee.create',
    after: { employeeCode: code, designation: projection.designation, dateOfJoining: projection.dateOfJoining },
    notes: 'Bulk import (create-or-reactivate reconcile service).',
  }
  return {
    id: ctx.idFor(code),
    candidateId: undefined,
    applicationId: undefined,
    ...projection,
    tenureYears: null,
    status: 'Active',
    onboardingChecklist: ctx.defaultOnboardingChecklist?.(),
    createdAt: ctx.now,
    createdBy: ctx.actor,
    updatedAt: ctx.now,
    auditLog: [audit],
  } as Employee
}

/** Fill only EMPTY fields on an existing record; populated-field conflicts are
 *  reported as diffs and applied only when the caller opted the field in. */
function reconcileExisting(
  row: ImportRow,
  ctx: ReconcileContext,
  existing: Employee,
  warnings: string[],
): { employee: Employee; diffs: FieldDiff[]; reactivated: boolean } {
  const { projection } = project(row, ctx, warnings)
  const diffs: FieldDiff[] = []
  const merged: Record<string, unknown> = { ...existing }
  const isEmpty = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

  for (const [key, incoming] of Object.entries(projection)) {
    if (key === 'leaveBalance' || key === 'leaveYearStart' || key === 'officialEmailMissing') continue
    const current = (existing as unknown as Record<string, unknown>)[key]
    if (isEmpty(incoming)) continue
    if (isEmpty(current)) {
      merged[key] = incoming // fill the gap
    } else if (JSON.stringify(current) !== JSON.stringify(incoming)) {
      // Opt-in overwrite, keyed per employee-code + field so the preview can
      // tick individual cells (never a blanket overwrite).
      const applied = ctx.overwriteFields?.has(`${cleanString(row.employeeCode)}:${key}`) ?? false
      if (applied) merged[key] = incoming
      diffs.push({ field: key, existing: current, incoming, applied })
    }
  }

  const reactivated = existing.status === 'Exited' || existing.employmentStatus === 'Exited'
  merged.status = 'Active'
  if (existing.employmentStatus === 'Exited') merged.employmentStatus = projection.employmentStatus
  merged.leaveBalance = existing.leaveBalance ?? { ...DEFAULT_LEAVE_BALANCE }
  merged.leaveYearStart = existing.leaveYearStart ?? projection.leaveYearStart
  merged.updatedAt = ctx.now

  const audit: AuditEntry = {
    timestamp: ctx.now,
    user: ctx.actor,
    action: reactivated ? 'employee.reactivate' : 'employee.import.update',
    after: {
      reactivated,
      filledFields: Object.keys(projection).filter(
        (k) => isEmpty((existing as unknown as Record<string, unknown>)[k]) && !isEmpty((projection as Record<string, unknown>)[k]),
      ),
      overwrites: diffs.filter((d) => d.applied).map((d) => d.field),
    },
    notes: 'Bulk import reconcile: set Active, filled empty fields.',
  }
  merged.auditLog = [...(existing.auditLog ?? []), audit]
  return { employee: merged as unknown as Employee, diffs, reactivated }
}

/**
 * Reconcile a batch of import rows against the current data. Returns one
 * RowResult per input row (order preserved). Pure - the caller persists the
 * `employee` records for non-error rows via its own write path.
 */
export function reconcileEmployeeImport(rows: ImportRow[], ctx: ReconcileContext): RowResult[] {
  const seenCodes = new Map<string, number>()
  rows.forEach((r, i) => {
    const code = cleanString(r.employeeCode)
    if (code) seenCodes.set(code, (seenCodes.get(code) ?? 0) + 1)
  })

  const usedInThisRun = new Set<string>()
  const results: RowResult[] = []

  for (const row of rows) {
    const code = cleanString(row.employeeCode)
    const name = cleanString(row.name)
    const errors: string[] = []
    const warnings: string[] = []

    for (const [key, label] of REQUIRED) {
      if (!cleanString(row[key])) errors.push(`missing required field: ${label}`)
    }
    for (const [field, label] of [
      ['dateOfJoining', 'DOJ'],
      ['dateOfBirth', 'DOB'],
      ['confirmationDate', 'Confirmation Date'],
    ] as Array<[keyof ImportRow, string]>) {
      const v = cleanString(row[field])
      if (v && !isIsoDate(v)) errors.push(`${label} does not parse as a date: "${v}"`)
    }
    if (code && (seenCodes.get(code) ?? 0) > 1) {
      errors.push('duplicate Employee Code within the file')
    }

    if (errors.length > 0) {
      results.push({
        rowRef: row.rowRef, code, name, classification: 'error', errors, warnings,
        resolvedDepartment: null, resolvedLocation: null, resolvedManager: null,
        employee: null, fieldDiffs: [],
      })
      continue
    }

    const existing = ctx.existingByCode.get(code)
    if (existing) {
      const { employee, diffs, reactivated } = reconcileExisting(row, ctx, existing, warnings)
      results.push({
        rowRef: row.rowRef, code, name,
        classification: reactivated ? 'reactivate' : 'update',
        errors, warnings,
        resolvedDepartment: employee.department || null,
        resolvedLocation: employee.location || null,
        resolvedManager: employee.reportingManagerId
          ? { id: employee.reportingManagerId, name: ctx.managerIdToName.get(employee.reportingManagerId) ?? '' }
          : null,
        employee, fieldDiffs: diffs,
      })
      continue
    }

    // Net-new. Guard against an email already used by a different code.
    const email = cleanString(row.officialEmail).toLowerCase()
    const emailClash = email ? ctx.existingByEmail.get(email) : undefined
    if (emailClash && emailClash.employeeCode !== code) {
      results.push({
        rowRef: row.rowRef, code, name, classification: 'error',
        errors: [`email ${email} already used by ${emailClash.employeeCode}`], warnings,
        resolvedDepartment: null, resolvedLocation: null, resolvedManager: null,
        employee: null, fieldDiffs: [],
      })
      continue
    }
    const id = ctx.idFor(code)
    if (usedInThisRun.has(id)) {
      results.push({
        rowRef: row.rowRef, code, name, classification: 'error',
        errors: ['deterministic id collision with another row in this file'], warnings,
        resolvedDepartment: null, resolvedLocation: null, resolvedManager: null,
        employee: null, fieldDiffs: [],
      })
      continue
    }
    usedInThisRun.add(id)

    const employee = freshEmployee(row, ctx, warnings)
    const { resolvedManager } = project(row, ctx, [])
    results.push({
      rowRef: row.rowRef, code, name, classification: 'create', errors, warnings,
      resolvedDepartment: employee.department || null,
      resolvedLocation: employee.location || null,
      resolvedManager,
      employee, fieldDiffs: [],
    })
  }

  return results
}

/** Build the name -> id manager lookup (full names + unique first names) from
 *  the current employees. Shared by both callers so resolution is identical. */
export function buildManagerLookup(employees: Employee[]): {
  nameToId: Map<string, string>
  idToName: Map<string, string>
} {
  const nameToId = new Map<string, string>()
  const idToName = new Map<string, string>()
  const firstCounts = new Map<string, number>()
  const firstToId = new Map<string, string>()
  for (const e of employees) {
    const full = cleanString(e.name).toLowerCase()
    if (!full) continue
    nameToId.set(full, e.id)
    idToName.set(e.id, e.name)
    const first = full.split(/\s+/)[0] ?? ''
    if (first) {
      firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1)
      firstToId.set(first, e.id)
    }
  }
  for (const [first, count] of firstCounts) {
    if (count === 1 && !nameToId.has(first)) nameToId.set(first, firstToId.get(first)!)
  }
  return { nameToId, idToName }
}
