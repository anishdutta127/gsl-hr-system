/*
 * Rubric aggregation. Weighted average of per-criterion scores. Normalises
 * every scale to a 0-10 composite so different roles can be compared at the
 * dashboard level without HR having to remember which rubric scale applies.
 */

import type { InterviewScore, RubricCriterion } from './types'

function normaliseToTen(value: number | 'yes' | 'no', scale: RubricCriterion['scale']): number {
  if (scale === 'yes-no') {
    return value === 'yes' ? 10 : 0
  }
  if (typeof value !== 'number') return 0
  if (scale === 'stars-1-5') return (Math.max(1, Math.min(5, value)) / 5) * 10
  if (scale === 'score-1-10') return Math.max(0, Math.min(10, value))
  return 0
}

export function aggregateScore(
  criteria: RubricCriterion[],
  scores: InterviewScore[],
): number | null {
  if (criteria.length === 0 || scores.length === 0) return null
  const scoreByCriterion = new Map(scores.map((s) => [s.criterionId, s] as const))
  let totalWeight = 0
  let weighted = 0
  for (const c of criteria) {
    const s = scoreByCriterion.get(c.id)
    if (!s) continue
    const weight = c.weight > 0 ? c.weight : 1
    weighted += normaliseToTen(s.value, c.scale) * weight
    totalWeight += weight
  }
  if (totalWeight === 0) return null
  return Math.round((weighted / totalWeight) * 10) / 10
}

export function inferNextStage(round: string, recommendation: 'proceed' | 'hold' | 'reject'):
  | { stage: string; terminal: boolean }
  | null {
  if (recommendation === 'reject') return { stage: 'Rejected', terminal: true }
  if (recommendation === 'hold') return { stage: 'OnHold', terminal: true }
  // proceed: move to the "Done" variant of this round
  if (round === 'HOD') return { stage: 'HODRoundDone', terminal: false }
  if (round === 'HR') return { stage: 'HRRoundDone', terminal: false }
  return null
}
