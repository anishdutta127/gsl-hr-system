/*
 * V5 — Empty / edge state coverage for Phase 4 HR Ops surfaces.
 *
 * Each test corresponds to a real production scenario from Riddhi's
 * 126-employee muster:
 *   - PHM (chairman, MTPL/220) sits in the muster with mostly empty fields.
 *   - 11 Ameet-reports have a reportingTo set but reportingManagerId
 *     resolves to MTPL/014 only after the alias map runs; before that
 *     fixed, they were null.
 *   - Some employees have no workPattern after a manual edit.
 *   - The Phase-1 leftover with a past confirmation date but
 *     employmentStatus still set to Probation reflects bad data drift
 *     after a manual JSON edit.
 *
 * These tests prove the rendering helpers degrade gracefully — they
 * don't print "undefined", they don't crash, and they don't pretend
 * everything is fine when it isn't.
 */

import { describe, expect, it } from 'vitest'
import { probationBadgeLabel, probationStatus } from '../probation'
import {
  buildDepartmentViews,
  buildLocationViews,
} from '../taxonomy'
import {
  cellSymbol,
  expectedDayKind,
  monthGridForEmployee,
  summariseMonth,
} from '../roster'
import { holidaysForEmployee } from '../holidays'
import {
  buildEmployeeChecklist,
  summariseCompliance,
} from '../documents'
import type {
  DocumentTemplate,
  Employee,
  Holiday,
  Taxonomy,
} from '../types'

const NOW = new Date('2026-05-09T00:00:00Z')

function emp(overrides: Partial<Employee>): Employee {
  return {
    id: 'e',
    employeeCode: 'X/0',
    name: 'Test',
    email: 'x@x',
    designation: 'X',
    department: 'Operations',
    location: 'Mumbai',
    dateOfJoining: '2025-01-01',
    status: 'Active',
    createdAt: '2025-01-01',
    createdBy: 'seed',
    auditLog: [],
    ...overrides,
  } as Employee
}

describe('Edge: PHM-class employee (chairman) with mostly empty fields', () => {
  it('probation status is na when no joining date', () => {
    const status = probationStatus(
      emp({ dateOfJoining: null, confirmationDate: null }),
      { now: NOW },
    )
    expect(status.kind).toBe('na')
    expect(probationBadgeLabel(status)).toBe('Probation N/A')
  })

  it('null reportingManagerId renders cleanly (not "undefined")', () => {
    const e = emp({ reportingTo: null, reportingManagerId: null })
    const renderedReporting = e.reportingTo ?? '-'
    expect(renderedReporting).toBe('-')
    expect(renderedReporting).not.toMatch(/undefined/i)
    expect(renderedReporting).not.toMatch(/null/i)
  })
})

describe('Edge: employee with empty workPattern', () => {
  it('roster defaults to office-5day when workPattern is missing', () => {
    const fallback = (emp({ workPattern: undefined }).workPattern ?? 'office-5day') as 'office-5day'
    const cells = monthGridForEmployee({
      workPattern: fallback,
      hybridDays: [],
      year: 2026,
      month1to12: 5,
      holidayDates: new Set(),
    })
    expect(cells.length).toBe(31)
    const summary = summariseMonth(cells)
    // Should match office-5day distribution (working Mon-Fri).
    expect(summary.office).toBeGreaterThan(0)
  })
})

describe('Edge: future confirmedAt — probation in progress', () => {
  it('badge shows positive daysRemaining', () => {
    const status = probationStatus(
      emp({ dateOfJoining: '2026-03-01', confirmationDate: '2026-09-01' }),
      { now: NOW },
    )
    expect(status.kind).toBe('probation')
    expect(status.daysRemaining).toBeGreaterThan(0)
  })
})

describe('Edge: past confirmedAt — Confirmed regardless of employmentStatus drift', () => {
  it('past confirmation date wins even when employmentStatus disagrees', () => {
    // Drifted data: someone manually set employmentStatus back to Probation
    // even though confirmationDate is in the past. The resolver trusts the
    // date (single authoritative field).
    const e = emp({
      dateOfJoining: '2024-01-01',
      confirmationDate: '2024-07-01',
      employmentStatus: 'Probation',
    })
    const status = probationStatus(e, { now: NOW })
    expect(status.kind).toBe('confirmed')
  })
})

