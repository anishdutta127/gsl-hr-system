import { describe, expect, it } from 'vitest'
import {
  canNominateEmployee,
  canTransition,
  validateWriteup,
} from '../recognitionState'

describe('canTransition - role gates', () => {
  it('HOD can nominate (Draft -> Nominated)', () => {
    const res = canTransition({ current: 'Draft', action: 'nominate', actorRole: 'HOD' })
    expect(res.ok).toBe(true)
    expect(res.next).toBe('Nominated')
  })

  it('HR can nominate (Admin/HR may submit nominations directly)', () => {
    expect(
      canTransition({ current: 'Draft', action: 'nominate', actorRole: 'HR' }).ok,
    ).toBe(true)
    expect(
      canTransition({ current: 'Draft', action: 'nominate', actorRole: 'Admin' }).ok,
    ).toBe(true)
  })

  it('Leadership CANNOT nominate', () => {
    const res = canTransition({ current: 'Draft', action: 'nominate', actorRole: 'Leadership' })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/Leadership/)
  })

  it('HOD CANNOT approve (only HR-Admin approves)', () => {
    const res = canTransition({ current: 'Nominated', action: 'approve', actorRole: 'HOD' })
    expect(res.ok).toBe(false)
  })

  it('HR can approve a Nominated record', () => {
    const res = canTransition({ current: 'Nominated', action: 'approve', actorRole: 'HR' })
    expect(res.ok).toBe(true)
    expect(res.next).toBe('Approved')
  })

  it('Admin can approve a Nominated record', () => {
    const res = canTransition({ current: 'Nominated', action: 'approve', actorRole: 'Admin' })
    expect(res.ok).toBe(true)
    expect(res.next).toBe('Approved')
  })

  it('HOD CANNOT publish', () => {
    const res = canTransition({ current: 'Approved', action: 'publish', actorRole: 'HOD' })
    expect(res.ok).toBe(false)
  })

  it('HR can publish an Approved record', () => {
    const res = canTransition({ current: 'Approved', action: 'publish', actorRole: 'HR' })
    expect(res.ok).toBe(true)
    expect(res.next).toBe('Published')
  })

  it('Leadership cannot archive or edit', () => {
    expect(
      canTransition({ current: 'Approved', action: 'archive', actorRole: 'Leadership' }).ok,
    ).toBe(false)
    expect(
      canTransition({ current: 'Nominated', action: 'edit', actorRole: 'Leadership' }).ok,
    ).toBe(false)
  })
})

describe('canTransition - state machine', () => {
  it('Cannot nominate from Nominated (already nominated)', () => {
    const res = canTransition({ current: 'Nominated', action: 'nominate', actorRole: 'HOD' })
    expect(res.ok).toBe(false)
  })

  it('Cannot approve from Draft (must go through Nominated)', () => {
    const res = canTransition({ current: 'Draft', action: 'approve', actorRole: 'HR' })
    expect(res.ok).toBe(false)
  })

  it('Cannot publish from Nominated (must approve first)', () => {
    const res = canTransition({ current: 'Nominated', action: 'publish', actorRole: 'HR' })
    expect(res.ok).toBe(false)
  })

  it('Cannot revert Published back to Approved (no rewind)', () => {
    const res = canTransition({ current: 'Published', action: 'approve', actorRole: 'Admin' })
    expect(res.ok).toBe(false)
  })

  it('Archived is terminal - cannot leave', () => {
    expect(
      canTransition({ current: 'Archived', action: 'approve', actorRole: 'HR' }).ok,
    ).toBe(false)
    expect(
      canTransition({ current: 'Archived', action: 'publish', actorRole: 'HR' }).ok,
    ).toBe(false)
    expect(
      canTransition({ current: 'Archived', action: 'edit', actorRole: 'HR' }).ok,
    ).toBe(false)
  })

  it('Reject (Nominated) lands in Archived', () => {
    const res = canTransition({ current: 'Nominated', action: 'reject', actorRole: 'HR' })
    expect(res.ok).toBe(true)
    expect(res.next).toBe('Archived')
  })

  it('Archive may be triggered from any non-terminal status', () => {
    const fromNominated = canTransition({
      current: 'Nominated',
      action: 'archive',
      actorRole: 'HR',
    })
    const fromApproved = canTransition({
      current: 'Approved',
      action: 'archive',
      actorRole: 'HR',
    })
    const fromPublished = canTransition({
      current: 'Published',
      action: 'archive',
      actorRole: 'HR',
    })
    expect(fromNominated.ok).toBe(true)
    expect(fromApproved.ok).toBe(true)
    expect(fromPublished.ok).toBe(true)
  })

  it('Edit allowed on Draft + Nominated only', () => {
    expect(
      canTransition({ current: 'Draft', action: 'edit', actorRole: 'HR' }).ok,
    ).toBe(true)
    expect(
      canTransition({ current: 'Nominated', action: 'edit', actorRole: 'HR' }).ok,
    ).toBe(true)
    expect(
      canTransition({ current: 'Approved', action: 'edit', actorRole: 'HR' }).ok,
    ).toBe(false)
    expect(
      canTransition({ current: 'Published', action: 'edit', actorRole: 'HR' }).ok,
    ).toBe(false)
  })

  it('Full happy path: Draft -> Nominated -> Approved -> Published', () => {
    // HOD nominates.
    const nominate = canTransition({
      current: 'Draft',
      action: 'nominate',
      actorRole: 'HOD',
    })
    expect(nominate.next).toBe('Nominated')
    // HR approves.
    const approve = canTransition({
      current: 'Nominated',
      action: 'approve',
      actorRole: 'HR',
    })
    expect(approve.next).toBe('Approved')
    // HR publishes.
    const publish = canTransition({
      current: 'Approved',
      action: 'publish',
      actorRole: 'HR',
    })
    expect(publish.next).toBe('Published')
  })
})

