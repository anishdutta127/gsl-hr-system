import { afterEach, describe, expect, it } from 'vitest'
import { computeStats, publicRecognitions, resetStatsCache } from '../recognitionStats'
import type { Recognition } from '../types'

afterEach(() => resetStatsCache())

function rec(overrides: Partial<Recognition>): Recognition {
  return {
    id: 'RECOG-2026-01',
    employeeId: 'emp-1',
    nominatedBy: 'hod-1',
    month: '2026-05',
    department: 'Academics',
    category: 'Employee of the Month',
    writeup: 'Great work',
    status: 'Published',
    nominatedAt: '2026-05-01T00:00:00Z',
    approvedAt: '2026-05-02T00:00:00Z',
    publishedAt: '2026-05-03T00:00:00Z',
    publicShareEnabled: true,
    distributionEmails: [],
    auditLog: [],
    ...overrides,
  }
}

describe('publicRecognitions', () => {
  it('keeps only published + publicShareEnabled records', () => {
    const list = [
      rec({ id: 'R1', status: 'Published', publicShareEnabled: true }),
      rec({ id: 'R2', status: 'Approved', publicShareEnabled: true }),
      rec({ id: 'R3', status: 'Published', publicShareEnabled: false }),
      rec({ id: 'R4', status: 'Nominated', publicShareEnabled: true }),
    ]
    expect(publicRecognitions(list).map((r) => r.id)).toEqual(['R1'])
  })
})

describe('computeStats', () => {
  it('returns zero stats for an empty list', () => {
    const s = computeStats([])
    expect(s.totalAllTime).toBe(0)
    expect(s.uniqueEmployees).toBe(0)
    expect(s.uniqueDepartments).toBe(0)
    expect(s.recent).toEqual([])
  })

  it('aggregates by year, department, and employee', () => {
    const list = [
      rec({ id: 'R1', employeeId: 'e1', department: 'Academics', month: '2026-05' }),
      rec({ id: 'R2', employeeId: 'e2', department: 'Operations', month: '2026-04' }),
      rec({ id: 'R3', employeeId: 'e1', department: 'Academics', month: '2025-09' }),
    ]
    const s = computeStats(list, new Date('2026-06-01'))
    expect(s.totalAllTime).toBe(3)
    expect(s.totalThisYear).toBe(2)
    expect(s.uniqueEmployees).toBe(2)
    expect(s.uniqueDepartments).toBe(2)
    expect(s.byYear.get('2026')).toBe(2)
    expect(s.byYear.get('2025')).toBe(1)
    expect(s.byDepartment.get('Academics')).toBe(2)
    expect(s.byDepartment.get('Operations')).toBe(1)
    expect(s.mostCelebrated.get('e1')).toBe(2)
  })

  it('sorts recent newest-first using publishedAt with fallback', () => {
    const list = [
      rec({ id: 'R1', publishedAt: '2026-04-15T00:00:00Z' }),
      rec({ id: 'R2', publishedAt: '2026-05-20T00:00:00Z' }),
      rec({ id: 'R3', publishedAt: '2026-03-01T00:00:00Z' }),
    ]
    expect(computeStats(list).recent.map((r) => r.id)).toEqual(['R2', 'R1', 'R3'])
  })

  it('ignores recognitions that aren\'t public', () => {
    const s = computeStats([
      rec({ id: 'R1' }),
      rec({ id: 'R2', publicShareEnabled: false }),
    ])
    expect(s.totalAllTime).toBe(1)
  })
})
