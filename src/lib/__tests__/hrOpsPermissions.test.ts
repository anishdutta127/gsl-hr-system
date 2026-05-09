/*
 * V6 — Permission boundary tests for Phase 4 HR Ops API routes that the
 * document regression suite doesn't already cover. Reporting Manager (HOD)
 * and Leadership must never break through any of these gates.
 *
 * Layered cleanly: the document-specific gates live in
 * hrDocumentUploads.regression.test.ts; this file focuses on taxonomy +
 * holidays + holiday picks + employee profile + probation routes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/identity', () => ({
  getCurrentSession: vi.fn(),
}))

vi.mock('@/lib/data', () => ({
  findEmployeeById: vi.fn(),
  loadEmployees: vi.fn(() => []),
}))

vi.mock('@/lib/queue/githubQueue', () => ({
  atomicUpdateJson: vi.fn(),
}))

vi.mock('@/lib/queue/pendingUpdates', () => ({
  enqueueUpdate: vi.fn(),
}))

import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'

const mockGetSession = vi.mocked(getCurrentSession)
const mockFindEmp = vi.mocked(findEmployeeById)
const mockAtomic = vi.mocked(atomicUpdateJson)
const mockEnqueue = vi.mocked(enqueueUpdate)

const HOD = { sub: 'u', email: 'hod@gsl', name: 'HOD', role: 'HOD' as const, iat: 0, exp: 0 }
const LEAD = { sub: 'u', email: 'lead@gsl', name: 'Lead', role: 'Leadership' as const, iat: 0, exp: 0 }
const HR = { sub: 'u', email: 'hr@gsl', name: 'HR', role: 'HR' as const, iat: 0, exp: 0 }
const ADMIN = { sub: 'u', email: 'a@gsl', name: 'A', role: 'Admin' as const, iat: 0, exp: 0 }

const SAMPLE_EMP = {
  id: 'emp-1',
  employeeCode: 'X/1',
  name: 'Test',
  email: 't@x',
  designation: 'X',
  department: 'Operations',
  location: 'Mumbai',
  dateOfJoining: '2025-01-01',
  status: 'Active' as const,
  createdAt: '2025-01-01',
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
  mockEnqueue.mockResolvedValue({
    id: 'q',
    queuedAt: '2026-05-09T00:00:00Z',
    queuedBy: 'x',
    entity: 'employee',
    operation: 'update',
    payload: {},
    retryCount: 0,
  })
})

afterEach(() => {
  vi.resetModules()
})

async function postJson(handlerImport: () => Promise<unknown>, url: string, body: unknown) {
  const mod = (await handlerImport()) as { POST: (req: Request) => Promise<Response> }
  return mod.POST(
    new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

async function patchJson(
  handlerImport: () => Promise<unknown>,
  url: string,
  body: unknown,
  params?: { id: string },
) {
  const mod = (await handlerImport()) as {
    PATCH: (req: Request, ctx?: { params: { id: string } }) => Promise<Response>
  }
  const req = new Request(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return params ? mod.PATCH(req, { params }) : mod.PATCH(req)
}

describe('POST /api/admin/taxonomy', () => {
  const url = 'https://x/api/admin/taxonomy'
  const body = { kind: 'location', operation: 'rename', from: 'Mumbai', to: 'Bombay' }

  it('null session: 401', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await postJson(() => import('@/app/api/admin/taxonomy/route'), url, body)
    expect(res.status).toBe(401)
  })
  it('HOD: 403', async () => {
    mockGetSession.mockResolvedValue(HOD as never)
    const res = await postJson(() => import('@/app/api/admin/taxonomy/route'), url, body)
    expect(res.status).toBe(403)
  })
  it('Leadership: 403 (taxonomy is HR/Admin only)', async () => {
    mockGetSession.mockResolvedValue(LEAD as never)
    const res = await postJson(() => import('@/app/api/admin/taxonomy/route'), url, body)
    expect(res.status).toBe(403)
  })
  it('HR: passes auth gate', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await postJson(() => import('@/app/api/admin/taxonomy/route'), url, body)
    expect([200, 400]).toContain(res.status) // not 401/403
  })
})

describe('POST /api/admin/holidays', () => {
  const url = 'https://x/api/admin/holidays'
  const body = { date: '2026-12-31', name: 'Test', type: 'mandatory' }

  it('HOD upload is 403', async () => {
    mockGetSession.mockResolvedValue(HOD as never)
    const res = await postJson(() => import('@/app/api/admin/holidays/route'), url, body)
    expect(res.status).toBe(403)
  })
  it('Leadership is 403', async () => {
    mockGetSession.mockResolvedValue(LEAD as never)
    const res = await postJson(() => import('@/app/api/admin/holidays/route'), url, body)
    expect(res.status).toBe(403)
  })
  it('HR passes auth gate', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await postJson(() => import('@/app/api/admin/holidays/route'), url, body)
    expect([200, 400]).toContain(res.status)
  })
})

describe('POST /api/admin/holidays/picks', () => {
  const url = 'https://x/api/admin/holidays/picks'
  const body = { employeeId: 'emp-1', holidayId: 'h-test', year: 2026 }

  it('HOD: 403', async () => {
    mockGetSession.mockResolvedValue(HOD as never)
    const res = await postJson(() => import('@/app/api/admin/holidays/picks/route'), url, body)
    expect(res.status).toBe(403)
  })
  it('HR: passes', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await postJson(() => import('@/app/api/admin/holidays/picks/route'), url, body)
    expect([200, 400, 409]).toContain(res.status)
  })
})

describe('PATCH /api/employees/[id]/profile', () => {
  const url = 'https://x/api/employees/emp-1/profile'
  const body = { phone: '+91-9999999999' }

  it('null session: 401', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await patchJson(
      () => import('@/app/api/employees/[id]/profile/route'),
      url,
      body,
      { id: 'emp-1' },
    )
    expect(res.status).toBe(401)
  })
  it('HOD: 403 — Reporting Manager cannot edit profile', async () => {
    mockGetSession.mockResolvedValue(HOD as never)
    const res = await patchJson(
      () => import('@/app/api/employees/[id]/profile/route'),
      url,
      body,
      { id: 'emp-1' },
    )
    expect(res.status).toBe(403)
  })
  it('Leadership: 403', async () => {
    mockGetSession.mockResolvedValue(LEAD as never)
    const res = await patchJson(
      () => import('@/app/api/employees/[id]/profile/route'),
      url,
      body,
      { id: 'emp-1' },
    )
    expect(res.status).toBe(403)
  })
  it('Admin: passes', async () => {
    mockGetSession.mockResolvedValue(ADMIN as never)
    const res = await patchJson(
      () => import('@/app/api/employees/[id]/profile/route'),
      url,
      body,
      { id: 'emp-1' },
    )
    expect([200, 400]).toContain(res.status)
  })
})

describe('POST /api/employees/[id]/probation', () => {
  const url = 'https://x/api/employees/emp-1/probation'
  const body = { action: 'confirm' }

  async function postWithParams() {
    const mod = await import('@/app/api/employees/[id]/probation/route')
    return mod.POST(
      new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: { id: 'emp-1' } },
    )
  }

  it('null session: 401', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await postWithParams()
    expect(res.status).toBe(401)
  })
  it('HOD: 403', async () => {
    mockGetSession.mockResolvedValue(HOD as never)
    const res = await postWithParams()
    expect(res.status).toBe(403)
  })
  it('Leadership: 403 (probation actions are HR-only)', async () => {
    mockGetSession.mockResolvedValue(LEAD as never)
    const res = await postWithParams()
    expect(res.status).toBe(403)
  })
  it('HR: passes auth gate', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await postWithParams()
    expect([200, 400]).toContain(res.status)
  })
})
