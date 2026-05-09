import { describe, expect, it } from 'vitest'
import { probationBadgeLabel, probationStatus } from '../probation'

const NOW = new Date('2026-05-09T00:00:00Z')

describe('probationStatus', () => {
  it('returns Confirmed when confirmation date is in the past', () => {
    const s = probationStatus(
      { dateOfJoining: '2024-01-01', confirmationDate: '2024-07-01', status: 'Active' },
      { now: NOW },
    )
    expect(s.kind).toBe('confirmed')
    expect(s.endsAt).toBe('2024-07-01')
  })

  it('returns Probation when join date is recent and not yet confirmed', () => {
    const s = probationStatus(
      { dateOfJoining: '2026-03-01', confirmationDate: null, status: 'Active' },
      { now: NOW },
    )
    expect(s.kind).toBe('probation')
    expect(s.endsAt).toBe('2026-09-01')
    expect(s.daysRemaining).toBeGreaterThan(0)
  })

  it('returns Pending Review when 6 months elapsed but no confirmation', () => {
    const s = probationStatus(
      { dateOfJoining: '2025-10-01', confirmationDate: null, status: 'Active' },
      { now: NOW },
    )
    expect(s.kind).toBe('pending-review')
    expect(s.daysRemaining).toBeLessThan(0)
  })

  it('respects a custom months value', () => {
    const s = probationStatus(
      { dateOfJoining: '2026-01-01', confirmationDate: null, status: 'Active' },
      { now: NOW, months: 3 },
    )
    expect(s.endsAt).toBe('2026-04-01')
    expect(s.kind).toBe('pending-review')
  })

  it('returns N/A for exited employees', () => {
    const s = probationStatus(
      { dateOfJoining: '2024-01-01', confirmationDate: null, status: 'Exited' },
      { now: NOW },
    )
    expect(s.kind).toBe('na')
  })

  it('returns N/A when joining date is missing', () => {
    const s = probationStatus(
      { dateOfJoining: null, confirmationDate: null, status: 'Active' },
      { now: NOW },
    )
    expect(s.kind).toBe('na')
  })

  it('treats confirmation date in the future as still on probation', () => {
    const s = probationStatus(
      { dateOfJoining: '2026-03-01', confirmationDate: '2026-09-01', status: 'Active' },
      { now: NOW },
    )
    expect(s.kind).toBe('probation')
  })
})

describe('probationBadgeLabel', () => {
  it('formats each status kind', () => {
    expect(
      probationBadgeLabel({ kind: 'confirmed', endsAt: '2024-07-01', daysRemaining: -300 }),
    ).toBe('Confirmed')
    expect(
      probationBadgeLabel({ kind: 'probation', endsAt: '2026-09-01', daysRemaining: 115 }),
    ).toBe('Probation (115 days remaining)')
    expect(
      probationBadgeLabel({
        kind: 'pending-review',
        endsAt: '2026-04-01',
        daysRemaining: -38,
      }),
    ).toBe('Probation pending review')
    expect(probationBadgeLabel({ kind: 'na', endsAt: null, daysRemaining: null })).toBe(
      'Probation N/A',
    )
  })
})
