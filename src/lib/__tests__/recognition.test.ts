import { describe, expect, it } from 'vitest'
import {
  currentMonth,
  financialYearStart,
  formatMonthLabel,
  groupByMonth,
  matchesQuery,
  nextRecognitionId,
} from '../recognition'
import type { Recognition } from '../types'

function rec(overrides: Partial<Recognition>): Recognition {
  return {
    id: 'RECOG-2026-01',
    employeeId: 'u1',
    nominatedBy: 'u2',
    month: '2026-05',
    department: 'Academics',
    category: 'Employee of the Month',
    writeup: '',
    status: 'Nominated',
    nominatedAt: '2026-05-01T00:00:00Z',
    distributionEmails: [],
    auditLog: [],
    ...overrides,
  }
}

describe('financialYearStart', () => {
  it('returns the calendar year for April onwards', () => {
    expect(financialYearStart('2026-04-01')).toBe(2026)
    expect(financialYearStart('2026-12-31')).toBe(2026)
  })

  it('returns the previous calendar year for January-March', () => {
    expect(financialYearStart('2026-03-31')).toBe(2025)
    expect(financialYearStart('2026-01-15')).toBe(2025)
  })

  it('throws on invalid input', () => {
    expect(() => financialYearStart('not-a-date')).toThrow(/invalid date/)
  })
})

describe('nextRecognitionId', () => {
  it('starts at 01 when the FY is empty', () => {
    expect(nextRecognitionId([], 2026)).toBe('RECOG-2026-01')
  })

  it('zero-pads to 2 digits', () => {
    expect(nextRecognitionId([rec({ id: 'RECOG-2026-08' })], 2026)).toBe('RECOG-2026-09')
  })

  it('does NOT fill gaps - sequential only', () => {
    // A deleted RECOG-2026-02 stays a gap; the next id is max+1. Reusing
    // numbers would clash with printed posters HR has already sent out.
    expect(
      nextRecognitionId(
        [rec({ id: 'RECOG-2026-01' }), rec({ id: 'RECOG-2026-03' })],
        2026,
      ),
    ).toBe('RECOG-2026-04')
  })

  it('ignores recognitions in other financial years', () => {
    expect(
      nextRecognitionId(
        [rec({ id: 'RECOG-2025-50' }), rec({ id: 'RECOG-2026-01' })],
        2026,
      ),
    ).toBe('RECOG-2026-02')
  })

  it('ignores malformed ids', () => {
    expect(
      nextRecognitionId([rec({ id: 'RECOG-2026-bad' }), rec({ id: 'OTHER-2026-01' })], 2026),
    ).toBe('RECOG-2026-01')
  })

  it('handles three-digit overflow gracefully', () => {
    expect(nextRecognitionId([rec({ id: 'RECOG-2026-99' })], 2026)).toBe('RECOG-2026-100')
  })
})

describe('groupByMonth', () => {
  it('groups by YYYY-MM', () => {
    const out = groupByMonth([
      rec({ id: 'a', month: '2026-04' }),
      rec({ id: 'b', month: '2026-05' }),
      rec({ id: 'c', month: '2026-04' }),
    ])
    expect(out.get('2026-04')?.map((r) => r.id)).toEqual(['a', 'c'])
    expect(out.get('2026-05')?.map((r) => r.id)).toEqual(['b'])
  })
})

describe('currentMonth', () => {
  it('returns yyyy-mm zero-padded', () => {
    expect(currentMonth(new Date(Date.UTC(2026, 4, 13)))).toBe('2026-05')
    expect(currentMonth(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01')
  })
})

describe('formatMonthLabel', () => {
  it('formats month + year', () => {
    expect(formatMonthLabel('2026-05')).toBe('May 2026')
    expect(formatMonthLabel('2026-12')).toBe('December 2026')
  })

  it('returns raw input for malformed values', () => {
    expect(formatMonthLabel('abc')).toBe('abc')
    expect(formatMonthLabel('2026-14')).toBe('2026-14')
  })
})

describe('matchesQuery', () => {
  const r = rec({
    id: 'RECOG-2026-04',
    department: 'Academics',
    category: 'Team Player',
    writeup: 'Manali stepped up during the Bangalore launch.',
  })

  it('returns true on empty query', () => {
    expect(matchesQuery(r, '')).toBe(true)
    expect(matchesQuery(r, '   ')).toBe(true)
  })

  it('matches department case-insensitively', () => {
    expect(matchesQuery(r, 'academics')).toBe(true)
    expect(matchesQuery(r, 'ACADEMICS')).toBe(true)
  })

  it('matches category', () => {
    expect(matchesQuery(r, 'Team')).toBe(true)
  })

  it('matches write-up substring', () => {
    expect(matchesQuery(r, 'Bangalore')).toBe(true)
  })

  it('matches the id prefix', () => {
    expect(matchesQuery(r, 'RECOG-2026')).toBe(true)
  })

  it('returns false when nothing matches', () => {
    expect(matchesQuery(r, 'kolkata')).toBe(false)
  })
})
