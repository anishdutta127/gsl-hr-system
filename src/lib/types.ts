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

/** Recommendation captured on a single hiring-manager feedback entry. */
export const FEEDBACK_RECOMMENDATIONS = [
  'Strong Hire',
  'Move Forward',
  'On Hold',
  'Reject',
] as const

export type FeedbackRecommendation = (typeof FEEDBACK_RECOMMENDATIONS)[number]

/** Narrative interview feedback submitted by the assigned hiring manager.
 * Distinct from `Interview` (rubric-led scoring); this is the prose
 * recommendation that gates progression out of the *RoundDone stages.
 *
 * `round` is the human label HR sees in the form ("Screening", "Technical",
 * "Final"), not the pipeline stage id; multiple entries per round are
 * allowed (a second-look after additional context is fine). The gate
 * (Step 3) looks for *any* entry whose `round` matches the current stage's
 * round label, so subsequent re-submissions count as cleared. */
export interface InterviewFeedback {
  round: string
  submittedBy: string
  submittedAt: string
  recommendation: FeedbackRecommendation
  strengths: string
  concerns: string
  overallNotes?: string
}

/** Stages out of which the hiring-manager feedback gate fires. Defaults to
 * the three *RoundDone stages where an actual interview just happened.
 * Per-application override allowed: a role with a different pipeline can
 * supply its own list. */
export const DEFAULT_FEEDBACK_REQUIRED_STAGES: Stage[] = [
  'HODRoundDone',
  'HOD2RoundDone',
  'HRRoundDone',
]

/** Sequential pre-onboarding approval: hiring manager first, HR second.
 * Lives on the Application rather than the Offer because the approval
 * happens BEFORE an Offer entity is drafted (a recruiter may run the
 * approval, then the candidate ghosts, and no Offer ever materialises). */
export type PreOnboardingApprovalStatus =
  | 'Not Started'
  | 'Pending Hiring Manager'
  | 'Pending HR Approval'
  | 'Approved'
  | 'Rejected'

export interface PreOnboardingApproval {
  status: PreOnboardingApprovalStatus
  /** Confirmed CTC in INR (annual). Captured by the hiring manager. */
  ctcConfirmed?: number
  /** ISO date of confirmed joining. */
  joiningDateConfirmed?: string
  /** Confirmed location (text, free-form — may match a Role.location or be a
   * site-level override). */
  locationConfirmed?: string
  /** Confirmed position title (defaults to candidate.roleAppliedFor). */
  positionConfirmed?: string
  /** Optional notes from either approver, last-wins. */
  notes?: string
  /** Set on the rejection path; either approver may reject. */
  rejectionReason?: string
  /** Who rejected: 'hiring-manager' | 'hr'. */
  rejectedBy?: 'hiring-manager' | 'hr'
  hiringManagerApprovedBy?: string
  hiringManagerApprovedAt?: string
  hrApprovedBy?: string
  hrApprovedAt?: string
}

/** Candidate response captured manually by a recruiter (we are not parsing
 * inbound email in Phase 1). Drives downstream UI affordances: once
 * `response === 'Accepted'`, the Appointment Letter send action unlocks. */
export const CANDIDATE_RESPONSE_TYPES = [
  'Accepted',
  'Declined',
  'Negotiating',
  'No Response',
  'Need More Info',
] as const

export type CandidateResponseType = (typeof CANDIDATE_RESPONSE_TYPES)[number]

export interface CandidateOfferResponse {
  response: CandidateResponseType
  /** ISO date of the response, as told to HR. May differ from the queue
   * write timestamp when HR back-stamps. */
  responseDate: string
  notes?: string
  /** Captured at the time HR recorded the response. */
  recordedBy: string
  recordedAt: string
}

/** Pre-onboarding email send tracker. Each entry corresponds to one
 * mailto: action — we don't actually send via SMTP in Phase 1, but we
 * record that HR opened the draft for that template so the next stage's
 * action unlocks. */
