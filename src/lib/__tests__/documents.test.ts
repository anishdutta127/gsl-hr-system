import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  assertInsideHrDocumentsRoot,
  buildEmployeeChecklist,
  buildHrDocumentRepoPath,
  canEditEmployeeDocuments,
  canViewEmployeeDocuments,
  summariseCompliance,
} from '../documents'
import type { DocumentTemplate, EmployeeDocument, SessionClaims } from '../types'

const SESSION = (overrides: Partial<SessionClaims>): SessionClaims => ({
  sub: 'u1',
  email: 'test@gsl.in',
  name: 'Test',
  role: 'HOD',
  iat: 0,
  exp: 0,
  ...overrides,
})

describe('canViewEmployeeDocuments', () => {
  it('Admin and HR always allowed', () => {
    expect(canViewEmployeeDocuments(SESSION({ role: 'Admin' }))).toBe(true)
    expect(canViewEmployeeDocuments(SESSION({ role: 'HR' }))).toBe(true)
  })
  it('HOD never allowed (Reporting Manager block)', () => {
    expect(canViewEmployeeDocuments(SESSION({ role: 'HOD' }))).toBe(false)
  })
  it('Leadership only allowed if email is on the env allowlist', () => {
    process.env.GSL_DOCUMENT_VIEWERS = 'ameet.z@getsetlearn.info'
    expect(canViewEmployeeDocuments(SESSION({ role: 'Leadership', email: 'ameet.z@getsetlearn.info' }))).toBe(true)
    expect(canViewEmployeeDocuments(SESSION({ role: 'Leadership', email: 'jesal@getsetlearn.info' }))).toBe(false)
    delete process.env.GSL_DOCUMENT_VIEWERS
  })
  it('Returns false for null session', () => {
    expect(canViewEmployeeDocuments(null)).toBe(false)
  })
})

describe('canEditEmployeeDocuments', () => {
  it('Admin and HR can edit; Leadership cannot even when allowlisted', () => {
    expect(canEditEmployeeDocuments(SESSION({ role: 'Admin' }))).toBe(true)
    expect(canEditEmployeeDocuments(SESSION({ role: 'HR' }))).toBe(true)
    expect(canEditEmployeeDocuments(SESSION({ role: 'Leadership' }))).toBe(false)
    expect(canEditEmployeeDocuments(SESSION({ role: 'HOD' }))).toBe(false)
  })
})

describe('buildHrDocumentRepoPath', () => {
  it('produces a path under data/hr-documents/', () => {
    expect(buildHrDocumentRepoPath('emp-123', 'doc-456', 'pdf')).toBe(
      'data/hr-documents/emp-123/doc-456.pdf',
    )
  })
  it('strips characters that could escape the root', () => {
    const p = buildHrDocumentRepoPath('../../etc', '../../../passwd', '.txt')
    expect(p.startsWith('data/hr-documents/')).toBe(true)
    expect(p.includes('..')).toBe(false)
  })
})

describe('assertInsideHrDocumentsRoot', () => {
  it('rejects a path that escapes via ..', () => {
    expect(() => assertInsideHrDocumentsRoot('/etc/passwd')).toThrow()
  })
})

