/*
 * Taxonomy reads + cascade-rename helpers.
 *
 * Source of truth for the *list* of locations and departments is
 * employees.json — derive distinct values from there. taxonomy.json holds
 * only the metadata HR attaches per name (locationType, flagged, notes).
 *
 * Mutations are admin-only and direct (atomicUpdateJson, not the queue):
 * each rename / merge / retype is one commit + one rebuild. Riddhi runs
 * them rarely (department restructure, location promotion to office).
 */

import fs from 'node:fs'
import path from 'node:path'
import type {
  Employee,
  LocationMeta,
  LocationType,
  DepartmentMeta,
  Taxonomy,
} from './types'
import { loadEmployees } from './data'

const TAXONOMY_FILE = path.join(process.cwd(), 'src', 'data', 'taxonomy.json')

const EMPTY_TAXONOMY: Taxonomy = { locations: {}, departments: {}, auditLog: [] }

export function loadTaxonomy(): Taxonomy {
  try {
    if (!fs.existsSync(TAXONOMY_FILE)) return { ...EMPTY_TAXONOMY }
    const text = fs.readFileSync(TAXONOMY_FILE, 'utf-8').trim()
    if (!text) return { ...EMPTY_TAXONOMY }
    const parsed = JSON.parse(text) as Taxonomy
    return {
      locations: parsed.locations ?? {},
      departments: parsed.departments ?? {},
      auditLog: parsed.auditLog ?? [],
    }
  } catch {
    return { ...EMPTY_TAXONOMY }
  }
}

export interface LocationView {
  name: string
  type: LocationType
  count: number
  notes?: string
}

export interface DepartmentView {
  name: string
  count: number
  flagged: boolean
  notes?: string
}

/**
 * Combine the metadata from taxonomy.json with the live employee counts
 * derived from employees.json. Locations or departments that exist in
 * employees.json but are missing metadata are surfaced (with default
 * locationType=remote-field and flagged=false) so HR sees them.
 */
export function buildLocationViews(
  employees: Employee[],
  taxonomy: Taxonomy,
): LocationView[] {
  const counts = new Map<string, number>()
  for (const emp of employees) {
    if (emp.status === 'Exited') continue
    const loc = (emp.location ?? '').trim()
    if (!loc) continue
    counts.set(loc, (counts.get(loc) ?? 0) + 1)
  }
  // Include taxonomy locations even if no employees are there yet — Riddhi
  // can pre-create offices.
  for (const name of Object.keys(taxonomy.locations)) {
    if (!counts.has(name)) counts.set(name, 0)
  }
  const out: LocationView[] = []
  for (const [name, count] of counts) {
    const meta: LocationMeta = taxonomy.locations[name] ?? { type: 'remote-field' }
    out.push({ name, type: meta.type, count, notes: meta.notes })
  }
  // Office first, then by count desc, then alphabetic.
  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'office' ? -1 : 1
    if (a.count !== b.count) return b.count - a.count
    return a.name.localeCompare(b.name)
  })
  return out
}

export function buildDepartmentViews(
  employees: Employee[],
  taxonomy: Taxonomy,
): DepartmentView[] {
  const counts = new Map<string, number>()
  for (const emp of employees) {
    if (emp.status === 'Exited') continue
    const dept = (emp.department ?? '').trim()
    if (!dept) continue
    counts.set(dept, (counts.get(dept) ?? 0) + 1)
  }
  for (const name of Object.keys(taxonomy.departments)) {
    if (!counts.has(name)) counts.set(name, 0)
  }
  const out: DepartmentView[] = []
  for (const [name, count] of counts) {
    const meta: DepartmentMeta = taxonomy.departments[name] ?? {}
    out.push({ name, count, flagged: meta.flagged ?? false, notes: meta.notes })
  }
  out.sort((a, b) => {
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1
    if (a.count !== b.count) return b.count - a.count
    return a.name.localeCompare(b.name)
  })
  return out
}

/**
 * Pure cascade-rename: returns a new employees array with every record's
 * `location` (or `department`) field renamed from `from` to `to`. The
 * audit-log entries are appended on the changed records. Used by the API
 * route AND by tests.
 */
export function cascadeRenameLocation({
  employees,
  from,
  to,
  user,
  now,
}: {
  employees: Employee[]
  from: string
  to: string
  user: string
  now: string
}): { next: Employee[]; touchedIds: string[] } {
  return cascadeField({
    employees,
    field: 'location',
    from,
    to,
    user,
    action: from === to ? 'employee.taxonomy.no-op' : 'employee.location.rename',
    now,
  })
}