export interface PreOnboardingEmailSend {
  templateId: 'offer-intimation' | 'offer-followup' | 'appointment-letter' | 'notice-period-checkin'
  sentAt: string
  sentBy: string
  /** Editable subject + body the user saw at send time; captured for audit
   * so we know what wording went out. */
  subject?: string
  /** Attachment names HR confirmed they would attach. mailto: cannot
   * carry attachments — this is a checklist trace, not a delivery proof. */
  attachmentsClaimed?: string[]
}

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

  // --- Gate 3 additions --------------------------------------------------

  /** Assigned hiring manager (User id). HR assigns when the candidate
   * enters an interview-eligible stage. Pre-existing applications stay
   * undefined and surface a "Assign hiring manager first" prompt on the
   * next transition attempt out of a feedback-required stage. */
  hiringManagerId?: string

  /** Narrative interview feedback entries, append-only, ordered by
   * submission time ascending. Multiple entries per round allowed
   * (subsequent submissions count as updates from the gate's perspective). */
  interviewFeedback?: InterviewFeedback[]

  /** Per-application override of which stages require hiring-manager
   * feedback before allowing a forward transition. When unset, the
   * gate falls back to DEFAULT_FEEDBACK_REQUIRED_STAGES. Allow empty
   * array to opt this application out entirely. */
  feedbackRequiredFor?: Stage[]

  /** Sequential pre-onboarding approval. Created on first action;
   * undefined for applications that never reach the offer-zone. */
  preOnboardingApproval?: PreOnboardingApproval

  /** Manually-captured candidate response to the offer intimation.
   * Recorded by HR; not parsed from inbound email. */
  candidateOfferResponse?: CandidateOfferResponse

  /** Tracks which pre-onboarding emails HR has drafted via the
   * send-email modal. Drives the unlock chain on the candidate detail
   * page (offer-intimation must be sent before follow-up; acceptance
   * required before appointment-letter; etc.). */
  preOnboardingEmails?: PreOnboardingEmailSend[]
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
  /** Each manual resend appends a timestamp here; sentAt always tracks
   * the most recent send. Surfaces as "Sent / Resent N" on the offer
   * detail page so HR can see the history at a glance. */
  resentAt?: string[]
  respondedAt?: string
  /** Captured when HR marks the offer Accepted. May differ from the
   * original `compensation.ctcAnnual` if HR negotiated. Always written
   * as the source-of-truth for the employee-creation flow. */
  acceptedCtcAnnual?: number
  /** Date the candidate confirmed acceptance. May differ from
   * respondedAt (queue write time) when HR back-stamps a verbal
   * acceptance after the fact. */
  acceptedOn?: string
  /** Joining date the candidate committed to at acceptance. Pre-fills
   * the employee record on activation. */
  acceptedJoiningDate?: string
  /** Captured when HR marks the offer Declined. Structured so
   * "why are we losing offers" reports don't have to scrape notes. */
  declineReason?: string
  declineNotes?: string
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

// --- Holiday calendar (Phase 4) ------------------------------------------

export type HolidayType = 'mandatory' | 'optional'

export interface Holiday {
  id: string
  /** ISO YYYY-MM-DD. Drives roster/leave logic. */
  date: string
  name: string
  type: HolidayType
  /** Region scope. Phase 1 stores ['national'] uniformly per Riddhi's
   *  confirmation. Future regional holidays add city codes here. */
  regions: string[]
  notes?: string
  createdAt: string
  createdBy: string
  auditLog: AuditEntry[]
}

/**
 * Per-employee optional-holiday picks. Phase 1 default budget: 2 picks per
 * employee per leave year (Apr-Mar). HR records picks via /holidays/picks
 * until self-service lands in Phase 3.
 */
export interface EmployeeOptionalHoliday {
  employeeId: string
  holidayId: string
  /** Calendar year of the picked holiday (the year the date falls in). */
  year: number
  selectedAt: string
  selectedBy: string
}

/** Default per-employee optional-holiday budget per leave year. */
export const OPTIONAL_HOLIDAY_BUDGET_PER_YEAR = 2

// --- Document repository (Phase 4) ---------------------------------------

