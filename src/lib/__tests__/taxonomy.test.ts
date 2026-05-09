import { describe, expect, it } from 'vitest'
import {
  applyDepartmentRename,
  applyLocationRename,
  applyLocationRetype,
  buildDepartmentViews,
  buildLocationViews,
  cascadeRenameDepartment,
  cascadeRenameLocation,
} from '../taxonomy'
import type { Employee, Taxonomy } from '../types'

const NOW = '2026-05-09T10:00:00.000Z'

function emp(overrides: Partial<Employee>): Employee {
  return {
    id: overrides.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    employeeCode: overrides.employeeCode ?? 'X/000',
    name: overrides.name ?? 'Test Person',
    email: overrides.email ?? 'test@example.com',
    designation: overrides.designation ?? 'Tester',
    department: overrides.department ?? 'Operations',
    location: overrides.location ?? 'Mumbai',
    dateOfJoining: overrides.dateOfJoining ?? '2025-01-01',
    status: overrides.status ?? 'Active',
    createdAt: overrides.createdAt ?? '2025-01-01T00:00:00.000Z',
    createdBy: overrides.createdBy ?? 'seed',
    auditLog: overrides.auditLog ?? [],
    ...overrides,
  } as Employee
}

const TAXONOMY: Taxonomy = {
  locations: {
    Mumbai: { type: 'office' },
    Kolkata: { type: 'office' },
    Bangalore: { type: 'remote-field' },
  },
  departments: {
    Operations: {},
    Academics: {},
    'Demonstration & Support': { flagged: true },
  },
  auditLog: [],
}

describe('cascadeRenameLocation', () => {
  it('rewrites every matching employee, leaves others untouched', () => {
    const employees = [
      emp({ id: 'a', location: 'Bangalore' }),
      emp({ id: 'b', location: 'Bangalore' }),
      emp({ id: 'c', location: 'Mumbai' }),
    ]
    const { next, touchedIds } = cascadeRenameLocation({
      employees,
      from: 'Bangalore',
      to: 'Bengaluru',
      user: 'anish@gsl',
      now: NOW,
    })
    expect(touchedIds).toEqual(['a', 'b'])
    expect(next.find((e) => e.id === 'a')!.location).toBe('Bengaluru')
    expect(next.find((e) => e.id === 'b')!.location).toBe('Bengaluru')
    expect(next.find((e) => e.id === 'c')!.location).toBe('Mumbai')
  })

  it('appends an audit entry to each touched record', () => {
    const employees = [emp({ id: 'a', location: 'Bangalore' })]
    const { next } = cascadeRenameLocation({
      employees,
      from: 'Bangalore',
      to: 'Bengaluru',
      user: 'anish@gsl',
      now: NOW,
    })
    const audit = next[0]!.auditLog
    expect(audit).toHaveLength(1)
    expect(audit[0]!.action).toBe('employee.location.rename')
    expect(audit[0]!.before).toEqual({ location: 'Bangalore' })
    expect(audit[0]!.after).toEqual({ location: 'Bengaluru' })
    expect(next[0]!.updatedAt).toBe(NOW)
  })

  it('no-op when from === to', () => {
    const employees = [emp({ id: 'a', location: 'Mumbai' })]
    const { next, touchedIds } = cascadeRenameLocation({
      employees,
      from: 'Mumbai',
      to: 'Mumbai',
      user: 'anish@gsl',
      now: NOW,
    })
    expect(touchedIds).toEqual([])
    expect(next).toEqual(employees)
  })

  it('rejects empty from/to', () => {
    expect(() =>
      cascadeRenameLocation({
        employees: [],
        from: '',
        to: 'Mumbai',
        user: 'a',
        now: NOW,
      }),
    ).toThrow()
  })

  it('merge case: Bangalore -> Bengaluru when both exist still cascades correctly', () => {
    const employees = [
      emp({ id: 'a', location: 'Bangalore' }),
      emp({ id: 'b', location: 'Bengaluru' }),
    ]
    const { next, touchedIds } = cascadeRenameLocation({
      employees,
      from: 'Bangalore',
      to: 'Bengaluru',
      user: 'a',
      now: NOW,
    })
    expect(touchedIds).toEqual(['a'])
    expect(next.every((e) => e.location === 'Bengaluru')).toBe(true)
  })
})

describe('cascadeRenameDepartment', () => {
  it('rewrites the department and audits', () => {
    const employees = [emp({ id: 'a', department: 'Demonstration & Support' })]
    const { next, touchedIds } = cascadeRenameDepartment({
      employees,
      from: 'Demonstration & Support',
      to: 'Operations',
      user: 'riddhi@gsl',
      now: NOW,
    })
    expect(touchedIds).toEqual(['a'])
    expect(next[0]!.department).toBe('Operations')
    expect(next[0]!.auditLog[0]!.action).toBe('employee.department.rename')
  })
})

