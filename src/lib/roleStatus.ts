/*
 * Role lifecycle helpers.
 *
 * Statuses live on Role.status. The helpers here make it impossible for
 * different surfaces to disagree about which roles are "open for candidates"
 * vs. "visible on /careers" — a class of bug that bit us in Phase 2 testing.
 */

import type { Role } from './types'

/** Roles that should appear in the "Add to role pipeline" picker on /candidates.
 * Step 6 will widen this to include 'Paused'. */
export function canAcceptNewCandidates(role: Pick<Role, 'status'>): boolean {
  const status = role.status as string
  return status === 'Open' || status === 'Draft' || status === 'Paused'
}

/** Roles that should appear on the public /careers page. */
export function isPubliclyVisible(role: Pick<Role, 'status' | 'description'>): boolean {
  if (role.status !== 'Open') return false
  if (!role.description || role.description.trim().length === 0) return false
  return true
}

/** Roles that should appear anywhere historical-but-not-archived (default lists). */
export function isVisibleByDefault(role: Pick<Role, 'status'>): boolean {
  return (role.status as string) !== 'Archived'
}
