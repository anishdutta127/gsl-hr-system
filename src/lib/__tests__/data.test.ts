import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Regression: a malformed record in candidates.json (missing id+name) used
 * to crash every page that sorts or maps over the pool, most visibly the
 * server-rendered /emails/[id] page (digest 2966877739 in production on
 * 2026-05-05). Root cause was upstream (mail.ts queued outbound-mail logs
 * with the wrong entity name, which the queue applier then routed into
 * candidates.json). loadCandidates now filters at the boundary so a single
 * bad record can't take down the page.
 */

let originalCwd: string
let tmpCwd: string

beforeEach(() => {
  originalCwd = process.cwd()
  tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gsl-data-test-'))
  fs.mkdirSync(path.join(tmpCwd, 'src/data'), { recursive: true })
  process.chdir(tmpCwd)
  // Force a fresh import so DATA_DIR (built from process.cwd at module load)
  // resolves against the temp cwd we just chdir'd into.
  vi.resetModules()
})

afterEach(() => {
  process.chdir(originalCwd)
  fs.rmSync(tmpCwd, { recursive: true, force: true })
})

describe('loadCandidates boundary filter', () => {
  it('drops records missing id or name', async () => {
    const fixture = [
      {
        id: 'real-1',
        name: 'Alice Real',
        email: 'alice@example.com',
        source: 'Naukri',
        phone: '',
        createdAt: '2026-01-01T00:00:00Z',
        createdBy: 'seed',
        auditLog: [],
      },
      {
        // Mimics the production pollution: outbound-mail log misrouted
        // into candidates.json by an old apply_queue.py mapping.
        _kind: 'outbound-mail',
        to: 'someone@example.com',
        subject: 'irrelevant',
        body: 'irrelevant',
        context: 'magic link for candidate xyz',
        createdAt: '2026-04-29T11:22:22.508Z',
      },
      {
        id: 'real-2',
        name: 'Bob Real',
        email: '',
        source: 'Referral',
        phone: '',
        createdAt: '2026-02-01T00:00:00Z',
        createdBy: 'seed',
        auditLog: [],
      },
    ]
    fs.writeFileSync(path.join(tmpCwd, 'src/data/candidates.json'), JSON.stringify(fixture))

    // Import after chdir + file write so the loader reads our fixture.
    const { loadCandidates } = await import('../data')
    const candidates = await loadCandidates()

    expect(candidates).toHaveLength(2)
    expect(candidates.map((c) => c.id)).toEqual(['real-1', 'real-2'])
    // The exact failure mode that produced digest 2966877739 in production:
    // sort by name no longer crashes because the bad record never reaches it.
    expect(() => [...candidates].sort((a, b) => a.name.localeCompare(b.name))).not.toThrow()
  })

  it('returns [] when the file is missing', async () => {
    const { loadCandidates } = await import('../data')
    expect(await loadCandidates()).toEqual([])
  })
})
