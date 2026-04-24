/*
 * Email template registry. Same shape as letterTemplates.ts but for plain-text
 * email bodies + subject lines.
 *
 * Why we don't send email from the app: CLAUDE.md non-negotiable. HR uses
 * their own Outlook / Gmail. We render the subject + body, stick it on the
 * clipboard (or open a mailto: link), and log an audit entry on the candidate
 * noting that a template was rendered for send. HR pastes it into their
 * client and sends.
 *
 * Tokens are {snake_case}; rendering is a simple string replace, not a full
 * template engine. Keeps the surface small and the failure mode obvious.
 *
 * Stage gating (stagesApplicable) is advisory, not enforced: it drives the
 * default dropdown on /candidates/[id] so HR sees stage-appropriate
 * templates first, but every template is always available.
 */

import type { Stage } from './types'

export interface EmailVariable {
  token: string
  label: string
  required: boolean
  hint?: string
  defaultFrom?:
    | 'candidate.name'
    | 'candidate.firstName'
    | 'candidate.email'
    | 'role.title'
    | 'role.department'
    | 'role.location'
    | 'company.name'
    | 'company.hrContact.name'
    | 'company.hrContact.email'
    | 'company.hrContact.whatsapp'
    | 'company.website'
    | 'today'
    | 'hod.name'
  multiline?: boolean
}

export interface EmailTemplate {
  id: string
  title: string
  description: string
  /** Which pipeline stages this template is most useful at. Empty = any. */
  stagesApplicable: Stage[]
  subject: string
  body: string
  variables: EmailVariable[]
  /** Tone: 'warm' for candidate-positive, 'neutral' for scheduling, 'closing' for rejection / offer close. */
  tone: 'warm' | 'neutral' | 'closing'
}

const CANDIDATE_COMMON: EmailVariable[] = [
  { token: 'firstName', label: 'First name', required: true, defaultFrom: 'candidate.firstName' },
  { token: 'roleTitle', label: 'Role title', required: true, defaultFrom: 'role.title' },
  { token: 'companyName', label: 'Company', required: true, defaultFrom: 'company.name' },
  { token: 'hrName', label: 'HR signatory name', required: true, defaultFrom: 'company.hrContact.name' },
  { token: 'hrEmail', label: 'HR signatory email', required: true, defaultFrom: 'company.hrContact.email' },
]

