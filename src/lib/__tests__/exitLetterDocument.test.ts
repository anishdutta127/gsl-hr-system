/*
 * Exit letter document routes - gate coverage + completion behaviour.
 *
 * The confidentiality risk is the No Dues letter (it carries full-and-final
 * settlement figures): a reporting manager / HOD must NOT be able to fetch it.
 * Relieving / experience follow the exit leadership allowlist. All three write
 * paths are HR/Admin only, and a present letter completes the step (removing it
 * when none remains reverts completion).
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
vi.mock('@/lib/exitProcess', async () => {
  const actual = await vi.importActual<typeof import('../exitProcess')>('../exitProcess')
  return { ...actual, loadExitProcesses: vi.fn(() => []) }
})

import { getCurrentSession } from '@/lib/identity'
import { atomicUpdateJson, putBinaryFile } from '@/lib/queue/githubQueue'
import {
  applyStepPatch,
  assertInsideExitLetterDocsRoot,
  buildExitLetterDocPath,
  canViewExitLetterDocument,
  loadExitProcesses,
} from '@/lib/exitProcess'
import {
  GET as getLetter,
  DELETE as delLetter,
} from '@/app/api/admin/exits/[employeeId]/steps/[templateId]/letter/[fileId]/route'
import { POST as uploadLetter } from '@/app/api/admin/exits/[employeeId]/steps/[templateId]/letter/route'
import { PATCH as patchStep } from '@/app/api/admin/exits/[employeeId]/steps/[templateId]/route'
import type { ExitProcess, ExitProcessStep, ExitStepKind, SessionClaims, StaffRole } from '@/lib/types'

const mockSession = vi.mocked(getCurrentSession)
const mockLoad = vi.mocked(loadExitProcesses)
const sessionOf = (role: StaffRole): SessionClaims => ({
  sub: 'u1',
  email: `${role}@gsl.in`,
  name: role,
  role,
  iat: 0,
  exp: 0,
})
const NOW = '2026-07-07T00:00:00.000Z'

function step(templateId: string, kind: ExitStepKind, extra: Partial<ExitProcessStep> = {}): ExitProcessStep {
  return {
    templateId,
    name: templateId,
    kind,
    isMandatory: true,
    status: 'Not Started',
    data: {},
    notes: '',
    completedAt: null,
    completedBy: null,
    ...extra,
  }
}

function fixture(steps?: ExitProcessStep[]): ExitProcess {
  return {
    employeeId: 'e1',
    exitType: 'Voluntary',
    reasonForLeaving: 'New opportunity',
    resignationDate: null,
    terminationDate: null,
    lastWorkingDay: '2026-07-31',
    steps: steps ?? [
      step('exit-no-dues', 'letter:NO-DUES-v1'),
      step('exit-relieving', 'letter:RELIEVING-v1'),
      step('exit-handover', 'handover'),
    ],
    completedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    createdBy: 'hr@gsl.in',
    updatedAt: '2026-07-01T00:00:00.000Z',
    auditLog: [],
  }
}

const req = (method = 'POST') => new Request('http://test/api', { method })
const P = (templateId: string) => ({ params: { employeeId: 'e1', templateId, fileId: 'letter-abc' } })
const PU = (templateId: string) => ({ params: { employeeId: 'e1', templateId } })

beforeEach(() => {
  mockSession.mockReset()
  mockLoad.mockReset().mockReturnValue([fixture()])
})

describe('canViewExitLetterDocument gate', () => {
  it('No Dues (financial): HR/Admin only - Leadership + HOD never', () => {
    expect(canViewExitLetterDocument(sessionOf('HR'), 'letter:NO-DUES-v1')).toBe(true)
    expect(canViewExitLetterDocument(sessionOf('Admin'), 'letter:NO-DUES-v1')).toBe(true)
    expect(canViewExitLetterDocument(sessionOf('Leadership'), 'letter:NO-DUES-v1')).toBe(false)
    expect(canViewExitLetterDocument(sessionOf('HOD'), 'letter:NO-DUES-v1')).toBe(false)
    expect(canViewExitLetterDocument(null, 'letter:NO-DUES-v1')).toBe(false)
  })

  it('Relieving / Experience: HR/Admin + Leadership (testing-open default); HOD never', () => {
    for (const kind of ['letter:RELIEVING-v1', 'letter:EXPERIENCE-v1'] as const) {
      expect(canViewExitLetterDocument(sessionOf('HR'), kind)).toBe(true)
      expect(canViewExitLetterDocument(sessionOf('Leadership'), kind)).toBe(true)
      expect(canViewExitLetterDocument(sessionOf('HOD'), kind)).toBe(false)
    }
  })
})

describe('GET letter document (serve) - the confidentiality boundary', () => {
  it('401 when signed out', async () => {
    mockSession.mockResolvedValue(null)
    expect((await getLetter(req('GET'), P('exit-no-dues'))).status).toBe(401)
  })

  it('No Dues: 403 for HOD AND Leadership (financial); HR passes the gate', async () => {
    mockSession.mockResolvedValue(sessionOf('HOD'))
    expect((await getLetter(req('GET'), P('exit-no-dues'))).status).toBe(403)
    mockSession.mockResolvedValue(sessionOf('Leadership'))
    expect((await getLetter(req('GET'), P('exit-no-dues'))).status).toBe(403)
    mockSession.mockResolvedValue(sessionOf('HR'))
    // Past the 403 gate; no doc on the fixture step -> 404.
    expect((await getLetter(req('GET'), P('exit-no-dues'))).status).toBe(404)
  })

  it('Relieving: 403 for HOD; Leadership + HR pass the gate', async () => {
    mockSession.mockResolvedValue(sessionOf('HOD'))
    expect((await getLetter(req('GET'), P('exit-relieving'))).status).toBe(403)
    mockSession.mockResolvedValue(sessionOf('Leadership'))
    expect((await getLetter(req('GET'), P('exit-relieving'))).status).toBe(404)
    mockSession.mockResolvedValue(sessionOf('HR'))
    expect((await getLetter(req('GET'), P('exit-relieving'))).status).toBe(404)
  })
})

describe('letter document write gates', () => {
  it('upload (POST): 403 for HOD + Leadership, past-gate for HR', async () => {
    mockSession.mockResolvedValue(sessionOf('HOD'))
    expect((await uploadLetter(req(), PU('exit-relieving'))).status).toBe(403)
    mockSession.mockResolvedValue(sessionOf('Leadership'))
    expect((await uploadLetter(req(), PU('exit-relieving'))).status).toBe(403)
    mockSession.mockResolvedValue(sessionOf('HR'))
    // Bodyless request -> past the gate, fails at multipart parsing (400).
    expect((await uploadLetter(req(), PU('exit-relieving'))).status).toBe(400)
  })

  it('upload to a non-letter step is rejected (400)', async () => {
    mockSession.mockResolvedValue(sessionOf('HR'))
    const res = await uploadLetter(req(), PU('exit-handover'))
    expect(res.status).toBe(400)
  })

  it('remove (DELETE): 403 for HOD and Leadership', async () => {
    mockSession.mockResolvedValue(sessionOf('HOD'))
    expect((await delLetter(req('DELETE'), P('exit-relieving'))).status).toBe(403)
    mockSession.mockResolvedValue(sessionOf('Leadership'))
    expect((await delLetter(req('DELETE'), P('exit-relieving'))).status).toBe(403)
  })
})

describe('upload write path', () => {
  beforeEach(() => {
    vi.mocked(putBinaryFile).mockClear().mockResolvedValue({ commitSha: 'x' })
    vi.mocked(atomicUpdateJson).mockClear().mockResolvedValue({ next: [], commitSha: 'x' })
  })

  it('HR upload stores the file under data/exit-letter-docs/<emp>/<step> and records it', async () => {
    mockSession.mockResolvedValue(sessionOf('HR'))
    const fd = new FormData()
    fd.append('file', new File([Buffer.from('%PDF-1.4 signed')], 'relieving-signed.pdf', { type: 'application/pdf' }))
    const res = await uploadLetter(new Request('http://test/api', { method: 'POST', body: fd }), PU('exit-relieving'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { document: { storageRef: string; filename: string } }
    expect(body.document.filename).toBe('relieving-signed.pdf')
    expect(body.document.storageRef).toMatch(/^data\/exit-letter-docs\/e1\/exit-relieving\/letter-.*\.pdf$/)

    expect(vi.mocked(putBinaryFile)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(putBinaryFile).mock.calls[0]?.[0]).toMatch(/^data\/exit-letter-docs\/e1\/exit-relieving\//)
    const call = vi.mocked(atomicUpdateJson).mock.calls.find((c) => String(c[0]).includes('exit_processes.json'))
    expect(call).toBeTruthy()
  })

  it('rejects a disallowed file type before any storage write', async () => {
    mockSession.mockResolvedValue(sessionOf('HR'))
    const fd = new FormData()
    fd.append('file', new File([Buffer.from('bin')], 'malware.exe', { type: 'application/octet-stream' }))
    const res = await uploadLetter(new Request('http://test/api', { method: 'POST', body: fd }), PU('exit-relieving'))
    expect(res.status).toBe(400)
    expect(vi.mocked(putBinaryFile)).not.toHaveBeenCalled()
  })
})

describe('completion follows letter presence (applyStepPatch)', () => {
  const doc = {
    uploadedAt: NOW,
    uploadedBy: 'hr@gsl.in',
    filename: 'signed.pdf',
    fileSize: 1024,
    storageRef: 'data/exit-letter-docs/e1/exit-relieving/letter-x.pdf',
  }

  it('uploading a letter completes the step', () => {
    const after = applyStepPatch({
      process: fixture(),
      templateId: 'exit-relieving',
      patch: { status: 'Completed', data: { letterDocument: doc } },
      by: 'hr@gsl.in',
      now: NOW,
    })
    const s = after.steps.find((x) => x.templateId === 'exit-relieving')!
    expect(s.status).toBe('Completed')
    expect(s.completedAt).toBe(NOW)
    expect(s.data.letterDocument?.filename).toBe('signed.pdf')
  })

  it('removing the only letter reverts completion', () => {
    const uploaded = applyStepPatch({
      process: fixture(),
      templateId: 'exit-relieving',
      patch: { status: 'Completed', data: { letterDocument: doc } },
      by: 'hr@gsl.in',
      now: NOW,
    })
    const removed = applyStepPatch({
      process: uploaded,
      templateId: 'exit-relieving',
      patch: { status: 'Not Started', data: { letterDocument: null } },
      by: 'hr@gsl.in',
      now: '2026-07-08T00:00:00.000Z',
    })
    const s = removed.steps.find((x) => x.templateId === 'exit-relieving')!
    expect(s.status).toBe('Not Started')
    expect(s.completedAt).toBeNull()
    expect(s.data.letterDocument).toBeNull()
  })
})

describe('generic step PATCH cannot inject a letterDocument', () => {
  it('keeps settlement fields but drops any client-supplied letterDocument', async () => {
    mockSession.mockResolvedValue(sessionOf('HR'))
    let captured: ExitProcess[] = []
    vi.mocked(atomicUpdateJson).mockImplementation(async (_path, mutate) => {
      const r = (mutate as (c: ExitProcess[]) => { next: ExitProcess[] })([fixture()])
      captured = r.next
      return { next: r.next, commitSha: 'x' }
    })
    const res = await patchStep(
      new Request('http://test/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          data: {
            settlementFigures: 50000,
            letterDocument: { storageRef: 'data/exit-letter-docs/e1/spoof/x.pdf', filename: 'spoof.pdf' },
          },
        }),
      }),
      PU('exit-no-dues'),
    )
    expect(res.status).toBe(200)
    const s = captured[0]!.steps.find((x) => x.templateId === 'exit-no-dues')!
    expect(s.data.settlementFigures).toBe(50000)
    expect(s.data.letterDocument).toBeUndefined()
  })
})

describe('storage path safety', () => {
  it('sanitises crafted ids and stays inside the root', () => {
    const p = buildExitLetterDocPath('e1/../../etc', 'exit-no-dues/..', 'letter-1/..', '.pdf')
    expect(p.startsWith('data/exit-letter-docs/')).toBe(true)
    expect(p.includes('..')).toBe(false)
    // A resolved good path is inside the root; a traversal attempt throws.
    assertInsideExitLetterDocsRoot(`${process.cwd()}/data/exit-letter-docs/e1/exit-no-dues/letter-1.pdf`)
    expect(() => assertInsideExitLetterDocsRoot(`${process.cwd()}/data/other/x.pdf`)).toThrow()
  })
})
