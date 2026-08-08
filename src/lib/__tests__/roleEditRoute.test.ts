/*
 * Role-gate + wiring coverage for PATCH /api/roles/[id].
 *
 * The gate is enforced on the API, not just the UI: hiding the Edit button
 * from a HOD is presentation, and presentation is not a permission.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/identity', () => ({ getCurrentSession: vi.fn() }))
vi.mock('@/lib/data', () => ({ findRoleById: vi.fn(), loadUsers: vi.fn(() => []) }))
vi.mock('@/lib/queue/pendingUpdates', () => ({ enqueueUpdate: vi.fn(async () => undefined) }))
vi.mock('@/lib/sanitiseHtml', () => ({ sanitiseRoleHtml: (h: string) => h }))

import { getCurrentSession } from '@/lib/identity'
import { findRoleById } from '@/lib/data'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { PATCH } from '@/app/api/roles/[id]/route'
import type { Role, SessionClaims, StaffRole } from '@/lib/types'

const mockSession = vi.mocked(getCurrentSession)
const mockFindRole = vi.mocked(findRoleById)
const mockEnqueue = vi.mocked(enqueueUpdate)

function sessionOf(role: StaffRole): SessionClaims {
  return { sub: 'u1', email: `${role}@gsl.in`, name: role, role, iat: 0, exp: 0 }
}

function roleFixture(): Role {
  return {
    id: 'role-1',
    title: 'Sales Executive',
    department: 'Premium Sales',
    location: 'Mumbai',
    employmentType: 'Full-time',
    status: 'Open',
    pipelineStages: ['Sourced', 'Offered'],
    rubric: [],
    description: '',
    responsibilities: [],
    mustHaves: [],
    niceToHaves: [],
    createdAt: '2026-05-01T00:00:00.000Z',
    createdBy: 'hr@gsl.in',
    auditLog: [],
  } as Role
}

function patch(body: unknown) {
  return new Request('http://test/api/roles/role-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = { params: { id: 'role-1' } }

describe('PATCH /api/roles/[id] role gate', () => {
  beforeEach(() => {
    mockSession.mockReset()
    mockFindRole.mockReset()
    mockEnqueue.mockReset()
    mockFindRole.mockResolvedValue(roleFixture())
  })

  it('401 when signed out', async () => {
    mockSession.mockResolvedValue(null)
    const res = await PATCH(patch({ title: 'New' }), params)
    expect(res.status).toBe(401)
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('403 for HOD and Leadership', async () => {
    for (const role of ['HOD', 'Leadership'] as StaffRole[]) {
      mockSession.mockResolvedValue(sessionOf(role))
      const res = await PATCH(patch({ title: 'New' }), params)
      expect(res.status, `${role} must not edit roles`).toBe(403)
    }
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('HR and Admin can edit', async () => {
    for (const role of ['HR', 'Admin'] as StaffRole[]) {
      mockEnqueue.mockClear()
      mockSession.mockResolvedValue(sessionOf(role))
      const res = await PATCH(patch({ title: `New ${role}` }), params)
      expect(res.status, `${role} must be able to edit roles`).toBe(200)
      expect(mockEnqueue).toHaveBeenCalledTimes(1)
    }
  })

  it('404 for a role that does not exist', async () => {
    mockSession.mockResolvedValue(sessionOf('HR'))
    mockFindRole.mockResolvedValue(undefined)
    expect((await PATCH(patch({ title: 'New' }), params)).status).toBe(404)
  })
})

describe('PATCH /api/roles/[id] queue payload', () => {
  beforeEach(() => {
    mockSession.mockReset()
    mockFindRole.mockReset()
    mockEnqueue.mockReset()
    mockFindRole.mockResolvedValue(roleFixture())
    mockSession.mockResolvedValue(sessionOf('HR'))
  })

  it('enqueues a role.edit carrying only the changed fields', async () => {
    await PATCH(patch({ title: 'Regional Manager', department: 'Premium Sales' }), params)
    expect(mockEnqueue).toHaveBeenCalledTimes(1)
    const arg = mockEnqueue.mock.calls[0]?.[0] as unknown as {
      entity: string
      operation: string
      payload: { id: string; operation: string; after: Record<string, unknown> }
    }
    expect(arg.entity).toBe('role')
    expect(arg.operation).toBe('update')
    expect(arg.payload.operation).toBe('role.edit')
    expect(arg.payload.id).toBe('role-1')
    // department was unchanged, so it must not be in the diff.
    expect(arg.payload.after).toEqual({ title: 'Regional Manager' })
  })

  it('never enqueues immutable fields even when the client sends them', async () => {
    await PATCH(
      patch({ title: 'Renamed', id: 'hijack', pipelineStages: ['Sourced'], createdAt: '1999-01-01' }),
      params,
    )
    const arg = mockEnqueue.mock.calls[0]?.[0] as unknown as {
      payload: { after: Record<string, unknown> }
    }
    expect(arg.payload.after).toEqual({ title: 'Renamed' })
    expect(arg.payload.after).not.toHaveProperty('id')
    expect(arg.payload.after).not.toHaveProperty('pipelineStages')
    expect(arg.payload.after).not.toHaveProperty('createdAt')
  })

  it('a no-op edit does not write to the queue', async () => {
    const res = await PATCH(patch({ title: 'Sales Executive' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ noop: true })
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('400 on invalid input, with nothing queued', async () => {
    const res = await PATCH(patch({ title: '' }), params)
    expect(res.status).toBe(400)
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('surfaces a queue failure as 503 rather than reporting false success', async () => {
    mockEnqueue.mockRejectedValue(new Error('GitHub unavailable'))
    const res = await PATCH(patch({ title: 'Regional Manager' }), params)
    expect(res.status).toBe(503)
  })
})
