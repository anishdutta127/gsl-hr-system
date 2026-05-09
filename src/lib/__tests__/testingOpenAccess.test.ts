/*
 * Tests for the TESTING_OPEN_ACCESS env override. The flag opens up
 * Leadership bypass on document and exit-interview viewer allowlists,
 * but HOD and other tighter gates STAY enforced.
 *
 * REMOVE BEFORE PRODUCTION. The accompanying CLAUDE.md note explains
 * how Anish flips it on Vercel.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  canEditEmployeeDocuments,
  canViewEmployeeDocuments,
  isTestingOpenAccess,
} from '../documents'
import { canViewExitInterview, canEditExitInterview } from '../offboardingTasks'
import type { SessionClaims } from '../types'

const session = (overrides: Partial<SessionClaims> = {}): SessionClaims => ({
  sub: 'u',
  email: 'test@gsl.in',
  name: 'Test',
  role: 'HOD',
  iat: 0,
  exp: 0,
  ...overrides,
})

beforeEach(() => {
  delete process.env.TESTING_OPEN_ACCESS
  delete process.env.GSL_DOCUMENT_VIEWERS
  delete process.env.GSL_INTERVIEW_VIEWERS
})
afterEach(() => {
  delete process.env.TESTING_OPEN_ACCESS
  delete process.env.GSL_DOCUMENT_VIEWERS
  delete process.env.GSL_INTERVIEW_VIEWERS
})

describe('isTestingOpenAccess', () => {
  it('false by default', () => {
    expect(isTestingOpenAccess()).toBe(false)
  })
  it('only true on the literal string "true"', () => {
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(isTestingOpenAccess()).toBe(true)
    process.env.TESTING_OPEN_ACCESS = '1'
    expect(isTestingOpenAccess()).toBe(false)
    process.env.TESTING_OPEN_ACCESS = 'TRUE'
    expect(isTestingOpenAccess()).toBe(false)
  })
})

describe('TESTING_OPEN_ACCESS — documents', () => {
  it('off: Leadership without allowlist is blocked', () => {
    expect(canViewEmployeeDocuments(session({ role: 'Leadership' }))).toBe(false)
  })

  it('on: Leadership bypasses the GSL_DOCUMENT_VIEWERS allowlist', () => {
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(
      canViewEmployeeDocuments(session({ role: 'Leadership', email: 'random@gsl.in' })),
    ).toBe(true)
  })

  it('on: HOD STAYS blocked even with the flag set', () => {
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(canViewEmployeeDocuments(session({ role: 'HOD' }))).toBe(false)
  })

  it('on: edit gate still HR/Admin-only (Leadership cannot edit)', () => {
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(canEditEmployeeDocuments(session({ role: 'Leadership' }))).toBe(false)
  })
})

describe('TESTING_OPEN_ACCESS — exit interviews', () => {
  it('off: Leadership without allowlist is blocked', () => {
    expect(canViewExitInterview(session({ role: 'Leadership' }))).toBe(false)
  })

  it('on: Leadership bypasses GSL_INTERVIEW_VIEWERS allowlist', () => {
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(
      canViewExitInterview(session({ role: 'Leadership', email: 'random@gsl.in' })),
    ).toBe(true)
  })

  it('on: HOD STAYS blocked from exit interviews', () => {
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(canViewExitInterview(session({ role: 'HOD' }))).toBe(false)
  })

  it('on: edit gate still HR/Admin-only', () => {
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(canEditExitInterview(session({ role: 'Leadership' }))).toBe(false)
  })
})

describe('TESTING_OPEN_ACCESS — does NOT widen HR/Admin (already full)', () => {
  it('HR and Admin always see everything regardless of flag', () => {
    expect(canViewEmployeeDocuments(session({ role: 'HR' }))).toBe(true)
    expect(canViewEmployeeDocuments(session({ role: 'Admin' }))).toBe(true)
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(canViewEmployeeDocuments(session({ role: 'HR' }))).toBe(true)
    expect(canViewEmployeeDocuments(session({ role: 'Admin' }))).toBe(true)
  })
})
