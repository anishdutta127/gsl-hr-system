/*
 * Pure helpers for computing the next/previous stage on a role's pipeline,
 * and the dynamic button label HR sees on a card ("Move to Shortlisted",
 * "Schedule HOD interview", "Send offer", etc.).
 *
 * Reads role.pipelineStages so per-role overrides (e.g. Academics two-HOD
 * pipeline) drive the UI without any hardcoded ordering. Terminal stages
 * are never returned as next/previous candidates: HR uses Reject / OnHold
 * for those, never the forward/back arrows.
 */

import type { Role, Stage } from './types'
import { isTerminal } from './pipeline'

export interface StageNeighbours {
  next: Stage | null
  previous: Stage | null
}

/** Index of the current stage in the role's non-terminal pipeline list. */
function indexOf(role: Role, stage: Stage): number {
  return role.pipelineStages.indexOf(stage)
}

/** Next non-terminal stage, or null when at the end / terminal. */
export function nextStage(role: Role, current: Stage): Stage | null {
  if (isTerminal(current)) return null
  const idx = indexOf(role, current)
  if (idx < 0) return null
  if (idx >= role.pipelineStages.length - 1) return null
  return role.pipelineStages[idx + 1] ?? null
}

/** Previous non-terminal stage, or null when at the start / terminal. */
export function previousStage(role: Role, current: Stage): Stage | null {
  if (isTerminal(current)) return null
  const idx = indexOf(role, current)
  if (idx <= 0) return null
  return role.pipelineStages[idx - 1] ?? null
}

export function neighbours(role: Role, current: Stage): StageNeighbours {
  return { next: nextStage(role, current), previous: previousStage(role, current) }
}

/** Friendly verb for moving forward INTO a stage. Tuned for the labels HR uses
 * verbally: "send offer", "schedule HOD interview", etc. Falls back to
 * "Move to <Stage>" for stages with no special verb.
 *
 * Phrasing is calibrated against DESIGN.md's copy voice: short, action-led,
 * British English. */
export function forwardLabel(target: Stage): string {
  switch (target) {
    case 'Shortlisted':
      return 'Move to Shortlisted'
    case 'AssessmentSent':
      return 'Send assessment'
    case 'AssessmentDone':
      return 'Mark assessment done'
    case 'VideoSent':
      return 'Send video request'
    case 'VideoDone':
      return 'Mark video done'
    case 'HODRoundScheduled':
      return 'Schedule HOD interview'
    case 'HODRoundDone':
      return 'Mark HOD round done'
    case 'HOD2RoundScheduled':
      return 'Schedule HOD round 2'
    case 'HOD2RoundDone':
      return 'Mark HOD round 2 done'
    case 'HRRoundScheduled':
      return 'Schedule HR interview'
    case 'HRRoundDone':
      return 'Mark HR round done'
    case 'Offered':
      return 'Send offer'
    case 'OfferAccepted':
      return 'Mark offer accepted'
    case 'DocsCollected':
      return 'Mark docs collected'
    case 'Joined':
      return 'Confirm hire'
    default:
      return `Move to ${target}`
  }
}

/** "HOD-round" stages get a special hook: moving INTO them triggers an email
 * notification to that role's HOD (and HOD round 2 owner where set). */
export function isHodRoundStage(stage: Stage): boolean {
  const s = String(stage)
  return s === 'HODRoundScheduled' || s === 'HOD2RoundScheduled'
}

export const REJECTION_REASONS = [
  'Not Qualified for Role',
  'Position Filled',
  'Withdrew',
  'Better Match Elsewhere',
  'Other',
] as const

export type RejectionReason = (typeof REJECTION_REASONS)[number]

export function isRejectionReason(value: unknown): value is RejectionReason {
  return typeof value === 'string' && (REJECTION_REASONS as readonly string[]).includes(value)
}

/**
 * Structured reasons captured when an offer is declined. Mirrors
 * REJECTION_REASONS in shape so HR can run "why are we losing offers"
 * reports without scraping notes. 'Other' requires the free-text field.
 */
export const OFFER_DECLINE_REASONS = [
  'Compensation',
  'Role mismatch',
  'Counter-offer accepted',
  'Personal',
  'No response',
  'Other',
] as const

export type OfferDeclineReason = (typeof OFFER_DECLINE_REASONS)[number]

export function isOfferDeclineReason(value: unknown): value is OfferDeclineReason {
  return (
    typeof value === 'string' &&
    (OFFER_DECLINE_REASONS as readonly string[]).includes(value)
  )
}
