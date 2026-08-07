/*
 * Canonical spec of which Role fields are editable, and by which surface.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Role edits are queue-mediated: the API appends an intent to
 * pending_updates.json, and `scripts/apply_queue.py` later writes the fields
 * onto the record. The runner's `role.*` branch copies an EXPLICIT tuple of
 * keys. Any field the API enqueues that is missing from that tuple is
 * silently dropped: the queue write succeeds, the UI reports success, the
 * audit entry is appended, and the value never changes.
 *
 * That is exactly the failure this module exists to make impossible.
 * `roleRunnerParity.test.ts` parses the runner's tuple out of the Python
 * source and asserts it equals ROLE_RUNNER_WRITABLE_FIELDS, so adding a
 * field here without teaching the runner about it fails the build rather
 * than losing a write in production.
 */

/**
 * Every field the apply runner's `role.*` branch writes onto the record.
 * Kept in lockstep with the key tuple in `scripts/apply_queue.py`.
 */
export const ROLE_RUNNER_WRITABLE_FIELDS = [
  'title',
  'department',
  'location',
  'employmentType',
  'status',
  'pauseReason',
  'closeOutcome',
  'closeNotes',
  'description',
  'responsibilities',
  'mustHaves',
  'niceToHaves',
  'salaryRange',
  'hodUserId',
  'hodRound2UserId',
] as const

export type RoleRunnerWritableField = (typeof ROLE_RUNNER_WRITABLE_FIELDS)[number]

/**
 * Fields owned by the lifecycle route (`PATCH /api/roles/[id]/status`).
 * They carry their own transition guards (a role with in-flight candidates
 * cannot be closed without an outcome, etc.), so the details editor must not
 * also write them.
 */
export const ROLE_LIFECYCLE_FIELDS = [
  'status',
  'pauseReason',
  'closeOutcome',
  'closeNotes',
] as const

/**
 * Fields the role details editor (`PATCH /api/roles/[id]`) accepts.
 * Derived, not hand-listed, so it cannot drift from the runner's set.
 */
export const ROLE_DETAIL_EDITABLE_FIELDS = ROLE_RUNNER_WRITABLE_FIELDS.filter(
  (f): f is Exclude<RoleRunnerWritableField, (typeof ROLE_LIFECYCLE_FIELDS)[number]> =>
    !(ROLE_LIFECYCLE_FIELDS as readonly string[]).includes(f),
)

export type RoleDetailEditableField = (typeof ROLE_DETAIL_EDITABLE_FIELDS)[number]

/**
 * Fields deliberately NOT editable, each with the reason. Surfaced in the UI
 * and asserted by tests so a future reader does not have to guess whether an
 * omission was a decision or an oversight.
 */
export const ROLE_IMMUTABLE_FIELDS: Record<string, string> = {
  id: 'Identity. Every application, offer and interview record keys on this id; changing it would orphan the pipeline.',
  createdAt: 'Historical fact. Rewriting it would falsify the audit trail.',
  createdBy: 'Historical fact. Rewriting it would falsify the audit trail.',
  auditLog: 'Append-only by construction. Every edit appends one entry; entries are never rewritten.',
  pipelineStages:
    'Load-bearing for in-flight candidates: each application carries a currentStage that must exist in this array. Editing it without a candidate-migration step would strand candidates on a stage the role no longer has. Needs its own guarded editor.',
  rubric: 'Has a dedicated editor at /roles/[id]/rubric.',
}

/** Employment types accepted by the details editor. */
export const ROLE_EMPLOYMENT_TYPES = [
  'Full-time',
  'Part-time',
  'Contract',
  'Internship',
] as const

/** Departments offered in the picker. Free text is still accepted on write. */
export const ROLE_DEPARTMENTS = [
  'Academics',
  'Premium Sales',
  'Operations',
  'STEM',
  'Marketing',
  'Instructional Design',
  'Other',
] as const

/** Locations offered in the picker. Free text is still accepted on write. */
export const ROLE_LOCATIONS = ['Mumbai', 'Delhi', 'Bengaluru', 'Remote', 'Hybrid'] as const

export const ROLE_TITLE_MAX_LENGTH = 120
