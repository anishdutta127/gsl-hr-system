/*
 * Pure helper that derives the unlock state for each of the four
 * pre-onboarding email templates from an Application snapshot.
 *
 * Used by the candidate detail page to render the four send buttons, and
 * unit-tested independently so the chain rules cannot drift quietly.
 *
 * Chain semantics:
 *   - offer-intimation: 'locked' until preOnboardingApproval.status === 'Approved',
 *     'unlocked' once approved (and not yet sent), 'sent' once HR has fired the draft.
 *   - offer-followup: 'locked' until offer-intimation has been sent. Stays 'unlocked'
 *     as long as the candidate has not yet accepted (HR judgement when to chase).
 *     Once response === 'Accepted', the follow-up purpose is moot, so it locks again.
 *     Tracked as 'sent' if the draft has been fired regardless.
 *   - appointment-letter: 'locked' until candidateOfferResponse.response === 'Accepted',
 *     'unlocked' once accepted and not yet sent, 'sent' once fired.
 *   - notice-period-checkin: 'locked' until appointment-letter has been sent,
 *     'unlocked' afterwards, 'sent' once fired. No upper bound — HR can fire
 *     this repeatedly during the notice window (later sends still log).
 */

import type { Application } from '../types'

export type UnlockStatus = 'locked' | 'unlocked' | 'sent'

export interface EmailUnlockState {
  intimation: UnlockStatus
  followup: UnlockStatus
  appointment: UnlockStatus
  noticeCheckin: UnlockStatus
}

export function getEmailUnlockState(application: Application): EmailUnlockState {
  const sends = application.preOnboardingEmails ?? []
  const hasIntimation = sends.some((s) => s.templateId === 'offer-intimation')
  const hasFollowup = sends.some((s) => s.templateId === 'offer-followup')
  const hasAppointment = sends.some((s) => s.templateId === 'appointment-letter')
  const hasNoticeCheckin = sends.some((s) => s.templateId === 'notice-period-checkin')

  const approved = application.preOnboardingApproval?.status === 'Approved'
  const accepted = application.candidateOfferResponse?.response === 'Accepted'

  const intimation: UnlockStatus = hasIntimation
    ? 'sent'
    : approved
      ? 'unlocked'
      : 'locked'

  // Follow-up is meaningful between "intimation sent" and "candidate accepted".
  // Once accepted, the follow-up purpose is gone (we move to appointment letter).
  // If HR did fire the follow-up before acceptance, we record that as 'sent'
  // and keep it locked thereafter.
  const followup: UnlockStatus = hasFollowup
    ? 'sent'
    : hasIntimation && !accepted
      ? 'unlocked'
      : 'locked'

  const appointment: UnlockStatus = hasAppointment
    ? 'sent'
    : accepted
      ? 'unlocked'
      : 'locked'

  const noticeCheckin: UnlockStatus = hasNoticeCheckin
    ? 'sent'
    : hasAppointment
      ? 'unlocked'
      : 'locked'

  return { intimation, followup, appointment, noticeCheckin }
}
