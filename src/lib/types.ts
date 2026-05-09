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

/** Academics hires run through two HOD rounds (Manali round 1, Ritu round 2)
 * before HR. Roles in the Academics department get this pipeline by default.
 */
export const ACADEMICS_PIPELINE_STAGES = [
  'Sourced',
  'Shortlisted',
  'AssessmentSent',
  'AssessmentDone',
  'VideoSent',
  'VideoDone',
  'HODRoundScheduled',
  'HODRoundDone',
  'HOD2RoundScheduled',
  'HOD2RoundDone',
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
  /** Optional second HOD, used by Academics roles: Manali scores round 1,
   * Ritu scores round 2. When unset, the role runs a single-HOD pipeline. */
  hodRound2UserId?: string
  location: 'Mumbai' | 'Delhi' | 'Bengaluru' | 'Remote' | 'Hybrid' | string
  employmentType: 'Full-time' | 'Part-time' | 'Contract' | 'Internship'
  status: 'Draft' | 'Open' | 'Paused' | 'Closed' | 'Archived'
  /** Free-text reason captured when the role was paused. Null/undef when not paused or not provided. */
  pauseReason?: string | null
  /** Outcome captured when the role was closed. */
  closeOutcome?: 'Position Filled' | 'No Suitable Candidate' | 'Cancelled' | 'Other' | null
  /** Optional notes alongside closeOutcome (e.g., the chosen candidate's name). */
  closeNotes?: string | null
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
  /** Extracted text content for the resume; used for substring search on
   * /candidates. Populated at seed time for legacy resumes; populated on
   * upload for future /careers applications. */
  searchableText?: string
  /** Free-form tags on the candidate. `programmes` is the HR-delivered
   * grouping used to route the candidate to matching open roles. */
  tags?: {
    programmes?: string[]
    other?: string[]
  }
  status?: 'Active' | 'Archived'
  /** When the candidate consented to data retention / publication. Null for
   * legacy resumes that pre-date the /careers consent form. */
  consentedAt?: string | null
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
  /** Captured when the application transitions to Rejected. Used for "why
   * we lose candidates" analysis on the candidate detail page. Cleared if the
   * application is re-opened (transition out of Rejected). */
  rejectionReason?:
    | 'Not Qualified for Role'
    | 'Position Filled'
    | 'Withdrew'
    | 'Better Match Elsewhere'
    | 'Other'
  rejectionNotes?: string
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
  /** Mr./Ms./Mrs./Dr. prefix from the master roster. */
  title?: string | null
  email: string
  phone?: string | null
  designation: string
  department: string
  /** Free-text manager name as recorded on the master roster. */
  reportingTo?: string | null
  /** Resolved on import by name-matching against other employees; null when the
   * named manager is not in the system (e.g., founder, external). */
  reportingManagerId?: string | null
  location: string
  dateOfJoining: string | null
  confirmationDate?: string | null
  tenureYears?: number | null
  dateOfBirth?: string | null
  age?: number | null
  gender?: string | null
  maritalStatus?: string | null
  address?: string | null
  personalEmail?: string | null
  /** Flagged during master-roster import when no Official Email ID was present. */
  officialEmailMissing?: boolean
  status: 'Active' | 'Exited'
  /** Phase 4 lifecycle marker. Coexists with `status` (which stays the
   * coarse Active/Exited record-state used everywhere in recruitment code).
   * Populated by the muster migration; subsequent transitions are written
   * by HR (probation confirm, notice period, leave). */
  employmentStatus?: EmploymentStatus
  /** Phase 4: rostering driver. office-5day / trainer-6day / hybrid-2day /
   * field / remote. Inferred from department + designation at import; HR
   * can override per-employee. */
  workPattern?: WorkPattern
  /** Phase 4: classifies the employee's location as a formal GSL office
   * (Mumbai, Kolkata) vs. a remote/field-only city. Drives roster expectations. */
  locationType?: LocationType
  /** Phase 4: per-employee leave balances. Reset every leave year (Apr-Mar).
   * Populated at import with the policy default; deductions land via the
   * Phase 3 leave system. */
  leaveBalance?: LeaveBalance
  /** Phase 4: ISO date for the start of the current leave year (1 Apr).
   * Renewals roll the balance and increment this. */
  leaveYearStart?: string
  /** Phase 4: most recent record-touch timestamp. createdAt + auditLog were
   * the existing audit; updatedAt is a denormalised "when did this record
   * last change" for the employees list sort. */
  updatedAt?: string
  ctcAnnual?: number
  /** Detailed salary breakdown for appointment letter PF/PT rendering. All
   * amounts in INR. CTC/Basic/HRA/Conveyance/OtherAllowances/PFEmployee/NetTakeHome
   * are annual; PT is per-month (the way HR records it). Optional: legacy
   * employees have it absent and HR fills the form per-letter. */
  salaryStructure?: {
    ctc: number
    basic: number
    hra: number
    conveyance: number
    otherAllowances: number
    pfEmployee: number
    ptMonthly: number
    netTakeHome: number
  }
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

// --- HR Operations (Phase 4 additive fields, layered on Employee) --------

export const WORK_PATTERNS = [
  'office-5day',
  'trainer-6day',
  'hybrid-2day',
  'field',
  'remote',
] as const
export type WorkPattern = (typeof WORK_PATTERNS)[number]

export const EMPLOYMENT_STATUSES = [
  'Active',
  'Probation',
  'Confirmed',
  'On Notice',
  'On Leave',
  'Exited',
] as const
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number]

export const LOCATION_TYPES = ['office', 'remote-field'] as const
export type LocationType = (typeof LOCATION_TYPES)[number]

export interface LeaveBalance {
  /** Casual leave days available in the current leave year. */
  casual: number
  /** Sick leave days available in the current leave year. */
  sick: number
}

/**
 * Taxonomy metadata for the locations + departments aggregated off
 * employees. Stored in src/data/taxonomy.json. The list of *names* is
 * derived from employees.json on every read; this file just stores the
 * metadata HR needs to attach to each name (locationType, flagged) and
 * any standalone notes.
 *
 * Operations that mutate names (rename, merge) cascade through
 * employees.json and update this metadata file in the same commit.
 */
export interface LocationMeta {
  /** Office locations have GSL HR/admin presence on-site. Remote-field
   *  locations are individual employees based there with no anchor office. */
  type: LocationType
  notes?: string
}
export interface DepartmentMeta {
  /** True when Riddhi has flagged this department for review (e.g.,
   *  "Demonstration & Support" pending decision on canonical home). */
  flagged?: boolean
  notes?: string
}
export interface Taxonomy {
  locations: Record<string, LocationMeta>
  departments: Record<string, DepartmentMeta>
  /** Audit log for taxonomy mutations (rename / retype / merge). */
  auditLog: AuditEntry[]
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
  | 'outbound_mail'

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