export function cascadeRenameDepartment({
  employees,
  from,
  to,
  user,
  now,
}: {
  employees: Employee[]
  from: string
  to: string
  user: string
  now: string
}): { next: Employee[]; touchedIds: string[] } {
  return cascadeField({
    employees,
    field: 'department',
    from,
    to,
    user,
    action: from === to ? 'employee.taxonomy.no-op' : 'employee.department.rename',
    now,
  })
}

function cascadeField({
  employees,
  field,
  from,
  to,
  user,
  action,
  now,
}: {
  employees: Employee[]
  field: 'location' | 'department'
  from: string
  to: string
  user: string
  action: string
  now: string
}): { next: Employee[]; touchedIds: string[] } {
  const fromTrimmed = from.trim()
  const toTrimmed = to.trim()
  if (!fromTrimmed || !toTrimmed) {
    throw new Error('cascadeField: from/to must be non-empty')
  }
  const touchedIds: string[] = []
  const next = employees.map((emp) => {
    if ((emp[field] ?? '') !== fromTrimmed) return emp
    if (fromTrimmed === toTrimmed) return emp
    const auditEntry = {
      timestamp: now,
      user,
      action,
      before: { [field]: fromTrimmed },
      after: { [field]: toTrimmed },
      notes: `Taxonomy ${field} rename "${fromTrimmed}" -> "${toTrimmed}"`,
    }
    touchedIds.push(emp.id)
    return {
      ...emp,
      [field]: toTrimmed,
      updatedAt: now,
      auditLog: [...emp.auditLog, auditEntry],
    } as Employee
  })
  return { next, touchedIds }
}

/** Mutate the taxonomy in-place for a location rename. The metadata at the
 *  old key moves to the new key (overwriting any existing meta there if
 *  it's a merge). Returns the new taxonomy + a flag indicating whether
 *  the operation was a merge (target name already existed). */
export function applyLocationRename({
  taxonomy,
  from,
  to,
  user,
  now,
}: {
  taxonomy: Taxonomy
  from: string
  to: string
  user: string
  now: string
}): { next: Taxonomy; isMerge: boolean } {
  const isMerge = !!taxonomy.locations[to] && from !== to
  const next: Taxonomy = {
    ...taxonomy,
    locations: { ...taxonomy.locations },
    departments: { ...taxonomy.departments },
    auditLog: [...taxonomy.auditLog],
  }
  const meta = next.locations[from] ?? { type: 'remote-field' as LocationType }
  if (from !== to) {
    delete next.locations[from]
    if (!next.locations[to]) {
      next.locations[to] = meta
    }
  }
  next.auditLog.push({
    timestamp: now,
    user,
    action: isMerge ? 'taxonomy.location.merge' : 'taxonomy.location.rename',
    before: { name: from, type: meta.type },
    after: { name: to, type: next.locations[to]?.type ?? meta.type },
    notes: isMerge ? `Merged location "${from}" into "${to}"` : `Renamed "${from}" -> "${to}"`,
  })
  return { next, isMerge }
}

export function applyDepartmentRename({
  taxonomy,
  from,
  to,
  user,
  now,
}: {
  taxonomy: Taxonomy
  from: string
  to: string
  user: string
  now: string
}): { next: Taxonomy; isMerge: boolean } {
  const isMerge = !!taxonomy.departments[to] && from !== to
  const next: Taxonomy = {
    ...taxonomy,
    locations: { ...taxonomy.locations },
    departments: { ...taxonomy.departments },
    auditLog: [...taxonomy.auditLog],
  }
  const meta = next.departments[from] ?? {}
  if (from !== to) {
    delete next.departments[from]
    if (!next.departments[to]) {
      next.departments[to] = meta
    }
  }
  next.auditLog.push({
    timestamp: now,
    user,
    action: isMerge ? 'taxonomy.department.merge' : 'taxonomy.department.rename',
    before: { name: from, flagged: meta.flagged ?? false },
    after: { name: to, flagged: next.departments[to]?.flagged ?? false },
    notes: isMerge ? `Merged department "${from}" into "${to}"` : `Renamed "${from}" -> "${to}"`,
  })
  return { next, isMerge }
}

export function applyLocationRetype({
  taxonomy,
  name,
  type,
  user,
  now,
}: {
  taxonomy: Taxonomy
  name: string
  type: LocationType
  user: string
  now: string
}): { next: Taxonomy } {
  const next: Taxonomy = {
    ...taxonomy,
    locations: { ...taxonomy.locations },
    departments: { ...taxonomy.departments },
    auditLog: [...taxonomy.auditLog],
  }
  const before = next.locations[name]?.type ?? 'remote-field'
  next.locations[name] = { ...(next.locations[name] ?? {}), type }
  next.auditLog.push({
    timestamp: now,
    user,
    action: 'taxonomy.location.retype',
    before: { name, type: before },
    after: { name, type },
    notes: `Set location "${name}" type to ${type}`,
  })
  return { next }
}

export { loadEmployees }
