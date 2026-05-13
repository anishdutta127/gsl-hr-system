/*
 * Pre-onboarding email template system.
 *
 * Four templates extracted verbatim from the Shruti-supplied reference PDFs:
 *   offer-intimation, offer-followup, appointment-letter,
 *   notice-period-checkin.
 *
 * Each template is a markdown file under ./templates/ with a SUBJECT: line
 * on top and the body below. Placeholders use {{variableName}}. The
 * renderer fills placeholders from a Candidate + Application + active
 * user + organisation context object.
 *
 * The output is plain text - these go via mailto: in Phase 1, so HTML
 * would not survive the user's mail client anyway. The send-email modal
 * lets HR edit subject and body before firing the mailto:.
 */

import { formatRs, formatDate } from '../format'
import { loadCompany } from '../company'
import { amountToWordsIndian } from './amountInWords'
import { TEMPLATE_BODIES } from './templates'

export const PRE_ONBOARDING_TEMPLATE_IDS = [
  'offer-intimation',
  'offer-followup',
  'appointment-letter',
  'notice-period-checkin',
] as const

export type PreOnboardingTemplateId = (typeof PRE_ONBOARDING_TEMPLATE_IDS)[number]

/** Suggested attachments per template. Surfaces in the modal as checkboxes
 * - HR picks which ones they will actually attach (mailto: cannot carry
 * attachments, so this is a checklist for the user, not a payload). */
export const TEMPLATE_ATTACHMENT_SUGGESTIONS: Record<PreOnboardingTemplateId, string[]> = {
  'offer-intimation': [
    'New Joinee Form (Excel)',
    'PF Declaration Form',
    'Investment Declaration - Form 12BB',
    'Medical Policy Nomination Form',
  ],
  'offer-followup': [],
  'appointment-letter': ['Appointment letter (PDF)'],
  'notice-period-checkin': [],
}

/** Required fields a caller must supply before rendering. Used by the
 * modal to validate that the form is complete before enabling Send. */
export const REQUIRED_FIELDS_PER_TEMPLATE: Record<PreOnboardingTemplateId, string[]> = {
  'offer-intimation': [
    'candidateName',
    'positionTitle',
    'location',
    'joiningDate',
    'ctcAmount',
    'recruiterName',
    'recruiterEmail',
  ],
  'offer-followup': [
    'candidateName',
    'positionTitle',
    'offerIntimationDate',
    'recruiterName',
    'recruiterEmail',
  ],
  'appointment-letter': [
    'candidateName',
    'positionTitle',
    'appointmentReturnByDate',
    'recruiterName',
    'recruiterEmail',
  ],
  'notice-period-checkin': [
    'candidateName',
    'positionTitle',
    'recruiterName',
    'recruiterEmail',
  ],
}

export interface TemplateContext {
  candidateName: string
  positionTitle: string
  location?: string
  joiningDate?: string
  /** Annual CTC in rupees (integer). The renderer formats it Indian-style
   * and derives the in-words string. */
  ctcAmount?: number
  /** Date the offer intimation was first sent - used by the follow-up
   * template's "our earlier communication dated" line. */
  offerIntimationDate?: string
  /** Deadline by which the candidate should return the signed appointment
   * letter - used by the appointment-letter template. */
  appointmentReturnByDate?: string
  recruiterName: string
  recruiterEmail: string
}

export interface RenderedEmail {
  subject: string
  body: string
  attachmentSuggestions: string[]
}

function readTemplate(id: PreOnboardingTemplateId): string {
  return TEMPLATE_BODIES[id]
}

/** Look at a candidate context object and return the list of fields that
 * MUST be supplied but are missing or blank. Used by the modal to
 * enable / disable the Send button. */
export function getMissingFieldsForTemplate(
  id: PreOnboardingTemplateId,
  ctx: Partial<TemplateContext>,
): string[] {
  const required = REQUIRED_FIELDS_PER_TEMPLATE[id]
  return required.filter((k) => {
    const v = (ctx as Record<string, unknown>)[k]
    if (v === undefined || v === null) return true
    if (typeof v === 'string' && !v.trim()) return true
    if (typeof v === 'number' && (!Number.isFinite(v) || v <= 0)) return true
    return false
  })
}

/** Render a template against a context. Throws when required fields are
 * missing - callers should call getMissingFieldsForTemplate first. */
export function renderEmailTemplate(
  id: PreOnboardingTemplateId,
  ctx: TemplateContext,
): RenderedEmail {
  const missing = getMissingFieldsForTemplate(id, ctx)
  if (missing.length > 0) {
    throw new Error(`Missing required fields for ${id}: ${missing.join(', ')}`)
  }

  const company = loadCompany()
  const tokens: Record<string, string> = {
    candidateName: ctx.candidateName,
    positionTitle: ctx.positionTitle,
    location: ctx.location ?? '',
    joiningDate: ctx.joiningDate ? formatDate(toISODate(ctx.joiningDate)) : '',
    ctcAmount:
      ctx.ctcAmount !== undefined ? formatRs(ctx.ctcAmount, { bare: true }) : '',
    ctcInWords:
      ctx.ctcAmount !== undefined ? amountToWordsIndian(ctx.ctcAmount) : '',
    offerIntimationDate: ctx.offerIntimationDate
      ? formatDate(toISODate(ctx.offerIntimationDate))
      : '',
    appointmentReturnByDate: ctx.appointmentReturnByDate
      ? formatDate(toISODate(ctx.appointmentReturnByDate))
      : '',
    recruiterName: ctx.recruiterName,
    recruiterEmail: ctx.recruiterEmail,
    companyName: company.name,
  }

  const raw = readTemplate(id)
  const filled = fillPlaceholders(raw, tokens)
  return splitSubjectAndBody(filled, TEMPLATE_ATTACHMENT_SUGGESTIONS[id])
}

function fillPlaceholders(input: string, tokens: Record<string, string>): string {
  return input.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (key in tokens) {
      return tokens[key] ?? ''
    }
    // Unknown placeholder: leave as-is so a template typo is loud at
    // review time rather than silently dropped.
    return `{{${key}}}`
  })
}

function splitSubjectAndBody(
  raw: string,
  attachmentSuggestions: string[],
): RenderedEmail {
  const lines = raw.split(/\r?\n/)
  let subject = ''
  const bodyStart = (() => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (line.toUpperCase().startsWith('SUBJECT:')) {
        subject = line.slice('SUBJECT:'.length).trim()
        return i + 1
      }
    }
    return 0
  })()
  // Skip a blank line after the SUBJECT: header so the body starts at the
  // greeting.
  let firstBody = bodyStart
  while (firstBody < lines.length && (lines[firstBody] ?? '').trim() === '') {
    firstBody++
  }
  const body = lines.slice(firstBody).join('\n').replace(/\n+$/, '\n')
  return { subject, body, attachmentSuggestions }
}

function toISODate(input: string): string {
  // Accepts either an ISO date already, a yyyy-mm-dd, or a Date string;
  // returns the ISO so formatDate can parse it. Falls back to today on
  // parse failure (formatDate then returns '-').
  if (!input) return ''
  const direct = new Date(input)
  if (!Number.isNaN(direct.getTime())) return direct.toISOString()
  return input
}