export const DOCUMENT_CATEGORIES = [
  'identity',
  'education',
  'employment',
  'tax',
  'other',
] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export interface DocumentTemplate {
  id: string
  name: string
  category: DocumentCategory
  /** When false, this template is "optional if applicable" — surfaced on
   *  the checklist but not counted against the missing-mandatory tally. */
  isMandatory: boolean
  /** When true, an expiry date can be set per-upload and the system warns
   *  on documents within 30/60/90 days of expiry. */
  hasExpiry: boolean
  description?: string
  /** Optional hint about applicability — "Only if previous employment",
   *  "Only if PF applicable", etc. Rendered as a tooltip on the checklist. */
  applicabilityHint?: string
}

export interface EmployeeDocument {
  id: string
  employeeId: string
  templateId: string
  uploadedAt: string
  uploadedBy: string
  /** Repo path where the file lives. Always under data/hr-documents/. */
  filePath: string
  /** Original file name from the uploader, preserved for display. */
  originalFileName: string
  fileSize: number
  expiresAt?: string | null
  verified: boolean
  verifiedBy?: string
  verifiedAt?: string
  notes?: string
  auditLog: AuditEntry[]
}

// --- Onboarding workflow (Phase 4 Phase 2) ------------------------------

export const ONBOARDING_CATEGORIES = [
  'Documentation',
  'IT & Assets',
  'Workplace',
  'HR Formalities',
  'Manager Tasks',
] as const
export type OnboardingCategory = (typeof ONBOARDING_CATEGORIES)[number]

