/*
 * Role-gate coverage for the bulk employee upload routes. Only the session is
 * mocked; the gate returns before any data access, so the handlers need no fs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/identity', () => ({ getCurrentSession: vi.fn() }))

import { getCurrentSession } from '@/lib/identity'
import { POST as previewPOST } from '@/app/api/admin/employees/bulk-upload/preview/route'
import { POST as commitPOST } from '@/app/api/admin/employees/bulk-upload/commit/route'
import { GET as templateGET } from '@/app/api/admin/employees/bulk-upload/template/route'
import type { SessionClaims, StaffRole } from '@/lib/types'

const mockSession = vi.mocked(getCurrentSession)

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