describe('buildEmployeeChecklist + summariseCompliance', () => {
  const templates: DocumentTemplate[] = [
    { id: 't-pan', name: 'PAN', category: 'identity', isMandatory: true, hasExpiry: false },
    { id: 't-passport', name: 'Passport', category: 'identity', isMandatory: false, hasExpiry: true },
    { id: 't-12bb', name: 'Form 12BB', category: 'tax', isMandatory: true, hasExpiry: true },
  ]

  const baseDoc: Omit<EmployeeDocument, 'id' | 'templateId' | 'uploadedAt' | 'verified'> = {
    employeeId: 'emp-1',
    uploadedBy: 'hr@gsl.in',
    filePath: 'data/hr-documents/emp-1/x.pdf',
    originalFileName: 'pan.pdf',
    fileSize: 1024,
    auditLog: [],
  }

  it('flags missing mandatory uploads', () => {
    const rows = buildEmployeeChecklist({ employeeId: 'emp-1', templates, documents: [] })
    expect(rows.find((r) => r.template.id === 't-pan')!.status).toBe('missing-mandatory')
    expect(rows.find((r) => r.template.id === 't-passport')!.status).toBe('missing-optional')
  })

  it('marks uploaded-but-unverified differently from verified', () => {
    const docs: EmployeeDocument[] = [
      { ...baseDoc, id: 'd1', templateId: 't-pan', uploadedAt: '2026-01-01T00:00:00Z', verified: true },
      { ...baseDoc, id: 'd2', templateId: 't-passport', uploadedAt: '2026-01-01T00:00:00Z', verified: false, expiresAt: '2030-01-01' },
    ]
    const rows = buildEmployeeChecklist({
      employeeId: 'emp-1',
      templates,
      documents: docs,
      now: new Date('2026-05-09T00:00:00Z'),
    })
    expect(rows.find((r) => r.template.id === 't-pan')!.status).toBe('verified')
    expect(rows.find((r) => r.template.id === 't-passport')!.status).toBe('uploaded')
  })

  it('flags expiring documents (within 30 days)', () => {
    const docs: EmployeeDocument[] = [
      {
        ...baseDoc,
        id: 'd1',
        templateId: 't-12bb',
        uploadedAt: '2026-01-01T00:00:00Z',
        verified: true,
        expiresAt: '2026-05-25', // 16 days from 2026-05-09
      },
    ]
    const rows = buildEmployeeChecklist({
      employeeId: 'emp-1',
      templates,
      documents: docs,
      now: new Date('2026-05-09T00:00:00Z'),
    })
    expect(rows.find((r) => r.template.id === 't-12bb')!.status).toBe('expiring')
  })

  it('flags expired documents (past expiry)', () => {
    const docs: EmployeeDocument[] = [
      {
        ...baseDoc,
        id: 'd1',
        templateId: 't-12bb',
        uploadedAt: '2026-01-01T00:00:00Z',
        verified: true,
        expiresAt: '2026-04-01',
      },
    ]
    const rows = buildEmployeeChecklist({
      employeeId: 'emp-1',
      templates,
      documents: docs,
      now: new Date('2026-05-09T00:00:00Z'),
    })
    expect(rows.find((r) => r.template.id === 't-12bb')!.status).toBe('expired')
  })

  it('uses the most recent upload when multiple exist for the same template', () => {
    const docs: EmployeeDocument[] = [
      { ...baseDoc, id: 'd-old', templateId: 't-pan', uploadedAt: '2025-01-01T00:00:00Z', verified: false },
      { ...baseDoc, id: 'd-new', templateId: 't-pan', uploadedAt: '2026-01-01T00:00:00Z', verified: true },
    ]
    const rows = buildEmployeeChecklist({ employeeId: 'emp-1', templates, documents: docs })
    const panRow = rows.find((r) => r.template.id === 't-pan')!
    expect(panRow.document?.id).toBe('d-new')
    expect(panRow.status).toBe('verified')
  })

  it('does not match documents from a different employee', () => {
    const docs: EmployeeDocument[] = [
      { ...baseDoc, employeeId: 'emp-2', id: 'd1', templateId: 't-pan', uploadedAt: '2026-01-01T00:00:00Z', verified: true },
    ]
    const rows = buildEmployeeChecklist({ employeeId: 'emp-1', templates, documents: docs })
    expect(rows.find((r) => r.template.id === 't-pan')!.status).toBe('missing-mandatory')
  })

  it('summary tallies match the checklist', () => {
    const docs: EmployeeDocument[] = [
      { ...baseDoc, id: 'd1', templateId: 't-pan', uploadedAt: '2026-01-01T00:00:00Z', verified: true },
      { ...baseDoc, id: 'd2', templateId: 't-12bb', uploadedAt: '2026-01-01T00:00:00Z', verified: true, expiresAt: '2026-04-01' },
    ]
    const rows = buildEmployeeChecklist({
      employeeId: 'emp-1',
      templates,
      documents: docs,
      now: new Date('2026-05-09T00:00:00Z'),
    })
    const summary = summariseCompliance(rows, 'emp-1')
    expect(summary.total).toBe(3)
    expect(summary.mandatoryMissing).toBe(0)
    expect(summary.optionalMissing).toBe(1)
    expect(summary.expired).toBe(1)
    expect(summary.uploadedUnverified).toBe(0)
  })
})
