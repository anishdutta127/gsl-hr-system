/*
 * Core type definitions for GSL HR System.
 *
 * Flat-file-per-entity data model (Option A, locked in /plan-eng-review).
 * Every entity file in src/data/ is an array of these records. Reads filter
 * by ID or foreign key in application code; writes go through the queue.
 */

// --- Pipeline stages -----------------------------------------------------

export const DEFAULT_PIPELINE_STAGES = [
  'Sourced',
  'Shortlisted',
  'AssessmentSent',
  'AssessmentDone',
  'VideoSent',
  'VideoDone',
  'HODRoundScheduled',
  'HODRoundDone',
  'HRRoundScheduled',
  'HRRoundDone',
  'Offered',
  'OfferAccepted',
  'DocsCollected',
  'Joined',
] as const

export const TERMINAL_STAGES = [
  'Rejected',
  'OnHold',
  'NotInterested',
  'Withdrawn',
  'Joined',
] as const

export type DefaultStage = (typeof DEFAULT_PIPELINE_STAGES)[number]
export type TerminalStage = (typeof TERMINAL_STAGES)[number]
export type Stage = DefaultStage | TerminalStage | string

// --- Candidate source enum -----------------------------------------------

export const CANDIDATE_SOURCES = [
  'Naukri',
  'Referral',
  'Educohire',
  'Careerchoice',
  'HRTeam',
  'Application',
  'CSS',
  'Other',
] as const

export type CandidateSource = (typeof CANDIDATE_SOURCES)[number]

// --- Staff users + roles --------------------------------------------------

export type StaffRole = 'Admin' | 'HR' | 'HOD' | 'Leadership'

export interface User {
  id: string
  email: string
  name: string
  role: StaffRole
  bcryptHash: string
  createdAt: string
  lastLoginAt?: string
  /** For HODs: which role-ids they own. Empty for other roles. */
  ownedRoleIds?: string[]
  /** Soft-delete flag. Deactivated users can't log in; records preserved for audit. */
  active: boolean
  auditLog: AuditEntry[]
}

// --- Role master ---------------------------------------------------------

export interface RubricCriterion {
  id: string
  name: string
  weight: number
  scale: 'stars-1-5' | 'score-1-10' | 'yes-no'
}

export interface Role {
  id: string
  title: string
  department: string
  hodUserId?: string
  location: 'Mumbai' | 'Delhi' | 'Bengaluru' | 'Remote' | 'Hybrid' | string
  employmentType: 'Full-time' | 'Part-time' | 'Contract' | 'Internship'
  status: 'Open' | 'Closed' | 'Draft'
  pipelineStages: Stage[]
  rubric: RubricCriterion[]
  salaryRange?: {
    min: number
    max: number
    currency: 'INR'
    period: 'annual' | 'monthly'
    /** When true, range displayed on /careers. When false, shown as 'Shared at first interview.' */
    disclose: boolean
  }
  description: string
  responsibilities: string[]
  mustHaves: string[]
  niceToHaves: string[]
  createdAt: string
  createdBy: string
  auditLog: AuditEntry[]
}

// --- Candidate -----------------------------------------------------------

export interface Candidate {
  id: string
  name: string
  email: string
  phone: string
  source: CandidateSource
  resumeFilePath?: string
  notes?: string
  createdAt: string
  createdBy: string
  auditLog: AuditEntry[]
}

// --- Application (candidate × role × stage) -------------------------------

export interface Application {
  id: string
  candidateId: string
  roleId: string
  currentStage: Stage
  stageEnteredAt: string
  createdAt: string
  createdBy: string
  auditLog: AuditEntry[]
  /** Stage transition history as queue writes land, newest first in each entry's auditLog. */
}

// --- Audit log entry ------------------------------------------------------

export interface AuditEntry {
  timestamp: string
  user: string
  action: string
  before?: unknown
  after?: unknown
  notes?: string
}

// --- Interview (HOD rubric scoring, freeform notes) -----------------------

export interface InterviewScore {
  criterionId: string
  value: number | 'yes' | 'no'
}

export type InterviewRound = 'HOD' | 'HR' | 'Final' | 'Panel' | string

export interface Interview {
  id: string
  applicationId: string
  roleId: string
  candidateId: string
  round: InterviewRound
  interviewerUserId: string
  scheduledAt?: string
  conductedAt?: string
  scores: InterviewScore[]
  notes: string
  recommendation: 'proceed' | 'hold' | 'reject'
  aggregateScore?: number
  createdAt: string
  createdBy: string
  auditLog: AuditEntry[]
}

// --- Offer ---------------------------------------------------------------

export interface Offer {
  id: string
  applicationId: string
  candidateId: string
  roleId: string
  status: 'Draft' | 'Approved' | 'Generated' | 'Sent' | 'Accepted' | 'Declined' | 'Withdrawn'
  compensation: {
    ctcAnnual: number
    fixedMonthly?: number
    variableAnnual?: number
    joiningBonus?: number
    noticePeriodDays: number
  }
  proposedJoiningDate?: string
  location: string
  designation: string
  reportingTo?: string
  generatedFilePath?: string
  approvedBy?: string
  approvedAt?: string
  sentAt?: string
  respondedAt?: string
  createdAt: string
  createdBy: string
  auditLog: AuditEntry[]
}

// --- Employee (post-join record) -----------------------------------------

export interface Employee {
  id: string
  employeeCode: string
  candidateId?: string
  applicationId?: string
  name: string
  email: string
  phone?: string
  designation: string
  department: string
  reportingTo?: string
  location: string
  dateOfJoining: string
  status: 'Active' | 'Exited'
  ctcAnnual?: number
  exit?: {
    lastWorkingDay: string
    reason: string
    relievingLetterIssued: boolean
    experienceLetterIssued: boolean
    notes?: string
  }
  onboardingChecklist?: OnboardingItem[]
  createdAt: string
  createdBy: string
  auditLog: AuditEntry[]
}

export interface OnboardingItem {
  id: string
  label: string
  done: boolean
  doneAt?: string
  doneBy?: string
}

// --- Prompt library (CP3 + CP4) ------------------------------------------

export interface Prompt {
  id: string
  title: string
  useCase: string
  category: 'resume' | 'jd' | 'interview' | 'shortlist' | 'other'
  body: string
  inputHint: string
  /** Minimal JSON Schema (type + required keys). Enforced by paste-back validator. */
  outputSchema: {
    type: 'object'
    required: string[]
    properties: Record<string, { type: string; description?: string }>
  }
  exampleOutputs: Array<Record<string, unknown>>
  createdAt: string
  validatedBy?: string
  validatedAt?: string
}

// --- Candidate application (magic link + session) ------------------------
// See src/lib/candidateAuth.ts. Magic link is a short-lived HMAC token; the
// candidate session cookie is an httpOnly SameSite=Strict cookie that proves
// the holder owns a particular candidateId. Both are signed with
// GSL_SNAPSHOT_SIGNING_KEY.

// --- Pending update (queue entry) -----------------------------------------

export type PendingUpdateEntity =
  | 'user'
  | 'role'
  | 'candidate'
  | 'application'
  | 'interview'
  | 'offer'
  | 'employee'
  | 'careers_application'

export interface PendingUpdate {
  id: string
  queuedAt: string
  queuedBy: string
  entity: PendingUpdateEntity
  operation: 'create' | 'update' | 'delete'
  payload: Record<string, unknown>
  retryCount?: number
}

// --- JWT session claims ---------------------------------------------------

export interface SessionClaims {
  sub: string
  email: string
  name: string
  role: StaffRole
  iat: number
  exp: number
}
