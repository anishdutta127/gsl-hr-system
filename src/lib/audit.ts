/*
 * Audit log helper. Every entity mutation appends one entry.
 * auditLog lives inside the entity itself (flat-file-per-entity model).
 * The sync runner applies the queue entry to the entity file and appends
 * a corresponding auditLog entry atomically.
 */

import type { AuditEntry } from './types'

export function makeAuditEntry(params: {
  user: string
  action: string
  before?: unknown
  after?: unknown
  notes?: string
}): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    user: params.user,
    action: params.action,
    before: params.before,
    after: params.after,
    notes: params.notes,
  }
}

export function appendAudit(entity: { auditLog: AuditEntry[] }, entry: AuditEntry): void {
  entity.auditLog = [...(entity.auditLog ?? []), entry]
}
