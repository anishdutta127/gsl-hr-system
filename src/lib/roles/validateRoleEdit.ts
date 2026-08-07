/*
 * Pure validation + diff for a role details edit.
 *
 * Kept out of the route handler so it can be unit-tested without a request,
 * a session, or the queue. The route stays a thin caller: authorise, call
 * this, enqueue the diff.
 */

import {
  ROLE_DEPARTMENTS,
  ROLE_EMPLOYMENT_TYPES,
  ROLE_LOCATIONS,
  ROLE_TITLE_MAX_LENGTH,
} from './editableFields'
import type { Role } from '@/lib/types'

export const MAX_DESCRIPTION_BYTES = 50 * 1024 // 50 KB rendered HTML
export const MAX_LIST_ITEMS = 40
export const MAX_LIST_ITEM_LENGTH = 300
export const MAX_FIELD_LENGTH = 120

export interface RoleEditInput {
  [key: string]: unknown
}

export interface RoleEditResult {
  ok: boolean
  /** Human-readable failure, suitable for a 400 body. */
  message?: string
  /** Fields whose value actually changed. Empty means no-op. */
  after: Record<string, unknown>
  /** Prior values for the same keys, for the audit entry. */
  before: Record<string, unknown>
}

function fail(message: string): RoleEditResult {
  return { ok: false, message, after: {}, before: {} }
}

/** Normalise a string[] payload: trim, drop blanks, cap length. */
function normaliseList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const items = value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
  if (items.length !== value.filter((v) => typeof v === 'string' && v.trim().length > 0).length) {
    return null
  }
  return items
}

function sameList(a: readonly string[] | undefined, b: readonly string[]): boolean {
  const left = a ?? []
  if (left.length !== b.length) return false
  return left.every((v, i) => v === b[i])
}

/**
 * Validate an edit payload against the current role and return the diff.
 *
 * `sanitiseDescription` is injected so this module stays free of the HTML
 * sanitiser's dependencies and remains trivially testable.
 */
export function validateRoleEdit(
  role: Role,
  body: RoleEditInput,
  options: {
    sanitiseDescription: (html: string) => string
    knownUserIds?: ReadonlySet<string>
  },
): RoleEditResult {
  const after: Record<string, unknown> = {}
  const before: Record<string, unknown> = {}

  const setIfChanged = (key: string, next: unknown, current: unknown) => {
    if (next !== current) {
      before[key] = current
      after[key] = next
    }
  }

  // --- title -------------------------------------------------------------
  if ('title' in body) {
    if (typeof body.title !== 'string') return fail('Role title must be text.')
    const title = body.title.trim()
    if (!title) return fail('Role title is required.')
    if (title.length > ROLE_TITLE_MAX_LENGTH) {
      return fail(`Role title is too long (max ${ROLE_TITLE_MAX_LENGTH} characters).`)
    }
    setIfChanged('title', title, role.title)
  }

  // --- department --------------------------------------------------------
  if ('department' in body) {
    if (typeof body.department !== 'string') return fail('Department must be text.')
    const department = body.department.trim()
    if (!department) return fail('Department is required.')
    if (department.length > MAX_FIELD_LENGTH) {
      return fail(`Department is too long (max ${MAX_FIELD_LENGTH} characters).`)
    }
    setIfChanged('department', department, role.department)
  }

  // --- location ----------------------------------------------------------
  if ('location' in body) {
    if (typeof body.location !== 'string') return fail('Location must be text.')
    const location = body.location.trim()
    if (!location) return fail('Location is required.')
    if (location.length > MAX_FIELD_LENGTH) {
      return fail(`Location is too long (max ${MAX_FIELD_LENGTH} characters).`)
    }
    setIfChanged('location', location, role.location)
  }

  // --- employmentType ----------------------------------------------------
  if ('employmentType' in body) {
    if (
      typeof body.employmentType !== 'string' ||
      !(ROLE_EMPLOYMENT_TYPES as readonly string[]).includes(body.employmentType)
    ) {
      return fail(`Employment type must be one of: ${ROLE_EMPLOYMENT_TYPES.join(', ')}.`)
    }
    setIfChanged('employmentType', body.employmentType, role.employmentType)
  }

  // --- description -------------------------------------------------------
  if ('description' in body) {
    if (typeof body.description !== 'string') return fail('Description must be text.')
    if (body.description.length > MAX_DESCRIPTION_BYTES) {
      return fail(
        `Description is too long (${MAX_DESCRIPTION_BYTES.toLocaleString('en-IN')} characters max).`,
      )
    }
    const cleaned = options.sanitiseDescription(body.description)
    setIfChanged('description', cleaned, role.description)
  }

  // --- JD lists ----------------------------------------------------------
  for (const key of ['responsibilities', 'mustHaves', 'niceToHaves'] as const) {
    if (!(key in body)) continue
    const items = normaliseList(body[key])
    if (items === null) return fail(`${key} must be a list of text lines.`)
    if (items.length > MAX_LIST_ITEMS) {
      return fail(`Too many entries in ${key} (max ${MAX_LIST_ITEMS}).`)
    }
    const tooLong = items.find((i) => i.length > MAX_LIST_ITEM_LENGTH)
    if (tooLong) {
      return fail(`An entry in ${key} is too long (max ${MAX_LIST_ITEM_LENGTH} characters).`)
    }
    if (!sameList(role[key], items)) {
      before[key] = role[key] ?? []
      after[key] = items
    }
  }

  // --- HOD assignment ----------------------------------------------------
  for (const key of ['hodUserId', 'hodRound2UserId'] as const) {
    if (!(key in body)) continue
    const raw = body[key]
    if (raw === null || raw === '') {
      setIfChanged(key, undefined, role[key])
      continue
    }
    if (typeof raw !== 'string') return fail('HOD must be a user id.')
    if (options.knownUserIds && !options.knownUserIds.has(raw)) {
      return fail('That HOD is not an active user.')
    }
    setIfChanged(key, raw, role[key])
  }

  // --- salary range ------------------------------------------------------
  if ('salaryRange' in body) {
    const raw = body.salaryRange
    if (raw === null) {
      if (role.salaryRange !== undefined) {
        before.salaryRange = role.salaryRange
        after.salaryRange = undefined
      }
    } else if (typeof raw === 'object' && raw !== null) {
      const r = raw as Record<string, unknown>
      const min = typeof r.min === 'number' ? r.min : Number(r.min)
      const max = typeof r.max === 'number' ? r.max : Number(r.max)
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return fail('Salary range needs numeric minimum and maximum values.')
      }
      if (min < 0 || max < 0) return fail('Salary values cannot be negative.')
      if (min > max) return fail('Salary minimum cannot exceed the maximum.')
      const period = r.period === 'monthly' ? 'monthly' : 'annual'
      const disclose = r.disclose === true
      const next = { min, max, currency: 'INR' as const, period, disclose }
      const current = role.salaryRange
      const unchanged =
        current !== undefined &&
        current.min === next.min &&
        current.max === next.max &&
        current.period === next.period &&
        current.disclose === next.disclose
      if (!unchanged) {
        before.salaryRange = current
        after.salaryRange = next
      }
    } else {
      return fail('Salary range must be an object or null.')
    }
  }

  return { ok: true, after, before }
}
