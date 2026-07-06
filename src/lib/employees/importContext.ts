/*
 * Server-side builder for the reconcile context: loads the current employees +
 * canonical taxonomy and wires the deterministic id + onboarding checklist, so
 * the bulk-upload preview and commit routes reconcile against live data with
 * exactly the same rules as the import script. Kept out of reconcileImport.ts
 * so that module stays pure (fs-free) + unit-testable.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { loadEmployees } from '@/lib/data'
import { defaultOnboardingChecklist } from '@/lib/onboarding'
import { buildManagerLookup, type ReconcileContext } from './reconcileImport'

/** Stable id from an employee code (matches scripts/import_employees.ts so a
 *  code imported by either path lands on the same record). */
export function deterministicEmployeeId(code: string): string {
  const h = crypto.createHash('sha256').update(`gsl-hr-emp:${code}`).digest('hex').slice(0, 32)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

function loadTaxonomy(): { departments: Record<string, unknown>; locations: Record<string, unknown> } {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'taxonomy.json'), 'utf-8')
    const t = JSON.parse(raw) as { departments?: Record<string, unknown>; locations?: Record<string, unknown> }
    return { departments: t.departments ?? {}, locations: t.locations ?? {} }
  } catch {
    return { departments: {}, locations: {} }
  }
}

export function buildReconcileContext({
  actor,
  now,
  overwriteFields,
}: {
  actor: string
  now: string
  overwriteFields?: Set<string>
}): ReconcileContext {
  const employees = loadEmployees()
  const taxonomy = loadTaxonomy()
  const { nameToId, idToName } = buildManagerLookup(employees)
  return {
    existingByCode: new Map(employees.filter((e) => e.employeeCode).map((e) => [e.employeeCode, e])),
    existingByEmail: new Map(employees.filter((e) => e.email).map((e) => [e.email.toLowerCase(), e])),
    managerNameToId: nameToId,
    managerIdToName: idToName,
    validDepartments: new Set(Object.keys(taxonomy.departments)),
    validLocations: new Set(Object.keys(taxonomy.locations)),
    now,
    actor,
    idFor: deterministicEmployeeId,
    defaultOnboardingChecklist,
    overwriteFields,
  }
}
