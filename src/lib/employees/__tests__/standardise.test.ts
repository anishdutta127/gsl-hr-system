import { describe, expect, it } from 'vitest'
import {
  cleanString,
  excelSerialToISO,
  FLAGGED_DEPARTMENTS,
  inferEmploymentStatus,
  inferLocationType,
  inferWorkPattern,
  leaveYearStartFor,
  resolveReportingManagerId,
  standardiseDepartment,
  standardiseLocation,
  DEFAULT_LEAVE_BALANCE,
} from '../standardise'

describe('cleanString', () => {
  it('trims trailing/leading whitespace', () => {
    expect(cleanString('  Pune ')).toBe('Pune')
  })
  it('collapses internal whitespace runs', () => {
    expect(cleanString('Mumbai  HQ')).toBe('Mumbai HQ')
  })
  it('handles null and undefined', () => {
    expect(cleanString(null)).toBe('')
    expect(cleanString(undefined)).toBe('')
  })
})

describe('standardiseLocation', () => {
  it('strips trailing spaces from muster locations', () => {
    expect(standardiseLocation('Durgapur ')).toBe('Durgapur')
    expect(standardiseLocation('Pune ')).toBe('Pune')
    expect(standardiseLocation('Raipur ')).toBe('Raipur')
  })
  it('leaves canonical names untouched', () => {
    expect(standardiseLocation('Mumbai')).toBe('Mumbai')
  })
})

describe('inferLocationType', () => {
  it('Mumbai and Kolkata are office locations', () => {
    expect(inferLocationType('Mumbai')).toBe('office')
    expect(inferLocationType('Kolkata')).toBe('office')
  })
  it('Bangalore tagged remote-field per Riddhi flag', () => {
    expect(inferLocationType('Bangalore')).toBe('remote-field')
  })
  it('all other muster locations are remote-field', () => {
    expect(inferLocationType('Pune')).toBe('remote-field')
    expect(inferLocationType('Indore')).toBe('remote-field')
    expect(inferLocationType('Durgapur')).toBe('remote-field')
  })
})

describe('standardiseDepartment', () => {
  it('merges STEM and Training -> STEM & Training', () => {
    expect(standardiseDepartment('STEM and Training')).toBe('STEM & Training')
    expect(standardiseDepartment('STEM & Training')).toBe('STEM & Training')
  })
  it('merges Product and Training -> Product', () => {
    expect(standardiseDepartment('Product and Training')).toBe('Product')
    expect(standardiseDepartment('Product')).toBe('Product')
  })
  it('keeps other departments verbatim (after trim)', () => {
    expect(standardiseDepartment('Academics')).toBe('Academics')
    expect(standardiseDepartment('Demonstration & Support')).toBe('Demonstration & Support')
    expect(standardiseDepartment('Founder’s Office')).toBe('Founder’s Office')
  })
  it('Demonstration & Support is in the flagged-for-review set', () => {
    expect(FLAGGED_DEPARTMENTS.has('Demonstration & Support')).toBe(true)
    expect(FLAGGED_DEPARTMENTS.has('Academics')).toBe(false)
  })
})

describe('inferWorkPattern', () => {
  it('Academics -> trainer-6day', () => {
    expect(inferWorkPattern({ department: 'Academics', designation: 'Senior Faculty' })).toBe(
      'trainer-6day',
    )
  })
  it('STEM & Training -> trainer-6day', () => {
    expect(
      inferWorkPattern({ department: 'STEM & Training', designation: 'Trainer - Robotics' }),
    ).toBe('trainer-6day')
  })
  it('Sales -> field', () => {
    expect(inferWorkPattern({ department: 'Sales', designation: 'Area Sales Manager' })).toBe(
      'field',
    )
  })
  it('Technology -> office-5day', () => {
    expect(
      inferWorkPattern({ department: 'Technology', designation: 'Senior Manager - Technology' }),
    ).toBe('office-5day')
  })
  it('Founder’s Office -> office-5day', () => {
    expect(
      inferWorkPattern({ department: "Founder's Office", designation: 'Chief Executive Officer' }),
    ).toBe('office-5day')
  })
  it('Trainer designation outside Academics -> trainer-6day', () => {
    expect(inferWorkPattern({ department: 'Operations', designation: 'STEM Trainer' })).toBe(
      'trainer-6day',
    )
  })
})

