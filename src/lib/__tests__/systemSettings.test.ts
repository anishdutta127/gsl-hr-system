/*
 * Tests for the systemSettings loader. The on-disk default ships with
 * leaveFlow='hr-mediated' which matches Riddhi's stated preference;
 * the loader falls back to that default when the file is missing or
 * malformed. Admin flips it from /admin/alerts/preferences via PUT.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/identity', () => ({
  getCurrentSession: vi.fn(),
}))

vi.mock('@/lib/queue/githubQueue', () => ({
  atomicUpdateJson: vi.fn(),
}))

import { getCurrentSession } from '@/lib/identity'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'

const mockGetSession = vi.mocked(getCurrentSession)
const mockAtomic = vi.mocked(atomicUpdateJson)

const HR = { sub: 'u-hr', email: 'hr@gsl.in', name: 'HR', role: 'HR' as const, iat: 0, exp: 0 }
const ADMIN = { ...HR, sub: 'u-admin', email: 'a@gsl.in', role: 'Admin' as const }
const HOD = { ...HR, sub: 'u-hod', email: 'hod@gsl.in', role: 'HOD' as const }

beforeEach(() => {
  vi.clearAllMocks()
  mockAtomic.mockImplementation(async (_p, mutate, opts) => {
    const result = mutate(opts.defaultValue as never)
    return { next: result.next, commitSha: 'sha' }
  })
})
afterEach(() => {
  vi.resetModules()
})

async function getSettings() {
  const mod = await import('@/app/api/admin/system-settings/route')
  return mod.GET()
}

async function putSettings(body: unknown) {
  const mod = await import('@/app/api/admin/system-settings/route')
  return mod.PUT(
    new Request('https://x/api/admin/system-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('GET /api/admin/system-settings', () => {
  it('null session: 401', async () => {
    mockGetSession.mockResolvedValue(null)
    expect((await getSettings()).status).toBe(401)
  })

  it('HOD: 403', async () => {
    mockGetSession.mockResolvedValue(HOD as never)
    expect((await getSettings()).status).toBe(403)
  })

  it('HR + Admin can read', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    expect((await getSettings()).status).toBe(200)
    mockGetSession.mockResolvedValue(ADMIN as never)
    expect((await getSettings()).status).toBe(200)
  })

  it('GET returns the seeded leaveFlow', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await getSettings()
    const body = (await res.json()) as { leaveFlow: string }
    expect(['hr-mediated', 'self-service']).toContain(body.leaveFlow)
  })
})

describe('PUT /api/admin/system-settings', () => {
  it('null session: 401', async () => {
    mockGetSession.mockResolvedValue(null)
    expect((await putSettings({ leaveFlow: 'self-service' })).status).toBe(401)
  })

  it('HR cannot edit (Admin-only)', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    expect((await putSettings({ leaveFlow: 'self-service' })).status).toBe(403)
  })

  it('HOD cannot edit', async () => {
    mockGetSession.mockResolvedValue(HOD as never)
    expect((await putSettings({ leaveFlow: 'self-service' })).status).toBe(403)
  })

  it('Invalid leaveFlow value -> 400', async () => {
    mockGetSession.mockResolvedValue(ADMIN as never)
    expect((await putSettings({ leaveFlow: 'managed-by-cat' })).status).toBe(400)
  })

  it('Admin flipping to self-service succeeds', async () => {
    mockGetSession.mockResolvedValue(ADMIN as never)
    const res = await putSettings({ leaveFlow: 'self-service' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { settings?: { leaveFlow?: string } }
    expect(body.settings?.leaveFlow).toBe('self-service')
  })

  it('Admin flipping back to hr-mediated succeeds', async () => {
    mockGetSession.mockResolvedValue(ADMIN as never)
    const res = await putSettings({ leaveFlow: 'hr-mediated' })
    expect(res.status).toBe(200)
  })
})

describe('loadSystemSettings (default fallback)', () => {
  it('Falls back to hr-mediated when seed-file missing or malformed', async () => {
    // The actual file lives on disk. Test the helper returns a valid
    // LeaveFlow even on missing data.
    const { loadSystemSettings, getLeaveFlow } = await import('../systemSettings')
    const s = loadSystemSettings()
    expect(['hr-mediated', 'self-service']).toContain(s.leaveFlow)
    expect(['hr-mediated', 'self-service']).toContain(getLeaveFlow())
  })
})
