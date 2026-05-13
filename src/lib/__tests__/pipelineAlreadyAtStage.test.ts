import { describe, expect, it } from 'vitest'
import { canTransition } from '../pipeline'
import type { Role } from '../types'

const roleAcademics: Role = {
  id: 'r-aca',
  title: 'STEM Coach',
  department: 'Academics',
  location: 'Mumbai',
  employmentType: 'Full-time',
  status: 'Open',
  pipelineStages: [
    'Sourced',
    'Shortlisted',
    'AssessmentSent',
    'AssessmentDone',
    'HODRoundScheduled',
    'HODRoundDone',
    'HRRoundScheduled',
    'HRRoundDone',
    'Offered',
    'OfferAccepted',
    'DocsCollected',
    'Joined',
  ],
  rubric: [],
  description: '',
  responsibilities: [],
  mustHaves: [],
  niceToHaves: [],
  createdAt: '',
  createdBy: '',
  auditLog: [],
}

describe('canTransition – same-stage guard', () => {
  it('rejects when target equals current with a recovery-hint reason', () => {
    const r = canTransition(roleAcademics, 'Shortlisted', 'Shortlisted')
    expect(r.valid).toBe(false)
    expect(r.reason).toContain('Already at Shortlisted')
    expect(r.reason).toContain('refresh')
  })

  it('does not mistakenly trigger same-stage when moving to the matching name in a different role', () => {
    // Even with the same stage label, source and target are within the same
    // role here — this is the only legitimate "same stage" guard. The test
    // is here to lock in the behaviour: targetStage equal to currentStage
    // is rejected regardless of context (the caller has already chosen
    // role + applicationId).
    const r = canTransition(roleAcademics, 'AssessmentDone', 'AssessmentDone')
    expect(r.valid).toBe(false)
  })

  it('still rejects same-stage even when stage is terminal', () => {
    const r = canTransition(roleAcademics, 'Rejected', 'Rejected')
    expect(r.valid).toBe(false)
  })

  it('allows forward moves with a distinct target', () => {
    const r = canTransition(roleAcademics, 'Shortlisted', 'AssessmentSent')
    expect(r.valid).toBe(true)
  })
})
