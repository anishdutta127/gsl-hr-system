/*
 * Role lifecycle helpers.
 *
 * Statuses live on Role.status. The helpers here make it impossible for
 * different surfaces to disagree about which roles are "open for candidates"
 * vs. "visible on /careers" — a class of bug that bit us in Phase 2 testing.
 */

import type { Role } from './types'

/** Roles that should appear in the "Add to role pipeline" picker on /candidates.
 * Closed and Archived roles are excluded; Draft + Open + Paused all accept
 * new candidates (Paused stops public applications, not internal sourcing). */
export function canAcceptNewCandidates(role: Pick<Role, 'status'>): boolean {
  return role.status === 'Open' || role.status === 'Draft' || role.status === 'Paused'
}

/** Roles that should appear on the public /careers page. Open + non-empty JD only. */
export function isPubliclyVisible(role: Pick<Role, 'status' | 'description'>): boolean {
  if (role.status !== 'Open') return false
  if (!role.description || role.description.trim().length === 0) return false
  return true
}

/** Roles that should appear anywhere historical-but-not-archived (default lists). */
export function isVisibleByDefault(role: Pick<Role, 'status'>): boolean {
  return role.status !== 'Archived'
}

/** Whether a role's pipeline is read-only (no stage transitions allowed).
 * Closed roles preserve the pipeline for record-keeping but freeze movement. */
export function isPipelineReadOnly(role: Pick<Role, 'status'>): boolean {
  return role.status === 'Closed' || role.status === 'Archived'
}

/** Allowed transitions from each state. The action verb is the user-facing label. */
export const CLOSE_OUTCOMES = [
  'Position Filled',
  'No Suitable Candidate',
  'Cancelled',
  'Other',
] as const

export type CloseOutcome = (typeof CLOSE_OUTCOMES)[number]

export type LifecycleAction =
  | 'publish' // Draft → Open
  | 'discard' // Draft → Archived
  | 'pause' // Open → Paused
  | 'resume' // Paused → Open
  | 'close' // Open|Paused → Closed
  | 'reopen' // Closed → Open
  | 'archive' // Closed → Archived

export interface ActionDescriptor {
  action: LifecycleAction
  label: string
  /** Whether the action requires a free-text reason (Pause). */
  needsReason?: boolean
  /** Whether the action requires a CloseOutcome enum (Close). */
  needsOutcome?: boolean
  /** When true, render the button as the destructive variant. */
  destructive?: boolean
}

export function availableActions(role: Pick<Role, 'status'>): ActionDescriptor[] {
  switch (role.status) {
    case 'Draft':
      return [
        { action: 'publish', label: 'Publish' },
        { action: 'discard', label: 'Discard', destructive: true },
      ]
    case 'Open':
      return [
        { action: 'pause', label: 'Pause', needsReason: true },
        { action: 'close', label: 'Close', needsOutcome: true, destructive: true },
      ]
    case 'Paused':
      return [
        { action: 'resume', label: 'Resume' },
        { action: 'close', label: 'Close', needsOutcome: true, destructive: true },
      ]
    case 'Closed':
      return [
        { action: 'reopen', label: 'Reopen' },
        { action: 'archive', label: 'Archive', destructive: true },
      ]
    default:
      return []
  }
}

export function nextStatusFor(action: LifecycleAction): Role['status'] {
  switch (action) {
    case 'publish':
    case 'resume':
    case 'reopen':
      return 'Open'
    case 'pause':
      return 'Paused'
    case 'close':
      return 'Closed'
    case 'discard':
    case 'archive':
      return 'Archived'
  }
}