export const TASK_STATUSES = [
  'Not Started',
  'In Progress',
  'Completed',
  'Blocked',
  'N/A',
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Who is responsible for a task by default. Resolved to a real userId
 *  on the per-employee task: HR/IT/Admin go to the first matching role
 *  user; ReportingManager resolves to employee.reportingManagerId;
 *  Employee resolves to the employee themselves (Phase 3 self-service). */
export const ONBOARDING_DEFAULT_ASSIGNEES = [
  'HR',
  'IT',
  'Admin',
  'ReportingManager',
  'Employee',
] as const
export type OnboardingDefaultAssignee = (typeof ONBOARDING_DEFAULT_ASSIGNEES)[number]

export interface OnboardingTaskTemplate {
  id: string
  name: string
  description?: string
  category: OnboardingCategory
  isMandatory: boolean
  defaultAssignee: OnboardingDefaultAssignee
  /** Days from joining date when this task is expected by. Negative for
   *  pre-joining tasks (e.g., -7 for the appointment letter). */
  daysFromJoining: number
  estimatedMinutes: number
  /** Optional documentTemplate id this task references. Completing the
   *  matching document upload auto-completes the task. */
  documentTemplateId?: string
}

export interface OnboardingTask {
  id: string
  employeeId: string
  templateId: string
  status: TaskStatus
  /** Resolved user id (or special string 'ReportingManager' /
   *  'Employee' when the assignee couldn't be resolved at create time). */
  assignedTo: string | null
  /** Computed: employee.dateOfJoining + template.daysFromJoining. */
  dueDate: string
  completedAt: string | null
  completedBy: string | null
  notes: string
  blockers: string
  auditLog: AuditEntry[]
}

// --- Offboarding workflow (Phase 4 Phase 2) -----------------------------

export const OFFBOARDING_CATEGORIES = [
  'Notice Period',
  'Knowledge Transfer',
  'Last Day',
  'Post-Exit',
] as const
export type OffboardingCategory = (typeof OFFBOARDING_CATEGORIES)[number]

export const EXIT_TYPES = [
  'Voluntary',
  'Termination',
  'End of Contract',
  'Retirement',
] as const
export type ExitType = (typeof EXIT_TYPES)[number]

export interface OffboardingTaskTemplate {
  id: string
  name: string
  description?: string
  category: OffboardingCategory
  isMandatory: boolean
  defaultAssignee: OnboardingDefaultAssignee | 'Accounts'
  /** Days from notice start (Day 1 = day notice received). Use a large
   *  positive offset for tasks pegged to last-working-day; the engine
   *  resolves dueDate against `lastWorkingDay - daysBeforeLwd` when the
   *  pegToLwd flag is set. */
  daysFromNoticeStart: number
  /** When true, daysFromNoticeStart is interpreted as "days BEFORE last
   *  working day" (negative offset from LWD). E.g., 7 = a week before
   *  LWD. Used for handover and KT tasks. */
  pegToLwd?: boolean
  estimatedMinutes: number
}

export interface OffboardingTask {
  id: string
  employeeId: string
  templateId: string
  status: TaskStatus
  assignedTo: string | null
  dueDate: string
  completedAt: string | null
  completedBy: string | null
  notes: string
  blockers: string
  auditLog: AuditEntry[]
}

/** A confidential exit-interview document. Stored under data/exit-interview-docs;
 *  served ONLY through the gated route (canViewExitInterview), never directly. */
export interface ExitInterviewDocumentFile {
  uploadedAt: string
  uploadedBy: string
  filename: string
  /** Bytes. */
  fileSize: number
  /** Repo-relative storage path under data/exit-interview-docs. */
  storageRef: string
}

export interface ExitInterview {
  employeeId: string
  conductedAt: string
  conductedBy: string
  /** Legacy free-text reason. Superseded by the canonical employee.exit.reason
   *  (set at initiation) + the uploaded interview document. Kept for back-compat;
   *  existing values are migrated into freeText. */
  reasonForLeaving: string
  wouldRecommend: 'Yes' | 'No' | 'Maybe' | null
  satisfactionWithManager: 1 | 2 | 3 | 4 | 5 | null
  satisfactionWithRole: 1 | 2 | 3 | 4 | 5 | null
  topThingsToChange: string
  freeText: string
  /** The confidential exit-interview document (HR conducts the interview via a
   *  document). Null when none uploaded. */
  interviewDocument?: ExitInterviewDocumentFile | null
  auditLog: AuditEntry[]
}

// --- Exit handover (Phase 4, gate 4) -------------------------------------
//
// The handover record sits alongside ExitInterview - same one-per-exit
// shape, keyed by employeeId. Separates the artefact (a filled-in
// template document) from the interview (HR's structured questions).

export const HANDOVER_TEMPLATE_KINDS = ['Standard', 'Tech', 'Sales', 'Custom'] as const
export type HandoverTemplateKind = (typeof HANDOVER_TEMPLATE_KINDS)[number]

export interface HandoverDocumentFile {
  uploadedAt: string
  uploadedBy: string
  filename: string
  /** Bytes. */
  fileSize: number
  /** Repo-relative storage path under data/exit-handovers. */
  storageRef: string
}

export interface HandoverPendingTask {
  description: string
  owner: string
  dueDate: string | null
}

export interface HandoverKeyContact {
  name: string
  role: string
  context: string
}

export interface HandoverAccessItem {
  system: string
  status: 'Pending' | 'Revoked'
}

export interface HandoverKnowledgeSession {
  withWhom: string
  completedAt: string
  notes: string
}

export interface ExitHandover {
  /** Same key as ExitInterview - one record per exiting employee. */
  employeeId: string
  templateUsed: HandoverTemplateKind | null
  document: HandoverDocumentFile | null
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNotes: string
  checklist: {
    pendingTasks: HandoverPendingTask[]
    keyContacts: HandoverKeyContact[]
    accessRevocation: HandoverAccessItem[]
    /** ITAsset ids the exiting employee has returned. */
    itAssetsReturned: string[]
    knowledgeTransfer: HandoverKnowledgeSession[]
  }
  createdAt: string
  updatedAt: string
  auditLog: AuditEntry[]
}

/** Status derived for surfacing on /exits. */
export type HandoverStatus = 'Not started' | 'In progress' | 'Submitted' | 'Reviewed'

export interface FFSettlement {
  employeeId: string
  finalSalaryDays: number
  leaveEncashment: number
  recoveryItems: Array<{ label: string; amount: number }>
  noticePeriodAdjustment: number
  totalNet: number
  paidAt: string | null
  paidBy: string | null
  notes: string
  auditLog: AuditEntry[]
}

// --- Exit cockpit (six-step exit process, 2026-06) ----------------------
//
// Reshapes the fragmented offboarding flow (tasks + handover + exit
// interview + F&F across three pages) into ONE editable, ordered six-step
// process per exiting employee. Steps are instantiated from the editable
// exit_step_templates.json; the per-employee record lives in
// exit_processes.json and is mutated via atomicUpdateJson (never the queue),
// each write appending an auditLog entry. The employee.status -> 'Exited'
// flip stays on the existing exit.initiate queue op (employees.json is
// queue-managed everywhere else).

export const EXIT_STEP_KINDS = [
  'initiate',
  'handover',
  'letter:NO-DUES-v1',
  'ff',
  'letter:RELIEVING-v1',
  'letter:EXPERIENCE-v1',
  'custom',
] as const
export type ExitStepKind = (typeof EXIT_STEP_KINDS)[number]

export const EXIT_STEP_STATUSES = [
  'Not Started',
  'In Progress',
  'Completed',
  'N/A',
] as const
export type ExitStepStatus = (typeof EXIT_STEP_STATUSES)[number]

export interface ExitStepTemplate {
  id: string
  /** 1-based display order. The cockpit sorts on this. */
  order: number
  name: string
  kind: ExitStepKind
  /** Mandatory steps gate "process complete"; HR can mark them N/A. */
  isMandatory: boolean
  description?: string
}

/** Kind-specific data captured on a step. All keys optional; only those
 *  relevant to the step's kind are populated. Settlement figures and
 *  payment data are financial (HR/Admin-only on the cockpit). */
export interface ExitStepData {
  // handover
  handoverEmailedAt?: string | null
  rmConfirmedAt?: string | null
  // no dues
  settlementFigures?: number | null
  settlementWords?: string | null
  lastDrawnSalary?: number | null
  pendingItems?: string | null
  signed?: boolean
  signedAt?: string | null
  signedCopyNote?: string | null
  // ff settlement
  ffAmount?: number | null
  paymentDate?: string | null
  paymentReference?: string | null
  // letters (relieving / experience / no-dues generation)
  letterIssuedAt?: string | null
  letterIssuedBy?: string | null
}

export interface ExitProcessStep {
  templateId: string
  name: string
  kind: ExitStepKind
  isMandatory: boolean
  status: ExitStepStatus
  data: ExitStepData
  notes: string
  completedAt: string | null
  completedBy: string | null
}

export interface ExitProcess {
  employeeId: string
  exitType: ExitType
  reasonForLeaving: string
  /** Resignation date for voluntary exits; null for terminations. */
  resignationDate: string | null
  /** Termination date for involuntary exits; null otherwise. */
  terminationDate: string | null
  lastWorkingDay: string
  steps: ExitProcessStep[]
  /** Stamped when all mandatory steps reach Completed/NA. Null while in
   *  progress. Drives the Alumni/Completed grouping on the /exits board. */
  completedAt: string | null
  /** Explicitly closed (archived) by HR/Admin, possibly with steps still
   *  outstanding (e.g. a termination with no experience letter). Distinct from
   *  completedAt: either one being set lands the exit in the Alumni group, off
   *  the active board. Cleared on reopen. Optional so pre-close records parse. */
  closedAt?: string | null
  closedBy?: string | null
  /** Short reason captured when closing with steps outstanding. */
  closeReason?: string | null
  createdAt: string
  createdBy: string
  updatedAt: string
  auditLog: AuditEntry[]
}

// --- Asset tracking (Phase 4 Phase 2) -----------------------------------

export const ASSET_TYPES = [
  'Laptop',
  'ID Card',
  'SIM',
  'Email Account',
  'Other',
] as const
export type AssetType = (typeof ASSET_TYPES)[number]

export const ASSET_CONDITIONS = ['New', 'Good', 'Fair', 'Damaged', 'Lost'] as const
export type AssetCondition = (typeof ASSET_CONDITIONS)[number]

export interface Asset {
  id: string
  type: AssetType
  identifier: string
  assignedTo: string | null
  assignedAt: string | null
  returnedAt: string | null
  condition: AssetCondition
  notes: string
  createdAt: string
  createdBy: string
  auditLog: AuditEntry[]
}

// --- IT asset inventory (Phase 4, gate 4) -------------------------------
//
// Richer hardware inventory alongside the lightweight `Asset` above. The
// older type tracks the offboarding return checklist (laptop / ID card /
// SIM / email account); the IT asset entity carries serial number,
// purchase metadata, warranty, full assignment history. Both coexist
// because the older entity surfaces in offboarding flows already and we
// did not want to ship a destructive migration.

export const IT_ASSET_CATEGORIES = [
  'Laptop',
  'Desktop',
  'Monitor',
  'Phone',
  'Tablet',
  'Headset',
  'Charger',
  'Keyboard',
  'Mouse',
  'Other',
] as const
export type ITAssetCategory = (typeof IT_ASSET_CATEGORIES)[number]

export const IT_ASSET_STATUSES = [
  'Available',
  'Assigned',
  'In Repair',
  'Retired',
  'Lost',
  'Stolen',
] as const
export type ITAssetStatus = (typeof IT_ASSET_STATUSES)[number]

export const IT_ASSET_CONDITIONS = ['New', 'Good', 'Fair', 'Poor'] as const
export type ITAssetCondition = (typeof IT_ASSET_CONDITIONS)[number]

export interface ITAssetAssignment {
  employeeId: string
  assignedAt: string
  assignedBy: string
}

export interface ITAssetHistoryEntry {
  employeeId: string
  assignedAt: string
  returnedAt: string
  returnedReason: string
  assignedBy: string
}

export interface ITAsset {
  /** ASSET-{YYYY}-{NNNN}. Gap-free within the calendar year. */
  id: string
  category: ITAssetCategory
  make: string
  model: string
  serialNumber: string
  /** Internal sticker / barcode tag. Optional. */
  assetTag: string
  /** ISO date. */
  purchaseDate: string | null
  /** INR, integer rupees. */
  purchaseCost: number | null
  warrantyEndDate: string | null
  currentAssignment: ITAssetAssignment | null
  assignmentHistory: ITAssetHistoryEntry[]
  status: ITAssetStatus
  condition: ITAssetCondition
  /** Office name or city for WFH allocations. */
  location: string
  notes: string
  auditLog: AuditEntry[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

// --- Leave management (Phase 4 Phase 3) ----------------------------------

export const LEAVE_TYPES = [
  'casual',
  'sick',
  'unpaid',
  'maternity',
  'paternity',
  'bereavement',
  'compensatory',
] as const
export type LeaveType = (typeof LEAVE_TYPES)[number]

export const LEAVE_STATUSES = [
  'Draft',
  'Submitted',
  'Approved',
  'Rejected',
  'Cancelled',
  'Recalled',
] as const
export type LeaveStatus = (typeof LEAVE_STATUSES)[number]

export interface LeaveApplication {
  id: string
  employeeId: string
  leaveType: LeaveType
  /** Inclusive start date, ISO YYYY-MM-DD. */
  startDate: string
  /** Inclusive end date. Equals startDate for a single-day or half-day. */
  endDate: string
  /** Computed at apply-time, persisted for audit clarity. Accounts for
   *  weekends + holidays per the employee's work pattern. */
  totalDays: number
  reason: string
  isHalfDay: boolean
  halfDaySession?: 'morning' | 'afternoon'
  status: LeaveStatus
  appliedAt: string
  appliedBy: string
  /** When the apply-runner moves it from Draft to Submitted. */
  submittedAt: string | null
  approvedBy: string | null
  approvedAt: string | null
  rejectionReason: string | null
  recallReason: string | null
  /** Set when the leave is logged retroactively (start date in the past). */
  isEmergency: boolean
  /** Loss-of-pay flag: total exceeded balance and the over-portion converts
   *  to unpaid. Stored so the report can split paid vs LOP days. */
  lossOfPayDays: number
  /** Rejection/cancellation acknowledgment. */
  cancelledBy?: string
  cancelledAt?: string
  auditLog: AuditEntry[]
}

export interface LeaveBucket {
  /** Annual entitlement (12 for casual + sick per Riddhi). */
  entitlement: number
  /** Days already taken (Approved leaves count). */
  taken: number
  /** Days locked by Submitted (pending approval) leaves. */
  pending: number
  /** entitlement - taken - pending. May be negative if HR ran a manual
   *  retroactive correction; the API rejects new applications that
   *  would push it below zero unless the requester confirms LOP. */
  balance: number
}

export interface LeaveBalanceRecord {
  employeeId: string
  /** April-1 of the active leave year. */
  leaveYearStart: string
  casual: LeaveBucket
  sick: LeaveBucket
  /** Unpaid leaves don't have an entitlement; we track only `taken`. */
  unpaid: { taken: number }
  updatedAt: string
}

/** Annual entitlement defaults per Riddhi: 12 casual + 12 sick = 24. */
export const LEAVE_ENTITLEMENT_DEFAULTS = {
  casual: 12,
  sick: 12,
} as const

// --- Attendance exceptions (Phase 4 Phase 4) ----------------------------

export const ATTENDANCE_EXCEPTION_TYPES = [
  'late',
  'half-day',
  'absent',
  'work-from-home',
  'on-field',
  'holiday-worked',
] as const
export type AttendanceExceptionType = (typeof ATTENDANCE_EXCEPTION_TYPES)[number]

export interface AttendanceException {
  id: string
  employeeId: string
  date: string
  type: AttendanceExceptionType
  notes: string
  loggedBy: string
  loggedAt: string
  auditLog: AuditEntry[]
}

// --- Alerts (Phase 4 Phase 4) -------------------------------------------

export const ALERT_CATEGORIES = [
  'document-expiry',
  'probation-review',
  'onboarding-overdue',
  'offboarding-lwd',
  'leave-pending-24h',
  'daily-hr-digest',
] as const
export type AlertCategory = (typeof ALERT_CATEGORIES)[number]

export interface AlertLogEntry {
  id: string
  category: AlertCategory
  /** Stable dedupe key per (category, target, trigger window). e.g.,
   *  "document-expiry:doc-123:30d:2026-05-09". Same triggerKey ->
   *  same alert -> never re-fires. */
  triggerKey: string
  recipients: string[]
  firedAt: string
  notes?: string
}

export interface AlertPreferences {
  enabled: Partial<Record<AlertCategory, boolean>>
  extraRecipients: string[]
  globalEnabled: boolean
  updatedAt: string
}

// --- System settings (Phase 4 — admin-editable defaults) ---------------

export const LEAVE_FLOWS = ['hr-mediated', 'self-service'] as const
export type LeaveFlow = (typeof LEAVE_FLOWS)[number]

export interface SystemSettings {
  /** Whether leave applications run through the HR-mediated path
   *  (HR opens the form on behalf of an employee) or the self-service
   *  path (employee submits, manager approves). Defaults to
   *  'hr-mediated' per Riddhi's stated preference; flip from
   *  /admin/alerts/preferences when self-service ships. */
  leaveFlow: LeaveFlow
  updatedAt: string
  updatedBy: string
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
  | 'recognition'
  | 'nominationCycle'

export interface PendingUpdate {
  id: string
  queuedAt: string
  queuedBy: string
  entity: PendingUpdateEntity
  operation: 'create' | 'update' | 'delete'
  payload: Record<string, unknown>
  retryCount?: number
}

// --- Rewards & Recognition (Phase 4, gate 3) ------------------------------

/** Categories surfaced in the HOD nomination form + recognition card. */
export const RECOGNITION_CATEGORIES = [
  'Employee of the Month',
  'Outstanding Contribution',
  'Team Player',
  'Innovation',
  'Other',
] as const

export type RecognitionCategory = (typeof RECOGNITION_CATEGORIES)[number]

/** Five-state lifecycle: HOD nominates → HR-Admin approves → HR-Admin
 * publishes (email distribution) → archive (manual). Draft is the
 * pre-submit holding state when a HOD is still composing the write-up. */
export type RecognitionStatus =
  | 'Draft'
  | 'Nominated'
  | 'Approved'
  | 'Published'
  | 'Archived'

/** Single distribution event — every time HR opens the email modal and
 * fires the mailto:, one of these is appended. */
export interface RecognitionDistribution {
  sentAt: string
  sentBy: string
  /** Number of recipients in the BCC field of the draft. */
  recipientCount: number
}

export interface RecognitionPhoto {
  /** Web-reachable path: /recognition-photos/[recognitionId].jpg. */
  storageRef: string
  uploadedAt: string
  uploadedBy: string
}

export interface RecognitionVoucher {
  /** INR amount. Default 500 (Riddhi's policy). */
  amount: number
  /** Always 'INR' for now; field kept for future foreign-currency awards. */
  currency: 'INR'
  /** Default 'Amazon'; HR can override if they ship a different voucher. */
  provider: string
  deliveredAt: string | null
  deliveryConfirmedBy: string | null
}

export interface Recognition {
  /** RECOG-{YYYY}-{NN} where YYYY is the financial year start and NN is
   * gap-free within that year. */
  id: string
  /** Employee being recognised — a User id (employee records are the
   * user records in this codebase, post-join). */
  employeeId: string
  /** User id of the nominator (HOD or HR-Admin). */
  nominatedBy: string
  /** YYYY-MM. Used for the monthly grid on /recognition. */
  month: string
  /** Snapshot of the employee's department at nomination time so renaming
   * a department later doesn't rewrite historical recognitions. */
  department: string
  category: RecognitionCategory
  /** The Canva-style write-up text. Plain text, line breaks preserved. */
  writeup: string
  status: RecognitionStatus
  nominatedAt: string
  approvedBy?: string
  approvedAt?: string
  publishedAt?: string
  /** Append-only distribution log. */
  distributionEmails: RecognitionDistribution[]
  // --- Phase 4 gate 4 additions ------------------------------------
  /** Defaults to false. HR-Admin flips this on when the celebration is
   *  ready for the public /celebrate URL to be shared. */
  publicShareEnabled?: boolean
  employeePhoto?: RecognitionPhoto | null
  voucher?: RecognitionVoucher | null
  /** Times the public share button was clicked. */
  shareCount?: number
  /** Counted server-side, deduplicated by IP within a 1h window. */
  viewCount?: number
  auditLog: AuditEntry[]
}

/** Bookkeeping record for the monthly "request nominations" mailto. One
 * cycle per (month). HR-Admin can re-trigger if HODs need a reminder. */
export interface NominationCycle {
  id: string
  /** YYYY-MM. */
  month: string
  requestedAt: string
  requestedBy: string
  /** User ids of the HODs the request mailto was addressed to. */
  hodsNotified: string[]
  auditLog: AuditEntry[]
}

// --- Internal HR task board (2026-06) -----------------------------------
//
// Riddhi's cross-stakeholder task tracker. Many HR tasks span multiple teams
// and stall waiting on others' inputs; this captures status, ownership,
// ordered sub-stages, the dependency (who it's pending with + why), blockers,
// an optional due date, a NULLABLE next step (tasks may have no defined next
// step), and an activity log. Internal staff only - never employee/candidate
// facing. Writes via atomicUpdateJson + auditLog, same as the admin surfaces.

export const HR_TASK_STATUSES = [
  'Not started',
  'In progress',
  'Blocked',
  'Waiting on input',
  'Done',
] as const
export type HrTaskStatus = (typeof HR_TASK_STATUSES)[number]

export const HR_TASK_STAGE_STATUSES = ['pending', 'current', 'done'] as const
export type HrTaskStageStatus = (typeof HR_TASK_STAGE_STATUSES)[number]

export interface HrTaskStage {
  id: string
  name: string
  order: number
  status: HrTaskStageStatus
  notes?: string
}

export interface HrTaskDependency {
  /** Who the task is pending with - person or team, free text. */
  pendingWith: string
  /** Optional link to a staff user. */
  pendingWithUserId?: string | null
  /** Why it is delayed. */
  reason: string
}

export interface HrTask {
  id: string
  title: string
  description: string
  status: HrTaskStatus
  /** Owning staff user. Null when unassigned. */
  ownerUserId: string | null
  /** Ordered sub-stages for multi-stage tasks; single-stage tasks keep an
   *  empty list. */
  stages: HrTaskStage[]
  /** The stage currently in flight; null for single-stage / unstarted. */
  currentStageId: string | null
  /** Who it is pending with + why. Null when nothing is blocking externally. */
  dependency: HrTaskDependency | null
  blocked: boolean
  blockerNote: string
  dueDate: string | null
  /** Nullable on purpose: a task may have no clearly defined next step. */
  nextStep: string | null
  createdAt: string
  createdBy: string
  updatedAt: string
  auditLog: AuditEntry[]
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
