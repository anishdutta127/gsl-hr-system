/*
 * Builds the mailto: URL the recruiter opens via the "Send feedback request"
 * button. Pre-fills the hiring manager's email, a subject + body that
 * names the candidate, the role, the current stage, and a link back to
 * the candidate page so the hiring manager can submit feedback in one click.
 *
 * Pure; called from a Server Component to render an <a href> the client
 * navigates to. Subject + body are URL-encoded by the helper so callers
 * don't have to.
 *
 * mailto: cannot carry CC / attachments — those would silently be dropped
 * by some mail clients. We keep this single-recipient + body-only and let
 * HR's email client open with the draft to review and send.
 */

import { loadCompany } from './company'

export interface FeedbackRequestMailtoArgs {
  toEmail: string
  toName: string
  candidateName: string
  candidateId: string
  roleTitle: string
  stage: string
  roundLabel: string
  recruiterEmail: string
  /** Override for tests; falls back to NEXT_PUBLIC_APP_URL || empty. */
  appBaseUrl?: string
}

export function buildFeedbackRequestMailto(args: FeedbackRequestMailtoArgs): string {
  const company = loadCompany().name
  const candidateUrl = buildCandidateUrl(args.candidateId, args.appBaseUrl)
  const firstName = args.toName.split(/\s+/)[0] ?? 'there'
  const subject = `Feedback request: ${args.candidateName} (${args.roleTitle}, ${args.roundLabel} round)`
  const body = [
    `Hi ${firstName},`,
    '',
    `Could you submit your ${args.roundLabel} feedback for ${args.candidateName} (${args.roleTitle})?`,
    '',
    `They are currently at stage "${args.stage}" and we need your read before moving them forward.`,
    '',
    candidateUrl
      ? `Open the candidate: ${candidateUrl}`
      : 'Open their record in the GSL HR system to submit.',
    '',
    `Thanks,`,
    args.recruiterEmail,
    company,
  ].join('\n')

  const params = new URLSearchParams({ subject, body })
  return `mailto:${encodeURIComponent(args.toEmail)}?${params.toString()}`
}

function buildCandidateUrl(candidateId: string, override?: string): string {
  const base =
    override ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_BASE_URL ?? ''
  if (!base) return ''
  return `${base.replace(/\/$/, '')}/candidates/${candidateId}`
}
