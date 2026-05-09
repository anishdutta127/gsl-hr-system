/*
 * Phase 4 Phase 2 regression suite: onboarding + offboarding + assets +
 * exit interview + F&F settlement permission boundaries and edge states.
 *
 * Mirrors the Phase 1 hrDocumentUploads.regression.test.ts pattern.
 * Layer 1: pure helpers covered in their dedicated test files.
 * Layer 2 (this file): route handlers with mocked dependencies.
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
  QueueUpstreamError: class QueueUpstreamError extends Error {
    constructor(
      public readonly path: string,
      public readonly status: number,
      public readonly body: string,
    ) {
      super(`Upstream ${status}`)
    }
  },
}))

vi.mock('@/lib/onboardingTasks', async () => {
  const actual = await vi.importActual<typeof import('../onboardingTasks')>('../onboardingTasks')
  return {
    ...actual,
    loadOnboardingTasks: vi.fn(() => []),
    loadOnboardingTemplates: vi.fn(() => []),
  }
})

vi.mock('@/lib/offboardingTasks', async () => {
  const actual = await vi.importActual<typeof import('../offboardingTasks')>('../offboardingTasks')
  return {
    ...actual,
    loadOffboardingTasks: vi.fn(() => []),
    loadOffboardingTemplates: vi.fn(() => []),
    loadExitInterviews: vi.fn(() => []),
    loadFFSettlements: vi.fn(() => []),
  }
})

import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'

const mockGetSession = vi.mocked(getCurrentSession)
const mockFindEmp = vi.mocked(findEmployeeById)
const mockAtomic = vi.mocked(atomicUpdateJson)

const HR = {
  sub: 'u-hr',
  email: 'hr@gsl.in',
  name: 'HR',
  role: 'HR' as const,
  iat: 0,
  exp: 0,
}
const ADMIN = { ...HR, sub: 'u-admin', email: 'a@gsl.in', role: 'Admin' as const }
const HOD_DR = {
  sub: 'mgr-7',
  email: 'manali@gsl.test',
  name: 'Manali',
  role: 'HOD' as const,
  iat: 0,
  exp: 0,
}
const HOD_OTHER = { ...HOD_DR, sub: 'mgr-other', email: 'other-mgr@gsl.test' }
const LEAD_RANDOM = {
  sub: 'u-lead',
  email: 'random@gsl.in',
  name: 'Lead',
  role: 'Leadership' as const,
  iat: 0,
  exp: 0,
}
const LEAD_AMEET = { ...LEAD_RANDOM, sub: 'u-ameet', email: 'ameet.z@getsetlearn.info' }

const SAMPLE_EMP = {
  id: 'emp-1',
  employeeCode: 'X/1',
  name: 'Direct Report',
  email: 'dr@gsl.in',
  designation: 'Engineer',
  department: 'Technology',
  location: 'Mumbai',
  reportingManagerId: 'mgr-7',
  dateOfJoining: '2026-04-01',
  status: 'Active' as const,
  createdAt: '2026-04-01',
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
  params?: { taskId?: string; employeeId?: string },
) {
  const mod = (await handlerImport()) as {
    PATCH: (req: Request, ctx?: { params: Record<string, string> }) => Promise<Response>
  }
  const req = new Request(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return params ? mod.PATCH(req, { params: params as Record<string, string> }) : mod.PATCH(req)
}
async function putJson(
  handlerImport: () => Promise<unknown>,
  url: string,
  body: unknown,
  params: { employeeId: string },
) {
  const mod = (await handlerImport()) as {
    PUT: (req: Request, ctx: { params: { employeeId: string } }) => Promise<Response>
  }
  return mod.PUT(
    new Request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params },
  )
}

// =====================================================================
// Onboarding generate (POST /api/admin/onboarding/generate)
// =====================================================================
describe('POST /api/admin/onboarding/generate', () => {
  const url = 'https://x/api/admin/onboarding/generate'

  it('null session 401', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await postJson(
      () => import('@/app/api/admin/onboarding/generate/route'),
      url,
      { employeeId: 'emp-1' },
    )
    expect(res.status).toBe(401)
  })

  it('HOD generate is 403 (HR-only operation)', async () => {
    mockGetSession.mockResolvedValue(HOD_DR as never)
    const res = await postJson(
      () => import('@/app/api/admin/onboarding/generate/route'),
      url,
      { employeeId: 'emp-1' },
    )
    expect(res.status).toBe(403)
  })

  it('Leadership generate is 403', async () => {
    mockGetSession.mockResolvedValue(LEAD_AMEET as never)
    const res = await postJson(
      () => import('@/app/api/admin/onboarding/generate/route'),
      url,
      { employeeId: 'emp-1' },
    )
    expect(res.status).toBe(403)
  })

  it('HR passes auth gate', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await postJson(
      () => import('@/app/api/admin/onboarding/generate/route'),
      url,
      { employeeId: 'emp-1' },
    )
    expect([200, 400, 404]).toContain(res.status)
  })
})

// =====================================================================
// Onboarding task PATCH
// =====================================================================
describe('PATCH /api/admin/onboarding/tasks/[taskId]', () => {
  beforeEach(async () => {
    const onb = await import('../onboardingTasks')
    vi.mocked(onb.loadOnboardingTasks).mockReturnValue([
      {
        id: 'obtask-emp-1-x',
        employeeId: 'emp-1',
        templateId: 'ob-day0',
        status: 'Not Started',
        assignedTo: 'mgr-7',
        dueDate: '2026-05-01',
        completedAt: null,
        completedBy: null,
        notes: '',
        blockers: '',
        auditLog: [],
      },
    ])
  })

  it('HR can complete', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await patchJson(
      () => import('@/app/api/admin/onboarding/tasks/[taskId]/route'),
      'https://x/api/admin/onboarding/tasks/obtask-emp-1-x',
      { status: 'Completed' },
      { taskId: 'obtask-emp-1-x' },
    )
    expect([200, 404]).toContain(res.status)
  })

  it('HOD assigned to the task can mark In Progress', async () => {
    mockGetSession.mockResolvedValue(HOD_DR as never)
    const res = await patchJson(
      () => import('@/app/api/admin/onboarding/tasks/[taskId]/route'),
      'https://x/api/admin/onboarding/tasks/obtask-emp-1-x',
      { status: 'In Progress' },
      { taskId: 'obtask-emp-1-x' },
    )
    expect([200, 404]).toContain(res.status)
  })

  it('HOD whose direct report this is NOT can NOT update', async () => {
    mockGetSession.mockResolvedValue(HOD_OTHER as never)
    const res = await patchJson(
      () => import('@/app/api/admin/onboarding/tasks/[taskId]/route'),
      'https://x/api/admin/onboarding/tasks/obtask-emp-1-x',
      { status: 'In Progress' },
      { taskId: 'obtask-emp-1-x' },
    )
    expect(res.status).toBe(403)
  })

  it('HOD cannot mark N/A (HR-only)', async () => {
    mockGetSession.mockResolvedValue(HOD_DR as never)
    const res = await patchJson(
      () => import('@/app/api/admin/onboarding/tasks/[taskId]/route'),
      'https://x/api/admin/onboarding/tasks/obtask-emp-1-x',
      { status: 'N/A' },
      { taskId: 'obtask-emp-1-x' },
    )
    expect(res.status).toBe(403)
  })

  it('HOD cannot reassign (HR-only)', async () => {
    mockGetSession.mockResolvedValue(HOD_DR as never)
    const res = await patchJson(
      () => import('@/app/api/admin/onboarding/tasks/[taskId]/route'),
      'https://x/api/admin/onboarding/tasks/obtask-emp-1-x',
      { assignedTo: 'someone-else' },
      { taskId: 'obtask-emp-1-x' },
    )
    expect(res.status).toBe(403)
  })

  it('Unknown taskId returns 404', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await patchJson(
      () => import('@/app/api/admin/onboarding/tasks/[taskId]/route'),
      'https://x/api/admin/onboarding/tasks/missing',
      { status: 'Completed' },
      { taskId: 'missing' },
    )
    expect(res.status).toBe(404)
  })
})

// =====================================================================
// Offboarding generate
// =====================================================================
describe('POST /api/admin/offboarding/generate', () => {
  const url = 'https://x/api/admin/offboarding/generate'

  it('HOD: 403', async () => {
    mockGetSession.mockResolvedValue(HOD_DR as never)
    const res = await postJson(
      () => import('@/app/api/admin/offboarding/generate/route'),
      url,
      { employeeId: 'emp-1' },
    )
    expect(res.status).toBe(403)
  })

  it('lastWorkingDay must be after noticeStartDate', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await postJson(
      () => import('@/app/api/admin/offboarding/generate/route'),
      url,
      {
        employeeId: 'emp-1',
        noticeStartDate: '2026-05-15',
        lastWorkingDay: '2026-05-15',
      },
    )
    expect(res.status).toBe(400)
  })

  it('HR with valid dates passes', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await postJson(
      () => import('@/app/api/admin/offboarding/generate/route'),
      url,
      {
        employeeId: 'emp-1',
        noticeStartDate: '2026-05-01',
        lastWorkingDay: '2026-06-01',
      },
    )
    expect([200, 400, 404]).toContain(res.status)
  })
})

// =====================================================================
// Offboarding task PATCH — exit interview NOT visible to HOD
// =====================================================================
describe('PATCH /api/admin/offboarding/tasks/[taskId]', () => {
  beforeEach(async () => {
    const off = await import('../offboardingTasks')
    vi.mocked(off.loadOffboardingTasks).mockReturnValue([
      {
        id: 'offtask-emp-1-handover',
        employeeId: 'emp-1',
        templateId: 'off-day3',
        status: 'Not Started',
        assignedTo: 'mgr-7',
        dueDate: '2026-05-04',
        completedAt: null,
        completedBy: null,
        notes: '',
        blockers: '',
        auditLog: [],
      },
      {
        id: 'offtask-emp-1-interview',
        employeeId: 'emp-1',
        templateId: 'off-exit-interview',
        status: 'Not Started',
        assignedTo: 'u-hr',
        dueDate: '2026-05-31',
        completedAt: null,
        completedBy: null,
        notes: '',
        blockers: '',
        auditLog: [],
      },
    ])
    vi.mocked(off.loadOffboardingTemplates).mockReturnValue([
      {
        id: 'off-day3',
        name: 'Begin handover plan',
        category: 'Knowledge Transfer',
        isMandatory: true,
        defaultAssignee: 'ReportingManager',
        daysFromNoticeStart: 3,
        estimatedMinutes: 60,
      },
      {
        id: 'off-exit-interview',
        name: 'Exit interview',
        category: 'Last Day',
        isMandatory: true,
        defaultAssignee: 'HR',
        daysFromNoticeStart: 0,
        pegToLwd: true,
        estimatedMinutes: 60,
      },
    ])
  })

  it('HOD direct-report can update handover task', async () => {
    mockGetSession.mockResolvedValue(HOD_DR as never)
    const res = await patchJson(
      () => import('@/app/api/admin/offboarding/tasks/[taskId]/route'),
      'https://x/api/admin/offboarding/tasks/offtask-emp-1-handover',
      { status: 'In Progress' },
      { taskId: 'offtask-emp-1-handover' },
    )
    expect([200, 404]).toContain(res.status)
  })

  it('HOD direct-report CANNOT update exit-interview task', async () => {
    mockGetSession.mockResolvedValue(HOD_DR as never)
    const res = await patchJson(
      () => import('@/app/api/admin/offboarding/tasks/[taskId]/route'),
      'https://x/api/admin/offboarding/tasks/offtask-emp-1-interview',
      { status: 'Completed' },
      { taskId: 'offtask-emp-1-interview' },
    )
    expect(res.status).toBe(403)
  })

  it('HOD non-direct-report blocked', async () => {
    mockGetSession.mockResolvedValue(HOD_OTHER as never)
    const res = await patchJson(
      () => import('@/app/api/admin/offboarding/tasks/[taskId]/route'),
      'https://x/api/admin/offboarding/tasks/offtask-emp-1-handover',
      { status: 'Completed' },
      { taskId: 'offtask-emp-1-handover' },
    )
    expect(res.status).toBe(403)
  })
})

// =====================================================================
// Exit interview PUT — strict gating
// =====================================================================
describe('PUT /api/admin/offboarding/exit-interview/[employeeId]', () => {
  const url = 'https://x/api/admin/offboarding/exit-interview/emp-1'
  const body = { reasonForLeaving: 'Better opportunity', wouldRecommend: 'Yes' as const }

  it('HOD: 403', async () => {
    mockGetSession.mockResolvedValue(HOD_DR as never)
    const res = await putJson(
      () => import('@/app/api/admin/offboarding/exit-interview/[employeeId]/route'),
      url,
      body,
      { employeeId: 'emp-1' },
    )
    expect(res.status).toBe(403)
  })

  it('Leadership: 403 even for view-only allowlist (edit gate is HR/Admin)', async () => {
    process.env.GSL_INTERVIEW_VIEWERS = 'ameet.z@getsetlearn.info'
    mockGetSession.mockResolvedValue(LEAD_AMEET as never)
    const res = await putJson(
      () => import('@/app/api/admin/offboarding/exit-interview/[employeeId]/route'),
      url,
      body,
      { employeeId: 'emp-1' },
    )
    expect(res.status).toBe(403)
    delete process.env.GSL_INTERVIEW_VIEWERS
  })

  it('HR: passes auth gate', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await putJson(
      () => import('@/app/api/admin/offboarding/exit-interview/[employeeId]/route'),
      url,
      body,
      { employeeId: 'emp-1' },
    )
    expect([200, 400, 404]).toContain(res.status)
  })

  it('Validates satisfaction range 1-5', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await putJson(
      () => import('@/app/api/admin/offboarding/exit-interview/[employeeId]/route'),
      url,
      { satisfactionWithManager: 9 },
      { employeeId: 'emp-1' },
    )
    expect(res.status).toBe(400)
  })

  it('Rejects an unknown wouldRecommend value', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await putJson(
      () => import('@/app/api/admin/offboarding/exit-interview/[employeeId]/route'),
      url,
      { wouldRecommend: 'Definitely Yes' },
      { employeeId: 'emp-1' },
    )
    expect(res.status).toBe(400)
  })
})

// =====================================================================
// F&F settlement PUT
// =====================================================================
describe('PUT /api/admin/offboarding/ff-settlement/[employeeId]', () => {
  const url = 'https://x/api/admin/offboarding/ff-settlement/emp-1'

  it('HOD: 403', async () => {
    mockGetSession.mockResolvedValue(HOD_DR as never)
    const res = await putJson(
      () => import('@/app/api/admin/offboarding/ff-settlement/[employeeId]/route'),
      url,
      { totalNet: 50000 },
      { employeeId: 'emp-1' },
    )
    expect(res.status).toBe(403)
  })

  it('Leadership: 403 (no settlement edit)', async () => {
    mockGetSession.mockResolvedValue(LEAD_AMEET as never)
    const res = await putJson(
      () => import('@/app/api/admin/offboarding/ff-settlement/[employeeId]/route'),
      url,
      { totalNet: 50000 },
      { employeeId: 'emp-1' },
    )
    expect(res.status).toBe(403)
  })

  it('HR: passes auth gate', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await putJson(
      () => import('@/app/api/admin/offboarding/ff-settlement/[employeeId]/route'),
      url,
      { totalNet: 50000 },
      { employeeId: 'emp-1' },
    )
    expect([200, 400, 404]).toContain(res.status)
  })
})

// =====================================================================
// Assets POST/PATCH/DELETE
// =====================================================================
describe('Assets routes', () => {
  it('POST: HOD blocked', async () => {
    mockGetSession.mockResolvedValue(HOD_DR as never)
    const res = await postJson(
      () => import('@/app/api/admin/assets/route'),
      'https://x/api/admin/assets',
      { type: 'Laptop', identifier: 'SN-1' },
    )
    expect(res.status).toBe(403)
  })

  it('POST: Leadership blocked (read-only)', async () => {
    mockGetSession.mockResolvedValue(LEAD_AMEET as never)
    const res = await postJson(
      () => import('@/app/api/admin/assets/route'),
      'https://x/api/admin/assets',
      { type: 'Laptop', identifier: 'SN-1' },
    )
    expect(res.status).toBe(403)
  })

  it('POST: HR can create', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await postJson(
      () => import('@/app/api/admin/assets/route'),
      'https://x/api/admin/assets',
      { type: 'Laptop', identifier: 'SN-001' },
    )
    expect([200, 400]).toContain(res.status)
  })

  it('POST: rejects unknown type', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await postJson(
      () => import('@/app/api/admin/assets/route'),
      'https://x/api/admin/assets',
      { type: 'Toaster', identifier: 'X' },
    )
    expect(res.status).toBe(400)
  })

  it('POST: rejects empty identifier', async () => {
    mockGetSession.mockResolvedValue(HR as never)
    const res = await postJson(
      () => import('@/app/api/admin/assets/route'),
      'https://x/api/admin/assets',
      { type: 'Laptop', identifier: '   ' },
    )
    expect(res.status).toBe(400)
  })

  it('PATCH: HOD blocked', async () => {
    mockGetSession.mockResolvedValue(HOD_DR as never)
    const res = await patchJson(
      () => import('@/app/api/admin/assets/route'),
      'https://x/api/admin/assets',
      { id: 'asset-1', returnAction: true },
    )
    expect(res.status).toBe(403)
  })

  it('DELETE: HOD blocked', async () => {
    mockGetSession.mockResolvedValue(HOD_DR as never)
    const mod = (await import('@/app/api/admin/assets/route')) as {
      DELETE: (req: Request) => Promise<Response>
    }
    const res = await mod.DELETE(
      new Request('https://x/api/admin/assets?id=asset-1', { method: 'DELETE' }),
    )
    expect(res.status).toBe(403)
  })
})
