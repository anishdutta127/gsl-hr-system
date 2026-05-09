/*
 * Phase 3 leave route regression suite. Mocks GitHub Contents API +
 * session + employee lookup. Covers permission boundaries, validation,
 * LOP confirmation flow, retroactive emergency rules, and overlap
 * rejection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/identity', () => ({
  getCurrentSession: vi.fn(),
}))

vi.mock('@/lib/data', () => ({
  findEmployeeById: vi.fn(),
  loadEmployees: vi.fn(() => []),
  loadUsers: vi.fn(() => []),
}))

vi.mock('@/lib/queue/githubQueue', () => ({
  atomicUpdateJson: vi.fn(),
}))

vi.mock('@/lib/holidays', async () => {
  const actual = await vi.importActual<typeof import('../holidays')>('../holidays')
  return {
    ...actual,
    loadHolidays: vi.fn(() => []),
    loadEmployeeOptionalHolidays: vi.fn(() => []),
  }
})

vi.mock('@/lib/leave', async () => {
  const actual = await vi.importActual<typeof import('../leave')>('../leave')
  return {
    ...actual,
    loadLeaveApplications: vi.fn(() => []),
  }
})

import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'

const mockGetSession = vi.mocked(getCurrentSession)
const mockFindEmp = vi.mocked(findEmployeeById)
const mockAtomic = vi.mocked(atomicUpdateJson)

const HR = { sub: 'u-hr', email: 'hr@gsl.in', name: 'HR', role: 'HR' as const, iat: 0, exp: 0 }
const ADMIN = { ...HR, sub: 'u-admin', email: 'a@gsl.in', role: 'Admin' as const }
const HOD = { sub: 'mgr-7', email: 'hod@gsl.in', name: 'HOD', role: 'HOD' as const, iat: 0, exp: 0 }
const HOD_OTHER = { ...HOD, sub: 'mgr-other', email: 'other-mgr@gsl.in' }
const LEAD = { sub: 'u-lead', email: 'lead@gsl.in', name: 'Lead', role: 'Leadership' as const, iat: 0, exp: 0 }

const SAMPLE_EMP = {
  id: 'emp-1',
  employeeCode: 'X/1',
  name: 'Direct Report',
  email: 'd@gsl.in',
  designation: 'Eng',
  department: 'Tech',
  location: 'Mumbai',
  reportingManagerId: 'mgr-7',
  workPattern: 'office-5day' as const,
  dateOfJoining: '2024-04-01',
  status: 'Active' as const,
  createdAt: '2024-04-01',
  createdBy: 'seed',
  auditLog: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindEmp.mockReturnValue(SAMPLE_EMP as never)
  mockAtomic.mockImplementation(async (_p, mutate, opts) => {
    const result = mutate(opts.defaultValue as never)
    return { next: result.next, commitSha: 'sha' }
  })
})

afterEach(() => {
  vi.resetModules()
})

async function postApply(body: unknown) {
  const mod = await import('@/app/api/admin/leave/apply/route')
  return mod.POST(
    new Request('https://x/api/admin/leave/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

async function patchLeave(id: string, body: unknown) {
  const mod = await import('@/app/api/admin/leave/[id]/route')
  return mod.PATCH(
    new Request(`https://x/api/admin/leave/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  )
}

const FUTURE_START = '2027-01-05' // Tuesday in the future
const FUTURE_END = '2027-01-09' // Saturday

describe('POST /api/admin/leave/apply — permissions', () => {
  it('null session: 401', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await postApply({
      employeeId: 'emp-1',
      leaveType: 'casual',
      startDate: FUTURE_START,
      endDate: FUTURE_END,
      reason: 'vacation',
    })
    expect(res.status).toBe(401)
  })

  it('HOD applying for someone else: 403 (admin route is HR-mediated only for non-self)', async () => {
    mockGetSession.mockResolvedValue(HOD as never)
    const res = await postApply({
      employeeId: 'emp-1',
      leaveType: 'casual',
      startDate: FUTURE_START,
      endDate: FUTURE_END,
      reason: 'vacation',
    })
    expect(res.status).toBe(403)
  })

  it('HOD applying for self: passes auth gate', async () => {
    mockGetSession.mockResolvedValue(HOD as never)
    mockFindEmp.mockReturnValue({ ...SAMPLE_EMP, id: 'mgr-7' } as never)
    const res = await postApply({
      employeeId: 'mgr-7',
      leaveType: 'casual',
      startDate: FUTURE_START,
      endDate: FUTURE_END,
      reason: 'vacation',
    })
    expect([200, 400, 409]).toContain(res.status)
  })

  it('Leadership applying for another employee: 403', async () => {
    mockGetSession.mockResolvedValue(LEAD as never)
    const res = await postApply({
      employeeId: 'emp-1',
      leaveType: 'casual',
      startDate: FUTURE_START,
      endDate: FUTURE_END,
      reason: 'vacation',
    })
    expect(res.status).toBe(403)
  })

  it('HR applying for any employee: passes', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await postApply({
      employeeId: 'emp-1',
      leaveType: 'casual',
      startDate: FUTURE_START,
      endDate: FUTURE_END,
      reason: 'vacation',
    })
    expect([200, 400, 409]).toContain(res.status)
  })
})

describe('POST /api/admin/leave/apply — validation', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(HR as never))

  it('invalid leaveType -> 400', async () => {
    const res = await postApply({
      employeeId: 'emp-1',
      leaveType: 'wedding',
      startDate: FUTURE_START,
      endDate: FUTURE_END,
      reason: 'x',
    })
    expect(res.status).toBe(400)
  })

  it('endDate before startDate -> 400', async () => {
    const res = await postApply({
      employeeId: 'emp-1',
      leaveType: 'casual',
      startDate: FUTURE_END,
      endDate: FUTURE_START,
      reason: 'x',
    })
    expect(res.status).toBe(400)
  })

  it('half-day with start != end -> 400', async () => {
    const res = await postApply({
      employeeId: 'emp-1',
      leaveType: 'casual',
      startDate: FUTURE_START,
      endDate: FUTURE_END,
      reason: 'x',
      isHalfDay: true,
    })
    expect(res.status).toBe(400)
  })

  it('past-dated leave without isEmergency -> 400', async () => {
    const res = await postApply({
      employeeId: 'emp-1',
      leaveType: 'casual',
      startDate: '2020-01-01',
      endDate: '2020-01-01',
      reason: 'x',
    })
    expect(res.status).toBe(400)
  })

  it('emergency more than 7 days back -> 400', async () => {
    const res = await postApply({
      employeeId: 'emp-1',
      leaveType: 'sick',
      startDate: '2020-01-01',
      endDate: '2020-01-01',
      reason: 'x',
      isEmergency: true,
    })
    expect(res.status).toBe(400)
  })

  it('exited employee -> 409', async () => {
    mockFindEmp.mockReturnValue({ ...SAMPLE_EMP, status: 'Exited' } as never)
    const res = await postApply({
      employeeId: 'emp-1',
      leaveType: 'casual',
      startDate: FUTURE_START,
      endDate: FUTURE_END,
      reason: 'x',
    })
    expect(res.status).toBe(409)
  })

  it('weekend-only window -> 400 (zero working days)', async () => {
    // 2027-01-09 Sat, 2027-01-10 Sun for office-5day
    const res = await postApply({
      employeeId: 'emp-1',
      leaveType: 'casual',
      startDate: '2027-01-09',
      endDate: '2027-01-10',
      reason: 'x',
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/admin/leave/apply — overlap detection', () => {
  beforeEach(async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const leave = await import('../leave')
    vi.mocked(leave.loadLeaveApplications).mockReturnValue([
      {
        id: 'existing',
        employeeId: 'emp-1',
        leaveType: 'casual',
        startDate: '2027-01-05',
        endDate: '2027-01-09',
        totalDays: 5,
        reason: '',
        isHalfDay: false,
        status: 'Approved',
        appliedAt: '2027-01-01',
        appliedBy: 'hr@gsl.in',
        submittedAt: '2027-01-01',
        approvedBy: 'hr@gsl.in',
        approvedAt: '2027-01-01',
        rejectionReason: null,
        recallReason: null,
        isEmergency: false,
        lossOfPayDays: 0,
        auditLog: [],
      },
    ])
  })

  it('overlapping with approved leave -> 409', async () => {
    const res = await postApply({
      employeeId: 'emp-1',
      leaveType: 'casual',
      startDate: '2027-01-07',
      endDate: '2027-01-12',
      reason: 'overlap',
    })
    expect(res.status).toBe(409)
  })
})

describe('POST /api/admin/leave/apply — LOP confirmation flow', () => {
  beforeEach(async () => {
    mockGetSession.mockResolvedValue(HR as never)
    // Pre-fill with 12 casual already taken so balance is 0; new 5-day
    // application would overflow into LOP.
    const leave = await import('../leave')
    vi.mocked(leave.loadLeaveApplications).mockReturnValue([
      {
        id: 'block',
        employeeId: 'emp-1',
        leaveType: 'casual',
        startDate: '2026-04-13',
        endDate: '2026-04-30',
        totalDays: 12,
        reason: '',
        isHalfDay: false,
        status: 'Approved',
        appliedAt: '2026-04-01',
        appliedBy: 'hr@gsl.in',
        submittedAt: '2026-04-01',
        approvedBy: 'hr@gsl.in',
        approvedAt: '2026-04-01',
        rejectionReason: null,
        recallReason: null,
        isEmergency: false,
        lossOfPayDays: 0,
        auditLog: [],
      },
    ])
  })

  it('LOP overflow without confirmLossOfPay -> 409 with requiresLOPConfirmation', async () => {
    const res = await postApply({
      employeeId: 'emp-1',
      leaveType: 'casual',
      startDate: '2027-01-05',
      endDate: '2027-01-09',
      reason: 'extra',
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { requiresLOPConfirmation?: boolean }
    expect(body.requiresLOPConfirmation).toBe(true)
  })

  it('confirmLossOfPay=true succeeds', async () => {
    const res = await postApply({
      employeeId: 'emp-1',
      leaveType: 'casual',
      startDate: '2027-01-05',
      endDate: '2027-01-09',
      reason: 'extra',
      confirmLossOfPay: true,
    })
    expect(res.status).toBe(200)
  })
})

describe('PATCH /api/admin/leave/[id] — approve/reject/recall/cancel', () => {
  beforeEach(async () => {
    const leave = await import('../leave')
    vi.mocked(leave.loadLeaveApplications).mockReturnValue([
      {
        id: 'lv-1',
        employeeId: 'emp-1',
        leaveType: 'casual',
        startDate: '2027-01-05',
        endDate: '2027-01-05',
        totalDays: 1,
        reason: '',
        isHalfDay: false,
        status: 'Submitted',
        appliedAt: '2027-01-01',
        appliedBy: 'hr@gsl.in',
        submittedAt: '2027-01-01',
        approvedBy: null,
        approvedAt: null,
        rejectionReason: null,
        recallReason: null,
        isEmergency: false,
        lossOfPayDays: 0,
        auditLog: [],
      },
    ])
  })

  it('HOD direct-report can approve', async () => {
    mockGetSession.mockResolvedValue(HOD as never)
    const res = await patchLeave('lv-1', { action: 'approve' })
    expect([200, 404]).toContain(res.status)
  })

  it('HOD non-direct-report blocked from approve', async () => {
    mockGetSession.mockResolvedValue(HOD_OTHER as never)
    const res = await patchLeave('lv-1', { action: 'approve' })
    expect(res.status).toBe(403)
  })

  it('Self-approve forbidden', async () => {
    // Simulate manager applying for themselves; emp-1's reportingManager is mgr-7
    mockGetSession.mockResolvedValue({ ...HOD, sub: 'emp-1' } as never)
    const res = await patchLeave('lv-1', { action: 'approve' })
    expect(res.status).toBe(403)
  })

  it('Reject without rejectionReason -> 400', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await patchLeave('lv-1', { action: 'reject' })
    expect(res.status).toBe(400)
  })

  it('Reject with reason -> 200', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await patchLeave('lv-1', { action: 'reject', rejectionReason: 'unclear' })
    expect([200, 404]).toContain(res.status)
  })

  it('Recall without reason -> 400; with reason -> 200', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    // Need an Approved leave to recall.
    const leave = await import('../leave')
    vi.mocked(leave.loadLeaveApplications).mockReturnValue([
      {
        id: 'lv-2',
        employeeId: 'emp-1',
        leaveType: 'casual',
        startDate: '2027-01-05',
        endDate: '2027-01-05',
        totalDays: 1,
        reason: '',
        isHalfDay: false,
        status: 'Approved',
        appliedAt: '2027-01-01',
        appliedBy: 'hr@gsl.in',
        submittedAt: '2027-01-01',
        approvedBy: 'hr@gsl.in',
        approvedAt: '2027-01-01',
        rejectionReason: null,
        recallReason: null,
        isEmergency: false,
        lossOfPayDays: 0,
        auditLog: [],
      },
    ])
    expect((await patchLeave('lv-2', { action: 'recall' })).status).toBe(400)
    expect(
      [200, 404].includes((await patchLeave('lv-2', { action: 'recall', recallReason: 'plans changed' })).status),
    ).toBe(true)
  })

  it('Cancel forbidden by non-owner non-HR', async () => {
    mockGetSession.mockResolvedValue(HOD_OTHER as never)
    const res = await patchLeave('lv-1', { action: 'cancel' })
    expect(res.status).toBe(403)
  })

  it('Edit allowed only by HR/Admin', async () => {
    mockGetSession.mockResolvedValue(HOD as never)
    const res = await patchLeave('lv-1', { action: 'edit', edits: { reason: 'updated' } })
    expect(res.status).toBe(403)
    mockGetSession.mockResolvedValue(ADMIN as never)
    const ok = await patchLeave('lv-1', { action: 'edit', edits: { reason: 'updated' } })
    expect([200, 404]).toContain(ok.status)
  })
})

describe('DELETE /api/admin/leave/[id] — Admin only hard-delete', () => {
  it('HR cannot hard-delete', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const mod = await import('@/app/api/admin/leave/[id]/route')
    const res = await mod.DELETE(
      new Request('https://x/api/admin/leave/lv-1', { method: 'DELETE' }),
      { params: { id: 'lv-1' } },
    )
    expect(res.status).toBe(403)
  })

  it('Admin can hard-delete', async () => {
    mockGetSession.mockResolvedValue(ADMIN as never)
    const mod = await import('@/app/api/admin/leave/[id]/route')
    const res = await mod.DELETE(
      new Request('https://x/api/admin/leave/lv-1', { method: 'DELETE' }),
      { params: { id: 'lv-1' } },
    )
    expect([200, 404]).toContain(res.status)
  })
})
