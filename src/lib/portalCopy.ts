/*
 * Candidate-facing copy for portal surfaces. Plain English. No corporate
 * softening (DESIGN.md AI slop blacklist). Every sentence passes the
 * 5-second test: would a 22-year-old recommend this process to a friend?
 */

import type { Application, Stage } from './types'
import { isTerminal } from './pipeline'

export function stagePlainEnglish(stage: Stage): string {
  switch (stage) {
    case 'Sourced':
      return "We've received your application. HR will review it shortly."
    case 'Shortlisted':
      return 'You are shortlisted. We will be in touch to share next steps.'
    case 'AssessmentSent':
      return 'There is a short take-home assessment waiting for you.'
    case 'AssessmentDone':
      return 'Your assessment is in. We are reviewing it now.'
    case 'VideoSent':
      return 'We have asked you to record a short video. Link it here when done.'
    case 'VideoDone':
      return 'Your video is in. Interviews come next.'
    case 'HODRoundScheduled':
      return 'Your interview with the team lead is scheduled.'
    case 'HODRoundDone':
      return 'Interview complete. We will share next steps soon.'
    case 'HRRoundScheduled':
      return 'Your HR round is scheduled.'
    case 'HRRoundDone':
      return 'HR round complete. We will confirm next steps.'
    case 'Offered':
      return 'An offer is on its way.'
    case 'OfferAccepted':
      return 'You have accepted the offer. We are preparing for your Day 1.'
    case 'DocsCollected':
      return 'Your joining documents are received. See you soon.'
    case 'Joined':
      return 'Welcome aboard.'
    case 'Rejected':
      return 'Application ended.'
    case 'OnHold':
      return 'Application on hold. We will be back in touch.'
    case 'Withdrawn':
      return 'You withdrew from this role.'
    case 'NotInterested':
      return 'You indicated you are no longer interested.'
    default:
      return ''
  }
}

export interface NextCandidateAction {
  description: string
  cta?: string
  href?: string
}

export function nextCandidateAction(app: Application): NextCandidateAction | null {
  if (isTerminal(app.currentStage)) return null
  switch (app.currentStage) {
    case 'AssessmentSent':
      return {
        description:
          'Take the short assessment we have prepared. It should take about 60 minutes.',
        cta: 'Start assessment',
        href: `/portal/assessment/${app.id}`,
      }
    case 'VideoSent':
      return {
        description:
          'Record a short (60-90 second) introduction video on Drive, OneDrive, or SharePoint and paste the share link.',
        cta: 'Submit video link',
        href: `/portal/video/${app.id}`,
      }
    case 'Offered':
      return {
        description:
          'Check your email for the offer letter. You can accept or decline from there.',
      }
    default:
      return { description: 'Nothing to do from your side right now. We will reach out.' }
  }
}
