import { describe, expect, it } from 'vitest'
import {
  cellSymbol,
  dayOfWeek,
  daysInMonth,
  defaultHybridDays,
  expectedDayKind,
  holidayDateSet,
  monthGridForEmployee,
  summariseMonth,
} from '../roster'
import type { Holiday } from '../types'

describe('dayOfWeek', () => {
  it('returns 0 for Sunday and 6 for Saturday', () => {
    expect(dayOfWeek('2026-05-10')).toBe(0) // Sunday
    expect(dayOfWeek('2026-05-09')).toBe(6) // Saturday
    expect(dayOfWeek('2026-05-04')).toBe(1) // Monday
  })
})

describe('daysInMonth', () => {
  it('returns 31 dates for January', () => {
    expect(daysInMonth(2026, 1)).toHaveLength(31)
    expect(daysInMonth(2026, 1)[0]).toBe('2026-01-01')
    expect(daysInMonth(2026, 1)[30]).toBe('2026-01-31')
  })
  it('returns 28 dates for non-leap February', () => {
    expect(daysInMonth(2026, 2)).toHaveLength(28)
  })
  it('returns 30 dates for April', () => {
    expect(daysInMonth(2026, 4)).toHaveLength(30)
  })
})

describe('defaultHybridDays', () => {
  it('Academics defaults to Mon+Thu', () => {
    expect(defaultHybridDays('Academics')).toEqual([1, 4])
  })
  it('STEM & Training defaults to Mon+Thu', () => {
    expect(defaultHybridDays('STEM & Training')).toEqual([1, 4])
  })
  it('other departments default to Tue+Thu', () => {
    expect(defaultHybridDays('Operations')).toEqual([2, 4])
    expect(defaultHybridDays('Technology')).toEqual([2, 4])
  })
})

describe('expectedDayKind', () => {
  const noHolidays = new Set<string>()
  const hybridDays = [1, 4] // Mon+Thu

  it('office-5day works Mon-Fri only', () => {
    expect(expectedDayKind({ workPattern: 'office-5day', dateIso: '2026-05-04', holidayDates: noHolidays, hybridDays })).toBe('office') // Mon
    expect(expectedDayKind({ workPattern: 'office-5day', dateIso: '2026-05-08', holidayDates: noHolidays, hybridDays })).toBe('office') // Fri
    expect(expectedDayKind({ workPattern: 'office-5day', dateIso: '2026-05-09', holidayDates: noHolidays, hybridDays })).toBe('off') // Sat
    expect(expectedDayKind({ workPattern: 'office-5day', dateIso: '2026-05-10', holidayDates: noHolidays, hybridDays })).toBe('off') // Sun
  })

  it('trainer-6day works Mon-Sat (no Sun)', () => {
    expect(expectedDayKind({ workPattern: 'trainer-6day', dateIso: '2026-05-09', holidayDates: noHolidays, hybridDays })).toBe('office') // Sat
    expect(expectedDayKind({ workPattern: 'trainer-6day', dateIso: '2026-05-10', holidayDates: noHolidays, hybridDays })).toBe('off') // Sun
  })

  it('hybrid-2day uses configured days', () => {
    expect(expectedDayKind({ workPattern: 'hybrid-2day', dateIso: '2026-05-04', holidayDates: noHolidays, hybridDays })).toBe('office') // Mon
    expect(expectedDayKind({ workPattern: 'hybrid-2day', dateIso: '2026-05-07', holidayDates: noHolidays, hybridDays })).toBe('office') // Thu
    expect(expectedDayKind({ workPattern: 'hybrid-2day', dateIso: '2026-05-05', holidayDates: noHolidays, hybridDays })).toBe('off') // Tue
  })

  it('field has no office days', () => {
    expect(expectedDayKind({ workPattern: 'field', dateIso: '2026-05-04', holidayDates: noHolidays, hybridDays })).toBe('off')
  })

  it('remote has no office days', () => {
    expect(expectedDayKind({ workPattern: 'remote', dateIso: '2026-05-04', holidayDates: noHolidays, hybridDays })).toBe('off')
  })

  it('holidays trump every pattern', () => {
    const holidays = new Set(['2026-01-01'])
    expect(expectedDayKind({ workPattern: 'office-5day', dateIso: '2026-01-01', holidayDates: holidays, hybridDays })).toBe('holiday')
    expect(expectedDayKind({ workPattern: 'trainer-6day', dateIso: '2026-01-01', holidayDates: holidays, hybridDays })).toBe('holiday')
    expect(expectedDayKind({ workPattern: 'field', dateIso: '2026-01-01', holidayDates: holidays, hybridDays })).toBe('holiday')
  })
})

describe('holidayDateSet', () => {
  const list: Holiday[] = [
    {
      id: 'h-mand',
      date: '2026-01-26',
      name: 'Republic Day',
      type: 'mandatory',
      regions: ['national'],
      createdAt: 'x',
      createdBy: 'x',
      auditLog: [],
    },
    {
      id: 'h-opt',
      date: '2026-12-25',
      name: 'Christmas',
      type: 'optional',
      regions: ['national'],
      createdAt: 'x',
      createdBy: 'x',
      auditLog: [],
    },
  ]

  it('always includes mandatory holidays', () => {
    const set = holidayDateSet(list, new Set())
    expect(set.has('2026-01-26')).toBe(true)
    expect(set.has('2026-12-25')).toBe(false)
  })
  it('includes picked optionals', () => {
    const set = holidayDateSet(list, new Set(['h-opt']))
    expect(set.has('2026-12-25')).toBe(true)
  })
  it('skips non-picked optionals', () => {
    const set = holidayDateSet(list, new Set())
    expect(set.has('2026-12-25')).toBe(false)
  })
})

describe('monthGridForEmployee + summariseMonth', () => {
  it('builds the full month grid and summary', () => {
    const cells = monthGridForEmployee({
      workPattern: 'office-5day',
      hybridDays: [],
      year: 2026,
      month1to12: 5,
      holidayDates: new Set(['2026-05-01']), // Maharashtra Day, Friday
    })
    expect(cells).toHaveLength(31)
    const summary = summariseMonth(cells)
    // May 2026: 5 weekends (Sat 2,9,16,23,30 + Sun 3,10,17,24,31) = 10 off days; 1 holiday on Fri 1; remaining = 31 - 10 - 1 = 20 office
    expect(summary.holiday).toBe(1)
    expect(summary.off).toBe(10)
    expect(summary.office).toBe(20)
    expect(summary.office + summary.off + summary.holiday).toBe(31)
  })

  it('trainer-6day yields more office days because Saturdays are working', () => {
    const cells = monthGridForEmployee({
      workPattern: 'trainer-6day',
      hybridDays: [],
      year: 2026,
      month1to12: 5,
      holidayDates: new Set(),
    })
    const summary = summariseMonth(cells)
    // 31 days; 5 Sundays off; rest office = 26 office, 5 off, 0 holiday.
    expect(summary.office).toBe(26)
    expect(summary.off).toBe(5)
  })
})

describe('cellSymbol', () => {
  it('maps each kind to a short text symbol', () => {
    expect(cellSymbol('office')).toBe('O')
    expect(cellSymbol('off')).toBe('-')
    expect(cellSymbol('holiday')).toBe('H')
  })
})
