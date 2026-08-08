/*
 * Tests for the row <-> domain mapping that the whole data layer now rests on.
 *
 * Everything reads through toDomain and writes through toRow, so a mistake
 * here is a mistake in every loader and every write at once. The parity script
 * proves these agree with the JSON for the 907 records that exist today; these
 * tests pin the RULES, including the cases the current data does not contain.
 */

import { describe, expect, it } from 'vitest'
import { ENTITIES, SINGLETONS, toDomain, toRow, isRegisteredPath, isSingletonPath } from '../db/entities'

const roleSpec = ENTITIES['src/data/roles.json']!
const employeeSpec = ENTITIES['src/data/employees.json']!

describe('toDomain: rebuilding the record a JSON file used to hold', () => {
  it('omits null columns, because in JSON the field was absent not null', () => {
    // 47 employees have no confirmationDate. If it came back as null rather
    // than absent, `'confirmationDate' in emp` flips from false to true and
    // every such check in the codebase silently changes meaning.
    const domain = toDomain(employeeSpec, {
      id: 'e1', employeeCode: 'MTPL/001', name: 'A', status: 'Active',
      confirmationDate: null, phone: null, extra: null,
    })
    expect('confirmationDate' in domain).toBe(false)
    expect('phone' in domain).toBe(false)
    expect(domain.id).toBe('e1')
  })

  it('spreads the extra blob back, so unmodelled fields survive', () => {
    const domain = toDomain(roleSpec, {
      id: 'r1', title: 'X', extra: { somethingNobodyModelled: 42 },
    })
    expect(domain.somethingNobodyModelled).toBe(42)
    expect(domain.title).toBe('X')
  })

  it('attaches auditLog only when audit rows were supplied', () => {
    const withAudit = toDomain(roleSpec, { id: 'r1', extra: null }, [{ action: 'role.create' }])
    expect(withAudit.auditLog).toEqual([{ action: 'role.create' }])

    const without = toDomain(roleSpec, { id: 'r1', extra: null })
    expect('auditLog' in without).toBe(false)
  })

  it('keeps falsy-but-present values, which are not the same as absent', () => {
    const domain = toDomain(employeeSpec, {
      id: 'e1', officialEmailMissing: false, age: 0, address: '', extra: null,
    })
    expect(domain.officialEmailMissing).toBe(false)
    expect(domain.age).toBe(0)
    expect(domain.address).toBe('')
  })
})

describe('toRow: splitting a record into columns plus extra', () => {
  it('routes declared fields to columns and the rest to extra', () => {
    const row = toRow(roleSpec, { id: 'r1', title: 'X', unmodelled: 'keep me' })
    expect(row.title).toBe('X')
    expect(row.extra).toEqual({ unmodelled: 'keep me' })
  })

  it('never writes auditLog into a column or into extra', () => {
    // auditLog lives in audit_entries. If it leaked into extra it would be
    // duplicated, and reads would then return it twice.
    const row = toRow(roleSpec, { id: 'r1', auditLog: [{ action: 'x' }] })
    expect(row.auditLog).toBeUndefined()
    expect(row.extra).toBeNull()
  })

  it('sets missing columns to null explicitly, so Prisma cannot apply a default', () => {
    // The migration learned this the hard way: 80 candidates had no status and
    // a schema default invented "Active" for all of them.
    const row = toRow(roleSpec, { id: 'r1' })
    expect(row.title).toBeNull()
    expect('title' in row).toBe(true)
  })

  it('uses null rather than an empty object when there is nothing extra', () => {
    expect(toRow(roleSpec, { id: 'r1', title: 'X' }).extra).toBeNull()
  })
})

describe('round trip', () => {
  it('a record survives toRow then toDomain unchanged', () => {
    const original = {
      id: 'r1', title: 'Regional Manager', department: 'Sales', location: 'Mumbai',
      employmentType: 'Full-time', status: 'Open', description: '<p>x</p>',
      pipelineStages: ['Sourced', 'Offered'], rubric: [], responsibilities: ['a'],
      mustHaves: [], niceToHaves: [], createdAt: '2026-08-07T00:00:00Z',
      createdBy: 'hr@gsl.in', unmodelledExtra: { nested: true },
    }
    const row = toRow(roleSpec, original)
    const back = toDomain(roleSpec, row)
    expect(back).toEqual(original)
  })

  it('a record carrying only its key survives', () => {
    const row = toRow(roleSpec, { id: 'r1' })
    expect(toDomain(roleSpec, row)).toEqual({ id: 'r1' })
  })
})

describe('registry integrity', () => {
  it('every entity declares its key among its columns', () => {
    for (const [path, spec] of Object.entries(ENTITIES)) {
      expect(spec.columns, `${path} must store its own key`).toContain(spec.key)
    }
  })

  it('the three id-less entities are keyed on employeeId', () => {
    // exit_processes, exit_interviews and exit_handovers carry no id in the
    // source data at all. Keying them on id produced a unique-constraint
    // failure on the empty string during migration.
    for (const path of [
      'src/data/exit_processes.json',
      'src/data/exit_interviews.json',
      'src/data/exit_handovers.json',
    ]) {
      expect(ENTITIES[path]!.key, `${path}`).toBe('employeeId')
    }
  })

  it('no path is registered as both a collection and a singleton', () => {
    for (const path of Object.keys(SINGLETONS)) {
      expect(ENTITIES[path], `${path} cannot be both`).toBeUndefined()
    }
  })

  it('recognises registered paths and rejects unknown ones', () => {
    expect(isRegisteredPath('src/data/roles.json')).toBe(true)
    expect(isRegisteredPath('src/data/taxonomy.json')).toBe(true)
    expect(isSingletonPath('src/data/taxonomy.json')).toBe(true)
    expect(isSingletonPath('src/data/roles.json')).toBe(false)
    // pending_updates.json is deliberately NOT registered: the queue still
    // writes it through the GitHub path until cutover.
    expect(isRegisteredPath('src/data/pending_updates.json')).toBe(false)
    expect(isRegisteredPath('src/data/nonsense.json')).toBe(false)
  })

  it('every entity written by the app is registered', () => {
    // Derived from the paths the codebase actually passes to atomicUpdateJson,
    // so a new write target that nobody registered fails here rather than
    // throwing in production.
    const written = [
      'src/data/recognitions.json', 'src/data/exit_processes.json',
      'src/data/exit_interviews.json', 'src/data/employee_onboarding_tasks.json',
      'src/data/leave_applications.json', 'src/data/it_assets.json',
      'src/data/hr_tasks.json', 'src/data/ff_settlements.json',
      'src/data/exit_handovers.json', 'src/data/employees.json',
      'src/data/employee_offboarding_tasks.json', 'src/data/employee_documents.json',
      'src/data/taxonomy.json', 'src/data/system_settings.json',
      'src/data/nomination_cycles.json', 'src/data/holidays.json',
      'src/data/employee_optional_holidays.json', 'src/data/candidates.json',
      'src/data/attendance_exceptions.json', 'src/data/assets.json',
      'src/data/alert_preferences.json', 'src/data/alert_log.json',
    ]
    for (const path of written) {
      expect(isRegisteredPath(path), `${path} is written by the app but not registered`).toBe(true)
    }
  })
})
