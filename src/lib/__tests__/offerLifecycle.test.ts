/*
 * Offer lifecycle contract tests.
 *
 * Pins the new resend / decline-with-reason / accept-with-details paths
 * added in gate H2. The state machine itself was already tested via
 * existing routes; what's new and worth pinning:
 * - Decline requires a structured reason (mirrors application reject).
 * - 'Other' decline reason requires free text.
 * - Resend stays at Sent and stamps a new sentAt + appendResentAt.
 * - Accept captures optional acceptance details with safe defaults.
 * - Withdraw still works from Draft / Approved / Sent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/identity', () => ({
  getCurrentSession: vi.fn(),
}))

vi.mock('@/lib/queue/pendingUpdates', () => ({
  enqueueUpdate: vi.fn(),
}))

vi.mock('@/lib/data', () => ({
  findOfferById: vi.fn(),
  findApplicationById: vi.fn(),
  findRoleById: vi.fn(),
}))

import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import {
  findApplicationById,
  findOfferById,
  findRoleById,
} from '@/lib/data'
import { POST } from '@/app/api/offers/[id]/[action]/route'
import type { Offer } from '@/lib/types'

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 'o-1',
    applicationId: 'a-1',
    candidateId: 'c-1',
    roleId: 'r-1',
    status: 'Sent',
    compensation: { ctcAnnual: 1500000, noticePeriodDays: 30 },
    location: 'Mumbai',
    designation: 'Counsellor',
    createdAt: '2026-04-01T00:00:00Z',
    createdBy: 'hr@gsl.in',
    auditLog: [],
    ...overrides,
  }
}

function mockSession(role: 'HR' | 'Admin' | 'HOD' | 'Leadership' = 'HR') {
  vi.mocked(getCurrentSession).mockResolvedValue({
    sub: 'u-1',
    email: 'hr@gsl.in',
    name: 'HR',
    role,
    iat: 0,
    exp: 0,
  })
}

function postRequest(body?: unknown): Request {
  return new Request('http://localhost/api/offers/o-1/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(findApplicationById).mockReturnValue(undefined)
  vi.mocked(findRoleById).mockReturnValue(undefined)
  vi.mocked(enqueueUpdate).mockResolvedValue({
    id: 'q-1',
    queuedAt: '',
    queuedBy: '',
    entity: 'offer',
    operation: 'update',
    payload: {},
    retryCount: 0,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/offers/[id]/[action]', () => {
  it('401s when there is no session', async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)
    vi.mocked(findOfferById).mockReturnValue(offer())
    const res = await POST(postRequest({}), { params: { id: 'o-1', action: 'send' } })
    expect(res.status).toBe(401)
  })

  it('403s for HOD even when authenticated', async () => {
    mockSession('HOD')
    vi.mocked(findOfferById).mockReturnValue(offer())
    const res = await POST(postRequest({}), { params: { id: 'o-1', action: 'send' } })
    expect(res.status).toBe(403)
  })

  it('rejects an unknown action', async () => {
    mockSession()
    vi.mocked(findOfferById).mockReturnValue(offer())
    const res = await POST(postRequest({}), {
      params: { id: 'o-1', action: 'bogus' },
    })
    expect(res.status).toBe(400)
  })

  describe('decline', () => {
    it('400s without a reason', async () => {
      mockSession()
      vi.mocked(findOfferById).mockReturnValue(offer())
      const res = await POST(postRequest({}), {
        params: { id: 'o-1', action: 'decline' },
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.message).toMatch(/reason/i)
    })

    it("400s when reason is 'Other' but no notes provided", async () => {
      mockSession()
      vi.mocked(findOfferById).mockReturnValue(offer())
      const res = await POST(
        postRequest({ declineReason: 'Other' }),
        { params: { id: 'o-1', action: 'decline' } },
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.message).toMatch(/notes are required/i)
    })

    it('persists the reason and structured note', async () => {
      mockSession()
      vi.mocked(findOfferById).mockReturnValue(offer())
      const res = await POST(
        postRequest({
          declineReason: 'Compensation',
          declineNotes: 'Counter-offer accepted at current employer.',
        }),
        { params: { id: 'o-1', action: 'decline' } },
      )
      expect(res.status).toBe(200)
      expect(enqueueUpdate).toHaveBeenCalledTimes(1)
      const arg = vi.mocked(enqueueUpdate).mock.calls[0]?.[0]
      const payload = arg?.payload as Record<string, unknown>
      expect((payload.after as Record<string, unknown>).status).toBe('Declined')
      expect((payload.after as Record<string, unknown>).declineReason).toBe(
        'Compensation',
      )
      expect((payload.after as Record<string, unknown>).declineNotes).toBe(
        'Counter-offer accepted at current employer.',
      )
      expect(payload.notes).toMatch(/Declined: Compensation/)
    })
  })

  describe('accept', () => {
    it('writes safe defaults when no acceptance details given', async () => {
      mockSession()
      vi.mocked(findOfferById).mockReturnValue(
        offer({ proposedJoiningDate: '2026-06-01', compensation: { ctcAnnual: 1200000, noticePeriodDays: 30 } }),
      )
      const res = await POST(postRequest({}), {
        params: { id: 'o-1', action: 'accept' },
      })
      expect(res.status).toBe(200)
      const arg = vi.mocked(enqueueUpdate).mock.calls[0]?.[0]
      const after = (arg?.payload as Record<string, unknown>).after as Record<string, unknown>
      expect(after.status).toBe('Accepted')
      expect(after.acceptedCtcAnnual).toBe(1200000)
      expect(after.acceptedJoiningDate).toBe('2026-06-01')
      expect(after.acceptedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('captures negotiated CTC and overrides defaults', async () => {
      mockSession()
      vi.mocked(findOfferById).mockReturnValue(offer())
      const res = await POST(
        postRequest({
          acceptedCtcAnnual: 1650000,
          acceptedOn: '2026-05-13',
          acceptedJoiningDate: '2026-06-15',
        }),
        { params: { id: 'o-1', action: 'accept' } },
      )
      expect(res.status).toBe(200)
      const arg = vi.mocked(enqueueUpdate).mock.calls[0]?.[0]
      const after = (arg?.payload as Record<string, unknown>).after as Record<string, unknown>
      expect(after.acceptedCtcAnnual).toBe(1650000)
      expect(after.acceptedOn).toBe('2026-05-13')
      expect(after.acceptedJoiningDate).toBe('2026-06-15')
    })

    it('ignores invalid CTC (zero or negative) and falls back to offer CTC', async () => {
      mockSession()
      vi.mocked(findOfferById).mockReturnValue(offer())
      const res = await POST(
        postRequest({ acceptedCtcAnnual: 0 }),
        { params: { id: 'o-1', action: 'accept' } },
      )
      expect(res.status).toBe(200)
      const arg = vi.mocked(enqueueUpdate).mock.calls[0]?.[0]
      const after = (arg?.payload as Record<string, unknown>).after as Record<string, unknown>
      expect(after.acceptedCtcAnnual).toBe(1500000)
    })
  })

  describe('resend', () => {
    it('only allows resend from Sent', async () => {
      mockSession()
      vi.mocked(findOfferById).mockReturnValue(offer({ status: 'Approved' }))
      const res = await POST(postRequest({}), {
        params: { id: 'o-1', action: 'resend' },
      })
      expect(res.status).toBe(400)
    })

    it('stays at Sent and stamps a new sentAt + appendResentAt', async () => {
      mockSession()
      vi.mocked(findOfferById).mockReturnValue(offer())
      const res = await POST(postRequest({}), {
        params: { id: 'o-1', action: 'resend' },
      })
      expect(res.status).toBe(200)
      const arg = vi.mocked(enqueueUpdate).mock.calls[0]?.[0]
      const after = (arg?.payload as Record<string, unknown>).after as Record<string, unknown>
      expect(after.status).toBe('Sent')
      expect(after.sentAt).toBeTruthy()
      expect(after.appendResentAt).toBe(after.sentAt)
    })
  })

  describe('withdraw', () => {
    it('allows withdraw from Draft, Approved, and Sent', async () => {
      for (const status of ['Draft', 'Approved', 'Sent'] as const) {
        vi.clearAllMocks()
        mockSession()
        vi.mocked(findOfferById).mockReturnValue(offer({ status }))
        const res = await POST(postRequest({}), {
          params: { id: 'o-1', action: 'withdraw' },
        })
        expect(res.status, `from ${status}`).toBe(200)
      }
    })

    it('rejects withdraw from a terminal status (Accepted)', async () => {
      mockSession()
      vi.mocked(findOfferById).mockReturnValue(offer({ status: 'Accepted' }))
      const res = await POST(postRequest({}), {
        params: { id: 'o-1', action: 'withdraw' },
      })
      expect(res.status).toBe(400)
    })
  })
})
