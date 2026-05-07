/*
 * Resume upload regression suite. Resume upload bugs hit Round 2, Round 3,
 * and Round 5 — each time a different surface (reader path resolution, public
 * apply path-builder, HR-side queue feedback). One test file, eight
 * scenarios, fail loudly the moment a future commit breaks any of them.
 *
 * Two layers:
 *   1. Pure-function tests of validateUploadedResume — fast, no I/O. Cover
 *      size cap, ext allow-list, traversal-in-filename, null bytes.
 *   2. Route-handler tests that drive each POST handler with mocked
 *      sessions, queue, and putBinaryFile. Verify auth gates, path-builder
 *      consistency, and orphan-file cleanup on enqueue failure.
 *
 * The mocks intentionally stop at the GitHub Contents API boundary — we're
 * testing the route's orchestration, not GitHub itself. The Python applier
 * is exercised in production runs of apply-queue.yml, not here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CANDIDATE_UPLOAD_PROFILE,
  HR_UPLOAD_PROFILE,
  PUBLIC_APPLY_PROFILE,
  validateUploadedResume,
} from '../resumeUpload'

// ---------------------------------------------------------------------------
// Layer 1: pure validation
// ---------------------------------------------------------------------------

function fileOf(name: string, size: number, ext = '.pdf'): File {
  // Construct a File whose .size matches the desired byte count without
  // actually allocating that many bytes — Vitest's File polyfill respects
  // the underlying blob length.
  const fullName = name.endsWith(ext) ? name : `${name}${ext}`
  return new File([new Uint8Array(size)], fullName, { type: 'application/pdf' })
}

describe('validateUploadedResume — HR profile (10 MB, .pdf or .docx)', () => {
  it('accepts a 1 MB PDF', () => {
    const r = validateUploadedResume(fileOf('cv', 1024 * 1024), HR_UPLOAD_PROFILE)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ext).toBe('.pdf')
  })

  it('accepts a .docx', () => {
    const f = new File([new Uint8Array(1024)], 'cv.docx', { type: 'application/octet-stream' })
    const r = validateUploadedResume(f, HR_UPLOAD_PROFILE)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ext).toBe('.docx')
  })

  it('rejects 11 MB (over 10 MB limit)', () => {
    const r = validateUploadedResume(fileOf('cv', 11 * 1024 * 1024), HR_UPLOAD_PROFILE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(413)
  })

  it('rejects empty file', () => {
    const r = validateUploadedResume(fileOf('cv', 0), HR_UPLOAD_PROFILE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('rejects no file', () => {
    const r = validateUploadedResume(null, HR_UPLOAD_PROFILE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('rejects path traversal in filename', () => {
    const f = new File([new Uint8Array(64)], '../../../etc/passwd.pdf')
    const r = validateUploadedResume(f, HR_UPLOAD_PROFILE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/illegal/i)
  })

  it('rejects backslash in filename', () => {
    const f = new File([new Uint8Array(64)], 'a\\b.pdf')
    const r = validateUploadedResume(f, HR_UPLOAD_PROFILE)
    expect(r.ok).toBe(false)
  })

  it('rejects null byte in filename', () => {
    const f = new File([new Uint8Array(64)], 'cv.pdf\0.exe')
    const r = validateUploadedResume(f, HR_UPLOAD_PROFILE)
    expect(r.ok).toBe(false)
  })

  it('rejects .exe', () => {
    const f = new File([new Uint8Array(64)], 'cv.exe', { type: 'application/x-msdownload' })
    const r = validateUploadedResume(f, HR_UPLOAD_PROFILE)
    expect(r.ok).toBe(false)
  })
})

describe('validateUploadedResume — candidate-portal profile (5 MB, .pdf only)', () => {
  it('accepts a 1 MB PDF', () => {
    const r = validateUploadedResume(fileOf('cv', 1024 * 1024), CANDIDATE_UPLOAD_PROFILE)
    expect(r.ok).toBe(true)
  })

  it('rejects 6 MB (over 5 MB limit)', () => {
    const r = validateUploadedResume(fileOf('cv', 6 * 1024 * 1024), CANDIDATE_UPLOAD_PROFILE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(413)
  })

  it('rejects .docx (PDF only)', () => {
    const f = new File([new Uint8Array(1024)], 'cv.docx')
    const r = validateUploadedResume(f, CANDIDATE_UPLOAD_PROFILE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/PDF/i)
  })
})

describe('validateUploadedResume — public-apply profile (5 MB, .pdf only)', () => {
  it('accepts a 1 MB PDF', () => {
    const r = validateUploadedResume(fileOf('cv', 1024 * 1024), PUBLIC_APPLY_PROFILE)
    expect(r.ok).toBe(true)
  })

  it('rejects 6 MB (over 5 MB limit)', () => {
    const r = validateUploadedResume(fileOf('cv', 6 * 1024 * 1024), PUBLIC_APPLY_PROFILE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(413)
  })

  it('rejects .docx', () => {
    const f = new File([new Uint8Array(1024)], 'cv.docx')
    const r = validateUploadedResume(f, PUBLIC_APPLY_PROFILE)
    expect(r.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Layer 2: route handlers with mocked dependencies.
//
// We mock the GitHub Contents API surface (putBinaryFile / appendToQueue /
// deleteBinaryFile) to assert orchestration without firing real PRs at
// origin. Sessions and candidate identities are mocked to drive the auth
// gates from the test side.
// ---------------------------------------------------------------------------

vi.mock('@/lib/identity', () => ({
  getCurrentSession: vi.fn(),
}))

vi.mock('@/lib/candidateIdentity', () => ({
  getCurrentCandidateId: vi.fn(),
}))

vi.mock('@/lib/data', () => ({
  findCandidateById: vi.fn(),
  findRoleById: vi.fn(),
}))

vi.mock('@/lib/queue/githubQueue', () => ({
  putBinaryFile: vi.fn(),
  deleteBinaryFile: vi.fn(),
  dispatchWorkflow: vi.fn(),
  QueueUpstreamError: class QueueUpstreamError extends Error {
    constructor(
      public readonly path: string,
      public readonly status: number,
      public readonly body: string,
    ) {
      super(`GitHub Contents API ${status} on ${path}: ${body.slice(0, 200)}`)
    }
  },
  QueueNotConfiguredError: class QueueNotConfiguredError extends Error {},
}))

vi.mock('@/lib/queue/pendingUpdates', () => ({
  enqueueUpdate: vi.fn(),
}))

vi.mock('@/lib/mail', () => ({
  deliverEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/candidateAuth', () => ({
  mintMagicLink: vi.fn().mockResolvedValue({ token: 'fake-magic-token' }),
}))

vi.mock('@/lib/rateLimit', () => ({
  rateLimited: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/company', () => ({
  loadCompany: vi.fn().mockReturnValue({
    name: 'GSL',
    hrContact: { name: 'HR', title: 'HR' },
  }),
}))

import { getCurrentSession } from '@/lib/identity'
import { getCurrentCandidateId } from '@/lib/candidateIdentity'
import { findCandidateById, findRoleById } from '@/lib/data'
import {
  deleteBinaryFile,
  putBinaryFile,
} from '@/lib/queue/githubQueue'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'

const mockGetSession = vi.mocked(getCurrentSession)
const mockGetCandidateId = vi.mocked(getCurrentCandidateId)
const mockFindCandidate = vi.mocked(findCandidateById)
const mockFindRole = vi.mocked(findRoleById)
const mockPutBinary = vi.mocked(putBinaryFile)
const mockDeleteBinary = vi.mocked(deleteBinaryFile)
const mockEnqueue = vi.mocked(enqueueUpdate)

beforeEach(() => {
  vi.clearAllMocks()
  mockPutBinary.mockResolvedValue({ commitSha: 'sha1' })
  mockEnqueue.mockResolvedValue({
    id: 'q1',
    queuedAt: '2026-05-07T00:00:00Z',
    queuedBy: 'test',
    entity: 'candidate',
    operation: 'update',
    payload: {},
    retryCount: 0,
  })
  mockDeleteBinary.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.resetModules()
})

function pdfFormData(name = 'cv.pdf', size = 1024): FormData {
  const fd = new FormData()
  fd.append('file', new File([new Uint8Array(size)], name, { type: 'application/pdf' }))
  return fd
}

async function postFormData(handler: (req: Request, ctx: { params: { id: string } }) => Promise<Response>, url: string, fd: FormData, params: { id: string }) {
  // Convert FormData to a Request via the standard fetch shape.
  const req = new Request(url, { method: 'POST', body: fd })
  return handler(req, { params })
}

describe('HR-side upload route — POST /api/candidates/[id]/resume', () => {
  it('writes file at buildResumeRepoPath, then enqueues candidate.set-resume', async () => {
    mockGetSession.mockResolvedValue({
      sub: 'u1',
      email: 'shruti@gsl.test',
      name: 'Shruti',
      role: 'HR',
      issuedAt: 0,
      expiresAt: 0,
    } as never)
    mockFindCandidate.mockReturnValue({
      id: 'cand-faizan',
      name: 'Faizan',
      email: 'faizan@x.test',
      phone: '',
      source: 'HRTeam',
      createdAt: '2026-05-01',
      createdBy: 'shruti',
      auditLog: [],
    } as never)

    const { POST } = await import('@/app/api/candidates/[id]/resume/route')
    const res = await postFormData(POST, 'https://x/api/candidates/cand-faizan/resume', pdfFormData(), {
      id: 'cand-faizan',
    })

    expect(res.status).toBe(200)
    expect(mockPutBinary).toHaveBeenCalledTimes(1)
    const repoPath = mockPutBinary.mock.calls[0]?.[0] ?? ''
    expect(repoPath.startsWith('data/resumes/uploads/')).toBe(true)
    expect(repoPath.endsWith('/cand-faizan.pdf')).toBe(true)
    expect(mockEnqueue).toHaveBeenCalledTimes(1)
    const enqArg = mockEnqueue.mock.calls[0]?.[0]
    expect(enqArg?.entity).toBe('candidate')
    const payload = enqArg?.payload as { operation?: string; after?: { resumeFilePath?: string } }
    expect(payload?.operation).toBe('candidate.set-resume')
    expect(payload?.after?.resumeFilePath).toBe(repoPath)
  })

  it('rejects when no session', async () => {
    mockGetSession.mockResolvedValue(null)
    const { POST } = await import('@/app/api/candidates/[id]/resume/route')
    const res = await postFormData(POST, 'https://x/api/candidates/c/resume', pdfFormData(), {
      id: 'c',
    })
    expect(res.status).toBe(401)
  })

  it('rejects when session is HOD (not Admin/HR)', async () => {
    mockGetSession.mockResolvedValue({
      sub: 'u2',
      email: 'manali@gsl.test',
      name: 'Manali',
      role: 'HOD',
      issuedAt: 0,
      expiresAt: 0,
    } as never)
    const { POST } = await import('@/app/api/candidates/[id]/resume/route')
    const res = await postFormData(POST, 'https://x/api/candidates/c/resume', pdfFormData(), {
      id: 'c',
    })
    expect(res.status).toBe(403)
  })

  it('rejects 11 MB upload before touching GitHub', async () => {
    mockGetSession.mockResolvedValue({
      sub: 'u1',
      email: 'shruti@gsl.test',
      name: 'Shruti',
      role: 'HR',
      issuedAt: 0,
      expiresAt: 0,
    } as never)
    mockFindCandidate.mockReturnValue({
      id: 'c',
      name: 'X',
      email: '',
      phone: '',
      source: 'HRTeam',
      createdAt: '2026-05-01',
      createdBy: 's',
      auditLog: [],
    } as never)
    const { POST } = await import('@/app/api/candidates/[id]/resume/route')
    const res = await postFormData(
      POST,
      'https://x/api/candidates/c/resume',
      pdfFormData('big.pdf', 11 * 1024 * 1024),
      { id: 'c' },
    )
    expect(res.status).toBe(413)
    expect(mockPutBinary).not.toHaveBeenCalled()
  })

  it('rejects ../etc/passwd.pdf in filename', async () => {
    mockGetSession.mockResolvedValue({
      sub: 'u1',
      email: 'shruti@gsl.test',
      name: 'Shruti',
      role: 'HR',
      issuedAt: 0,
      expiresAt: 0,
    } as never)
    mockFindCandidate.mockReturnValue({
      id: 'c',
      name: 'X',
      email: '',
      phone: '',
      source: 'HRTeam',
      createdAt: '2026-05-01',
      createdBy: 's',
      auditLog: [],
    } as never)
    const fd = new FormData()
    fd.append('file', new File([new Uint8Array(64)], '../../../etc/passwd.pdf'))
    const { POST } = await import('@/app/api/candidates/[id]/resume/route')
    const res = await postFormData(POST, 'https://x/api/candidates/c/resume', fd, { id: 'c' })
    expect(res.status).toBe(400)
    expect(mockPutBinary).not.toHaveBeenCalled()
  })

  it('cleans up the orphan file when enqueue fails after the file is written', async () => {
    mockGetSession.mockResolvedValue({
      sub: 'u1',
      email: 'shruti@gsl.test',
      name: 'Shruti',
      role: 'HR',
      issuedAt: 0,
      expiresAt: 0,
    } as never)
    mockFindCandidate.mockReturnValue({
      id: 'c-orphan',
      name: 'Y',
      email: '',
      phone: '',
      source: 'HRTeam',
      createdAt: '2026-05-01',
      createdBy: 's',
      auditLog: [],
    } as never)
    mockEnqueue.mockRejectedValueOnce(new Error('queue down'))
    const { POST } = await import('@/app/api/candidates/[id]/resume/route')
    const res = await postFormData(POST, 'https://x/api/candidates/c-orphan/resume', pdfFormData(), {
      id: 'c-orphan',
    })
    expect(res.status).toBe(503)
    expect(mockPutBinary).toHaveBeenCalledTimes(1)
    expect(mockDeleteBinary).toHaveBeenCalledTimes(1)
    const cleanupPath = mockDeleteBinary.mock.calls[0]?.[0]
    const writePath = mockPutBinary.mock.calls[0]?.[0]
    expect(cleanupPath).toBe(writePath)
  })

  it('does NOT delete on enqueue failure when the upload was an overwrite of an existing path (would destroy the prior resume)', async () => {
    mockGetSession.mockResolvedValue({
      sub: 'u1',
      email: 'shruti@gsl.test',
      name: 'Shruti',
      role: 'HR',
      issuedAt: 0,
      expiresAt: 0,
    } as never)
    // Candidate already has a resume at the path that buildResumeRepoPath
    // would produce for this candidate id + .pdf in the current month.
    // Compute it the way the route does so we stay in sync if month rolls over.
    const { buildResumeRepoPath } = await import('@/lib/resumePath')
    const existingPath = buildResumeRepoPath('c-overwrite', '.pdf')
    mockFindCandidate.mockReturnValue({
      id: 'c-overwrite',
      name: 'Z',
      email: '',
      phone: '',
      source: 'HRTeam',
      createdAt: '2026-05-01',
      createdBy: 's',
      auditLog: [],
      resumeFilePath: existingPath,
    } as never)
    mockEnqueue.mockRejectedValueOnce(new Error('queue down'))
    const { POST } = await import('@/app/api/candidates/[id]/resume/route')
    const res = await postFormData(
      POST,
      'https://x/api/candidates/c-overwrite/resume',
      pdfFormData(),
      { id: 'c-overwrite' },
    )
    expect(res.status).toBe(503)
    expect(mockPutBinary).toHaveBeenCalledTimes(1)
    // No cleanup — the candidate record still points at this path.
    expect(mockDeleteBinary).not.toHaveBeenCalled()
  })
})

describe('Candidate-portal upload route — POST /api/portal/resume', () => {
  it('writes at buildResumeRepoPath when authed via candidate session', async () => {
    mockGetCandidateId.mockResolvedValue('cand-portal')
    mockFindCandidate.mockReturnValue({
      id: 'cand-portal',
      name: 'Pavan',
      email: 'pavan@x.test',
      phone: '',
      source: 'Application',
      createdAt: '2026-05-01',
      createdBy: 'public',
      auditLog: [],
    } as never)
    const { POST } = await import('@/app/api/portal/resume/route')
    const req = new Request('https://x/api/portal/resume', {
      method: 'POST',
      body: pdfFormData(),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockPutBinary).toHaveBeenCalledTimes(1)
    expect(mockPutBinary.mock.calls[0]?.[0]?.startsWith('data/resumes/uploads/')).toBe(true)
  })

  it('rejects when no candidate session (HR JWT does not satisfy this gate)', async () => {
    mockGetCandidateId.mockResolvedValue(null)
    const { POST } = await import('@/app/api/portal/resume/route')
    const req = new Request('https://x/api/portal/resume', {
      method: 'POST',
      body: pdfFormData(),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('rejects 6 MB upload', async () => {
    mockGetCandidateId.mockResolvedValue('cand-portal')
    mockFindCandidate.mockReturnValue({
      id: 'cand-portal',
      name: 'X',
      email: '',
      phone: '',
      source: 'Application',
      createdAt: '2026-05-01',
      createdBy: 'p',
      auditLog: [],
    } as never)
    const { POST } = await import('@/app/api/portal/resume/route')
    const req = new Request('https://x/api/portal/resume', {
      method: 'POST',
      body: pdfFormData('big.pdf', 6 * 1024 * 1024),
    })
    const res = await POST(req)
    expect(res.status).toBe(413)
  })

  it('rejects .docx (PDF only on candidate portal)', async () => {
    mockGetCandidateId.mockResolvedValue('cand-portal')
    mockFindCandidate.mockReturnValue({
      id: 'cand-portal',
      name: 'X',
      email: '',
      phone: '',
      source: 'Application',
      createdAt: '2026-05-01',
      createdBy: 'p',
      auditLog: [],
    } as never)
    const fd = new FormData()
    fd.append('file', new File([new Uint8Array(1024)], 'cv.docx'))
    const { POST } = await import('@/app/api/portal/resume/route')
    const req = new Request('https://x/api/portal/resume', { method: 'POST', body: fd })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('Public apply route — POST /api/public/careers/apply', () => {
  function applyForm(opts: { withResume?: boolean; resumeBytes?: number; resumeName?: string } = {}) {
    const fd = new FormData()
    fd.append('roleId', 'role-1')
    fd.append('name', 'Asha')
    fd.append('email', 'asha@x.test')
    fd.append('phone', '+91-9000000000')
    fd.append('coverNote', '')
    fd.append('website', '') // honeypot, must be empty
    if (opts.withResume) {
      const f = new File(
        [new Uint8Array(opts.resumeBytes ?? 1024)],
        opts.resumeName ?? 'cv.pdf',
        { type: 'application/pdf' },
      )
      fd.append('resume', f)
    }
    return fd
  }

  it('writes resume at buildApplicationResumePath when role is Open and resume valid', async () => {
    mockFindRole.mockReturnValue({
      id: 'role-1',
      title: 'Academics Manager',
      department: 'Academics',
      location: 'Mumbai',
      employmentType: 'Full-time',
      status: 'Open',
      pipelineStages: ['Sourced'],
      rubric: [],
      description: '',
      responsibilities: [],
      mustHaves: [],
      niceToHaves: [],
      createdAt: '2026-04-01',
      createdBy: 'seed',
      auditLog: [],
    } as never)
    const { POST } = await import('@/app/api/public/careers/apply/route')
    const req = new Request('https://x/api/public/careers/apply', {
      method: 'POST',
      body: applyForm({ withResume: true }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockPutBinary).toHaveBeenCalledTimes(1)
    const repoPath = mockPutBinary.mock.calls[0]?.[0] ?? ''
    expect(repoPath.startsWith('data/resumes/applications/')).toBe(true)
    // Both candidate and application should have been queued.
    expect(mockEnqueue).toHaveBeenCalledTimes(2)
  })

  it('rejects 6 MB resume before queueing anything', async () => {
    mockFindRole.mockReturnValue({
      id: 'role-1',
      title: 'r',
      department: 'Academics',
      location: 'Mumbai',
      employmentType: 'Full-time',
      status: 'Open',
      pipelineStages: ['Sourced'],
      rubric: [],
      description: '',
      responsibilities: [],
      mustHaves: [],
      niceToHaves: [],
      createdAt: '2026-04-01',
      createdBy: 'seed',
      auditLog: [],
    } as never)
    const { POST } = await import('@/app/api/public/careers/apply/route')
    const req = new Request('https://x/api/public/careers/apply', {
      method: 'POST',
      body: applyForm({ withResume: true, resumeBytes: 6 * 1024 * 1024 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(413)
    expect(mockPutBinary).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('rejects .docx resume', async () => {
    mockFindRole.mockReturnValue({
      id: 'role-1',
      title: 'r',
      department: 'Academics',
      location: 'Mumbai',
      employmentType: 'Full-time',
      status: 'Open',
      pipelineStages: ['Sourced'],
      rubric: [],
      description: '',
      responsibilities: [],
      mustHaves: [],
      niceToHaves: [],
      createdAt: '2026-04-01',
      createdBy: 'seed',
      auditLog: [],
    } as never)
    const { POST } = await import('@/app/api/public/careers/apply/route')
    const req = new Request('https://x/api/public/careers/apply', {
      method: 'POST',
      body: applyForm({ withResume: true, resumeName: 'cv.docx' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(mockPutBinary).not.toHaveBeenCalled()
  })

  it('cleans up the orphan resume file when candidate enqueue fails', async () => {
    mockFindRole.mockReturnValue({
      id: 'role-1',
      title: 'r',
      department: 'Academics',
      location: 'Mumbai',
      employmentType: 'Full-time',
      status: 'Open',
      pipelineStages: ['Sourced'],
      rubric: [],
      description: '',
      responsibilities: [],
      mustHaves: [],
      niceToHaves: [],
      createdAt: '2026-04-01',
      createdBy: 'seed',
      auditLog: [],
    } as never)
    mockEnqueue.mockRejectedValueOnce(new Error('queue down'))
    const { POST } = await import('@/app/api/public/careers/apply/route')
    const req = new Request('https://x/api/public/careers/apply', {
      method: 'POST',
      body: applyForm({ withResume: true }),
    })
    const res = await POST(req)
    expect(res.status).toBe(503)
    expect(mockPutBinary).toHaveBeenCalledTimes(1)
    expect(mockDeleteBinary).toHaveBeenCalledTimes(1)
    const writePath = mockPutBinary.mock.calls[0]?.[0]
    const cleanupPath = mockDeleteBinary.mock.calls[0]?.[0]
    expect(cleanupPath).toBe(writePath)
  })
})

describe('Admin sync-now route — POST /api/admin/sync-now', () => {
  it('rejects when no session', async () => {
    mockGetSession.mockResolvedValue(null)
    const { POST } = await import('@/app/api/admin/sync-now/route')
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('rejects HR (admin-only)', async () => {
    mockGetSession.mockResolvedValue({
      sub: 'u1',
      email: 'shruti@gsl.test',
      name: 'Shruti',
      role: 'HR',
      issuedAt: 0,
      expiresAt: 0,
    } as never)
    const { POST } = await import('@/app/api/admin/sync-now/route')
    const res = await POST()
    expect(res.status).toBe(403)
  })
})
