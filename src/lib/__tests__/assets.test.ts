import { describe, expect, it } from 'vitest'
import {
  assetsAssignedTo,
  canManageAssets,
  canViewAsset,
} from '../assets'
import type { Asset, SessionClaims } from '../types'

const session = (overrides: Partial<SessionClaims> = {}): SessionClaims => ({
  sub: 'u',
  email: 'x@gsl.in',
  name: 'X',
  role: 'HR',
  iat: 0,
  exp: 0,
  ...overrides,
})

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a',
    type: 'Laptop',
    identifier: 'SN-001',
    assignedTo: 'emp-1',
    assignedAt: '2026-01-01',
    returnedAt: null,
    condition: 'Good',
    notes: '',
    createdAt: '2026-01-01',
    createdBy: 'seed',
    auditLog: [],
    ...overrides,
  }
}

describe('canManageAssets', () => {
  it('Admin and HR can manage', () => {
    expect(canManageAssets(session({ role: 'Admin' }))).toBe(true)
    expect(canManageAssets(session({ role: 'HR' }))).toBe(true)
  })
  it('HOD/Leadership cannot manage', () => {
    expect(canManageAssets(session({ role: 'HOD' }))).toBe(false)
    expect(canManageAssets(session({ role: 'Leadership' }))).toBe(false)
  })
})

describe('canViewAsset', () => {
  it('Admin/HR/Leadership see all', () => {
    expect(canViewAsset({ session: session({ role: 'Admin' }), asset: asset() })).toBe(true)
    expect(canViewAsset({ session: session({ role: 'HR' }), asset: asset() })).toBe(true)
    expect(canViewAsset({ session: session({ role: 'Leadership' }), asset: asset() })).toBe(true)
  })

  it('HOD sees only their direct reports\' assignments', () => {
    const a = asset({ assignedTo: 'emp-1' })
    // mgr-7 is the reporting manager of emp-1
    expect(
      canViewAsset({
        session: session({ role: 'HOD', sub: 'mgr-7' }),
        asset: a,
        employeeReportingManagerId: 'mgr-7',
      }),
    ).toBe(true)
    // someone else's report
    expect(
      canViewAsset({
        session: session({ role: 'HOD', sub: 'mgr-7' }),
        asset: a,
        employeeReportingManagerId: 'mgr-elsewhere',
      }),
    ).toBe(false)
  })

  it('HOD never sees unassigned assets', () => {
    expect(
      canViewAsset({
        session: session({ role: 'HOD', sub: 'mgr-7' }),
        asset: asset({ assignedTo: null }),
      }),
    ).toBe(false)
  })
})

describe('assetsAssignedTo', () => {
  it('returns currently-assigned assets only (not returned)', () => {
    const assets: Asset[] = [
      asset({ id: 'a1', assignedTo: 'emp-1' }),
      asset({ id: 'a2', assignedTo: 'emp-1', returnedAt: '2026-05-01' }),
      asset({ id: 'a3', assignedTo: 'emp-2' }),
    ]
    const out = assetsAssignedTo(assets, 'emp-1')
    expect(out.map((a) => a.id)).toEqual(['a1'])
  })
})