describe('canNominateEmployee', () => {
  it('Admin can nominate anyone', () => {
    expect(
      canNominateEmployee({
        actorRole: 'Admin',
        employeeDepartment: 'Academics',
      }),
    ).toBe(true)
  })

  it('HR can nominate anyone', () => {
    expect(
      canNominateEmployee({
        actorRole: 'HR',
        employeeDepartment: 'Sales',
      }),
    ).toBe(true)
  })

  it('HOD can nominate within their own department', () => {
    expect(
      canNominateEmployee({
        actorRole: 'HOD',
        actorDepartment: 'Academics',
        employeeDepartment: 'Academics',
      }),
    ).toBe(true)
  })

  it('HOD CANNOT nominate outside their department', () => {
    expect(
      canNominateEmployee({
        actorRole: 'HOD',
        actorDepartment: 'Academics',
        employeeDepartment: 'Sales',
      }),
    ).toBe(false)
  })

  it('HOD without a recorded department cannot nominate', () => {
    expect(
      canNominateEmployee({
        actorRole: 'HOD',
        employeeDepartment: 'Academics',
      }),
    ).toBe(false)
  })

  it('Department comparison is case-insensitive and ignores whitespace', () => {
    expect(
      canNominateEmployee({
        actorRole: 'HOD',
        actorDepartment: 'academics ',
        employeeDepartment: 'Academics',
      }),
    ).toBe(true)
  })

  it('Leadership cannot nominate (read-only role)', () => {
    expect(
      canNominateEmployee({
        actorRole: 'Leadership',
        employeeDepartment: 'Sales',
      }),
    ).toBe(false)
  })
})

describe('validateWriteup', () => {
  it('rejects writeups shorter than 30 chars', () => {
    expect(validateWriteup('too short')).toMatch(/at least 30/)
  })

  it('rejects whitespace-only padding', () => {
    expect(validateWriteup('    \n   \t   ')).toMatch(/at least 30/)
  })

  it('accepts writeup of exactly 30 chars', () => {
    expect(validateWriteup('A'.repeat(30))).toBeNull()
  })

  it('rejects writeup longer than 800 chars', () => {
    expect(validateWriteup('A'.repeat(801))).toMatch(/800 characters or fewer/)
  })

  it('accepts writeup of exactly 800 chars', () => {
    expect(validateWriteup('A'.repeat(800))).toBeNull()
  })

  it('returns null on a normal writeup', () => {
    expect(
      validateWriteup(
        'Manali stepped up during the Bangalore launch and consistently went above and beyond.',
      ),
    ).toBeNull()
  })
})
