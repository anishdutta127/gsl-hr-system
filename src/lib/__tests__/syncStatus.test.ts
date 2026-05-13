/*
 * Sync status endpoint contract test.
 *
 * The endpoint must:
 * - 401 unauthenticated callers
 * - return a snapshot for any signed-in user (HR, HOD, Leadership, Admin)
 * - degrade gracefully when GitHub is unreachable / PAT missing — fall back
 *   to local file reads so the widget never breaks
 *
 * The widget loads when the user opens the dropdown; this gate matters
 * because users can't react to queue lag they can't see.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/identity', () => ({
  getCurrentSession: vi.fn(),
}))

vi.mock('@/lib/queue/githubQueue', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queue/githubQueue')>(
    '@/lib/queue/githubQueue',
  )
  return {
    ...actual,
    readRepoFile: vi.fn(),
    findLastDrainCommit: vi.fn(),
  }
})

import { getCurrentSession } from '@/lib/identity'
import { readRepoFile, findLastDrainCommit } from '@/lib/queue/githubQueue'
import { GET } from '@/app/api/sync/status/route'

function mockSession(role: 'HR' | 'Admin' | 'HOD' | 'Leadership' = 'HR') {
  vi.mocked(getCurrentSession).mockResolvedValue({
    sub: 'u-1',
    email: 'shruti@gsl.in',
    name: 'Shruti',
    role,
    iat: 0,
    exp: 0,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/sync/status', () => {
  it('401s when there is no session', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)
    const res = (await GET()) as NextResponse
    expect(res.status).toBe(401)
  })

  it('returns a github-sourced snapshot when the PAT is configured', async () => {
    mockSession('HR')
    vi.mocked(readRepoFile).mockResolvedValue(
      JSON.stringify([
        { id: '1', queuedAt: 'x', queuedBy: 'a', entity: 'application', operation: 'update', payload: {} },
        { id: '2', queuedAt: 'y', queuedBy: 'b', entity: 'candidate', operation: 'create', payload: {} },
      ]),
    )
    vi.mocked(findLastDrainCommit).mockResolvedValue({
      sha: 'abc',
      date: '2026-05-13T06:14:00Z',
      message: 'chore(apply): drain queue 2026-05-13T06:14Z',
    })

    const res = (await GET()) as NextResponse
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pendingCount).toBe(2)
    expect(body.lastDrainAt).toBe('2026-05-13T06:14:00Z')
    expect(body.source).toBe('github')
  })

  it('falls back to local read when GitHub is unreachable', async () => {
    mockSession('HOD')
    vi.mocked(readRepoFile).mockResolvedValue(null)
    vi.mocked(findLastDrainCommit).mockResolvedValue(null)

    const res = (await GET()) as NextResponse
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe('local')
    // Local pending may be 0 or N depending on the dev's working tree;
    // the contract is just that it doesn't error.
    expect(typeof body.pendingCount).toBe('number')
    expect(body.lastDrainAt).toBeNull()
  })

  it('falls back to local read when GitHub throws', async () => {
    mockSession('Leadership')
    vi.mocked(readRepoFile).mockRejectedValue(new Error('boom'))
    vi.mocked(findLastDrainCommit).mockResolvedValue(null)

    const res = (await GET()) as NextResponse
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe('local')
  })

  it('handles malformed pending JSON without crashing', async () => {
    mockSession('Admin')
    vi.mocked(readRepoFile).mockResolvedValue('{ not valid json')
    vi.mocked(findLastDrainCommit).mockResolvedValue(null)

    const res = (await GET()) as NextResponse
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe('local')
  })
})
