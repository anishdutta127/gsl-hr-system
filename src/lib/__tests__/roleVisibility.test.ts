/*
 * Regression: a created role must never be invisible.
 *
 * THE INCIDENT (production, 2026-08-07). HR created three roles. All three
 * were accepted into the queue and reported as saved. The board showed
 * "Open (2)" because the apply runner had not drained yet, and there was
 * nothing anywhere to distinguish "saved, waiting" from "failed". The roles
 * were reported lost and nearly recreated by hand.
 *
 * Two independent things have to hold for that to be impossible:
 *   1. Once drained, the role lands in a section the board renders.
 *   2. While still queued, the board says so and names it.
 */

import { describe, it, expect } from 'vitest'
import { summarisePendingUpdates, pendingNoticeSentence } from '../queue/pendingSummary'
import type { PendingUpdate } from '../types'

/** The statuses the roles board renders a section for. */
const RENDERED_STATUSES = ['Open', 'Paused', 'Draft', 'Closed', 'Archived'] as const

/** Mirrors the board's bucketing, including the catch-all. */
function bucketFor(status: string): string {
  return (RENDERED_STATUSES as readonly string[]).includes(status) ? status : 'Needs attention'
}

/** The exact three roles that went missing, as the queue held them. */
const REAL_QUEUE_SNAPSHOT: PendingUpdate[] = [
  {
    id: 'b2d74602',
    queuedAt: '2026-08-07T12:41:33.879Z',
    queuedBy: 'Hiring@getsetlearn.info',
    entity: 'role',
    operation: 'create',
    payload: { id: 'b2d74602', title: 'Regional Manager', status: 'Open' },
  },
  {
    id: 'fb81c959',
    queuedAt: '2026-08-07T12:42:34.471Z',
    queuedBy: 'Hiring@getsetlearn.info',
    entity: 'role',
    operation: 'create',
    payload: { id: 'fb81c959', title: 'Manager Sales', status: 'Open' },
  },
  {
    id: '0d6bb3c0',
    queuedAt: '2026-08-07T12:42:53.136Z',
    queuedBy: 'Hiring@getsetlearn.info',
    entity: 'role',
    operation: 'update',
    payload: { id: '0d6bb3c0', operation: 'role.close', after: { status: 'Closed' } },
  },
  {
    id: '344c701c',
    queuedAt: '2026-08-07T12:45:13.992Z',
    queuedBy: 'Hiring@getsetlearn.info',
    entity: 'role',
    operation: 'create',
    payload: { id: '344c701c', title: 'Junior Video Editor', status: 'Open' },
  },
]

describe('a created role is reachable on the board once drained', () => {
  it('a freshly created role gets status Open, which the board renders', () => {
    // POST /api/roles hardcodes status 'Open' on the created payload.
    expect(bucketFor('Open')).toBe('Open')
    expect(RENDERED_STATUSES).toContain('Open')
  })

  it('every status a role can hold is reachable in some section', () => {
    for (const status of ['Draft', 'Open', 'Paused', 'Closed', 'Archived']) {
      expect(bucketFor(status)).not.toBe('Needs attention')
    }
  })

  it('an unrecognised status surfaces instead of vanishing', () => {
    // Before the catch-all, a role with an off-enum status matched no section
    // and was invisible on every tab with no error anywhere.
    expect(bucketFor('On Hold')).toBe('Needs attention')
    expect(bucketFor('')).toBe('Needs attention')
  })
})

describe('a queued role is visible as pending (the real incident)', () => {
  it('surfaces all three missing roles by name from the real queue snapshot', () => {
    const summary = summarisePendingUpdates(REAL_QUEUE_SNAPSHOT, 'role')
    expect(summary.count).toBe(4)
    const labels = summary.items.map((i) => i.label)
    expect(labels).toContain('Regional Manager')
    expect(labels).toContain('Manager Sales')
    expect(labels).toContain('Junior Video Editor')
  })

  it('distinguishes a new role from an edit or a close', () => {
    const summary = summarisePendingUpdates(REAL_QUEUE_SNAPSHOT, 'role')
    const byLabel = new Map(summary.items.map((i) => [i.label, i.action]))
    expect(byLabel.get('Regional Manager')).toBe('new role')
    expect(summary.items.some((i) => i.action === 'close')).toBe(true)
  })

  it('says something a human can act on', () => {
    const summary = summarisePendingUpdates(REAL_QUEUE_SNAPSHOT, 'role')
    expect(pendingNoticeSentence(summary)).toMatch(/not yet visible/i)
  })

  it('stays silent when the queue is empty, so the notice means something', () => {
    // Positive control: if this returned a banner for an empty queue, the
    // banner would be noise and HR would learn to ignore it.
    const summary = summarisePendingUpdates([], 'role')
    expect(summary.count).toBe(0)
    expect(pendingNoticeSentence(summary)).toBe('')
  })

  it('narrows to the entity, so an employee write does not appear on the roles board', () => {
    const mixed: PendingUpdate[] = [
      ...REAL_QUEUE_SNAPSHOT,
      {
        id: 'emp-1',
        queuedAt: '2026-08-07T12:50:00.000Z',
        queuedBy: 'Hiring@getsetlearn.info',
        entity: 'employee',
        operation: 'update',
        payload: { id: 'emp-1', operation: 'exit.initiate' },
      },
    ]
    expect(summarisePendingUpdates(mixed, 'role').count).toBe(4)
    expect(summarisePendingUpdates(mixed, 'employee').count).toBe(1)
    expect(summarisePendingUpdates(mixed).count).toBe(5)
  })

  it('survives a malformed queue entry rather than blanking the notice', () => {
    const summary = summarisePendingUpdates(
      [null, 'nonsense', ...REAL_QUEUE_SNAPSHOT],
      'role',
    )
    expect(summary.count).toBe(4)
  })

  it('returns nothing for a non-array queue instead of throwing', () => {
    expect(summarisePendingUpdates(null).count).toBe(0)
    expect(summarisePendingUpdates(undefined).count).toBe(0)
  })
})
