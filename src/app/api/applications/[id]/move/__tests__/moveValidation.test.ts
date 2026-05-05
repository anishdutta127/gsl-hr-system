import { describe, expect, it } from 'vitest'
import { isTerminal } from '@/lib/pipeline'
import { canAcceptNewCandidates } from '@/lib/roleStatus'
import type { Application, Role } from '@/lib/types'

/*
 * Pure-function harness around the predicate set the move route uses so the
 * decisions stay regression-testable without mocking next/server, sessions,
 * the GitHub queue, or the filesystem. Mirror of the API guard chain.
 */
type MoveCheck =
  | { ok: true; warn: false }
  | { ok: true; warn: true; reason: string }
  | { ok: false; status: 400 | 404 | 409; message: string }

function checkMove(
  apps: Application[],
  roles: Role[],
  sourceAppId: string,
  destinationRoleId: string,
  force: boolean,
): MoveCheck {
  const sourceApp = apps.find((a) => a.id === sourceAppId)
  if (!sourceApp) return { ok: false, status: 404, message: 'Source application not found.' }

  if (sourceApp.roleId === destinationRoleId) {
    return { ok: false, status: 400, message: 'Source and destination roles are the same.' }
  }

  const destinationRole = roles.find((r) => r.id === destinationRoleId)
  if (!destinationRole) return { ok: false, status: 404, message: 'Destination role not found.' }

  if (!canAcceptNewCandidates(destinationRole)) {
    return { ok: false, status: 400, message: `Destination role is ${destinationRole.status}` }
  }

  if (sourceApp.currentStage === 'Joined') {
    return {
      ok: false,
      status: 400,
      message: 'Cannot move a candidate who has already Joined for this role.',
    }
  }

  const dup = apps.find(
    (a) =>
      a.candidateId === sourceApp.candidateId &&
      a.roleId === destinationRoleId &&
      !['Rejected', 'Withdrawn', 'NotInterested'].includes(a.currentStage as string),
  )
  if (dup) {
    return { ok: false, status: 409, message: 'Candidate already in destination role.' }
  }

  if (
    ['Offered', 'OfferAccepted', 'DocsCollected'].includes(sourceApp.currentStage as string) &&
    !force
  ) {
    return { ok: true, warn: true, reason: 'past-offer' }
  }

  return { ok: true, warn: false }
}

const role = (id: string, status: Role['status'] = 'Open'): Role => ({
  id,
  title: `Role ${id}`,
  department: 'Academics',
  location: 'Mumbai',
  employmentType: 'Full-time',
  status,
  pipelineStages: ['Sourced', 'Shortlisted'],
  rubric: [],
  description: 'desc',
  responsibilities: [],
  mustHaves: [],
  niceToHaves: [],
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'seed',
  auditLog: [],
})

const app = (
  id: string,
  candidateId: string,
  roleId: string,
  currentStage: Application['currentStage'] = 'Sourced',
): Application => ({
  id,
  candidateId,
  roleId,
  currentStage,
  stageEnteredAt: '2026-04-01T00:00:00Z',
  createdAt: '2026-04-01T00:00:00Z',
  createdBy: 'seed',
  auditLog: [],
})

describe('move route guard chain', () => {
  it('rejects when source application is missing', () => {
    const r = checkMove([], [role('R')], 'missing', 'R', false)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(404)
  })

  it('rejects when source and destination roles are the same', () => {
    const apps = [app('A1', 'C1', 'R1')]
    const r = checkMove(apps, [role('R1')], 'A1', 'R1', false)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('rejects when destination role is closed', () => {
    const apps = [app('A1', 'C1', 'R1')]
    const r = checkMove(apps, [role('R1'), role('R2', 'Closed')], 'A1', 'R2', false)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('blocks Move when source is Joined (terminal-employee)', () => {
    const apps = [app('A1', 'C1', 'R1', 'Joined')]
    const r = checkMove(apps, [role('R1'), role('R2')], 'A1', 'R2', false)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(400)
      expect(r.message).toMatch(/Joined/i)
    }
  })

  it('rejects duplicate when candidate already active in destination', () => {
    const apps = [
      app('A1', 'C1', 'R1', 'Sourced'),
      app('A2', 'C1', 'R2', 'Shortlisted'),
    ]
    const r = checkMove(apps, [role('R1'), role('R2')], 'A1', 'R2', false)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(409)
  })

  it('allows duplicate when prior destination application is Withdrawn', () => {
    const apps = [
      app('A1', 'C1', 'R1', 'Sourced'),
      app('A2', 'C1', 'R2', 'Withdrawn'),
    ]
    const r = checkMove(apps, [role('R1'), role('R2')], 'A1', 'R2', false)
    expect(r.ok).toBe(true)
  })

  it('warns (without blocking) when source is at Offered and force is false', () => {
    const apps = [app('A1', 'C1', 'R1', 'Offered')]
    const r = checkMove(apps, [role('R1'), role('R2')], 'A1', 'R2', false)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warn).toBe(true)
  })

  it('proceeds without warning when force is true past Offered', () => {
    const apps = [app('A1', 'C1', 'R1', 'OfferAccepted')]
    const r = checkMove(apps, [role('R1'), role('R2')], 'A1', 'R2', true)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warn).toBe(false)
  })

  it('proceeds for a normal Sourced application', () => {
    const apps = [app('A1', 'C1', 'R1', 'Sourced')]
    const r = checkMove(apps, [role('R1'), role('R2')], 'A1', 'R2', false)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warn).toBe(false)
  })
})

describe('isTerminal', () => {
  it('considers Joined and Withdrawn terminal', () => {
    expect(isTerminal('Joined')).toBe(true)
    expect(isTerminal('Withdrawn')).toBe(true)
    expect(isTerminal('Sourced')).toBe(false)
  })
})
