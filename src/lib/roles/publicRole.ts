/*
 * Public projection of a Role.
 *
 * WHY THIS EXISTS. /careers is unauthenticated, and its index page passed
 * whole Role records into a client component. Anything handed to a client
 * component is serialised into the RSC payload, so every internal field
 * travelled to every visitor even though none of it was rendered. Live
 * production carried role auditLog arrays including internal staff email
 * addresses, plus rubric, pipelineStages and createdBy.
 *
 * ALLOWLIST, NOT BLOCKLIST. These functions build a NEW object from an
 * explicit field list. They never spread the source and never delete keys.
 * A blocklist is correct only until somebody adds a field to the model; an
 * allowlist is wrong only if somebody deliberately adds the new field here.
 * That is the difference between failing open and failing closed.
 *
 * publicRoleProjection.test.ts asserts the emitted key set equals the
 * allowlist exactly, so a field added to Role cannot silently reach the
 * public payload.
 */

import type { Role } from '@/lib/types'

/** Fields a public listing needs. Nothing else may appear. */
export const PUBLIC_ROLE_SUMMARY_FIELDS = [
  'id',
  'title',
  'department',
  'location',
  'employmentType',
] as const

/** Fields a public role detail page needs, on top of the summary. */
export const PUBLIC_ROLE_DETAIL_FIELDS = [
  ...PUBLIC_ROLE_SUMMARY_FIELDS,
  'description',
  'responsibilities',
  'mustHaves',
  'niceToHaves',
  'salary',
] as const

/**
 * Every Role field that must NEVER reach a public surface. Not used to filter
 * anything: the projections are allowlists. It exists so the guard test can
 * assert each one is absent by name, which makes the test read as the promise
 * it is enforcing rather than as an abstract key comparison.
 */
export const NEVER_PUBLIC_ROLE_FIELDS = [
  'auditLog',
  'salaryRange',
  'hodUserId',
  'hodRound2UserId',
  'rubric',
  'pipelineStages',
  'createdBy',
  'createdAt',
  'status',
  'pauseReason',
  'closeOutcome',
  'closeNotes',
] as const

export interface PublicRoleSummary {
  id: string
  title: string
  department: string
  location: string
  employmentType: string
}

/** Disclosed pay only. Absent entirely when the range is not disclosed. */
export interface PublicSalary {
  min: number
  max: number
  period: 'annual' | 'monthly'
}

export interface PublicRole extends PublicRoleSummary {
  description: string
  responsibilities: string[]
  mustHaves: string[]
  niceToHaves: string[]
  /** null when undisclosed, so min and max never serialise in that case. */
  salary: PublicSalary | null
}

/**
 * Narrow a role to what a public listing shows.
 * Built field by field on purpose. Do not refactor this into a spread.
 */
export function toPublicRoleSummary(role: Role): PublicRoleSummary {
  return {
    id: role.id,
    title: role.title,
    department: role.department,
    location: role.location,
    employmentType: role.employmentType,
  }
}

/**
 * Narrow a role to what a public detail page shows.
 *
 * `salaryRange.disclose` is honoured HERE rather than at render time: when a
 * range is not disclosed the numbers are not merely hidden, they are never put
 * into the returned object, so they cannot appear in the payload.
 */
export function toPublicRole(role: Role): PublicRole {
  const disclosed =
    role.salaryRange && role.salaryRange.disclose
      ? {
          min: role.salaryRange.min,
          max: role.salaryRange.max,
          period: role.salaryRange.period,
        }
      : null

  return {
    ...toPublicRoleSummary(role),
    description: role.description ?? '',
    responsibilities: role.responsibilities ?? [],
    mustHaves: role.mustHaves ?? [],
    niceToHaves: role.niceToHaves ?? [],
    salary: disclosed,
  }
}
