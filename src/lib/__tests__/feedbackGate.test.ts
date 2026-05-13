import { describe, expect, it } from 'vitest'
import {
  evaluateGate,
  feedbackRequiredFor,
  hasFeedbackForCurrentRound,
  isFeedbackRecommendation,
  isFeedbackRequiredStage,
  roundLabelForStage,
  validateFeedbackPayload,
} from '../feedbackGate'
import type { Application, InterviewFeedback } from '../types'
import { DEFAULT_FEEDBACK_REQUIRED_STAGES } from '../types'

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'a1',
    candidateId: 'c1',
    roleId: 'r1',
    currentStage: 'HODRoundDone',
    stageEnteredAt: '2026-05-13T10:00:00Z',
    createdAt: '2026-05-01T00:00:00Z',
    createdBy: 'hr',
    auditLog: [],
    ...overrides,
  }
}

const sampleFeedback = (round: string): InterviewFeedback => ({
  round,
  submittedBy: 'manali@gsl',
  submittedAt: '2026-05-13T11:00:00Z',
  recommendation: 'Move Forward',
  strengths: 'Strong on Python; great problem-solving instincts.',
  concerns: 'A bit thin on system design.',
})

describe('feedbackRequiredFor', () => {
  it('returns the default list when the application has no override', () => {
    expect(feedbackRequiredFor(makeApp())).toEqual(DEFAULT_FEEDBACK_REQUIRED_STAGES)
  })

  it('honours the per-application override when set', () => {
    const app = makeApp({ feedbackRequiredFor: ['HRRoundDone'] })
    expect(feedbackRequiredFor(app)).toEqual(['HRRoundDone'])
  })

  it('treats an explicit empty array as "no stages require feedback"', () => {
    const app = makeApp({ feedbackRequiredFor: [] })
    expect(feedbackRequiredFor(app)).toEqual([])
    expect(isFeedbackRequiredStage(app)).toBe(false)
  })
})

describe('roundLabelForStage', () => {
  it('maps the three default stages to their round labels', () => {
    expect(roundLabelForStage('HODRoundDone')).toBe('HOD')
    expect(roundLabelForStage('HOD2RoundDone')).toBe('HOD 2')
    expect(roundLabelForStage('HRRoundDone')).toBe('HR')
  })

  it('falls back to the raw stage name for unknown stages', () => {
    expect(roundLabelForStage('CustomRound')).toBe('CustomRound')
  })
})

describe('hasFeedbackForCurrentRound', () => {
  it('returns false when interviewFeedback is undefined', () => {
    expect(hasFeedbackForCurrentRound(makeApp())).toBe(false)
  })

  it('returns true when any entry matches the current round label', () => {
    const app = makeApp({ interviewFeedback: [sampleFeedback('HOD')] })
    expect(hasFeedbackForCurrentRound(app)).toBe(true)
  })

  it('does not confuse round labels across stages', () => {
    const app = makeApp({
      currentStage: 'HRRoundDone',
      interviewFeedback: [sampleFeedback('HOD')],
    })
    expect(hasFeedbackForCurrentRound(app)).toBe(false)
  })
})

describe('evaluateGate', () => {
  it('clears for a terminal target stage even without feedback', () => {
    const app = makeApp()
    expect(evaluateGate(app, 'Rejected')).toEqual({ cleared: true })
    expect(evaluateGate(app, 'OnHold')).toEqual({ cleared: true })
    expect(evaluateGate(app, 'Withdrawn')).toEqual({ cleared: true })
  })

  it('clears when the current stage is not feedback-required', () => {
    const app = makeApp({ currentStage: 'Shortlisted' })
    expect(evaluateGate(app, 'AssessmentSent')).toEqual({ cleared: true })
  })

  it('blocks when no hiring manager is assigned', () => {
    const app = makeApp()
    const result = evaluateGate(app, 'HRRoundScheduled')
    expect(result.cleared).toBe(false)
    expect(result.reason).toBe('no-hiring-manager-assigned')
  })

  it('blocks when the hiring manager has not submitted feedback', () => {
    const app = makeApp({ hiringManagerId: 'u1' })
    const result = evaluateGate(app, 'HRRoundScheduled')
    expect(result.cleared).toBe(false)
    expect(result.reason).toBe('feedback-not-submitted')
    expect(result.promptHint).toContain('HOD')
  })

  it('clears when feedback exists for the current round', () => {
    const app = makeApp({
      hiringManagerId: 'u1',
      interviewFeedback: [sampleFeedback('HOD')],
    })
    expect(evaluateGate(app, 'HRRoundScheduled')).toEqual({ cleared: true })
  })

  it('still clears when an additional feedback entry exists for an older round', () => {
    const app = makeApp({
      currentStage: 'HRRoundDone',
      hiringManagerId: 'u1',
      interviewFeedback: [sampleFeedback('HOD'), sampleFeedback('HR')],
    })
    expect(evaluateGate(app, 'Offered')).toEqual({ cleared: true })
  })

  it('does not falsely block pre-existing applications when override is empty', () => {
    const app = makeApp({ feedbackRequiredFor: [] })
    expect(evaluateGate(app, 'HRRoundScheduled')).toEqual({ cleared: true })
  })
})

describe('isFeedbackRecommendation', () => {
  it('accepts the four canonical recommendations', () => {
    expect(isFeedbackRecommendation('Strong Hire')).toBe(true)
    expect(isFeedbackRecommendation('Move Forward')).toBe(true)
    expect(isFeedbackRecommendation('On Hold')).toBe(true)
    expect(isFeedbackRecommendation('Reject')).toBe(true)
  })

  it('rejects other strings + non-strings', () => {
    expect(isFeedbackRecommendation('hire')).toBe(false)
    expect(isFeedbackRecommendation(null)).toBe(false)
    expect(isFeedbackRecommendation(undefined)).toBe(false)
  })
})

describe('validateFeedbackPayload', () => {
  it('returns null when the round is missing or empty', () => {
    expect(
      validateFeedbackPayload({
        round: '',
        recommendation: 'Move Forward',
        strengths: 'x',
        concerns: '',
      }),
    ).toBeNull()
  })

  it('returns null when the recommendation is unknown', () => {
    expect(
      validateFeedbackPayload({
        round: 'HOD',
        recommendation: 'hire',
        strengths: 'x',
        concerns: '',
      }),
    ).toBeNull()
  })

  it('requires at least one of strengths or concerns to be non-empty', () => {
    expect(
      validateFeedbackPayload({
        round: 'HOD',
        recommendation: 'Move Forward',
        strengths: '   ',
        concerns: '   ',
      }),
    ).toBeNull()
  })

  it('accepts a minimal valid payload with strengths only', () => {
    const got = validateFeedbackPayload({
      round: 'HOD',
      recommendation: 'Move Forward',
      strengths: 'Sharp on basics.',
      concerns: '',
    })
    expect(got).not.toBeNull()
    expect(got?.strengths).toBe('Sharp on basics.')
    expect(got?.concerns).toBe('')
  })

  it('strips overallNotes when blank', () => {
    const got = validateFeedbackPayload({
      round: 'HOD',
      recommendation: 'Reject',
      strengths: '',
      concerns: 'Failed coding round.',
      overallNotes: '   ',
    })
    expect(got?.overallNotes).toBeUndefined()
  })
})
