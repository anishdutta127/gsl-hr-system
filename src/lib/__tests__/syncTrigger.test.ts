/*
 * Universal Sync now trigger contract tests.
 *
 * The endpoint must:
 * - 401 unauthenticated callers
 * - rate-limit successive triggers from the same user (≤1/min)
 * - dispatch the apply-queue workflow on success
 * - bubble up GitHub upstream errors (403 missing actions:write, 404 workflow
 *   gone, 503 generic) as readable messages
 *
 * Scope: HR's "candidates jumped back to Sourced" depends on Sync now
 * being available to non-Admin users; that's the change being pinned by
 * these tests.
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
    dispatchWorkflow: vi.fn(),
  }
})

import { getCurrentSession } from '@/lib/identity'
import {
  dispatchWorkflow,
  QueueNotConfiguredError,
  QueueUpstreamError,
} from '@/lib/queue/githubQueue'
import { POST } from '@/app/api/sync/trigger/route'

function mockSession(email = 'shruti@gsl.in', role: 'HR' | 'Admin' | 'HOD' | 'Leadership' = 'HR') {
  vi.mocked(getCurrentSession).mockResolvedValue({
    sub: 'u-1',
    email,
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

describe('POST /api/sync/trigger', () => {
  it('401s when there is no session', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)
    const res = (await POST()) as NextResponse
    expect(res.status).toBe(401)
  })

  it('dispatches the apply-queue workflow for any signed-in role', async () => {
    mockSession('hr1@gsl.in', 'HR')
    vi.mocked(dispatchWorkflow).mockResolvedValue(undefined)
    const res = (await POST()) as NextResponse
    expect(res.status).toBe(200)
    expect(dispatchWorkflow).toHaveBeenCalledWith('apply-queue.yml')
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('also works for HOD (no longer Admin-only)', async () => {
    mockSession('hod1@gsl.in', 'HOD')
    vi.mocked(dispatchWorkflow).mockResolvedValue(undefined)
    const res = (await POST()) as NextResponse
    expect(res.status).toBe(200)
  })

  it('rate-limits a second trigger within 60 seconds (per email)', async () => {
    mockSession('shruti@gsl.in', 'HR')
    vi.mocked(dispatchWorkflow).mockResolvedValue(undefined)
    const first = (await POST()) as NextResponse
    expect(first.status).toBe(200)
    const second = (await POST()) as NextResponse
    expect(second.status).toBe(429)
    expect(dispatchWorkflow).toHaveBeenCalledTimes(1)
  })

  it('different users do not share rate-limit buckets', async () => {
    mockSession('user-a@gsl.in', 'HR')
    vi.mocked(dispatchWorkflow).mockResolvedValue(undefined)
    const a = (await POST()) as NextResponse
    expect(a.status).toBe(200)

    mockSession('user-b@gsl.in', 'HR')
    const b = (await POST()) as NextResponse
    expect(b.status).toBe(200)
    expect(dispatchWorkflow).toHaveBeenCalledTimes(2)
  })

  it('returns 503 with a configuration message when the PAT is missing', async () => {
    mockSession('user-c@gsl.in', 'HR')
    vi.mocked(dispatchWorkflow).mockRejectedValue(new QueueNotConfiguredError())
    const res = (await POST()) as NextResponse
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.message).toMatch(/GSL_QUEUE_GITHUB_TOKEN/)
  })

  it('returns 503 with a clear scope hint when GitHub returns 403', async () => {
    mockSession('user-d@gsl.in', 'HR')
    vi.mocked(dispatchWorkflow).mockRejectedValue(
      new QueueUpstreamError('apply-queue.yml', 403, 'Resource not accessible'),
    )
    const res = (await POST()) as NextResponse
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.message).toMatch(/actions:write/)
  })
})
