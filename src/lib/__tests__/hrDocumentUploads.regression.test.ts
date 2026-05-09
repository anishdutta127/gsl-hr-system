/*
 * HR document upload regression suite. Mirrors the resume regression suite —
 * one file, every scenario, fails loudly the moment a future commit breaks
 * any of them. The document repository carries Shruti-class confidentiality
 * risk: a single role-gate slip and Reporting Managers see PAN cards. These
 * tests exist specifically so role-gate regressions cannot ship.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Layer 1: pure path/permission helpers
// ---------------------------------------------------------------------------

import {
  assertInsideHrDocumentsRoot,
  buildHrDocumentRepoPath,
  canEditEmployeeDocuments,
  canViewEmployeeDocuments,
} from '../documents'

describe('buildHrDocumentRepoPath', () => {
  it('produces a path under data/hr-documents/[employeeId]/', () => {
    const p = buildHrDocumentRepoPath('emp-123', 'doc-456', '.pdf')
    expect(p).toBe('data/hr-documents/emp-123/doc-456.pdf')
  })

  it('strips traversal characters from employeeId and fileId', () => {
    const p = buildHrDocumentRepoPath('../../etc', '../../passwd', '.txt')
    expect(p.startsWith('data/hr-documents/')).toBe(true)
    expect(p.includes('..')).toBe(false)
  })

  it('normalises extension casing', () => {
    expect(buildHrDocumentRepoPath('emp', 'doc', '.PDF')).toBe('data/hr-documents/emp/doc.pdf')
  })
})

describe('assertInsideHrDocumentsRoot', () => {
  it('rejects /etc/passwd', () => {
    expect(() => assertInsideHrDocumentsRoot('/etc/passwd')).toThrow()
  })
})

describe('canViewEmployeeDocuments + canEditEmployeeDocuments', () => {
  const session = (overrides: Record<string, unknown> = {}) =>
    ({
      sub: 'u',
      email: overrides.email ?? 'x@gsl.in',
      name: 'X',
      role: overrides.role ?? 'HR',
      iat: 0,
      exp: 0,
    } as never)

  it('Admin and HR can view + edit', () => {
    expect(canViewEmployeeDocuments(session({ role: 'Admin' }))).toBe(true)
    expect(canViewEmployeeDocuments(session({ role: 'HR' }))).toBe(true)
    expect(canEditEmployeeDocuments(session({ role: 'Admin' }))).toBe(true)
    expect(canEditEmployeeDocuments(session({ role: 'HR' }))).toBe(true)
  })

  it('HOD (Reporting Manager class) is hard-blocked from view AND edit', () => {
    expect(canViewEmployeeDocuments(session({ role: 'HOD' }))).toBe(false)
    expect(canEditEmployeeDocuments(session({ role: 'HOD' }))).toBe(false)
  })

  it('Production lockdown: TESTING_OPEN_ACCESS=false + GSL_DOCUMENT_VIEWERS set restricts Leadership to listed', () => {
    process.env.TESTING_OPEN_ACCESS = 'false'
    delete process.env.GSL_DOCUMENT_VIEWERS
    // Both env vars open: Leadership still in.
    expect(canViewEmployeeDocuments(session({ role: 'Leadership' }))).toBe(true)
    process.env.GSL_DOCUMENT_VIEWERS = 'ameet.z@getsetlearn.info, jesal@getsetlearn.info'
    expect(
      canViewEmployeeDocuments(session({ role: 'Leadership', email: 'ameet.z@getsetlearn.info' })),
    ).toBe(true)
    expect(
      canViewEmployeeDocuments(session({ role: 'Leadership', email: 'jesal@getsetlearn.info' })),
    ).toBe(true)
    expect(
      canViewEmployeeDocuments(session({ role: 'Leadership', email: 'random@getsetlearn.info' })),
    ).toBe(false)
    delete process.env.TESTING_OPEN_ACCESS
    delete process.env.GSL_DOCUMENT_VIEWERS
  })

  it('Allowlisted Leadership can VIEW but cannot EDIT', () => {
    process.env.GSL_DOCUMENT_VIEWERS = 'ameet.z@getsetlearn.info'
    const lead = session({ role: 'Leadership', email: 'ameet.z@getsetlearn.info' })
    expect(canViewEmployeeDocuments(lead)).toBe(true)
    expect(canEditEmployeeDocuments(lead)).toBe(false)
    delete process.env.GSL_DOCUMENT_VIEWERS
  })

  it('Null session blocked', () => {
    expect(canViewEmployeeDocuments(null)).toBe(false)
    expect(canEditEmployeeDocuments(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Layer 2: route handlers with mocked dependencies.
// ---------------------------------------------------------------------------

vi.mock('@/lib/identity', () => ({
  getCurrentSession: vi.fn(),
}))

vi.mock('@/lib/data', () => ({
  findEmployeeById: vi.fn(),
}))

vi.mock('@/lib/queue/githubQueue', () => ({
  atomicUpdateJson: vi.fn(),
  putBinaryFile: vi.fn(),
  deleteBinaryFile: vi.fn(),
  QueueUpstreamError: class QueueUpstreamError extends Error {
    constructor(
      public readonly path: string,
      public readonly status: number,
      public readonly body: string,
    ) {
      super(`Upstream ${status}`)
    }
  },
  QueueNotConfiguredError: class QueueNotConfiguredError extends Error {},
}))

vi.mock('@/lib/documents', async () => {
  const actual = await vi.importActual<typeof import('../documents')>('../documents')
  return {
    ...actual,
    loadEmployeeDocuments: vi.fn(() => []),
  }
})

import { getCurrentSession } from '@/lib/identity'
import { findEmployeeById } from '@/lib/data'
import { atomicUpdateJson, putBinaryFile } from '@/lib/queue/githubQueue'

const mockGetSession = vi.mocked(getCurrentSession)
const mockFindEmp = vi.mocked(findEmployeeById)
const mockPutBinary = vi.mocked(putBinaryFile)
const mockAtomic = vi.mocked(atomicUpdateJson)

const HR_SESSION = {
  sub: 'u1',
  email: 'riddhi@gsl.test',
  name: 'Riddhi',
  role: 'HR' as const,
  iat: 0,
  exp: 0,
}
const HOD_SESSION = {
  sub: 'u2',
  email: 'manali@gsl.test',
  name: 'Manali',
  role: 'HOD' as const,
  iat: 0,
  exp: 0,
}
const LEAD_SESSION_AMEET = {
  sub: 'u3',
  email: 'ameet.z@getsetlearn.info',
  name: 'Ameet',
  role: 'Leadership' as const,
  iat: 0,
  exp: 0,
}
const LEAD_SESSION_OTHER = {
  ...LEAD_SESSION_AMEET,
  email: 'random@getsetlearn.info',
}

const SAMPLE_EMPLOYEE = {
  id: 'emp-ajith',
  employeeCode: 'MTPL/004',
  name: 'AJITH NAIR',
  email: 'ajith.n@getsetlearn.info',
  designation: 'Senior Manager - Technology',
  department: 'Technology',
  location: 'Mumbai',
  dateOfJoining: '2021-01-01',
  status: 'Active' as const,
  createdAt: '2021-01-01',
  createdBy: 'master',
  auditLog: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPutBinary.mockResolvedValue({ commitSha: 'sha1' })
  mockAtomic.mockImplementation(async (_path, mutate, opts) => {
    const result = mutate(opts.defaultValue as never)
    return { next: result.next, commitSha: 'sha2' }
  })
  mockFindEmp.mockReturnValue(SAMPLE_EMPLOYEE as never)
})

afterEach(() => {
  vi.resetModules()
})

function uploadFormData(name = 'aadhaar.pdf', size = 1024, type = 'application/pdf'): FormData {
  const fd = new FormData()
  fd.append('employeeId', 'emp-ajith')
  fd.append('templateId', 'tpl-aadhaar-card')
  fd.append('file', new File([new Uint8Array(size)], name, { type }))
  return fd
}

async function postUpload(fd: FormData) {
  const { POST } = await import('@/app/api/admin/documents/route')
  const req = new Request('https://x/api/admin/documents', { method: 'POST', body: fd })
  return POST(req)
}

describe('POST /api/admin/documents (upload)', () => {
  it('HR upload writes file at data/hr-documents/[empId]/[docId].pdf and records the document', async () => {
    mockGetSession.mockResolvedValue(HR_SESSION as never)
    const res = await postUpload(uploadFormData())
    expect(res.status).toBe(200)
    expect(mockPutBinary).toHaveBeenCalledTimes(1)
    const repoPath = mockPutBinary.mock.calls[0]?.[0] ?? ''
    expect(repoPath.startsWith('data/hr-documents/emp-ajith/')).toBe(true)
    expect(repoPath.endsWith('.pdf')).toBe(true)

    expect(mockAtomic).toHaveBeenCalledTimes(1)
    const docPath = mockAtomic.mock.calls[0]?.[0]
    expect(docPath).toBe('src/data/employee_documents.json')
  })

  it('HOD (Reporting Manager class) upload is 403 — reporting manager must NOT touch documents', async () => {
    mockGetSession.mockResolvedValue(HOD_SESSION as never)
    const res = await postUpload(uploadFormData())
    expect(res.status).toBe(403)
    expect(mockPutBinary).not.toHaveBeenCalled()
  })

  it('Allowlisted Leadership cannot upload (read-only)', async () => {
    process.env.GSL_DOCUMENT_VIEWERS = 'ameet.z@getsetlearn.info'
    mockGetSession.mockResolvedValue(LEAD_SESSION_AMEET as never)
    const res = await postUpload(uploadFormData())
    expect(res.status).toBe(403)
    delete process.env.GSL_DOCUMENT_VIEWERS
  })

  it('Non-allowlisted Leadership is also blocked', async () => {
    mockGetSession.mockResolvedValue(LEAD_SESSION_OTHER as never)
    const res = await postUpload(uploadFormData())
    expect(res.status).toBe(403)
  })

  it('Unauthenticated upload is 403', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await postUpload(uploadFormData())
    expect(res.status).toBe(403)
  })

  it('Files >10MB are rejected with 413', async () => {
    mockGetSession.mockResolvedValue(HR_SESSION as never)
    const res = await postUpload(uploadFormData('big.pdf', 11 * 1024 * 1024))
    expect(res.status).toBe(413)
    expect(mockPutBinary).not.toHaveBeenCalled()
  })

  it('Empty file is rejected', async () => {
    mockGetSession.mockResolvedValue(HR_SESSION as never)
    const res = await postUpload(uploadFormData('empty.pdf', 0))
    expect(res.status).toBe(400)
    expect(mockPutBinary).not.toHaveBeenCalled()
  })

  it('.exe is rejected', async () => {
    mockGetSession.mockResolvedValue(HR_SESSION as never)
    const res = await postUpload(uploadFormData('virus.exe', 1024, 'application/x-msdownload'))
    expect(res.status).toBe(400)
    expect(mockPutBinary).not.toHaveBeenCalled()
  })

  it('.docx is accepted (some templates need Excel/Word)', async () => {
    mockGetSession.mockResolvedValue(HR_SESSION as never)
    const res = await postUpload(uploadFormData('joinee.docx', 1024, 'application/octet-stream'))
    expect(res.status).toBe(200)
  })

  it('.xlsx is accepted (New Joinee Details template)', async () => {
    mockGetSession.mockResolvedValue(HR_SESSION as never)
    const res = await postUpload(uploadFormData('joinee.xlsx', 1024, 'application/octet-stream'))
    expect(res.status).toBe(200)
  })

  it('Missing employeeId returns 400 without writing', async () => {
    mockGetSession.mockResolvedValue(HR_SESSION as never)
    const fd = new FormData()
    fd.append('templateId', 'tpl-aadhaar-card')
    fd.append('file', new File([new Uint8Array(64)], 'a.pdf', { type: 'application/pdf' }))
    const { POST } = await import('@/app/api/admin/documents/route')
    const res = await POST(new Request('https://x/api/admin/documents', { method: 'POST', body: fd }))
    expect(res.status).toBe(400)
    expect(mockPutBinary).not.toHaveBeenCalled()
  })

  it('Unknown employeeId returns 404', async () => {
    mockGetSession.mockResolvedValue(HR_SESSION as never)
    mockFindEmp.mockReturnValue(undefined)
    const res = await postUpload(uploadFormData())
    expect(res.status).toBe(404)
    expect(mockPutBinary).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/documents (verify / edit)', () => {
  it('HR can verify', async () => {
    mockGetSession.mockResolvedValue(HR_SESSION as never)
    const { PATCH } = await import('@/app/api/admin/documents/route')
    const res = await PATCH(
      new Request('https://x/api/admin/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'doc-1', verified: true }),
      }),
    )
    // 404 because mocked default value list is empty; what matters is auth gate did not block.
    expect([200, 404]).toContain(res.status)
  })

  it('HOD verify is 403', async () => {
    mockGetSession.mockResolvedValue(HOD_SESSION as never)
    const { PATCH } = await import('@/app/api/admin/documents/route')
    const res = await PATCH(
      new Request('https://x/api/admin/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'doc-1', verified: true }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('Allowlisted Leadership verify is 403 (view-only)', async () => {
    process.env.GSL_DOCUMENT_VIEWERS = 'ameet.z@getsetlearn.info'
    mockGetSession.mockResolvedValue(LEAD_SESSION_AMEET as never)
    const { PATCH } = await import('@/app/api/admin/documents/route')
    const res = await PATCH(
      new Request('https://x/api/admin/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'doc-1', verified: true }),
      }),
    )
    expect(res.status).toBe(403)
    delete process.env.GSL_DOCUMENT_VIEWERS
  })
})

describe('DELETE /api/admin/documents', () => {
  it('HOD delete is 403', async () => {
    mockGetSession.mockResolvedValue(HOD_SESSION as never)
    const { DELETE } = await import('@/app/api/admin/documents/route')
    const res = await DELETE(new Request('https://x/api/admin/documents?id=doc-1', { method: 'DELETE' }))
    expect(res.status).toBe(403)
  })

  it('HR delete with non-existent id returns 404', async () => {
    mockGetSession.mockResolvedValue(HR_SESSION as never)
    const { DELETE } = await import('@/app/api/admin/documents/route')
    const res = await DELETE(
      new Request('https://x/api/admin/documents?id=missing', { method: 'DELETE' }),
    )
    expect(res.status).toBe(404)
  })
})

describe('GET /api/admin/documents/[id]/download (reader)', () => {
  it('HOD reader access is 403 even with valid id', async () => {
    mockGetSession.mockResolvedValue(HOD_SESSION as never)
    const { GET } = await import('@/app/api/admin/documents/[id]/download/route')
    const res = await GET(new Request('https://x/api/admin/documents/doc-1/download'), {
      params: { id: 'doc-1' },
    })
    expect(res.status).toBe(403)
  })

  it('Allowlisted Leadership CAN read', async () => {
    process.env.GSL_DOCUMENT_VIEWERS = 'ameet.z@getsetlearn.info'
    mockGetSession.mockResolvedValue(LEAD_SESSION_AMEET as never)
    const { GET } = await import('@/app/api/admin/documents/[id]/download/route')
    const res = await GET(new Request('https://x/api/admin/documents/doc-1/download'), {
      params: { id: 'doc-1' },
    })
    // 404 because no document exists in the empty-list mock; what matters is the
    // auth gate did NOT 403 a properly-allowlisted Leadership user.
    expect(res.status).toBe(404)
    delete process.env.GSL_DOCUMENT_VIEWERS
  })

  it('Non-allowlisted Leadership cannot read in PRODUCTION lockdown', async () => {
    process.env.TESTING_OPEN_ACCESS = 'false'
    process.env.GSL_DOCUMENT_VIEWERS = 'ameet.z@getsetlearn.info'
    mockGetSession.mockResolvedValue(LEAD_SESSION_OTHER as never)
    const { GET } = await import('@/app/api/admin/documents/[id]/download/route')
    const res = await GET(new Request('https://x/api/admin/documents/doc-1/download'), {
      params: { id: 'doc-1' },
    })
    expect(res.status).toBe(403)
    delete process.env.TESTING_OPEN_ACCESS
    delete process.env.GSL_DOCUMENT_VIEWERS
  })

  it('HR reader 404s cleanly when document is missing', async () => {
    mockGetSession.mockResolvedValue(HR_SESSION as never)
    const { GET } = await import('@/app/api/admin/documents/[id]/download/route')
    const res = await GET(new Request('https://x/api/admin/documents/missing/download'), {
      params: { id: 'missing' },
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { message?: string }
    expect(body.message).toMatch(/not found/i)
  })
})
