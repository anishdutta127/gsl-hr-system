import { describe, expect, it } from 'vitest'
import {
  forwardLabel,
  isHodRoundStage,
  isRejectionReason,
  neighbours,
  nextStage,
  previousStage,
} from '../stageTransition'
import type { Role } from '../types'

const baseRole = (stages: string[]): Role => ({
  id: 'r',
  title: 'Test Role',
  department: 'Academics',
  location: 'Mumbai',
  employmentType: 'Full-time',
  status: 'Open',
  pipelineStages: stages,
  rubric: [],
  description: '',
  responsibilities: [],
  mustHaves: [],
  niceToHaves: [],
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'seed',
  auditLog: [],
})

describe('nextStage / previousStage', () => {
  const role = baseRole([
    'Sourced',
    'Shortlisted',
    'AssessmentSent',
    'Offered',
    'Joined',
  ])

  it('returns the next non-terminal stage in the role pipeline', () => {
    expect(nextStage(role, 'Sourced')).toBe('Shortlisted')
    expect(nextStage(role, 'AssessmentSent')).toBe('Offered')
  })

  it('returns null at the end of the pipeline', () => {
    expect(nextStage(role, 'Joined')).toBeNull()
  })

  it('returns null for stages not in the pipeline', () => {
    expect(nextStage(role, 'Mystery' as never)).toBeNull()
  })

  it('returns null for terminal stages, even if they appear in the list', () => {
    expect(nextStage(role, 'Rejected' as never)).toBeNull()
    expect(nextStage(role, 'Withdrawn' as never)).toBeNull()
  })

  it('previousStage returns the prior stage', () => {
    expect(previousStage(role, 'AssessmentSent')).toBe('Shortlisted')
    expect(previousStage(role, 'Sourced')).toBeNull()
  })
})

describe('neighbours', () => {
  it('reflects per-role pipeline overrides', () => {
    const academics = baseRole([
      'Sourced',
      'HODRoundScheduled',
      'HODRoundDone',
      'HOD2RoundScheduled',
      'HRRoundScheduled',
    ])
    expect(neighbours(academics, 'HODRoundDone')).toEqual({
      next: 'HOD2RoundScheduled',
      previous: 'HODRoundScheduled',
    })
  })

  it('handles a single-stage pipeline cleanly', () => {
    const tiny = baseRole(['Sourced'])
    expect(neighbours(tiny, 'Sourced')).toEqual({ next: null, previous: null })
  })
})

describe('forwardLabel', () => {
  it('uses HR-friendly verbs for known stages', () => {
    expect(forwardLabel('Offered')).toBe('Send offer')
    expect(forwardLabel('HODRoundScheduled')).toBe('Schedule HOD interview')
    expect(forwardLabel('Joined')).toBe('Confirm hire')
  })

  it('falls back to "Move to <Stage>" for unknown stages', () => {
    expect(forwardLabel('CustomStage' as never)).toBe('Move to CustomStage')
  })
})

describe('isHodRoundStage', () => {
  it('recognises both HOD round 1 and round 2 schedule stages', () => {
    expect(isHodRoundStage('HODRoundScheduled')).toBe(true)
    expect(isHodRoundStage('HOD2RoundScheduled')).toBe(true)
    expect(isHodRoundStage('HODRoundDone')).toBe(false)
    expect(isHodRoundStage('Sourced')).toBe(false)
  })
})

describe('isRejectionReason', () => {
  it('accepts only the canonical reason strings', () => {
    expect(isRejectionReason('Position Filled')).toBe(true)
    expect(isRejectionReason('Better Match Elsewhere')).toBe(true)
    expect(isRejectionReason('Other')).toBe(true)
    expect(isRejectionReason('garbage')).toBe(false)
    expect(isRejectionReason(null)).toBe(false)
  })
})
