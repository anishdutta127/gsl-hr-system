import { describe, expect, it } from 'vitest'
import {
  transitionPreOnboardingApproval,
  isReadyForOfferIntimation,
} from '../preOnboardingApproval'
import type { PreOnboardingApproval } from '../types'

const HM_ONLY = { isAssignedHiringManager: true, isHrOrAdmin: false, isAdmin: false }
const HR = { isAssignedHiringManager: false, isHrOrAdmin: true, isAdmin: false }
const ADMIN = { isAssignedHiringManager: false, isHrOrAdmin: true, isAdmin: true }
const RECRUITER = { isAssignedHiringManager: false, isHrOrAdmin: false, isAdmin: false }

const validInitiate = {
  kind: 'initiate' as const,
  ctcConfirmed: 12_50_000,
  joiningDateConfirmed: '2026-06-01',
  locationConfirmed: 'Mumbai',
  positionConfirmed: 'STEM Coach',
}

describe('initiate', () => {
  it('hiring manager can initiate', () => {
    const r = transitionPreOnboardingApproval(undefined, validInitiate, HM_ONLY)
    expect(r.ok).toBe(true)
    expect(r.next?.status).toBe('Pending Hiring Manager')
    expect(r.next?.ctcConfirmed).toBe(12_50_000)
  })

  it('HR can initiate', () => {
    const r = transitionPreOnboardingApproval(undefined, validInitiate, HR)
    expect(r.ok).toBe(true)
    expect(r.next?.status).toBe('Pending Hiring Manager')
  })

  it('recruiter cannot initiate', () => {
    const r = transitionPreOnboardingApproval(undefined, validInitiate, RECRUITER)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('only-hm-or-hr-can-initiate')
  })

  it('blocks initiate with zero CTC', () => {
    const r = transitionPreOnboardingApproval(undefined, { ...validInitiate, ctcConfirmed: 0 }, HM_ONLY)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('ctc-required')
  })

  it('blocks initiate with empty location', () => {
    const r = transitionPreOnboardingApproval(undefined, { ...validInitiate, locationConfirmed: '' }, HM_ONLY)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('location-required')
  })
})

describe('hiring-manager-approve', () => {
  const existing: PreOnboardingApproval = {
    status: 'Pending Hiring Manager',
    ctcConfirmed: 12_50_000,
    joiningDateConfirmed: '2026-06-01',
    locationConfirmed: 'Mumbai',
    positionConfirmed: 'STEM Coach',
  }

  it('advances to Pending HR Approval', () => {
    const r = transitionPreOnboardingApproval(existing, {
      kind: 'hiring-manager-approve',
      by: 'manali@gsl',
      at: '2026-05-13T10:00:00Z',
    }, HM_ONLY)
    expect(r.ok).toBe(true)
    expect(r.next?.status).toBe('Pending HR Approval')
    expect(r.next?.hiringManagerApprovedBy).toBe('manali@gsl')
    expect(r.next?.hiringManagerApprovedAt).toBe('2026-05-13T10:00:00Z')
  })

  it('refuses when not assigned HM and not HR/Admin', () => {
    const r = transitionPreOnboardingApproval(existing, {
      kind: 'hiring-manager-approve',
      by: 'x@gsl',
      at: '2026-05-13T10:00:00Z',
    }, RECRUITER)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('only-hm-can-approve')
  })

  it('refuses when status is not Pending Hiring Manager', () => {
    const r = transitionPreOnboardingApproval({ ...existing, status: 'Approved' }, {
      kind: 'hiring-manager-approve',
      by: 'x@gsl',
      at: '2026-05-13T10:00:00Z',
    }, HR)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('cannot-from-Approved')
  })
})

describe('hr-approve', () => {
  const existing: PreOnboardingApproval = {
    status: 'Pending HR Approval',
    ctcConfirmed: 12_50_000,
    joiningDateConfirmed: '2026-06-01',
    locationConfirmed: 'Mumbai',
    positionConfirmed: 'STEM Coach',
    hiringManagerApprovedBy: 'manali@gsl',
    hiringManagerApprovedAt: '2026-05-13T10:00:00Z',
  }

  it('finalises to Approved', () => {
    const r = transitionPreOnboardingApproval(existing, {
      kind: 'hr-approve',
      by: 'shruti@gsl',
      at: '2026-05-13T12:00:00Z',
    }, HR)
    expect(r.ok).toBe(true)
    expect(r.next?.status).toBe('Approved')
    expect(r.next?.hrApprovedBy).toBe('shruti@gsl')
  })

  it('refuses HM-only callers', () => {
    const r = transitionPreOnboardingApproval(existing, {
      kind: 'hr-approve',
      by: 'manali@gsl',
      at: '2026-05-13T12:00:00Z',
    }, HM_ONLY)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('only-hr-can-approve')
  })

  it('cannot fast-track from Pending Hiring Manager', () => {
    const r = transitionPreOnboardingApproval({ ...existing, status: 'Pending Hiring Manager' }, {
      kind: 'hr-approve',
      by: 'shruti@gsl',
      at: '2026-05-13T12:00:00Z',
    }, HR)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('cannot-from-Pending Hiring Manager')
  })
})

describe('reject', () => {
  const existing: PreOnboardingApproval = {
    status: 'Pending Hiring Manager',
    ctcConfirmed: 12_50_000,
    joiningDateConfirmed: '2026-06-01',
    locationConfirmed: 'Mumbai',
    positionConfirmed: 'STEM Coach',
  }

  it('hiring manager rejection captures reason', () => {
    const r = transitionPreOnboardingApproval(existing, {
      kind: 'reject',
      rejectedBy: 'hiring-manager',
      rejectionReason: 'CTC too low.',
    }, HM_ONLY)
    expect(r.ok).toBe(true)
    expect(r.next?.status).toBe('Rejected')
    expect(r.next?.rejectedBy).toBe('hiring-manager')
    expect(r.next?.rejectionReason).toBe('CTC too low.')
  })

  it('refuses HM rejection from a random recruiter', () => {
    const r = transitionPreOnboardingApproval(existing, {
      kind: 'reject',
      rejectedBy: 'hiring-manager',
      rejectionReason: 'x',
    }, RECRUITER)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('cannot-reject-as-hm')
  })

  it('requires a non-empty reason', () => {
    const r = transitionPreOnboardingApproval(existing, {
      kind: 'reject',
      rejectedBy: 'hr',
      rejectionReason: '',
    }, HR)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('reason-required')
  })
})

describe('reset', () => {
  it('Admin can reset from any state', () => {
    const r = transitionPreOnboardingApproval({ status: 'Approved' }, { kind: 'reset' }, ADMIN)
    expect(r.ok).toBe(true)
    expect(r.next?.status).toBe('Not Started')
  })

  it('HR cannot reset', () => {
    const r = transitionPreOnboardingApproval({ status: 'Approved' }, { kind: 'reset' }, HR)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('admin-only')
  })
})

describe('isReadyForOfferIntimation', () => {
  it('false when undefined', () => {
    expect(isReadyForOfferIntimation(undefined)).toBe(false)
  })

  it('false when not yet approved', () => {
    expect(isReadyForOfferIntimation({ status: 'Pending HR Approval' })).toBe(false)
  })

  it('true when approved', () => {
    expect(isReadyForOfferIntimation({ status: 'Approved' })).toBe(true)
  })
})