const PORTAL_LINK: EmailVariable = {
  token: 'portalLink',
  label: 'Portal link (magic link)',
  required: false,
  hint: 'Leave blank to issue a fresh link from the portal.',
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'ROUND1-INVITE',
    title: 'Round 1 invite (Shruti to candidate)',
    description: "Opens the conversation. Use when a candidate moves from Sourced / Submitted to Shortlisted and you want to schedule the first chat.",
    stagesApplicable: ['Sourced', 'Shortlisted'],
    tone: 'warm',
    subject: 'Let\'s talk about {roleTitle} at {companyName}',
    body: [
      'Hi {firstName},',
      '',
      'Thanks for your interest in the {roleTitle} role at {companyName}. Your profile caught our eye and we would like to set up a 20-minute introductory conversation to tell you more about the role and hear about what you are looking for.',
      '',
      'Could you share a couple of times that work for you this week or next? I will send across a calendar invite.',
      '',
      'Warm regards,',
      '{hrName}',
      '{hrEmail}',
    ].join('\n'),
    variables: CANDIDATE_COMMON,
  },
  {
    id: 'SHORTLIST-ADVANCE',
    title: 'Shortlisted, moving to assessment',
    description: "After the first conversation, telling the candidate they've passed Round 1 and outlining the next step (assessment / HOD round).",
    stagesApplicable: ['Shortlisted', 'AssessmentSent'],
    tone: 'warm',
    subject: 'Next step for {roleTitle} at {companyName}',
    body: [
      'Hi {firstName},',
      '',
      'Really enjoyed our conversation. We would like to move forward with the next step for the {roleTitle} role.',
      '',
      'The next stage is {nextStepDescription}. I will follow up with specifics in the next 24 hours.',
      '',
      'Thanks for your patience.',
      '',
      'Warm regards,',
      '{hrName}',
      '{hrEmail}',
    ].join('\n'),
    variables: [
      ...CANDIDATE_COMMON,
      { token: 'nextStepDescription', label: 'Next step (one line)', required: true, hint: 'e.g., a short assignment we will share over email', multiline: false },
    ],
  },
  {
    id: 'ASSESSMENT-INVITE',
    title: 'Assessment invite',
    description: "Sends the assessment file / brief. Attach the file separately — the template does not embed it.",
    stagesApplicable: ['Shortlisted', 'AssessmentSent'],
    tone: 'neutral',
    subject: 'Assignment for {roleTitle} — {companyName}',
    body: [
      'Hi {firstName},',
      '',
      'As discussed, please find the assignment for the {roleTitle} role attached. You have {deadlineDays} days from today to submit.',
      '',
      'A few notes before you start:',
      '  - Use your own words. We are not checking against a rubric of right answers; we are looking for how you think.',
      '  - The assignment should take {effortHours} hours of focused work, no more.',
      '  - If anything is unclear, reply to this email and I will clarify same-day.',
      '',
      'Reply to this email with your submission as a single PDF.',
      '',
      'All the best,',
      '{hrName}',
      '{hrEmail}',
    ].join('\n'),
    variables: [
      ...CANDIDATE_COMMON,
      { token: 'deadlineDays', label: 'Days to complete', required: true, hint: 'e.g., 5' },
      { token: 'effortHours', label: 'Estimated effort (hours)', required: true, hint: 'e.g., 3-4' },
    ],
  },
  {
    id: 'HOD-INTERVIEW-INVITE',
    title: 'HOD interview invite',
    description: "Scheduling the interview with the department head. Fill in HOD name + proposed times.",
    stagesApplicable: ['AssessmentDone', 'VideoDone', 'HODRoundScheduled'],
    tone: 'neutral',
    subject: 'HOD interview for {roleTitle} — {companyName}',
    body: [
      'Hi {firstName},',
      '',
      'Thanks for completing the earlier stages. The next step is a conversation with {hodName}, who leads the {roleDepartment} team at {companyName}. The conversation usually runs 45 minutes and focuses on {focusAreas}.',
      '',
      'Please let me know which of the following times works for you:',
      '  {slot1}',
      '  {slot2}',
      '  {slot3}',
      '',
      'I will send a calendar invite once you confirm.',
      '',
      'Warm regards,',
      '{hrName}',
      '{hrEmail}',
    ].join('\n'),
    variables: [
      ...CANDIDATE_COMMON,
      { token: 'hodName', label: 'HOD name', required: true, defaultFrom: 'hod.name' },
      { token: 'roleDepartment', label: 'Department', required: true, defaultFrom: 'role.department' },
      { token: 'focusAreas', label: 'Focus areas (one line)', required: true, hint: 'e.g., your teaching experience and how you structure a Grade 9 lesson' },
      { token: 'slot1', label: 'Slot 1', required: true, hint: 'e.g., Tuesday 28 Apr, 4:30 PM IST' },
      { token: 'slot2', label: 'Slot 2', required: true },
      { token: 'slot3', label: 'Slot 3', required: true },
    ],
  },
  {
    id: 'HR-INTERVIEW-INVITE',
    title: 'HR interview invite (final round)',
    description: "Scheduling the closing HR conversation after HOD has signed off.",
    stagesApplicable: ['HODRoundDone', 'HOD2RoundDone', 'HRRoundScheduled'],
    tone: 'neutral',
    subject: 'Final round for {roleTitle} — {companyName}',
    body: [
      'Hi {firstName},',
      '',
      'Great news: {hodName} has given the thumbs-up. The last step is a conversation with our HR team to align on compensation, joining date, and any questions you have about the company.',
      '',
      'Please pick a slot:',
      '  {slot1}',
      '  {slot2}',
      '  {slot3}',
      '',
      'Looking forward to this.',
      '',
      'Warm regards,',
      '{hrName}',
      '{hrEmail}',
    ].join('\n'),
    variables: [
      ...CANDIDATE_COMMON,
      { token: 'hodName', label: 'HOD name (who cleared)', required: true, defaultFrom: 'hod.name' },
      { token: 'slot1', label: 'Slot 1', required: true },
      { token: 'slot2', label: 'Slot 2', required: true },
      { token: 'slot3', label: 'Slot 3', required: true },
    ],
  },
  {
    id: 'POLITE-REJECT-PRE-INTERVIEW',
    title: 'Polite reject (pre-interview)',
    description: "Declining a candidate before the HOD round. Kind, honest, brief.",
    stagesApplicable: ['Sourced', 'Shortlisted', 'AssessmentSent', 'AssessmentDone', 'VideoSent', 'VideoDone'],
    tone: 'closing',
    subject: 'Update on your {roleTitle} application',
    body: [
      'Hi {firstName},',
      '',
      'Thank you for the time you put into applying for the {roleTitle} role at {companyName}.',
      '',
      'We have decided to move forward with other candidates for this role. This is not a reflection of your experience or the quality of your submission; we had a strong pool and had to make a call.',
      '',
      'I will keep your profile on file and will get in touch if a more suitable role opens up. You are welcome to apply for other openings at {companyWebsite}/careers.',
      '',
      'Thank you again and all the best.',
      '',
      '{hrName}',
      '{hrEmail}',
    ].join('\n'),
    variables: [
      ...CANDIDATE_COMMON,
      { token: 'companyWebsite', label: 'Company website', required: true, defaultFrom: 'company.website' },
    ],
  },
  {
    id: 'POLITE-REJECT-POST-INTERVIEW',
    title: 'Polite reject (post-interview)',
    description: "Declining after the HOD round. More specific than pre-interview; acknowledges the time the candidate invested.",
    stagesApplicable: ['HODRoundDone', 'HOD2RoundDone', 'HRRoundDone'],
    tone: 'closing',
    subject: 'Update on your {roleTitle} application',
    body: [
      'Hi {firstName},',
      '',
      'Thank you for the time you invested in the {roleTitle} process, including your conversation with our team.',
      '',
      'We have decided to move forward with another candidate for this role. It was a close call and we enjoyed meeting you.',
      '',
      '{optionalFeedback}',
      '',
      'We will keep your profile on file and will reach out if a better-fit role opens up.',
      '',
      'Thank you again.',
      '',
      '{hrName}',
      '{hrEmail}',
    ].join('\n'),
    variables: [
      ...CANDIDATE_COMMON,
      { token: 'optionalFeedback', label: 'Optional specific feedback (one paragraph)', required: false, multiline: true, hint: 'Leave blank if not sharing feedback this round.' },
    ],
  },
  {
    id: 'OFFER-ANNOUNCE',
    title: 'Offer email (with letter attached)',
    description: "Announces the offer. Attach the generated .docx appointment letter separately.",
    stagesApplicable: ['HRRoundDone', 'Offered'],
    tone: 'warm',
    subject: 'Offer letter: {roleTitle} at {companyName}',
    body: [
      'Hi {firstName},',
      '',
      'Delighted to share the formal offer for the {roleTitle} role at {companyName}.',
      '',
      'Key terms are in the attached appointment letter:',
      '  - Designation: {designation}',
      '  - Annual CTC: Rs. {ctcAnnual}',
      '  - Proposed joining date: {proposedJoiningDate}',
      '',
      'Please review and, if everything looks good, sign and return the letter by {responseDeadline}. Do reach out if you have any questions at all — happy to jump on a quick call.',
      '',
      'We are looking forward to having you on the team.',
      '',
      '{hrName}',
      '{hrEmail}',
    ].join('\n'),
    variables: [
      ...CANDIDATE_COMMON,
      { token: 'designation', label: 'Designation (on letter)', required: true },
      { token: 'ctcAnnual', label: 'Annual CTC (Indian comma, e.g., 6,00,000)', required: true },
      { token: 'proposedJoiningDate', label: 'Proposed joining date (long form)', required: true, hint: 'e.g., 2nd June 2026' },
      { token: 'responseDeadline', label: 'Response deadline', required: true, hint: 'e.g., 5th May 2026' },
    ],
  },
  {
    id: 'JOINING-CONFIRM',
    title: 'Joining confirmation (Day 1 details)',
    description: "Sent after OfferAccepted. Day 1 logistics.",
    stagesApplicable: ['OfferAccepted', 'DocsCollected'],
    tone: 'warm',
    subject: 'Welcome to {companyName} — Day 1 details',
    body: [
      'Hi {firstName},',
      '',
      'So pleased you are joining us. Here is what Day 1 looks like:',
      '',
      '  Date: {startDate}',
      '  Reporting time: {reportingTime}',
      '  Location: {reportingLocation}',
      '  Who to ask for: {reportingContact}',
      '',
      'Please bring the following:',
      '{documentsList}',
      '',
      'On the evening before Day 1 you will receive your email and laptop-setup instructions. If anything is unclear, WhatsApp me on {hrWhatsapp}.',
      '',
      'See you soon.',
      '',
      '{hrName}',
      '{hrEmail}',
    ].join('\n'),
    variables: [
      ...CANDIDATE_COMMON,
      { token: 'startDate', label: 'Start date (long form)', required: true },
      { token: 'reportingTime', label: 'Reporting time', required: true, hint: 'e.g., 9:30 AM' },
      { token: 'reportingLocation', label: 'Reporting location', required: true, hint: 'Full address' },
      { token: 'reportingContact', label: 'Reporting contact', required: true },
      { token: 'documentsList', label: 'Documents list (multi-line)', required: true, multiline: true, hint: 'One per line' },
      { token: 'hrWhatsapp', label: 'HR WhatsApp', required: true, defaultFrom: 'company.hrContact.whatsapp' },
    ],
  },
  {
    id: 'GHOST-FOLLOW-UP',
    title: 'Nudge — no response in a while',
    description: "Used when a candidate has gone silent at any stage. Gentle, one-shot.",
    stagesApplicable: [],
    tone: 'neutral',
    subject: 'Still interested in {roleTitle}, {firstName}?',
    body: [
      'Hi {firstName},',
      '',
      'Circling back on your {roleTitle} application with {companyName}. We had not heard from you on {lastAction} and wanted to check in — are you still interested in this role?',
      '',
      'If yes, no problem, just reply to this email and we will pick up where we left off. If you have decided to move in a different direction, that is completely fine too; a quick reply helps me close the loop on our end.',
      '',
      'Thank you.',
      '',
      '{hrName}',
      '{hrEmail}',
    ].join('\n'),
    variables: [
      ...CANDIDATE_COMMON,
      { token: 'lastAction', label: 'What was the last thing pending', required: true, hint: 'e.g., the HOD interview slot confirmation, the assignment submission' },
    ],
  },
]

export function findEmailTemplateById(id: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((t) => t.id === id)
}

/** Templates sorted with stage-applicable ones first. */
export function orderByRelevance(stage: Stage | null): EmailTemplate[] {
  if (!stage) return EMAIL_TEMPLATES
  const applicable: EmailTemplate[] = []
  const rest: EmailTemplate[] = []
  for (const t of EMAIL_TEMPLATES) {
    if (t.stagesApplicable.includes(stage)) applicable.push(t)
    else rest.push(t)
  }
  return [...applicable, ...rest]
}

export function renderTokens(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key: string) => {
    const v = values[key]
    return v == null ? `{${key}}` : v
  })
}
