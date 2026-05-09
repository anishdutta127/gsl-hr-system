/*
 * Tests for the testing-vs-production access posture.
 *
 * Defaults are OPEN. Setting TESTING_OPEN_ACCESS=false (production)
 * narrows Leadership to the GSL_DOCUMENT_VIEWERS / GSL_INTERVIEW_VIEWERS
 * allowlists. HOD and other role-correctness gates STAY enforced
 * regardless — those are role-correctness, not access-correctness.
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
  it('TRUE by default (env unset = testing-default open)', () => {
    expect(isTestingOpenAccess()).toBe(true)
  })

  it('TRUE when explicitly set to "true"', () => {
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(isTestingOpenAccess()).toBe(true)
  })

  it('FALSE only when explicitly set to "false"', () => {
    process.env.TESTING_OPEN_ACCESS = 'false'
    expect(isTestingOpenAccess()).toBe(false)
  })

  it('Empty string treated as unset (still open)', () => {
    process.env.TESTING_OPEN_ACCESS = ''
    expect(isTestingOpenAccess()).toBe(true)
  })

  it('Any other value treated as open (production must explicitly say "false")', () => {
    process.env.TESTING_OPEN_ACCESS = 'TRUE'
    expect(isTestingOpenAccess()).toBe(true)
    process.env.TESTING_OPEN_ACCESS = '1'
    expect(isTestingOpenAccess()).toBe(true)
    process.env.TESTING_OPEN_ACCESS = '0'
    expect(isTestingOpenAccess()).toBe(true)
  })
})

describe('Default-open posture — documents', () => {
  it('Default (env unset): Leadership can view documents', () => {
    expect(canViewEmployeeDocuments(session({ role: 'Leadership' }))).toBe(true)
  })

  it('TESTING_OPEN_ACCESS=true: Leadership can view (explicit testing mode)', () => {
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(
      canViewEmployeeDocuments(session({ role: 'Leadership', email: 'random@gsl.in' })),
    ).toBe(true)
  })

  it('TESTING_OPEN_ACCESS=false + viewers UNSET: Leadership still in (allowlist defaulted-open)', () => {
    process.env.TESTING_OPEN_ACCESS = 'false'
    expect(
      canViewEmployeeDocuments(session({ role: 'Leadership', email: 'random@gsl.in' })),
    ).toBe(true)
  })

  it('Production lockdown: TESTING_OPEN_ACCESS=false + viewer allowlist set', () => {
    process.env.TESTING_OPEN_ACCESS = 'false'
    process.env.GSL_DOCUMENT_VIEWERS = 'ameet.z@getsetlearn.info'
    expect(
      canViewEmployeeDocuments(session({ role: 'Leadership', email: 'ameet.z@getsetlearn.info' })),
    ).toBe(true)
    expect(
      canViewEmployeeDocuments(session({ role: 'Leadership', email: 'random@gsl.in' })),
    ).toBe(false)
  })

  it('HOD STAYS blocked regardless of flag (role-correctness)', () => {
    expect(canViewEmployeeDocuments(session({ role: 'HOD' }))).toBe(false)
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(canViewEmployeeDocuments(session({ role: 'HOD' }))).toBe(false)
    process.env.TESTING_OPEN_ACCESS = 'false'
    expect(canViewEmployeeDocuments(session({ role: 'HOD' }))).toBe(false)
  })

  it('Edit gate still HR/Admin-only (Leadership cannot edit even when open)', () => {
    expect(canEditEmployeeDocuments(session({ role: 'Leadership' }))).toBe(false)
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(canEditEmployeeDocuments(session({ role: 'Leadership' }))).toBe(false)
  })
})

describe('Default-open posture — exit interviews', () => {
  it('Default (env unset): Leadership can view exit interviews', () => {
    expect(canViewExitInterview(session({ role: 'Leadership' }))).toBe(true)
  })

  it('TESTING_OPEN_ACCESS=false + viewers UNSET: Leadership still in', () => {
    process.env.TESTING_OPEN_ACCESS = 'false'
    expect(
      canViewExitInterview(session({ role: 'Leadership', email: 'random@gsl.in' })),
    ).toBe(true)
  })

  it('Production lockdown: TESTING_OPEN_ACCESS=false + interview allowlist set', () => {
    process.env.TESTING_OPEN_ACCESS = 'false'
    process.env.GSL_INTERVIEW_VIEWERS = 'ameet.z@getsetlearn.info'
    expect(
      canViewExitInterview(session({ role: 'Leadership', email: 'ameet.z@getsetlearn.info' })),
    ).toBe(true)
    expect(
      canViewExitInterview(session({ role: 'Leadership', email: 'random@gsl.in' })),
    ).toBe(false)
  })

  it('HOD STAYS blocked regardless of flag (role-correctness)', () => {
    expect(canViewExitInterview(session({ role: 'HOD' }))).toBe(false)
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(canViewExitInterview(session({ role: 'HOD' }))).toBe(false)
    process.env.TESTING_OPEN_ACCESS = 'false'
    expect(canViewExitInterview(session({ role: 'HOD' }))).toBe(false)
  })

  it('Edit gate still HR/Admin-only', () => {
    expect(canEditExitInterview(session({ role: 'Leadership' }))).toBe(false)
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(canEditExitInterview(session({ role: 'Leadership' }))).toBe(false)
  })
})

describe('HR/Admin always full', () => {
  it('Always see everything regardless of flag', () => {
    expect(canViewEmployeeDocuments(session({ role: 'HR' }))).toBe(true)
    expect(canViewEmployeeDocuments(session({ role: 'Admin' }))).toBe(true)
    expect(canViewExitInterview(session({ role: 'HR' }))).toBe(true)
    expect(canViewExitInterview(session({ role: 'Admin' }))).toBe(true)
    process.env.TESTING_OPEN_ACCESS = 'false'
    process.env.GSL_DOCUMENT_VIEWERS = 'never@gsl.in'
    process.env.GSL_INTERVIEW_VIEWERS = 'never@gsl.in'
    expect(canViewEmployeeDocuments(session({ role: 'HR' }))).toBe(true)
    expect(canViewEmployeeDocuments(session({ role: 'Admin' }))).toBe(true)
    expect(canViewExitInterview(session({ role: 'HR' }))).toBe(true)
    expect(canViewExitInterview(session({ role: 'Admin' }))).toBe(true)
  })
})
