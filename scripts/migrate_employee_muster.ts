/*
 * Migrate Employee_Muster_v2.xlsx into src/data/employees.json.
 *
 * Idempotent. Match strategy: by employeeCode (primary), email (fallback).
 * For matched rows: merge new HR-Ops fields onto the existing record while
 * preserving id / createdAt / auditLog / candidateId / applicationId /
 * salaryStructure / exit / onboardingChecklist. New rows get a fresh id +
 * audit-create entry. Rows missing employeeCode are skipped (they're
 * address-line spillovers from the source xlsx).
 *
 * Run:
 *   npx tsx scripts/migrate_employee_muster.ts [--dry-run]
 *
 * Reports: created / updated / skipped / conflicts.
 *
 * Side effects (live mode only):
 *   - Overwrites src/data/employees.json with the merged result.
 *   - The script is one-shot — it does NOT use the pendingUpdates queue.
 *     Anish runs it locally and commits the resulting JSON. Re-running on a
 *     fresh checkout produces the same diff (modulo audit timestamps).
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { readXlsxAsRecords } from './lib/xlsxReader'
import {
  DEFAULT_LEAVE_BALANCE,
  excelSerialToISO,
  FLAGGED_DEPARTMENTS,
  inferEmploymentStatus,
  inferLocationType,
  inferWorkPattern,
  leaveYearStartFor,
  resolveReportingManagerId,
  standardiseDepartment,
  standardiseLocation,
  cleanString,
} from '../src/lib/employees/standardise'
import type { Employee } from '../src/lib/types'

interface MusterRow {
  EmployeeCode: string
  Title: string
  EmployeeName: string
  DOJ: string
  Tenure: string
  Designation: string
  Department: string
  ReportingManager: string
  ConfirmDate: string
  Location: string
  OfficialEmail: string
  Gender: string
  DOB: string
  Age: string
  MaritalStatus: string
  MobileNo: string
  Address: string
  PersonalEmail: string
}

const COLUMN_MAP = {
  A: 'EmployeeCode',
  B: 'Title',
  C: 'EmployeeName',
  D: 'DOJ',
  E: 'Tenure',
  F: 'Designation',
  G: 'Department',
  H: 'ReportingManager',
  I: 'ConfirmDate',
  J: 'Location',
  K: 'OfficialEmail',
  L: 'Gender',
  M: 'DOB',
  N: 'Age',
  O: 'MaritalStatus',
  P: 'MobileNo',
  Q: 'Address',
  R: 'PersonalEmail',
} as const

const ROOT = path.join(__dirname, '..')
const MUSTER_PATH = path.join(ROOT, 'phase-4-hrops-inputs', 'Employee_Muster_v2.xlsx')
const EMPLOYEES_JSON = path.join(ROOT, 'src', 'data', 'employees.json')
const NOW_ISO = new Date().toISOString()
const LEAVE_YEAR_START = leaveYearStartFor(2026)

function deterministicId(employeeCode: string): string {
  // UUID-v5-ish from the employee code. Stable across runs.
  const hash = crypto.createHash('sha256').update(`gsl-hr-emp:${employeeCode}`).digest('hex')
  const hex = hash.slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function buildEmployeeFromMuster(
  row: MusterRow,
  managerLookup: Map<string, string>,
  existing: Employee | undefined,
): { employee: Employee; warnings: string[] } {
  const warnings: string[] = []

  const employeeCode = cleanString(row.EmployeeCode)
  const name = cleanString(row.EmployeeName)
  const department = standardiseDepartment(row.Department)
  const location = standardiseLocation(row.Location)
  const designation = cleanString(row.Designation)
  const dateOfJoining = excelSerialToISO(row.DOJ)
  const confirmationDate = excelSerialToISO(row.ConfirmDate)
  const dateOfBirth = excelSerialToISO(row.DOB)
  const reportingManagerId = resolveReportingManagerId(row.ReportingManager, managerLookup)
  const phone = cleanString(row.MobileNo)
  const officialEmail = cleanString(row.OfficialEmail).toLowerCase()
  const personalEmail = cleanString(row.PersonalEmail).toLowerCase() || null

  if (FLAGGED_DEPARTMENTS.has(department)) {
    warnings.push(
      `${employeeCode} ${name}: department "${department}" flagged for Riddhi to confirm canonical home.`,
    )
  }
  if (cleanString(row.ReportingManager).toUpperCase() === 'PHM') {
    warnings.push(`${employeeCode} ${name}: reports to PHM (chairman) - reportingManagerId left null.`)
  } else if (cleanString(row.ReportingManager) && !reportingManagerId) {
    warnings.push(
      `${employeeCode} ${name}: reporting manager "${row.ReportingManager}" not resolved to an employee id.`,
    )
  }

  // For each field where the muster value is empty/null, fall back to the
  // existing record. The muster occasionally has blank cells (e.g. PHM has
  // no location), and the DOB column has a mix of Excel serials and free-
  // text strings — non-parseable text comes through as null from
  // excelSerialToISO. Preserving the existing value in those cases avoids
  // the migration nulling out hand-curated data.
  const prefer = <T>(musterVal: T, existingVal: T): T => {
    const empty =
      musterVal == null || (typeof musterVal === 'string' && musterVal.trim() === '')
    return empty ? existingVal : musterVal
  }

  const workPattern = existing?.workPattern ?? inferWorkPattern({ department, designation })
  const employmentStatus =
    existing?.status === 'Exited'
      ? 'Exited'
      : inferEmploymentStatus({ confirmedAt: confirmationDate ?? existing?.confirmationDate ?? null })

  const id = existing?.id ?? deterministicId(employeeCode)

  // Audit entry. Only append when something is actually changing — avoid
  // log spam on idempotent re-runs. Comparing by content via JSON.stringify
  // of the whole projected record vs. existing.
  const finalLocation = prefer(location, existing?.location ?? '')
  const finalDepartment = prefer(department, existing?.department ?? '')
  const finalEmail = prefer(officialEmail, existing?.email ?? '')

  const projection = {
    employeeCode,
    title: prefer(cleanString(row.Title) || null, existing?.title ?? null),
    name: prefer(name, existing?.name ?? ''),
    email: finalEmail,
    phone: prefer(phone || null, existing?.phone ?? null),
    designation: prefer(designation, existing?.designation ?? ''),
    department: finalDepartment,
    reportingTo: prefer(cleanString(row.ReportingManager) || null, existing?.reportingTo ?? null),
    reportingManagerId: reportingManagerId ?? existing?.reportingManagerId ?? null,
    location: finalLocation,
    locationType: inferLocationType(finalLocation),
    dateOfJoining: prefer(dateOfJoining, existing?.dateOfJoining ?? null),
    confirmationDate: prefer(confirmationDate, existing?.confirmationDate ?? null),
    dateOfBirth: prefer(dateOfBirth, existing?.dateOfBirth ?? null),
    age: row.Age ? Number(row.Age) : (existing?.age ?? null),
    gender: prefer(cleanString(row.Gender) || null, existing?.gender ?? null),
    maritalStatus: prefer(cleanString(row.MaritalStatus) || null, existing?.maritalStatus ?? null),
    address: prefer(cleanString(row.Address) || null, existing?.address ?? null),
    personalEmail: prefer(personalEmail, existing?.personalEmail ?? null),
    employmentStatus,
    workPattern,
    leaveBalance: existing?.leaveBalance ?? { ...DEFAULT_LEAVE_BALANCE },
    leaveYearStart: existing?.leaveYearStart ?? LEAVE_YEAR_START,
    officialEmailMissing: !finalEmail,
  } as const

  if (existing) {
    const previousProjection = {
      employeeCode: existing.employeeCode,
      title: existing.title ?? null,
      name: existing.name,
      email: existing.email,
      phone: existing.phone ?? null,
      designation: existing.designation,
      department: existing.department,
      reportingTo: existing.reportingTo ?? null,
      reportingManagerId: existing.reportingManagerId ?? null,
      location: existing.location,
      locationType: existing.locationType ?? null,
      dateOfJoining: existing.dateOfJoining,
      confirmationDate: existing.confirmationDate ?? null,
      dateOfBirth: existing.dateOfBirth ?? null,
      age: existing.age ?? null,
      gender: existing.gender ?? null,
      maritalStatus: existing.maritalStatus ?? null,
      address: existing.address ?? null,
      personalEmail: existing.personalEmail ?? null,
      employmentStatus: existing.employmentStatus ?? null,
      workPattern: existing.workPattern ?? null,
      leaveBalance: existing.leaveBalance ?? null,
      leaveYearStart: existing.leaveYearStart ?? null,
      officialEmailMissing: existing.officialEmailMissing ?? false,
    }

    const auditLog = [...(existing.auditLog ?? [])]
    if (JSON.stringify(previousProjection) !== JSON.stringify(projection)) {
      auditLog.push({
        timestamp: NOW_ISO,
        user: 'muster-migration',
        action: 'employee.muster_v2_import',
        before: previousProjection,
        after: projection,
        notes: 'Phase 4 HR-Ops schema migration from Employee_Muster_v2.xlsx',
      })
    }

    const merged: Employee = {
      ...existing,
      id,
      ...projection,
      // Preserve recruitment-side joins and lifecycle data.
      candidateId: existing.candidateId,
      applicationId: existing.applicationId,
      ctcAnnual: existing.ctcAnnual,
      salaryStructure: existing.salaryStructure,
      exit: existing.exit,
      onboardingChecklist: existing.onboardingChecklist,
      tenureYears: row.Tenure ? Number(row.Tenure) : (existing.tenureYears ?? null),
      status: existing.status,
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
      updatedAt: NOW_ISO,
      auditLog,
    }
    return { employee: merged, warnings }
  }

  // Net-new employee.
  const fresh: Employee = {
    id,
    candidateId: undefined,
    applicationId: undefined,
    ...projection,
    tenureYears: row.Tenure ? Number(row.Tenure) : null,
    status: 'Active',
    createdAt: NOW_ISO,
    createdBy: 'muster-migration',
    updatedAt: NOW_ISO,
    auditLog: [
      {
        timestamp: NOW_ISO,
        user: 'muster-migration',
        action: 'employee.create',
        after: projection,
        notes: 'Created from Employee_Muster_v2.xlsx',
      },
    ],
  }
  return { employee: fresh, warnings }
}

function main() {
  const dryRun = process.argv.includes('--dry-run')

  if (!fs.existsSync(MUSTER_PATH)) {
    throw new Error(`Muster not found: ${MUSTER_PATH}`)
  }

  const muster = readXlsxAsRecords(MUSTER_PATH, COLUMN_MAP) as unknown as Array<
    MusterRow & { _rowNum: number }
  >

  const existingRaw = fs.existsSync(EMPLOYEES_JSON)
    ? (JSON.parse(fs.readFileSync(EMPLOYEES_JSON, 'utf-8')) as Employee[])
    : []
  const byCode = new Map(existingRaw.filter((e) => e.employeeCode).map((e) => [e.employeeCode, e]))
  const byEmail = new Map(
    existingRaw.filter((e) => e.email).map((e) => [e.email.toLowerCase(), e]),
  )

  // Build manager lookup. Pass 1: full-name keys. Pass 2: first-name keys
  // ONLY when exactly one employee in the muster has that first name (so
  // "Shubhangi" -> SHUBHANGI GAJAKOSH resolves cleanly, but ambiguous first
  // names don't get auto-mapped to whichever record happens to be first).
  const managerLookup = new Map<string, string>()
  const firstNameCounts = new Map<string, number>()
  const firstNameToId = new Map<string, string>()
  for (const row of muster) {
    const code = cleanString(row.EmployeeCode)
    if (!code) continue
    const fullName = cleanString(row.EmployeeName).toLowerCase()
    if (!fullName) continue
    const id = byCode.get(code)?.id ?? deterministicId(code)
    managerLookup.set(fullName, id)
    const firstToken = (fullName.split(/\s+/)[0] ?? '').trim()
    if (firstToken) {
      firstNameCounts.set(firstToken, (firstNameCounts.get(firstToken) ?? 0) + 1)
      firstNameToId.set(firstToken, id)
    }
  }
  // Promote unique first names into the lookup, but never overwrite a
  // full-name key.
  for (const [first, count] of firstNameCounts) {
    if (count === 1 && !managerLookup.has(first)) {
      managerLookup.set(first, firstNameToId.get(first)!)
    }
  }

  // Hand-curated aliases for canonical name drift in the source data.
  // Document each alias inline so future migrations know why it's here.
  // Anish/Riddhi sign-off on each alias before commit.
  const ALIASES: Array<{ alias: string; canonical: string; reason: string }> = [
    {
      alias: 'ameet zaveri',
      canonical: 'amit zaveri',
      reason: 'CEO MTPL/014 is recorded as AMIT ZAVERI but referenced as Ameet Zaveri in the reporting-manager column.',
    },
  ]
  for (const { alias, canonical } of ALIASES) {
    const id = managerLookup.get(canonical)
    if (id && !managerLookup.has(alias)) managerLookup.set(alias, id)
  }

  const results = {
    created: [] as string[],
    updated: [] as string[],
    skipped: [] as string[],
    conflicts: [] as string[],
    warnings: [] as string[],
  }

  const merged: Employee[] = []
  const seenIds = new Set<string>()

  // Pass 1: process every existing employee. If matched by the muster, use
  // the muster row to project; else preserve as-is (with default leave fields
  // backfilled if missing, so the schema is consistent).
  for (const existing of existingRaw) {
    const code = existing.employeeCode
    const musterRow = muster.find((r) => cleanString(r.EmployeeCode) === code)
    if (musterRow) {
      const { employee, warnings } = buildEmployeeFromMuster(musterRow, managerLookup, existing)
      merged.push(employee)
      seenIds.add(employee.id)
      results.updated.push(`${code} ${existing.name}`)
      results.warnings.push(...warnings)
    } else {
      // Existing employee not in the muster — preserve, backfill defaults.
      const updated: Employee = {
        ...existing,
        leaveBalance: existing.leaveBalance ?? { ...DEFAULT_LEAVE_BALANCE },
        leaveYearStart: existing.leaveYearStart ?? LEAVE_YEAR_START,
        employmentStatus:
          existing.employmentStatus ??
          (existing.status === 'Exited'
            ? 'Exited'
            : inferEmploymentStatus({ confirmedAt: existing.confirmationDate })),
        workPattern:
          existing.workPattern ??
          inferWorkPattern({
            department: existing.department,
            designation: existing.designation,
          }),
        locationType: existing.locationType ?? inferLocationType(existing.location ?? ''),
      }
      merged.push(updated)
      seenIds.add(updated.id)
      results.skipped.push(`${code} ${existing.name} (in employees.json, not in muster)`)
    }
  }

  // Pass 2: handle muster rows not matched to any existing employee.
  for (const row of muster) {
    const code = cleanString(row.EmployeeCode)
    if (!code) {
      // The xlsx has 3 trailing rows with only an Address cell — those are
      // address-line spillovers from the previous record. Safe to skip.
      const desc = cleanString(row.Address) || cleanString(row.EmployeeName) || `row ${row._rowNum}`
      results.skipped.push(`row ${row._rowNum}: missing EmployeeCode (likely address-spillover) - "${desc}"`)
      continue
    }
    const existingByCode = byCode.get(code)
    if (existingByCode) continue // handled in pass 1

    const email = cleanString(row.OfficialEmail).toLowerCase()
    const existingByEmail = email ? byEmail.get(email) : undefined
    if (existingByEmail && existingByEmail.employeeCode !== code) {
      // Same email, different employeeCode — surface the conflict.
      results.conflicts.push(
        `${code} ${cleanString(row.EmployeeName)}: email ${email} already used by ${existingByEmail.employeeCode}`,
      )
      continue
    }

    const { employee, warnings } = buildEmployeeFromMuster(row, managerLookup, undefined)
    if (seenIds.has(employee.id)) {
      results.conflicts.push(`${code}: deterministic id collision with another record`)
      continue
    }
    merged.push(employee)
    seenIds.add(employee.id)
    results.created.push(`${code} ${cleanString(row.EmployeeName)}`)
    results.warnings.push(...warnings)
  }

  console.log('\n=== Migration report ===')
  console.log(`Existing employees:     ${existingRaw.length}`)
  console.log(`Muster rows:            ${muster.length} (incl. ${muster.filter((r) => !cleanString(r.EmployeeCode)).length} no-code spillover rows)`)
  console.log(`Created:                ${results.created.length}`)
  console.log(`Updated:                ${results.updated.length}`)
  console.log(`Skipped (not in muster):${results.skipped.length}`)
  console.log(`Conflicts:              ${results.conflicts.length}`)
  console.log(`Warnings:               ${results.warnings.length}`)
  console.log(`Output records:         ${merged.length}`)

  if (results.conflicts.length) {
    console.log('\n--- Conflicts (manual resolution required) ---')
    results.conflicts.forEach((c) => console.log('  ' + c))
  }
  if (results.warnings.length) {
    console.log('\n--- Warnings ---')
    results.warnings.forEach((w) => console.log('  ' + w))
  }
  if (results.created.length) {
    console.log('\n--- Created ---')
    results.created.forEach((c) => console.log('  ' + c))
  }
  if (results.skipped.length) {
    console.log('\n--- Skipped ---')
    results.skipped.forEach((s) => console.log('  ' + s))
  }

  if (dryRun) {
    console.log('\nDRY RUN: no files written.')
    return
  }

  fs.writeFileSync(EMPLOYEES_JSON, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
  console.log(`\nWrote ${merged.length} records to ${path.relative(ROOT, EMPLOYEES_JSON)}.`)
}

main()
