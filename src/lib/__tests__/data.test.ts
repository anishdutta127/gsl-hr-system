import { describe, expect, it, vi, beforeEach } from 'vitest'

/*
 * Regression: a malformed record in the candidate pool (missing id+name) used
 * to crash every page that sorts or maps over it, most visibly the
 * server-rendered /emails/[id] page (digest 2966877739 in production on
 * 2026-05-05). Root cause was upstream (mail.ts queued outbound-mail logs with
 * the wrong entity name, which the queue applier then routed into the
 * candidate collection). loadCandidates filters at the boundary so a single
 * bad record cannot take down the page.
 *
 * CONVERTED for Postgres. The original wrote a candidates.json fixture into a
 * temp cwd, which tested file IO that no longer exists. The regression is
 * about the FILTER, not about where the records came from, so the data layer
 * is stubbed and the filter is exercised directly. No database is touched.
 */

vi.mock('@/lib/db/entities', () => ({ readCollection: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: {} }))

import { readCollection } from '@/lib/db/entities'
import { loadCandidates } from '../data'

const mockRead = vi.mocked(readCollection)

beforeEach(() => mockRead.mockReset())

/** The exact pollution seen in production: an outbound-mail log, not a candidate. */
const MISROUTED_MAIL_LOG = {
  _kind: 'outbound-mail',
  to: 'someone@example.com',
  subject: 'irrelevant',
  body: 'irrelevant',
  context: 'magic link for candidate xyz',
  createdAt: '2026-04-29T11:22:22.508Z',
}

describe('loadCandidates boundary filter', () => {
  it('drops records missing id or name', async () => {
    mockRead.mockResolvedValue([
      {
        id: 'real-1', name: 'Alice Real', email: 'alice@example.com',
        source: 'Naukri', phone: '', createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'seed', auditLog: [],
      },
      MISROUTED_MAIL_LOG,
      {
        id: 'real-2', name: 'Bob Real', email: '', source: 'Referral',
        phone: '', createdAt: '2026-02-01T00:00:00Z', createdBy: 'seed', auditLog: [],
      },
    ])

    const candidates = await loadCandidates()

    expect(candidates).toHaveLength(2)
    expect(candidates.map((c) => c.id)).toEqual(['real-1', 'real-2'])
    // The exact failure mode behind digest 2966877739: sorting by name no
    // longer throws, because the bad record never reaches the caller.
    expect(() => [...candidates].sort((a, b) => a.name.localeCompare(b.name))).not.toThrow()
  })

  it('drops a record with an id but no name', async () => {
    mockRead.mockResolvedValue([{ id: 'has-id-only', email: 'x@example.com' }])
    expect(await loadCandidates()).toEqual([])
  })

  it('drops a record with a name but no id', async () => {
    mockRead.mockResolvedValue([{ name: 'Has Name Only' }])
    expect(await loadCandidates()).toEqual([])
  })

  it('returns [] when the collection is empty', async () => {
    mockRead.mockResolvedValue([])
    expect(await loadCandidates()).toEqual([])
  })

  it('reads the candidate collection, not some other entity', async () => {
    // Positive control: if the loader were pointed at the wrong path, every
    // assertion above would still pass against a stub that ignores its input.
    mockRead.mockResolvedValue([])
    await loadCandidates()
    expect(mockRead).toHaveBeenCalledWith('src/data/candidates.json')
  })
})
