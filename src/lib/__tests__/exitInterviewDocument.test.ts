/*
 * Confidentiality + gate coverage for the exit-interview document routes.
 * The whole risk is a reporting-manager / HOD reading candid feedback about
 * themselves, so the GET (serve) route MUST reject them.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/identity', () => ({ getCurrentSession: vi.fn() }))
vi.mock('@/lib/data', () => ({
  findEmployeeById: vi.fn(() => ({ id: 'e1', name: 'Exiting Person', reportingManagerId: 'm1' })),
}))
vi.mock('@/lib/queue/githubQueue', () => ({
  atomicUpdateJson: vi.fn(async () => ({ next: [], commitSha: 'x' })),
  deleteBinaryFile: vi.fn(),
  putBinaryFile: vi.fn(),
}))
vi.mock('@/lib/offboardingTasks', async () => {
  const actual = await vi.importActual<typeof import('../offboardingTasks')>('../offboardingTasks')
  return { ...actual, loadExitInterviews: vi.fn(() => []) }
})

import { getCurrentSession } from '@/lib/identity'
import { atomicUpdateJson, putBinaryFile } from '@/lib/queue/githubQueue'
import { canEditExitInterview, canViewExitInterview } from '@/lib/offboardingTasks'
import { GET as getDoc, DELETE as delDoc } from '@/app/api/admin/offboarding/exit-interview/[employeeId]/document/[fileId]/route'
import { POST as uploadDoc } from '@/app/api/admin/offboarding/exit-interview/[employeeId]/document/route'
import type { SessionClaims, StaffRole } from '@/lib/types'

const mockSession = vi.mocked(getCurrentSession)
const sessionOf = (role: StaffRole): SessionClaims => ({ sub: 'u1', email: `${role}@gsl.in`, name: role, role, iat: 0, exp: 0 })
const P = { params: { employeeId: 'e1', fileId: 'intv-abc' } }
const PU = { params: { employeeId: 'e1' } }
const req = () => new Request('http://test/api', { method: 'POST' })

describe('exit-interview confidentiality gate', () => {
  it('canViewExitInterview: HOD never; HR + Admin always', () => {
    expect(canViewExitInterview(sessionOf('HOD'))).toBe(false)
    expect(canViewExitInterview(sessionOf('HR'))).toBe(true)
    expect(canViewExitInterview(sessionOf('Admin'))).toBe(true)
    expect(canViewExitInterview(null)).toBe(false)
  })

  it('canEditExitInterview: HR + Admin only', () => {
    expect(canEditExitInterview(sessionOf('HR'))).toBe(true)
    expect(canEditExitInterview(sessionOf('Admin'))).toBe(true)
    expect(canEditExitInterview(sessionOf('HOD'))).toBe(false)
    expect(canEditExitInterview(sessionOf('Leadership'))).toBe(false)
  })
})

describe('GET exit-interview document (serve) - the confidentiality boundary', () => {
  beforeEach(() => mockSession.mockReset())

  it('401 when signed out', async () => {
    mockSession.mockResolvedValue(null)
    expect((await getDoc(req(), P)).status).toBe(401)
  })

  it('403 for a HOD / reporting manager (HOD role) - cannot fetch the doc', async () => {
    mockSession.mockResolvedValue(sessionOf('HOD'))
    expect((await getDoc(req(), P)).status).toBe(403)
  })

  it('HR passes the gate (reaches 404 "no document", not 403)', async () => {
    mockSession.mockResolvedValue(sessionOf('HR'))
    expect((await getDoc(req(), P)).status).toBe(404)
  })
})

describe('exit-interview document upload/remove gates', () => {
  beforeEach(() => mockSession.mockReset())

  it('upload (POST): 403 for HOD, past-gate for HR', async () => {
    mockSession.mockResolvedValue(sessionOf('HOD'))
    expect((await uploadDoc(req(), PU)).status).toBe(403)
    mockSession.mockResolvedValue(sessionOf('HR'))
    // Bodyless request -> past the gate, fails at multipart parsing (400).
    expect((await uploadDoc(req(), PU)).status).toBe(400)
  })

  it('remove (DELETE): 403 for HOD and Leadership', async () => {
    mockSession.mockResolvedValue(sessionOf('HOD'))
    expect((await delDoc(req(), P)).status).toBe(403)
    mockSession.mockResolvedValue(sessionOf('Leadership'))
    expect((await delDoc(req(), P)).status).toBe(403)
  })
})

describe('exit-interview document upload: write path', () => {
  beforeEach(() => {
    mockSession.mockReset()
    vi.mocked(putBinaryFile).mockClear()
    vi.mocked(atomicUpdateJson).mockClear()
    vi.mocked(putBinaryFile).mockResolvedValue({ commitSha: 'x' })
    vi.mocked(atomicUpdateJson).mockResolvedValue({ next: [], commitSha: 'x' })
  })

  it('HR upload stores the file under data/exit-interview-docs and records it', async () => {
    mockSession.mockResolvedValue(sessionOf('HR'))
    const fd = new FormData()
    fd.append('file', new File([Buffer.from('%PDF-1.4 test')], 'interview.pdf', { type: 'application/pdf' }))
    const res = await uploadDoc(new Request('http://test/api', { method: 'POST', body: fd }), PU)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { document: { storageRef: string; filename: string } }
    expect(body.document.filename).toBe('interview.pdf')
    expect(body.document.storageRef).toMatch(/^data\/exit-interview-docs\/e1\/intv-.*\.pdf$/)

    expect(vi.mocked(putBinaryFile)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(putBinaryFile).mock.calls[0]?.[0]).toMatch(/^data\/exit-interview-docs\/e1\//)
    // The interview record write happened, upserting interviewDocument + audit.
    const call = vi.mocked(atomicUpdateJson).mock.calls.find((c) => String(c[0]).includes('exit_interviews.json'))
    expect(call).toBeTruthy()
  })

  it('rejects a disallowed file type before any storage write', async () => {
    mockSession.mockResolvedValue(sessionOf('HR'))
    const fd = new FormData()
    fd.append('file', new File([Buffer.from('bin')], 'malware.exe', { type: 'application/octet-stream' }))
    const res = await uploadDoc(new Request('http://test/api', { method: 'POST', body: fd }), PU)
    expect(res.status).toBe(400)
    expect(vi.mocked(putBinaryFile)).not.toHaveBeenCalled()
  })
})
