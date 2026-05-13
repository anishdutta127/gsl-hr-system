/*
 * Pure state-transition helper for Recognition records. Mirrors the
 * authoritative API behaviour for /api/admin/recognition and
 * /api/admin/recognition/[id] so tests can pin the contract without
 * spinning up a full HTTP cycle.
 *
 * State machine:
 *
 *   Draft  ─► Nominated ─► Approved ─► Published
 *                │             │            │
 *                └─► Archived ◄┘            └─► Archived
 *
 *   Archived is the only terminal state; everything else may forward to it.
 *   We never go backwards: a Published record stays Published. An Approved
 *   record can be Archived (poster series gets retired) but not reverted to
 *   Nominated. This keeps the printed-poster invariant honest -- once HR
 *   approved a write-up, that wording is what got sent out.
 *
 * Role gates (mirrors the API):
 *
 *   nominate   - Admin, HR, HOD
 *   approve    - Admin, HR
 *   reject     - Admin, HR  (transitions Nominated -> Archived)
 *   publish    - Admin, HR  (transitions Approved -> Published)
 *   archive    - Admin, HR  (terminal from any non-Archived state)
 *   edit       - Admin, HR  (only Nominated; Draft is editable by author too)
 *
 * Why HOD can't approve their own nomination: prevents single-point self-
 * recognition. HR-Admin is the human review layer. Self-approval blocked
 * even when HOD nominated for an employee in their own department.
 */

import type { RecognitionStatus, StaffRole } from './types'

export type RecognitionAction =
  | 'nominate'
  | 'approve'
  | 'reject'
  | 'publish'
  | 'archive'
  | 'edit'

/** All valid forward transitions. Keyed by `current` status, value is the
 *  set of statuses we can transition to. Archived is the dead end. */
const FORWARD_TRANSITIONS: Record<RecognitionStatus, RecognitionStatus[]> = {
  Draft: ['Nominated', 'Archived'],
  Nominated: ['Approved', 'Archived'],
  Approved: ['Published', 'Archived'],
  Published: ['Archived'],
  Archived: [],
}

/** Role permission set. Pure lookup -- the API also enforces this on the
 *  server before mutating. */
const ROLE_GATES: Record<RecognitionAction, StaffRole[]> = {
  nominate: ['Admin', 'HR', 'HOD'],
  approve: ['Admin', 'HR'],
  reject: ['Admin', 'HR'],
  publish: ['Admin', 'HR'],
  archive: ['Admin', 'HR'],
  edit: ['Admin', 'HR'],
}

export interface TransitionInput {
  current: RecognitionStatus
  action: RecognitionAction
  actorRole: StaffRole
}

export interface TransitionResult {
  ok: boolean
  next?: RecognitionStatus
  reason?: string
}

/** Map each action to the resulting status. Used for the legal-target check
 *  before role-gating. */
function targetFor(action: RecognitionAction): RecognitionStatus | null {
  switch (action) {
    case 'nominate':
      return 'Nominated'
    case 'approve':
      return 'Approved'
    case 'publish':
      return 'Published'
    case 'reject':
    case 'archive':
      return 'Archived'
    case 'edit':
      return null // edit doesn't change status
  }
}

export function canTransition(input: TransitionInput): TransitionResult {
  const allowedRoles = ROLE_GATES[input.action]
  if (!allowedRoles.includes(input.actorRole)) {
    return { ok: false, reason: `Role ${input.actorRole} cannot ${input.action}.` }
  }

  if (input.action === 'edit') {
    // Edit is allowed on Draft + Nominated only; once HR approves, the
    // write-up is frozen as the printed-poster wording.
    if (input.current === 'Draft' || input.current === 'Nominated') {
      return { ok: true }
    }
    return {
      ok: false,
      reason: `Cannot edit a recognition in status ${input.current}.`,
    }
  }

  if (input.action === 'nominate') {
    // Nominate is the create action; current must be Draft (or a fresh
    // record, which we model as Draft by convention).
    if (input.current === 'Draft') {
      return { ok: true, next: 'Nominated' }
    }
    return {
      ok: false,
      reason: `Cannot nominate from status ${input.current}.`,
    }
  }

  const target = targetFor(input.action)
  if (!target) {
    return { ok: false, reason: `Unknown action ${input.action}.` }
  }

  const validTargets = FORWARD_TRANSITIONS[input.current]
  if (!validTargets.includes(target)) {
    return {
      ok: false,
      reason: `Cannot ${input.action} from status ${input.current}.`,
    }
  }

  return { ok: true, next: target }
}

/** True when the user is permitted to nominate the given employee.
 *  Admin + HR may nominate anyone; HOD may only nominate employees in their
 *  own department. Pure helper; the caller supplies department info because
 *  this module doesn't load data. */
export function canNominateEmployee(args: {
  actorRole: StaffRole
  actorDepartment?: string
  employeeDepartment: string
}): boolean {
  if (args.actorRole === 'Admin' || args.actorRole === 'HR') return true
  if (args.actorRole !== 'HOD') return false
  if (!args.actorDepartment) return false
  return (
    args.actorDepartment.trim().toLowerCase() ===
    args.employeeDepartment.trim().toLowerCase()
  )
}

/** Write-up validation. Returns null on success, an error message on
 *  failure. Used by both the API and the form. */
export function validateWriteup(writeup: string): string | null {
  const trimmed = writeup.trim()
  if (trimmed.length < 30) {
    return 'Write-up must be at least 30 characters so it is meaningful on the poster.'
  }
  if (trimmed.length > 800) {
    return 'Write-up must be 800 characters or fewer to fit the poster layout.'
  }
  return null
}
