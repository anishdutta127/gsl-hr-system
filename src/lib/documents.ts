/*
 * Document repository helpers.
 *
 * Permissions: Admin and HR always; Leadership users on the explicit
 * GSL_DOCUMENT_VIEWERS allowlist (env, comma-separated emails). Riddhi
 * was clear that Reporting Managers must NOT see employee documents,
 * so the role-gate stops at HR; Leadership is allowlisted by user
 * identity instead of by role.
 *
 * Storage: data/hr-documents/[employeeId]/[uuid].pdf — same single-root
 * traversal-guard pattern used for resumes (assertInsideHrDocumentsRoot).
 */

import fs from 'node:fs'
import path from 'node:path'
import type {
  DocumentTemplate,
  EmployeeDocument,
  SessionClaims,
} from './types'

const TEMPLATES_FILE = path.join(process.cwd(), 'src', 'data', 'document_templates.json')
const DOCUMENTS_FILE = path.join(process.cwd(), 'src', 'data', 'employee_documents.json')

function readJsonArray<T>(file: string): T[] {
  try {
    if (!fs.existsSync(file)) return []
    const text = fs.readFileSync(file, 'utf-8').trim()
    if (!text) return []
    const parsed = JSON.parse(text) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export function loadDocumentTemplates(): DocumentTemplate[] {
  return readJsonArray<DocumentTemplate>(TEMPLATES_FILE)
}

export function loadEmployeeDocuments(): EmployeeDocument[] {
  return readJsonArray<EmployeeDocument>(DOCUMENTS_FILE)
}

/** Comma-separated list of additional emails (typically Leadership users
 *  like Ameet) who are explicitly allowed to view the document repository.
 *  HR + Admin already have access via role.
 *
 *  TESTING DEFAULT: when GSL_DOCUMENT_VIEWERS is unset OR empty, treat
 *  every Leadership user as if they're on the allowlist. Set
 *  GSL_DOCUMENT_VIEWERS=email1,email2,... on production to lock down. */
function viewerAllowlist(): Set<string> {
  const raw = process.env.GSL_DOCUMENT_VIEWERS ?? ''
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** Returns true when the document-viewer allowlist is unset or empty —
 *  in which case every Leadership user is implicitly allowed. */
function isViewerAllowlistOpen(): boolean {
  const raw = process.env.GSL_DOCUMENT_VIEWERS
  return raw === undefined || raw.trim() === ''
}

/** Test-mode override.
 *
 *  TESTING DEFAULT: open access for HR + Admin + Leadership.
 *  Set TESTING_OPEN_ACCESS=false on production to enforce strict
 *  allowlists. Anish flips the env var to false on Vercel — no code
 *  change required.
 *
 *  HR/Admin already have full access via role; this flag opens up
 *  Leadership. HOD and other tighter gates (Reporting Manager visibility
 *  scoping, Sales/Ops blocked from HR Ops) STAY enforced regardless. */
export function isTestingOpenAccess(): boolean {
  const v = process.env.TESTING_OPEN_ACCESS
  if (v === undefined || v === '') return true // default open
  return v !== 'false'
}

export function canViewEmployeeDocuments(session: SessionClaims | null): boolean {
  if (!session) return false
  if (session.role === 'Admin' || session.role === 'HR') return true
  if (session.role === 'Leadership') {
    if (isTestingOpenAccess()) return true
    if (isViewerAllowlistOpen()) return true
    return viewerAllowlist().has(session.email.toLowerCase())
  }
  return false
}

export function canEditEmployeeDocuments(session: SessionClaims | null): boolean {
  if (!session) return false
  return session.role === 'Admin' || session.role === 'HR'
}

// --- File path safety ----------------------------------------------------

const HR_DOCUMENTS_ROOT = path.resolve(process.cwd(), 'data', 'hr-documents')

export function buildHrDocumentRepoPath(employeeId: string, fileId: string, ext: string): string {
  // Repo-relative POSIX path (commits go through the GitHub API which
  // expects forward slashes regardless of platform).
  const safeId = employeeId.replace(/[^a-zA-Z0-9-_]/g, '')
  const safeFileId = fileId.replace(/[^a-zA-Z0-9-_]/g, '')
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '').toLowerCase()
  return `data/hr-documents/${safeId}/${safeFileId}${safeExt.startsWith('.') ? safeExt : `.${safeExt}`}`
}

/** Throws if the resolved path leaves the hr-documents root. Mirrors the
 *  pattern used by resumePath.assertInsideResumeRoot. */
export function assertInsideHrDocumentsRoot(absPath: string): void {
  const resolved = path.resolve(absPath)
  if (!resolved.startsWith(HR_DOCUMENTS_ROOT + path.sep) && resolved !== HR_DOCUMENTS_ROOT) {
    throw new Error(
      `Resolved path ${resolved} escapes hr-documents root ${HR_DOCUMENTS_ROOT}.`,
    )
  }
}

// --- Compliance summary --------------------------------------------------

export type DocumentRowStatus =
  | 'verified' // uploaded + verified
  | 'uploaded' // uploaded but not verified yet
  | 'expiring' // uploaded, verified, expires within 30 days
  | 'expired' // uploaded but expiry passed
  | 'missing-mandatory' // no upload + isMandatory
  | 'missing-optional' // no upload + !isMandatory

export interface ChecklistRow {
  template: DocumentTemplate
  document?: EmployeeDocument
  status: DocumentRowStatus
}

export function buildEmployeeChecklist({
  employeeId,
  templates,
  documents,
  now = new Date(),
}: {
  employeeId: string
  templates: DocumentTemplate[]
  documents: EmployeeDocument[]
  now?: Date
}): ChecklistRow[] {
  // Index documents by templateId. If multiple uploads exist for the same
  // template, the most recent one wins (newest uploadedAt). Older versions
  // remain on file.
  const docsByTpl = new Map<string, EmployeeDocument>()
  for (const d of documents) {
    if (d.employeeId !== employeeId) continue
    const existing = docsByTpl.get(d.templateId)
    if (!existing || d.uploadedAt > existing.uploadedAt) docsByTpl.set(d.templateId, d)
  }

  return templates.map((tpl) => {
    const doc = docsByTpl.get(tpl.id)
    if (!doc) {
      return {
        template: tpl,
        status: tpl.isMandatory ? ('missing-mandatory' as const) : ('missing-optional' as const),
      }
    }
    if (doc.expiresAt) {
      const expiry = new Date(doc.expiresAt).getTime()
      if (Number.isFinite(expiry)) {
        const daysToExpiry = Math.floor((expiry - now.getTime()) / (24 * 60 * 60 * 1000))
        if (daysToExpiry < 0) return { template: tpl, document: doc, status: 'expired' as const }
        if (daysToExpiry <= 30) return { template: tpl, document: doc, status: 'expiring' as const }
      }
    }
    return {
      template: tpl,
      document: doc,
      status: doc.verified ? ('verified' as const) : ('uploaded' as const),
    }
  })
}

export interface ComplianceSummary {
  employeeId: string
  total: number
  mandatoryMissing: number
  optionalMissing: number
  uploadedUnverified: number
  expiring: number
  expired: number
}

export function summariseCompliance(rows: ChecklistRow[], employeeId: string): ComplianceSummary {
  const summary: ComplianceSummary = {
    employeeId,
    total: rows.length,
    mandatoryMissing: 0,
    optionalMissing: 0,
    uploadedUnverified: 0,
    expiring: 0,
    expired: 0,
  }
  for (const r of rows) {
    switch (r.status) {
      case 'missing-mandatory':
        summary.mandatoryMissing++
        break
      case 'missing-optional':
        summary.optionalMissing++
        break
      case 'uploaded':
        summary.uploadedUnverified++
        break
      case 'expiring':
        summary.expiring++
        break
      case 'expired':
        summary.expired++
        break
    }
  }
  return summary
}