describe('applyLocationRename', () => {
  it('moves metadata from old key to new key when target does not exist', () => {
    const { next, isMerge } = applyLocationRename({
      taxonomy: TAXONOMY,
      from: 'Bangalore',
      to: 'Bengaluru',
      user: 'anish@gsl',
      now: NOW,
    })
    expect(isMerge).toBe(false)
    expect(next.locations.Bangalore).toBeUndefined()
    expect(next.locations.Bengaluru).toEqual({ type: 'remote-field' })
    expect(next.auditLog.at(-1)!.action).toBe('taxonomy.location.rename')
  })

  it('keeps target metadata when merging into an existing location', () => {
    const { next, isMerge } = applyLocationRename({
      taxonomy: TAXONOMY,
      from: 'Bangalore',
      to: 'Mumbai',
      user: 'anish@gsl',
      now: NOW,
    })
    expect(isMerge).toBe(true)
    expect(next.locations.Bangalore).toBeUndefined()
    expect(next.locations.Mumbai!.type).toBe('office') // target's office type wins
    expect(next.auditLog.at(-1)!.action).toBe('taxonomy.location.merge')
  })

  it('returns the same taxonomy shape on a no-op rename', () => {
    const { next, isMerge } = applyLocationRename({
      taxonomy: TAXONOMY,
      from: 'Mumbai',
      to: 'Mumbai',
      user: 'anish@gsl',
      now: NOW,
    })
    expect(isMerge).toBe(false)
    expect(next.locations.Mumbai).toEqual({ type: 'office' })
  })
})

describe('applyDepartmentRename', () => {
  it('preserves flagged metadata when renaming, drops it when merging into clean target', () => {
    const { next: renamed } = applyDepartmentRename({
      taxonomy: TAXONOMY,
      from: 'Demonstration & Support',
      to: 'Demos & Support',
      user: 'a',
      now: NOW,
    })
    expect(renamed.departments['Demos & Support']?.flagged).toBe(true)

    const { next: merged } = applyDepartmentRename({
      taxonomy: TAXONOMY,
      from: 'Demonstration & Support',
      to: 'Operations',
      user: 'a',
      now: NOW,
    })
    expect(merged.departments['Demonstration & Support']).toBeUndefined()
    expect(merged.departments.Operations).toEqual({}) // target's clean meta wins
  })
})

describe('applyLocationRetype', () => {
  it('toggles type on an existing location', () => {
    const { next } = applyLocationRetype({
      taxonomy: TAXONOMY,
      name: 'Bangalore',
      type: 'office',
      user: 'anish@gsl',
      now: NOW,
    })
    expect(next.locations.Bangalore!.type).toBe('office')
    expect(next.auditLog.at(-1)!.action).toBe('taxonomy.location.retype')
  })

  it('creates the metadata entry if name is new (location now has employees but no meta)', () => {
    const { next } = applyLocationRetype({
      taxonomy: TAXONOMY,
      name: 'Pune',
      type: 'office',
      user: 'a',
      now: NOW,
    })
    expect(next.locations.Pune!.type).toBe('office')
  })
})

describe('buildLocationViews + buildDepartmentViews', () => {
  it('merges live employee counts with metadata, and surfaces meta-only entries with count 0', () => {
    const employees = [
      emp({ location: 'Mumbai' }),
      emp({ location: 'Mumbai' }),
      emp({ location: 'Pune' }),
    ]
    const taxonomy: Taxonomy = {
      locations: {
        Mumbai: { type: 'office' },
        // Pune has employees but no meta -> appears as remote-field default.
        // Hyderabad has meta but no employees -> appears with count 0.
        Hyderabad: { type: 'remote-field' },
      },
      departments: {},
      auditLog: [],
    }
    const views = buildLocationViews(employees, taxonomy)
    const byName = Object.fromEntries(views.map((v) => [v.name, v]))
    expect(byName.Mumbai).toEqual({ name: 'Mumbai', type: 'office', count: 2, notes: undefined })
    expect(byName.Pune).toEqual({ name: 'Pune', type: 'remote-field', count: 1, notes: undefined })
    expect(byName.Hyderabad).toEqual({
      name: 'Hyderabad',
      type: 'remote-field',
      count: 0,
      notes: undefined,
    })
  })

  it('Exited employees are excluded from counts', () => {
    const employees = [
      emp({ location: 'Mumbai', status: 'Active' }),
      emp({ location: 'Mumbai', status: 'Exited' }),
    ]
    const views = buildLocationViews(employees, { locations: {}, departments: {}, auditLog: [] })
    expect(views.find((v) => v.name === 'Mumbai')!.count).toBe(1)
  })

  it('flagged departments sort to the top', () => {
    const employees = [
      emp({ department: 'Demonstration & Support' }),
      emp({ department: 'Operations' }),
      emp({ department: 'Operations' }),
      emp({ department: 'Operations' }),
    ]
    const taxonomy: Taxonomy = {
      locations: {},
      departments: { 'Demonstration & Support': { flagged: true } },
      auditLog: [],
    }
    const views = buildDepartmentViews(employees, taxonomy)
    expect(views[0]!.name).toBe('Demonstration & Support')
    expect(views[0]!.flagged).toBe(true)
  })
})
