import { describe, expect, it } from 'vitest'
import {
  buildManagerLookup,
  reconcileEmployeeImport,
  type ImportRow,
  type ReconcileContext,
} from '../employees/reconcileImport'
import type { Employee } from '../types'

const NOW = '2026-07-06T00:00:00.000Z'

function emp(over: Partial<Employee> = {}): Employee {
  return {
    id: over.id ?? 'id-x',
    employeeCode: over.employeeCode ?? 'MTPL/900',
    name: over.name ?? 'Existing Person',
    email: over.email ?? 'existing@gsl.in',
    designation: 'Manager',
    department: 'Sales',
    location: 'Mumbai',
    dateOfJoining: '2024-01-01',
    status: 'Active',
    createdAt: '2024-01-01',
    createdBy: 'seed',
    auditLog: [],
    ...over,
  } as Employee
}

function row(over: Partial<ImportRow> = {}): ImportRow {
  return {
    employeeCode: 'MTPL/500',
    title: 'Mr.',
    name: 'New Person',
    gender: 'Male',
    dateOfBirth: '1990-01-01',
    dateOfJoining: '2026-05-01',
    designation: 'Sales Executive',
    department: 'Sales',
    reportingManager: 'Existing Person',
    location: 'Mumbai',
    confirmationDate: '2026-11-01',
    officialEmail: 'new.person@gsl.in',
    rowRef: 'Sheet #1',
    ...over,
  }
}

function ctx(existing: Employee[], over: Partial<ReconcileContext> = {}): ReconcileContext {
  const { nameToId, idToName } = buildManagerLookup(existing)
  return {
    existingByCode: new Map(existing.filter((e) => e.employeeCode).map((e) => [e.employeeCode, e])),
    existingByEmail: new Map(existing.filter((e) => e.email).map((e) => [e.email.toLowerCase(), e])),
    managerNameToId: nameToId,
    managerIdToName: idToName,
    validDepartments: new Set(['Sales', 'STEM & Training', 'Academics']),
    validLocations: new Set(['Mumbai', 'Kolkata', 'Durgapur']),
    now: NOW,
    actor: 'test',
    idFor: (code) => `id-${code.replace(/\W/g, '')}`,
    ...over,
  }
}

describe('reconcileEmployeeImport', () => {
  it('creates a net-new active employee and resolves the manager', () => {
    const mgr = emp({ id: 'mgr-1', employeeCode: 'MTPL/900', name: 'Existing Person' })
    const [r] = reconcileEmployeeImport([row()], ctx([mgr]))
    expect(r.classification).toBe('create')
    expect(r.errors).toEqual([])
    expect(r.employee?.status).toBe('Active')
    expect(r.employee?.employmentStatus).toBe('Probation') // conf date in the future
    expect(r.resolvedManager).toEqual({ id: 'mgr-1', name: 'Existing Person' })
    expect(r.employee?.reportingManagerId).toBe('mgr-1')
    expect(r.employee?.auditLog[0]?.action).toBe('employee.create')
  })

  it('maps "STEM and Training" to the canonical "STEM & Training"', () => {
    const [r] = reconcileEmployeeImport([row({ department: 'STEM and Training' })], ctx([]))
    expect(r.resolvedDepartment).toBe('STEM & Training')
    expect(r.warnings.some((w) => w.includes('not in canonical'))).toBe(false)
  })

  it('flags an out-of-taxonomy location but keeps it on the record', () => {
    const [r] = reconcileEmployeeImport([row({ location: 'Ladakh' })], ctx([]))
    expect(r.classification).toBe('create')
    expect(r.employee?.location).toBe('Ladakh')
    expect(r.warnings.some((w) => w.includes('Ladakh') && w.includes('not in canonical'))).toBe(true)
  })

  it('flags a title/gender conflict without changing the gender', () => {
    const [r] = reconcileEmployeeImport([row({ title: 'Mr.', gender: 'Female' })], ctx([]))
    expect(r.employee?.gender).toBe('Female') // never guessed/rewritten
    expect(r.warnings.some((w) => w.includes('conflicts with gender'))).toBe(true)
  })

  it('errors on missing required fields', () => {
    const [r] = reconcileEmployeeImport([row({ designation: '', dateOfJoining: '' })], ctx([]))
    expect(r.classification).toBe('error')
    expect(r.employee).toBeNull()
    expect(r.errors.some((e) => e.includes('Designation'))).toBe(true)
    expect(r.errors.some((e) => e.includes('DOJ'))).toBe(true)
  })

  it('errors on a malformed date', () => {
    const [r] = reconcileEmployeeImport([row({ dateOfBirth: '31/02/1990' })], ctx([]))
    expect(r.classification).toBe('error')
    expect(r.errors.some((e) => e.includes('does not parse'))).toBe(true)
  })

  it('errors on a duplicate Employee Code within the file', () => {
    const results = reconcileEmployeeImport(
      [row({ employeeCode: 'MTPL/501' }), row({ employeeCode: 'MTPL/501', officialEmail: 'x2@gsl.in' })],
      ctx([]),
    )
    expect(results.every((r) => r.classification === 'error')).toBe(true)
    expect(results[0]?.errors.some((e) => e.includes('duplicate'))).toBe(true)
  })

  it('reactivates an existing Exited employee and fills only empty fields', () => {
    const existing = emp({
      id: 'id-MTPL500',
      employeeCode: 'MTPL/500',
      name: 'New Person',
      status: 'Exited',
      employmentStatus: 'Exited',
      designation: 'Old Title',
      location: '',
    })
    const [r] = reconcileEmployeeImport([row({ designation: 'Sales Executive', location: 'Kolkata' })], ctx([existing]))
    expect(r.classification).toBe('reactivate')
    expect(r.employee?.status).toBe('Active')
    expect(r.employee?.location).toBe('Kolkata') // filled (was empty)
    expect(r.employee?.designation).toBe('Old Title') // NOT overwritten (was populated)
    expect(r.fieldDiffs.some((d) => d.field === 'designation' && !d.applied)).toBe(true)
  })

  it('applies a populated-field overwrite only when opted in', () => {
    const existing = emp({ id: 'id-MTPL500', employeeCode: 'MTPL/500', name: 'New Person', designation: 'Old Title' })
    const [r] = reconcileEmployeeImport(
      [row({ designation: 'Sales Executive' })],
      ctx([existing], { overwriteFields: new Set(['designation']) }),
    )
    expect(r.employee?.designation).toBe('Sales Executive')
    expect(r.fieldDiffs.some((d) => d.field === 'designation' && d.applied)).toBe(true)
  })
})
