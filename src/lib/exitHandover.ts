/*
 * Exit handover helpers.
 *
 * Storage: src/data/exit_handovers.json (array, one record per exit).
 * Uploaded handover files live under data/exit-handovers/[employeeId]/
 * with the same single-root traversal guard pattern used for HR
 * documents (see src/lib/documents.ts:assertInsideHrDocumentsRoot).
 *
 * Permissions:
 *   - HR + Admin: full edit + review
 *   - Reporting manager of the exiting employee: can edit checklist + upload doc
 *   - Exiting employee (when self-service portal lands): same as RM
 *   - Leadership: read-only via the existing role gate; the env-allowlist
 *     used for exit interviews does NOT apply here - the handover itself
 *     contains role transition info that anyone reviewing the exit
 *     should see, and the confidential bits live in ExitInterview.
 */

import fs from 'node:fs'
import path from 'node:path'
import type {
  ExitHandover,
  HandoverStatus,
  SessionClaims,
} from './types'

const HANDOVERS_FILE = path.join(process.cwd(), 'src', 'data', 'exit_handovers.json')
const HANDOVER_ROOT = path.resolve(process.cwd(), 'data', 'exit-handovers')

export function loadExitHandovers(): ExitHandover[] {
  try {
    if (!fs.existsSync(HANDOVERS_FILE)) return []
    const text = fs.readFileSync(HANDOVERS_FILE, 'utf-8').trim()
    if (!text) return []
    const parsed = JSON.parse(text) as unknown
    return Array.isArray(parsed) ? (parsed as ExitHandover[]) : []
  } catch {
    return []
  }
}

export function findHandoverByEmployeeId(employeeId: string): ExitHandover | undefined {
  return loadExitHandovers().find((h) => h.employeeId === employeeId)
}

export function buildHandoverRepoPath(employeeId: string, fileId: string, ext: string): string {
  // Repo-relative POSIX path - the queue commits via the GitHub Contents
  // API which always wants forward slashes regardless of host platform.
  const safeId = employeeId.replace(/[^a-zA-Z0-9-_]/g, '')
  const safeFileId = fileId.replace(/[^a-zA-Z0-9-_]/g, '')
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '').toLowerCase()
  return `data/exit-handovers/${safeId}/${safeFileId}${safeExt.startsWith('.') ? safeExt : `.${safeExt}`}`
}

/** Throws if the resolved path leaves the handover root. */
export function assertInsideHandoverRoot(absPath: string): void {
  const resolved = path.resolve(absPath)
  if (!resolved.startsWith(HANDOVER_ROOT + path.sep) && resolved !== HANDOVER_ROOT) {
    throw new Error(
      `Resolved path ${resolved} escapes handover root ${HANDOVER_ROOT}.`,
    )
  }
}

export function canEditHandover(
  session: SessionClaims | null,
  options: { reportingManagerId?: string | null } = {},
): boolean {
  if (!session) return false
  if (session.role === 'Admin' || session.role === 'HR') return true
  if (session.role === 'HOD' && options.reportingManagerId === session.sub) return true
  return false
}

export function canReviewHandover(session: SessionClaims | null): boolean {
  if (!session) return false
  return session.role === 'Admin' || session.role === 'HR'
}

/** Derived status for the /exits surface. */
export function handoverStatus(handover: ExitHandover | undefined): HandoverStatus {
  if (!handover) return 'Not started'
  if (handover.reviewedBy) return 'Reviewed'
  if (handover.document) return 'Submitted'
  // checklist has content but no doc yet
  const c = handover.checklist
  if (
    c.pendingTasks.length > 0 ||
    c.keyContacts.length > 0 ||
    c.accessRevocation.length > 0 ||
    c.itAssetsReturned.length > 0 ||
    c.knowledgeTransfer.length > 0 ||
    handover.templateUsed
  ) {
    return 'In progress'
  }
  return 'Not started'
}

export function emptyHandover(employeeId: string, now: string): ExitHandover {
  return {
    employeeId,
    templateUsed: null,
    document: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: '',
    checklist: {
      pendingTasks: [],
      keyContacts: [],
      accessRevocation: [],
      itAssetsReturned: [],
      knowledgeTransfer: [],
    },
    createdAt: now,
    updatedAt: now,
    auditLog: [],
  }
}
