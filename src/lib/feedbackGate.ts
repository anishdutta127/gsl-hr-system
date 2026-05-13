/*
 * Pure helpers for the Gate 3 hiring-manager feedback gate.
 *
 * No IO. Given an Application + a target stage, decide whether progression
 * should be blocked, allowed, or require an Admin override. Surfaces the
 * "round" label the gate expects feedback for so the UI can name it in
 * the modal copy.
 *
 * The gate fires on transitions OUT of a stage in
 * `application.feedbackRequiredFor` (default
 * DEFAULT_FEEDBACK_REQUIRED_STAGES). Same-stage moves never trigger the
 * gate; neither do moves INTO a feedback-required stage (only OUT of one).
 *
 * Terminal-stage transitions (Reject, OnHold, Withdrawn) bypass the gate.
 * Rationale: HR is allowed to close out a candidate without asking the
 * hiring manager for prose feedback — the rejection reason capture is
 * the audit trail for those moves.
 */

import type {
  Application,
  FeedbackRecommendation,
  InterviewFeedback,
  Stage,
} from './types'
import { DEFAULT_FEEDBACK_REQUIRED_STAGES, FEEDBACK_RECOMMENDATIONS } from './types'
import { TERMINAL_STAGES } from './types'

const TERMINAL_SET = new Set<string>(TERMINAL_STAGES)

/** Human label for the round that a *RoundDone stage corresponds to. The
 * feedback gate uses this label to match `feedback.round` entries; the
 * hiring manager submits using the same label from the form. */
const ROUND_LABELS: Record<string, string> = {
  HODRoundDone: 'HOD',
  HOD2RoundDone: 'HOD 2',
  HRRoundDone: 'HR',
  // Future-proof: if a role's pipeline names the stage differently the
  // gate falls back to the raw stage name.
}

/** The set of stages the gate fires on for a given application. */
export function feedbackRequiredFor(application: Application): Stage[] {
  if (application.feedbackRequiredFor !== undefined) {
    return application.feedbackRequiredFor
  }
  return DEFAULT_FEEDBACK_REQUIRED_STAGES
}

/** The round label the hiring manager submits feedback for when the
 * application is at `currentStage`. */
export function roundLabelForStage(currentStage: Stage): string {
  return ROUND_LABELS[String(currentStage)] ?? String(currentStage)
}

/** Whether the application has at least one feedback entry for the round
 * label corresponding to currentStage. */
export function hasFeedbackForCurrentRound(application: Application): boolean {
  const label = roundLabelForStage(application.currentStage)
  const entries = application.interviewFeedback ?? []
  return entries.some((f) => f.round === label)
}

/** Whether the current stage is one where the gate fires. */
export function isFeedbackRequiredStage(application: Application): boolean {
  return feedbackRequiredFor(application).includes(application.currentStage)
}

export interface GateResult {
  /** True when the transition can proceed without an override. */
  cleared: boolean
  /** Block reason, populated when `cleared === false`. */
  reason?:
    | 'no-hiring-manager-assigned'
    | 'feedback-not-submitted'
  /** UI hint for what the prompt should suggest. */
  promptHint?: string
}

/**
 * Decide whether the gate clears for a forward transition out of the
 * current stage.
 *
 * Rules:
 *   1. Terminal target stage → always cleared (Reject etc. bypass).
 *   2. Not at a feedback-required stage → always cleared.
 *   3. No hiring manager assigned → blocked with 'no-hiring-manager-assigned'.
 *   4. Hiring manager assigned but no feedback for this round → blocked
 *      with 'feedback-not-submitted'.
 *   5. Otherwise cleared.
 */
export function evaluateGate(
  application: Application,
  targetStage: Stage,
): GateResult {
  if (TERMINAL_SET.has(String(targetStage))) {
    return { cleared: true }
  }
  if (!isFeedbackRequiredStage(application)) {
    return { cleared: true }
  }
  if (!application.hiringManagerId) {
    return {
      cleared: false,
      reason: 'no-hiring-manager-assigned',
      promptHint: 'Assign hiring manager first',
    }
  }
  if (!hasFeedbackForCurrentRound(application)) {
    return {
      cleared: false,
      reason: 'feedback-not-submitted',
      promptHint: `${roundLabelForStage(application.currentStage)} feedback required before moving forward`,
    }
  }
  return { cleared: true }
}

/** Validate a recommendation string against the union. */
export function isFeedbackRecommendation(v: unknown): v is FeedbackRecommendation {
  return typeof v === 'string' && (FEEDBACK_RECOMMENDATIONS as readonly string[]).includes(v)
}

/** Validate a candidate feedback payload from a client form. Returns the
 * sanitised record or null when invalid (caller maps null → 400). */
export function validateFeedbackPayload(input: {
  round?: unknown
  recommendation?: unknown
  strengths?: unknown
  concerns?: unknown
  overallNotes?: unknown
}): Omit<InterviewFeedback, 'submittedAt' | 'submittedBy'> | null {
  if (typeof input.round !== 'string' || !input.round.trim()) return null
  if (!isFeedbackRecommendation(input.recommendation)) return null
  if (typeof input.strengths !== 'string') return null
  if (typeof input.concerns !== 'string') return null
  const strengths = input.strengths.trim()
  const concerns = input.concerns.trim()
  if (!strengths && !concerns) return null
  return {
    round: input.round.trim(),
    recommendation: input.recommendation,
    strengths,
    concerns,
    overallNotes:
      typeof input.overallNotes === 'string' && input.overallNotes.trim()
        ? input.overallNotes.trim()
        : undefined,
  }
}
