/*
 * Pure helpers for the pre-onboarding approval workflow. The API route
 * (POST /api/applications/[id]/pre-onboarding) is the IO surface; this
 * module exposes the same state machine as pure functions so we can
 * unit-test transitions without spinning up Next routes.
 */

import type { PreOnboardingApproval } from './types'

export type ApprovalAction =
  | { kind: 'initiate'; ctcConfirmed: number; joiningDateConfirmed: string; locationConfirmed: string; positionConfirmed: string; notes?: string }
  | { kind: 'hiring-manager-approve'; notes?: string; by: string; at: string }
  | { kind: 'hr-approve'; notes?: string; by: string; at: string }
  | { kind: 'reject'; rejectedBy: 'hiring-manager' | 'hr'; rejectionReason: string }
  | { kind: 'reset' }

export interface TransitionContext {
  isAssignedHiringManager: boolean
  isHrOrAdmin: boolean
  isAdmin: boolean
}

export interface TransitionResult {
  ok: boolean
  reason?: string
  next?: PreOnboardingApproval
}

const EMPTY: PreOnboardingApproval = { status: 'Not Started' }

/** Pure state-machine step. Returns the new PreOnboardingApproval, or
 * a reason string when the action is invalid for the current state /
 * caller. No IO; no audit log appended (that lives in the API route). */
export function transitionPreOnboardingApproval(
  current: PreOnboardingApproval | undefined,
  action: ApprovalAction,
  ctx: TransitionContext,
): TransitionResult {
  const existing = current ?? EMPTY

  switch (action.kind) {
    case 'initiate': {
      if (!ctx.isAssignedHiringManager && !ctx.isHrOrAdmin) {
        return { ok: false, reason: 'only-hm-or-hr-can-initiate' }
      }
      if (!Number.isFinite(action.ctcConfirmed) || action.ctcConfirmed <= 0) {
        return { ok: false, reason: 'ctc-required' }
      }
      if (!action.joiningDateConfirmed) return { ok: false, reason: 'joining-date-required' }
      if (!action.locationConfirmed) return { ok: false, reason: 'location-required' }
      if (!action.positionConfirmed) return { ok: false, reason: 'position-required' }
      return {
        ok: true,
        next: {
          status: 'Pending Hiring Manager',
          ctcConfirmed: action.ctcConfirmed,
          joiningDateConfirmed: action.joiningDateConfirmed,
          locationConfirmed: action.locationConfirmed,
          positionConfirmed: action.positionConfirmed,
          notes: action.notes,
        },
      }
    }

    case 'hiring-manager-approve': {
      if (!ctx.isAssignedHiringManager && !ctx.isHrOrAdmin) {
        return { ok: false, reason: 'only-hm-can-approve' }
      }
      if (existing.status !== 'Pending Hiring Manager') {
        return { ok: false, reason: `cannot-from-${existing.status}` }
      }
      return {
        ok: true,
        next: {
          ...existing,
          status: 'Pending HR Approval',
          hiringManagerApprovedBy: action.by,
          hiringManagerApprovedAt: action.at,
          notes: action.notes ?? existing.notes,
        },
      }
    }

    case 'hr-approve': {
      if (!ctx.isHrOrAdmin) return { ok: false, reason: 'only-hr-can-approve' }
      if (existing.status !== 'Pending HR Approval') {
        return { ok: false, reason: `cannot-from-${existing.status}` }
      }
      return {
        ok: true,
        next: {
          ...existing,
          status: 'Approved',
          hrApprovedBy: action.by,
          hrApprovedAt: action.at,
          notes: action.notes ?? existing.notes,
        },
      }
    }

    case 'reject': {
      if (action.rejectedBy === 'hiring-manager' && !ctx.isAssignedHiringManager && !ctx.isHrOrAdmin) {
        return { ok: false, reason: 'cannot-reject-as-hm' }
      }
      if (action.rejectedBy === 'hr' && !ctx.isHrOrAdmin) {
        return { ok: false, reason: 'cannot-reject-as-hr' }
      }
      if (!action.rejectionReason) return { ok: false, reason: 'reason-required' }
      return {
        ok: true,
        next: {
          ...existing,
          status: 'Rejected',
          rejectedBy: action.rejectedBy,
          rejectionReason: action.rejectionReason,
        },
      }
    }

    case 'reset': {
      if (!ctx.isAdmin) return { ok: false, reason: 'admin-only' }
      return { ok: true, next: { status: 'Not Started' } }
    }
  }
}

/** True when the application is cleared for sending the offer intimation
 * email - i.e. the approval has been finalised by HR. */
export function isReadyForOfferIntimation(approval: PreOnboardingApproval | undefined): boolean {
  return !!approval && approval.status === 'Approved'
}
