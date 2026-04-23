/*
 * Pipeline stage transition logic.
 *
 * Pure functions only; no IO. Given a role and an application's current
 * stage, determine whether a target stage is a valid next move.
 *
 * Role.pipelineStages is the ordered list of non-terminal stages. Terminal
 * stages (Rejected / OnHold / NotInterested / Withdrawn / Joined) are
 * globally defined and may be entered from any non-terminal stage.
 */

import type { Role, Stage } from './types'
import { TERMINAL_STAGES } from './types'

const TERMINAL_SET = new Set<string>(TERMINAL_STAGES)

export function isTerminal(stage: Stage): boolean {
  return TERMINAL_SET.has(stage)
}

export interface TransitionResult {
  valid: boolean
  reason?: string
}

/**
 * Validate a stage transition for a role.
 * Rules:
 *   1. Terminal stages block further transitions.
 *   2. Any non-terminal stage can transition to any other non-terminal stage
 *      in the role's pipelineStages list (HR may skip ahead or move back).
 *   3. Any non-terminal stage can transition to any terminal stage.
 *   4. Target stage must be either in role.pipelineStages or in TERMINAL_STAGES.
 */
export function canTransition(
  role: Role,
  currentStage: Stage,
  targetStage: Stage,
): TransitionResult {
  if (currentStage === targetStage) {
    return { valid: false, reason: 'Already at this stage.' }
  }
  if (isTerminal(currentStage)) {
    return {
      valid: false,
      reason: `Cannot move from terminal stage ${currentStage}.`,
    }
  }
  const validTargets = new Set<string>([...role.pipelineStages, ...TERMINAL_STAGES])
  if (!validTargets.has(targetStage)) {
    return {
      valid: false,
      reason: `${targetStage} is not a valid stage for this role.`,
    }
  }
  return { valid: true }
}

/** List stages in display order: role.pipelineStages first, then terminal stages. */
export function orderedStages(role: Role): Stage[] {
  return [...role.pipelineStages, ...TERMINAL_STAGES.filter((s) => s !== 'Joined')]
  // 'Joined' is technically a terminal state but displayed inline as the final
  // non-terminal stage in the main pipeline. Adjust display as needed.
}