describe('inferEmploymentStatus', () => {
  const now = new Date('2026-05-09T00:00:00Z')

  it('past confirmation date -> Confirmed', () => {
    expect(inferEmploymentStatus({ confirmedAt: '2025-01-01', now })).toBe('Confirmed')
  })
  it('future confirmation date -> Probation', () => {
    expect(inferEmploymentStatus({ confirmedAt: '2026-09-01', now })).toBe('Probation')
  })
  it('null confirmation -> Active (legacy fallback)', () => {
    expect(inferEmploymentStatus({ confirmedAt: null, now })).toBe('Active')
  })
  it('today counts as Confirmed', () => {
    expect(inferEmploymentStatus({ confirmedAt: '2026-05-09', now })).toBe('Confirmed')
  })
})

describe('resolveReportingManagerId', () => {
  const lookup = new Map([
    ['ameet zaveri', 'emp-ameet'],
    ['shubhangi', 'emp-shubhangi'],
    ['ritu uppal', 'emp-ritu'],
  ])

  it('resolves an exact name match (case-insensitive)', () => {
    expect(resolveReportingManagerId('Ameet Zaveri', lookup)).toBe('emp-ameet')
    expect(resolveReportingManagerId('AMEET ZAVERI', lookup)).toBe('emp-ameet')
  })
  it('strips trailing whitespace before matching', () => {
    expect(resolveReportingManagerId('Shubhangi ', lookup)).toBe('emp-shubhangi')
  })
  it('PHM (chairman) explicitly resolves to null', () => {
    expect(resolveReportingManagerId('PHM', lookup)).toBeNull()
  })
  it('falls back to first-token match when no exact full-name match', () => {
    // "Balu R" -> first token "balu" -> looked up in the map.
    const m = new Map([['balu', 'emp-balu']])
    expect(resolveReportingManagerId('Balu R', m)).toBe('emp-balu')
  })
  it('does NOT first-token-fallback when full-name already matched (avoids drift)', () => {
    const m = new Map([
      ['ameet zaveri', 'emp-ameet'],
      ['ameet', 'emp-someone-else'],
    ])
    expect(resolveReportingManagerId('Ameet Zaveri', m)).toBe('emp-ameet')
  })
  it('unknown name resolves to null', () => {
    expect(resolveReportingManagerId('Nobody Here', lookup)).toBeNull()
  })
  it('null/empty input returns null', () => {
    expect(resolveReportingManagerId(null, lookup)).toBeNull()
    expect(resolveReportingManagerId('', lookup)).toBeNull()
  })
})

describe('excelSerialToISO', () => {
  it('converts known reference dates', () => {
    expect(excelSerialToISO(44197)).toBe('2021-01-01')
    expect(excelSerialToISO(45292)).toBe('2024-01-01')
  })
  it('converts string-typed numbers (xlsx encodes serials as strings)', () => {
    expect(excelSerialToISO('44287')).toBe('2021-04-01')
  })
  it('rejects null/empty/zero', () => {
    expect(excelSerialToISO(null)).toBeNull()
    expect(excelSerialToISO('')).toBeNull()
    expect(excelSerialToISO(0)).toBeNull()
    expect(excelSerialToISO(-1)).toBeNull()
  })
})

describe('leaveYearStartFor + DEFAULT_LEAVE_BALANCE', () => {
  it('formats April-1 of the given year', () => {
    expect(leaveYearStartFor(2026)).toBe('2026-04-01')
    expect(leaveYearStartFor(2027)).toBe('2027-04-01')
  })
  it('default policy is 12 casual + 12 sick', () => {
    expect(DEFAULT_LEAVE_BALANCE).toEqual({ casual: 12, sick: 12 })
  })
})
