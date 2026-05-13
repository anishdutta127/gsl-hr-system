import { describe, expect, it } from 'vitest'
import { getEmailUnlockState } from '../preOnboardingEmails/unlockState'
import type {
  Application,
  PreOnboardingApproval,
  PreOnboardingEmailSend,
  CandidateOfferResponse,
} from '../types'

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'a1',
    candidateId: 'c1',
    roleId: 'r1',
    currentStage: 'HRRoundDone',
    stageEnteredAt: '2026-05-01T09:00:00Z',
    createdAt: '2026-04-01T09:00:00Z',
    createdBy: 'shruti@gsl',
    auditLog: [],
    ...overrides,
  }
}

const APPROVED: PreOnboardingApproval = {
  status: 'Approved',
  ctcConfirmed: 12_50_000,
  joiningDateConfirmed: '2026-06-01',
  locationConfirmed: 'Mumbai',
  positionConfirmed: 'STEM Coach',
  hiringManagerApprovedBy: 'shashank@gsl',
  hiringManagerApprovedAt: '2026-05-05T09:00:00Z',
  hrApprovedBy: 'riddhi@gsl',
  hrApprovedAt: '2026-05-06T09:00:00Z',
}

const PENDING_HM: PreOnboardingApproval = {
  status: 'Pending Hiring Manager',
  ctcConfirmed: 12_50_000,
  joiningDateConfirmed: '2026-06-01',
  locationConfirmed: 'Mumbai',
  positionConfirmed: 'STEM Coach',
}

const ACCEPTED: CandidateOfferResponse = {
  response: 'Accepted',
  responseDate: '2026-05-09',
  recordedBy: 'shruti@gsl',
  recordedAt: '2026-05-09T10:00:00Z',
}

const DECLINED: CandidateOfferResponse = {
  response: 'Declined',
  responseDate: '2026-05-09',
  recordedBy: 'shruti@gsl',
  recordedAt: '2026-05-09T10:00:00Z',
}

function send(templateId: PreOnboardingEmailSend['templateId']): PreOnboardingEmailSend {
  return {
    templateId,
    sentAt: '2026-05-07T09:00:00Z',
    sentBy: 'shruti@gsl',
    subject: `Test subject for ${templateId}`,
    attachmentsClaimed: [],
  }
}

describe('getEmailUnlockState', () => {
  it('all locked when no approval and no sends', () => {
    const state = getEmailUnlockState(makeApp())
    expect(state).toEqual({
      intimation: 'locked',
      followup: 'locked',
      appointment: 'locked',
      noticeCheckin: 'locked',
    })
  })

  it('intimation stays locked while approval is Pending Hiring Manager', () => {
    const state = getEmailUnlockState(makeApp({ preOnboardingApproval: PENDING_HM }))
    expect(state.intimation).toBe('locked')
  })

  it('intimation unlocks once approval status is Approved', () => {
    const state = getEmailUnlockState(makeApp({ preOnboardingApproval: APPROVED }))
    expect(state.intimation).toBe('unlocked')
    expect(state.followup).toBe('locked')
    expect(state.appointment).toBe('locked')
    expect(state.noticeCheckin).toBe('locked')
  })

  it('intimation becomes "sent" once the offer-intimation has been recorded', () => {
    const state = getEmailUnlockState(
      makeApp({
        preOnboardingApproval: APPROVED,
        preOnboardingEmails: [send('offer-intimation')],
      }),
    )
    expect(state.intimation).toBe('sent')
  })

  it('followup unlocks after intimation sent and no candidate response yet', () => {
    const state = getEmailUnlockState(
      makeApp({
        preOnboardingApproval: APPROVED,
        preOnboardingEmails: [send('offer-intimation')],
      }),
    )
    expect(state.followup).toBe('unlocked')
  })

  it('followup locks once candidate response is Accepted (purpose moot)', () => {
    const state = getEmailUnlockState(
      makeApp({
        preOnboardingApproval: APPROVED,
        preOnboardingEmails: [send('offer-intimation')],
        candidateOfferResponse: ACCEPTED,
      }),
    )
    expect(state.followup).toBe('locked')
  })

  it('followup stays unlocked when candidate is Declined or Negotiating', () => {
    const state = getEmailUnlockState(
      makeApp({
        preOnboardingApproval: APPROVED,
        preOnboardingEmails: [send('offer-intimation')],
        candidateOfferResponse: DECLINED,
      }),
    )
    expect(state.followup).toBe('unlocked')
  })

  it('followup recorded as sent when HR has fired the draft', () => {
    const state = getEmailUnlockState(
      makeApp({
        preOnboardingApproval: APPROVED,
        preOnboardingEmails: [send('offer-intimation'), send('offer-followup')],
      }),
    )
    expect(state.followup).toBe('sent')
  })

  it('appointment unlocks once candidate response is Accepted', () => {
    const state = getEmailUnlockState(
      makeApp({
        preOnboardingApproval: APPROVED,
        preOnboardingEmails: [send('offer-intimation')],
        candidateOfferResponse: ACCEPTED,
      }),
    )
    expect(state.appointment).toBe('unlocked')
  })

  it('appointment "sent" when appointment-letter entry present', () => {
    const state = getEmailUnlockState(
      makeApp({
        preOnboardingApproval: APPROVED,
        preOnboardingEmails: [send('offer-intimation'), send('appointment-letter')],
        candidateOfferResponse: ACCEPTED,
      }),
    )
    expect(state.appointment).toBe('sent')
  })

  it('noticeCheckin unlocks once appointment-letter has been sent', () => {
    const state = getEmailUnlockState(
      makeApp({
        preOnboardingApproval: APPROVED,
        preOnboardingEmails: [send('offer-intimation'), send('appointment-letter')],
        candidateOfferResponse: ACCEPTED,
      }),
    )
    expect(state.noticeCheckin).toBe('unlocked')
  })

  it('noticeCheckin recorded as sent when entry present', () => {
    const state = getEmailUnlockState(
      makeApp({
        preOnboardingApproval: APPROVED,
        preOnboardingEmails: [
          send('offer-intimation'),
          send('appointment-letter'),
          send('notice-period-checkin'),
        ],
        candidateOfferResponse: ACCEPTED,
      }),
    )
    expect(state.noticeCheckin).toBe('sent')
  })

  it('cannot skip the chain: appointment stays locked even with intimation sent if not accepted', () => {
    const state = getEmailUnlockState(
      makeApp({
        preOnboardingApproval: APPROVED,
        preOnboardingEmails: [send('offer-intimation')],
      }),
    )
    expect(state.appointment).toBe('locked')
    expect(state.noticeCheckin).toBe('locked')
  })

  it('full happy path: all four progress through to sent', () => {
    const state = getEmailUnlockState(
      makeApp({
        preOnboardingApproval: APPROVED,
        preOnboardingEmails: [
          send('offer-intimation'),
          send('offer-followup'),
          send('appointment-letter'),
          send('notice-period-checkin'),
        ],
        candidateOfferResponse: ACCEPTED,
      }),
    )
    expect(state).toEqual({
      intimation: 'sent',
      followup: 'sent',
      appointment: 'sent',
      noticeCheckin: 'sent',
    })
  })
})
