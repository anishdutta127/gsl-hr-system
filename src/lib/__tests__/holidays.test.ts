import { describe, expect, it } from 'vitest'
import {
  holidayDayOfWeek,
  holidaysForEmployee,
  holidaysInYear,
  isHolidayOn,
  pickedCountForEmployee,
  sortHolidays,
  togglePick,
} from '../holidays'
import type { EmployeeOptionalHoliday, Holiday } from '../types'

const NOW = '2026-05-09T10:00:00.000Z'

function h(overrides: Partial<Holiday>): Holiday {
  return {
    id: overrides.id ?? `h-${Math.random().toString(36).slice(2, 8)}`,
    date: overrides.date ?? '2026-01-01',
    name: overrides.name ?? 'Test Day',
    type: overrides.type ?? 'mandatory',
    regions: overrides.regions ?? ['national'],
    notes: overrides.notes,
    createdAt: '2026-05-09T00:00:00.000Z',
    createdBy: 'test',
    auditLog: [],
  }
}

describe('sortHolidays + holidaysInYear', () => {
  it('sorts chronologically with name tiebreak', () => {
    const list = [
      h({ date: '2026-12-25', name: 'Christmas' }),
      h({ date: '2026-01-01', name: 'New Year' }),
      h({ date: '2026-01-01', name: 'Aaa Earlier' }),
    ]
    const sorted = sortHolidays(list)
    expect(sorted.map((x) => x.name)).toEqual(['Aaa Earlier', 'New Year', 'Christmas'])
  })

  it('filters by year', () => {
    const list = [h({ date: '2026-01-01' }), h({ date: '2027-01-01' })]
    expect(holidaysInYear(list, 2026)).toHaveLength(1)
    expect(holidaysInYear(list, 2027)).toHaveLength(1)
  })
})

describe('holidayDayOfWeek', () => {
  it('returns three-letter day name', () => {
    expect(holidayDayOfWeek('2026-01-01')).toBe('Thu')
    expect(holidayDayOfWeek('2026-01-26')).toBe('Mon')
  })
  it('returns empty for invalid input', () => {
    expect(holidayDayOfWeek('garbage')).toBe('')
  })
})

describe('isHolidayOn', () => {
  const list = [
    h({ date: '2026-01-01', type: 'mandatory' }),
    h({ date: '2026-01-14', type: 'optional' }),
  ]
  it('matches by date', () => {
    expect(isHolidayOn(list, '2026-01-01')).toBe(true)
    expect(isHolidayOn(list, '2026-01-02')).toBe(false)
  })
  it('respects type filter', () => {
    expect(isHolidayOn(list, '2026-01-14', { types: ['mandatory'] })).toBe(false)
    expect(isHolidayOn(list, '2026-01-14', { types: ['optional'] })).toBe(true)
  })
})

describe('togglePick', () => {
  const baseHolidays = [
    h({ id: 'h-makar', date: '2026-01-14', type: 'optional' }),
    h({ id: 'h-gudi', date: '2026-03-19', type: 'optional' }),
    h({ id: 'h-eid', date: '2026-03-20', type: 'optional' }),
    h({ id: 'h-xmas', date: '2026-12-25', type: 'optional' }),
  ]
  void baseHolidays

  it('adds a pick when the employee has budget remaining', () => {
    const { next, action } = togglePick({
      picks: [],
      employeeId: 'e1',
      holidayId: 'h-gudi',
      year: 2026,
      selectedBy: 'hr',
      now: NOW,
    })
    expect(action).toBe('added')
    expect(next).toHaveLength(1)
    expect(next[0]!.holidayId).toBe('h-gudi')
  })

  it('removes a pick when toggled twice', () => {
    const initial: EmployeeOptionalHoliday[] = [
      { employeeId: 'e1', holidayId: 'h-gudi', year: 2026, selectedAt: NOW, selectedBy: 'hr' },
    ]
    const { next, action } = togglePick({
      picks: initial,
      employeeId: 'e1',
      holidayId: 'h-gudi',
      year: 2026,
      selectedBy: 'hr',
      now: NOW,
    })
    expect(action).toBe('removed')
    expect(next).toHaveLength(0)
  })

  it('throws when over budget', () => {
    const initial: EmployeeOptionalHoliday[] = [
      { employeeId: 'e1', holidayId: 'h-gudi', year: 2026, selectedAt: NOW, selectedBy: 'hr' },
      { employeeId: 'e1', holidayId: 'h-eid', year: 2026, selectedAt: NOW, selectedBy: 'hr' },
    ]
    expect(() =>
      togglePick({
        picks: initial,
        employeeId: 'e1',
        holidayId: 'h-makar',
        year: 2026,
        selectedBy: 'hr',
        now: NOW,
      }),
    ).toThrow(/budget/)
  })

  it('isolates picks by employee and year', () => {
    const initial: EmployeeOptionalHoliday[] = [
      { employeeId: 'e1', holidayId: 'h-gudi', year: 2026, selectedAt: NOW, selectedBy: 'hr' },
      { employeeId: 'e1', holidayId: 'h-eid', year: 2026, selectedAt: NOW, selectedBy: 'hr' },
    ]
    // e2 should still be able to pick freely.
    const { next, action } = togglePick({
      picks: initial,
      employeeId: 'e2',
      holidayId: 'h-makar',
      year: 2026,
      selectedBy: 'hr',
      now: NOW,
    })
    expect(action).toBe('added')
    expect(next).toHaveLength(3)
  })
})

describe('holidaysForEmployee', () => {
  const list = [
    h({ id: 'h-mand', date: '2026-01-26', type: 'mandatory' }),
    h({ id: 'h-opt-a', date: '2026-03-19', type: 'optional' }),
    h({ id: 'h-opt-b', date: '2026-12-25', type: 'optional' }),
  ]

  it('returns mandatory + picked optionals only', () => {
    const picks: EmployeeOptionalHoliday[] = [
      { employeeId: 'e1', holidayId: 'h-opt-a', year: 2026, selectedAt: NOW, selectedBy: 'hr' },
    ]
    const out = holidaysForEmployee({
      employeeId: 'e1',
      year: 2026,
      holidays: list,
      picks,
    })
    const ids = out.map((x) => x.id).sort()
    expect(ids).toEqual(['h-mand', 'h-opt-a'])
  })

  it('counts picks by employee and year', () => {
    const picks: EmployeeOptionalHoliday[] = [
      { employeeId: 'e1', holidayId: 'h-opt-a', year: 2026, selectedAt: NOW, selectedBy: 'hr' },
      { employeeId: 'e1', holidayId: 'h-opt-b', year: 2026, selectedAt: NOW, selectedBy: 'hr' },
      { employeeId: 'e2', holidayId: 'h-opt-a', year: 2026, selectedAt: NOW, selectedBy: 'hr' },
      { employeeId: 'e1', holidayId: 'h-opt-a', year: 2027, selectedAt: NOW, selectedBy: 'hr' },
    ]
    expect(pickedCountForEmployee(picks, 'e1', 2026)).toBe(2)
    expect(pickedCountForEmployee(picks, 'e2', 2026)).toBe(1)
    expect(pickedCountForEmployee(picks, 'e1', 2027)).toBe(1)
  })
})