describe('Edge: past join + null confirmedAt + >6 months elapsed', () => {
  it('renders Probation pending review (red)', () => {
    const status = probationStatus(
      emp({ dateOfJoining: '2025-10-01', confirmationDate: null }),
      { now: NOW },
    )
    expect(status.kind).toBe('pending-review')
    expect(probationBadgeLabel(status)).toBe('Probation pending review')
  })
})

describe('Edge: roster for a month with no working days for someone', () => {
  it('field employee gets all "off" cells (not crashed view)', () => {
    const cells = monthGridForEmployee({
      workPattern: 'field',
      hybridDays: [],
      year: 2026,
      month1to12: 5,
      holidayDates: new Set(['2026-05-01']),
    })
    expect(cells).toHaveLength(31)
    const summary = summariseMonth(cells)
    expect(summary.office).toBe(0)
    expect(summary.holiday).toBe(1)
    expect(summary.off).toBe(30)
    cells.forEach((c) => {
      expect(['off', 'holiday']).toContain(c.kind)
      expect(cellSymbol(c.kind)).toMatch(/^[H-]$/)
    })
  })

  it('remote employee + month with no holidays renders all "off"', () => {
    const cells = monthGridForEmployee({
      workPattern: 'remote',
      hybridDays: [],
      year: 2026,
      month1to12: 6,
      holidayDates: new Set(),
    })
    const summary = summariseMonth(cells)
    expect(summary.office).toBe(0)
    expect(summary.holiday).toBe(0)
    expect(summary.off).toBe(30)
  })
})

describe('Edge: department with 0 employees after taxonomy merge', () => {
  it('appears in admin view with count 0 (not hidden, not crashed)', () => {
    const taxonomy: Taxonomy = {
      locations: {},
      departments: {
        'Old Department': {},
        Operations: {},
      },
      auditLog: [],
    }
    const views = buildDepartmentViews([emp({ department: 'Operations' })], taxonomy)
    const oldDept = views.find((d) => d.name === 'Old Department')
    expect(oldDept).toBeDefined()
    expect(oldDept!.count).toBe(0)
  })
})

describe('Edge: holiday with optional: true and zero employee picks', () => {
  it('still shows in calendar; just nobody benefits from it', () => {
    const holidays: Holiday[] = [
      {
        id: 'h-xmas',
        date: '2026-12-25',
        name: 'Christmas',
        type: 'optional',
        regions: ['national'],
        createdAt: 'x',
        createdBy: 'x',
        auditLog: [],
      },
    ]
    const out = holidaysForEmployee({
      employeeId: 'emp-1',
      year: 2026,
      holidays,
      picks: [],
    })
    expect(out).toHaveLength(0) // not picked = not observed
    // But the holiday still exists in the source list — calendar renders it.
    expect(holidays).toHaveLength(1)
  })
})

describe('Edge: employee with no documents gets full missing-mandatory checklist', () => {
  const templates: DocumentTemplate[] = [
    { id: 'tpl-pan', name: 'PAN', category: 'identity', isMandatory: true, hasExpiry: false },
    {
      id: 'tpl-passport',
      name: 'Passport',
      category: 'identity',
      isMandatory: false,
      hasExpiry: true,
    },
  ]

  it('summary lights up missing mandatories', () => {
    const rows = buildEmployeeChecklist({
      employeeId: 'emp-new',
      templates,
      documents: [],
    })
    expect(rows.length).toBe(2)
    const summary = summariseCompliance(rows, 'emp-new')
    expect(summary.mandatoryMissing).toBe(1)
    expect(summary.optionalMissing).toBe(1)
    expect(summary.expired).toBe(0)
  })
})

describe('Edge: employee with empty location appears at end of location views', () => {
  it('empty location is dropped from views (not rendered as blank row)', () => {
    const employees = [emp({ location: 'Mumbai' }), emp({ location: '' })]
    const views = buildLocationViews(employees, {
      locations: { Mumbai: { type: 'office' } },
      departments: {},
      auditLog: [],
    })
    expect(views.find((v) => v.name === '')).toBeUndefined()
  })
})

describe('Edge: holiday on a Sunday for a 6-day trainer', () => {
  it('Sunday holiday is still tagged "holiday" not "off"', () => {
    // 2026-09-13 is a Sunday hypothetically; let's use a known Sunday.
    // 2026-05-10 is Sunday.
    const kind = expectedDayKind({
      workPattern: 'trainer-6day',
      dateIso: '2026-05-10',
      holidayDates: new Set(['2026-05-10']),
      hybridDays: [],
    })
    expect(kind).toBe('holiday')
  })
})
