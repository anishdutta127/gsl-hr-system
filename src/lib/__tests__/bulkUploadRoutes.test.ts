/*
 * Role-gate coverage for the bulk employee upload routes. Only the session is
 * mocked; the gate returns before any data access, so the handlers need no fs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/identity', () => ({ getCurrentSession: vi.fn() }))
vi.mock('@/lib/data', () => ({ loadEmployees: vi.fn(() => []), loadUsers: vi.fn(() => []) }))
vi.mock('@/lib/queue/githubQueue', () => ({ atomicUpdateJson: vi.fn(async () => ({ next: [], commitSha: 'x' })) }))
vi.mock('@/lib/onboardingTasks', async () => {
  const actual = await vi.importActual<typeof import('../onboardingTasks')>('../onboardingTasks')
  return { ...actual, loadOnboardingTemplates: vi.fn(() => []), loadOnboardingTasks: vi.fn(() => []) }
})

import { getCurrentSession } from '@/lib/identity'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import { POST as previewPOST } from '@/app/api/admin/employees/bulk-upload/preview/route'
import { POST as commitPOST } from '@/app/api/admin/employees/bulk-upload/commit/route'
import { GET as templateGET } from '@/app/api/admin/employees/bulk-upload/template/route'
import type { Employee, SessionClaims, StaffRole } from '@/lib/types'

const mockSession = vi.mocked(getCurrentSession)
const mockAtomic = vi.mocked(atomicUpdateJson)

function sessionOf(role: StaffRole): SessionClaims {
  return { sub: 'u1', email: `${role}@gsl.in`, name: role, role, iat: 0, exp: 0 }
}
function post() {
  // Bodyless POST: request.formData() rejects -> the handler's 400 path. The
  // gate (401/403) returns before formData() is ever called.
  return new Request('http://test/api', { method: 'POST' })
}

describe('bulk-upload routes: role gate (Admin + HR only)', () => {
  beforeEach(() => mockSession.mockReset())

  it('preview + commit return 401 when signed out', async () => {
    mockSession.mockResolvedValue(null)
    expect((await previewPOST(post())).status).toBe(401)
    expect((await commitPOST(post())).status).toBe(401)
  })

  it('preview + commit return 403 for HOD and Leadership', async () => {
    for (const role of ['HOD', 'Leadership'] as StaffRole[]) {
      mockSession.mockResolvedValue(sessionOf(role))
      expect((await previewPOST(post())).status).toBe(403)
      expect((await commitPOST(post())).status).toBe(403)
    }
  })

  it('preview returns 400 (not 403) for HR with no file', async () => {
    mockSession.mockResolvedValue(sessionOf('HR'))
    expect((await previewPOST(post())).status).toBe(400)
  })

  it('template: 403 for HOD, 200 xlsx for HR and Admin', async () => {
    mockSession.mockResolvedValue(sessionOf('HOD'))
    expect((await templateGET()).status).toBe(403)
    for (const role of ['HR', 'Admin'] as StaffRole[]) {
      mockSession.mockResolvedValue(sessionOf(role))
      const res = await templateGET()
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('spreadsheetml')
    }
  })
})

describe('bulk-upload commit: write path', () => {
  beforeEach(() => {
    mockSession.mockReset()
    mockAtomic.mockClear()
    mockAtomic.mockImplementation(async () => ({ next: [], commitSha: 'x' }))
  })

  function commitReq(csv: string) {
    const fd = new FormData()
    fd.append('file', new File([csv], 'test.csv', { type: 'text/csv' }))
    fd.append('overwrites', '[]')
    return new Request('http://test/api', { method: 'POST', body: fd })
  }

  it('writes valid rows to employees.json via atomicUpdateJson (upsert by id)', async () => {
    mockSession.mockResolvedValue(sessionOf('HR'))
    const csv =
      'Employee Code,Employee Name,DOJ,Designation,Department\n' +
      'MTPL/810,Commit Tester,2026-06-01,Sales Executive,Sales'
    const res = await commitPOST(commitReq(csv))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { written: number; result: Array<{ code: string; outcome: string }> }
    expect(body.written).toBe(1)
    expect(body.result[0]).toMatchObject({ code: 'MTPL/810', outcome: 'created' })

    // The employees write happened, and the mutate upserts the new record.
    const empCall = mockAtomic.mock.calls.find((c) => String(c[0]).includes('employees.json'))
    expect(empCall).toBeTruthy()
    const mutate = empCall![1] as (cur: Employee[]) => { next: Employee[] }
    const next = mutate([]).next
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ employeeCode: 'MTPL/810', name: 'Commit Tester', status: 'Active' })
    expect(next[0]?.auditLog?.[0]?.action).toBe('employee.create')
  })

  it('rejects a file whose every row errors (422, no write)', async () => {
    mockSession.mockResolvedValue(sessionOf('HR'))
    const csv = 'Employee Code,Employee Name,DOJ,Designation,Department\n,No Code,,,'
    const res = await commitPOST(commitReq(csv))
    expect(res.status).toBe(422)
    expect(mockAtomic.mock.calls.some((c) => String(c[0]).includes('employees.json'))).toBe(false)
  })
})
