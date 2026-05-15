import { describe, expect, it } from 'vitest'
import {
  itAssetHistoryFor,
  itAssetsAssignedTo,
  matchesITAssetQuery,
  nextITAssetId,
} from '../itAssets'
import type { ITAsset } from '../types'

function asset(overrides: Partial<ITAsset>): ITAsset {
  return {
    id: 'ASSET-2026-0001',
    category: 'Laptop',
    make: 'Dell',
    model: 'Latitude 5420',
    serialNumber: 'SN-A',
    assetTag: '',
    purchaseDate: null,
    purchaseCost: null,
    warrantyEndDate: null,
    currentAssignment: null,
    assignmentHistory: [],
    status: 'Available',
    condition: 'Good',
    location: 'Mumbai',
    notes: '',
    auditLog: [],
    createdBy: 'hr@gsl',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('nextITAssetId', () => {
  it('starts at 0001 when the year is empty', () => {
    expect(nextITAssetId([], 2026)).toBe('ASSET-2026-0001')
  })

  it('zero-pads to four digits', () => {
    expect(nextITAssetId([asset({ id: 'ASSET-2026-0042' })], 2026)).toBe('ASSET-2026-0043')
  })

  it('does NOT fill gaps within the year', () => {
    // Printed asset tags must not be reused: a retired ASSET-2026-0002
    // stays a gap even if HR deletes that record.
    expect(
      nextITAssetId(
        [asset({ id: 'ASSET-2026-0001' }), asset({ id: 'ASSET-2026-0004' })],
        2026,
      ),
    ).toBe('ASSET-2026-0005')
  })

  it('scopes max() by year', () => {
    expect(
      nextITAssetId(
        [asset({ id: 'ASSET-2025-0099' }), asset({ id: 'ASSET-2026-0003' })],
        2026,
      ),
    ).toBe('ASSET-2026-0004')
    expect(
      nextITAssetId(
        [asset({ id: 'ASSET-2025-0099' }), asset({ id: 'ASSET-2026-0003' })],
        2027,
      ),
    ).toBe('ASSET-2027-0001')
  })

  it('ignores malformed ids', () => {
    expect(
      nextITAssetId(
        [
          asset({ id: 'ASSET-2026-XXXX' }),
          asset({ id: 'asset-2026-0005' }),
          asset({ id: 'ASSET-2026-0008' }),
        ],
        2026,
      ),
    ).toBe('ASSET-2026-0009')
  })
})

describe('itAssetsAssignedTo', () => {
  it('returns only currently-assigned assets for the employee', () => {
    const a1 = asset({
      id: 'ASSET-2026-0001',
      status: 'Assigned',
      currentAssignment: { employeeId: 'emp-1', assignedAt: 't', assignedBy: 'hr' },
    })
    const a2 = asset({
      id: 'ASSET-2026-0002',
      status: 'Available',
      currentAssignment: null,
    })
    const a3 = asset({
      id: 'ASSET-2026-0003',
      status: 'Assigned',
      currentAssignment: { employeeId: 'emp-2', assignedAt: 't', assignedBy: 'hr' },
    })
    expect(itAssetsAssignedTo([a1, a2, a3], 'emp-1').map((a) => a.id)).toEqual([
      'ASSET-2026-0001',
    ])
  })
})

describe('itAssetHistoryFor', () => {
  it('returns assets the employee currently has OR previously had', () => {
    const a1 = asset({
      id: 'ASSET-2026-0001',
      currentAssignment: { employeeId: 'emp-1', assignedAt: 't', assignedBy: 'hr' },
    })
    const a2 = asset({
      id: 'ASSET-2026-0002',
      currentAssignment: { employeeId: 'emp-2', assignedAt: 't', assignedBy: 'hr' },
      assignmentHistory: [
        {
          employeeId: 'emp-1',
          assignedAt: 't0',
          returnedAt: 't1',
          returnedReason: 'role change',
          assignedBy: 'hr',
        },
      ],
    })
    const a3 = asset({ id: 'ASSET-2026-0003' })
    expect(itAssetHistoryFor([a1, a2, a3], 'emp-1').map((a) => a.id).sort()).toEqual([
      'ASSET-2026-0001',
      'ASSET-2026-0002',
    ])
  })
})

describe('matchesITAssetQuery', () => {
  const a = asset({
    id: 'ASSET-2026-0001',
    make: 'Apple',
    model: 'MacBook Pro 14',
    serialNumber: 'C02XX9876',
    assetTag: 'GSL-LAP-021',
    location: 'Mumbai',
  })

  it('matches an empty query', () => {
    expect(matchesITAssetQuery(a, '')).toBe(true)
    expect(matchesITAssetQuery(a, '   ')).toBe(true)
  })

  it('matches on id, make, model, serial, tag, and location case-insensitively', () => {
    expect(matchesITAssetQuery(a, 'apple')).toBe(true)
    expect(matchesITAssetQuery(a, 'MACBOOK')).toBe(true)
    expect(matchesITAssetQuery(a, 'c02xx')).toBe(true)
    expect(matchesITAssetQuery(a, 'GSL-LAP')).toBe(true)
    expect(matchesITAssetQuery(a, 'mumbai')).toBe(true)
    expect(matchesITAssetQuery(a, 'asset-2026')).toBe(true)
  })

  it('returns false for non-matches', () => {
    expect(matchesITAssetQuery(a, 'Dell')).toBe(false)
    expect(matchesITAssetQuery(a, 'kolkata')).toBe(false)
  })
})
