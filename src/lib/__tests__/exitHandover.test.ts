import { describe, expect, it } from 'vitest'
import {
  buildHandoverRepoPath,
  emptyHandover,
  handoverStatus,
} from '../exitHandover'
import type { ExitHandover, HandoverDocumentFile } from '../types'

describe('handoverStatus', () => {
  it('returns Not started for missing record', () => {
    expect(handoverStatus(undefined)).toBe('Not started')
  })

  it('returns Not started for an empty handover record', () => {
    expect(handoverStatus(emptyHandover('emp-1', '2026-05-01'))).toBe('Not started')
  })

  it('returns In progress once any checklist content is set', () => {
    const h = emptyHandover('emp-1', '2026-05-01')
    h.templateUsed = 'Standard'
    expect(handoverStatus(h)).toBe('In progress')
  })

  it('returns In progress for checklist entries even without a doc', () => {
    const h = emptyHandover('emp-1', '2026-05-01')
    h.checklist.keyContacts.push({ name: 'A', role: 'B', context: 'C' })
    expect(handoverStatus(h)).toBe('In progress')
  })

  it('returns Submitted when a document is uploaded but not reviewed', () => {
    const doc: HandoverDocumentFile = {
      uploadedAt: '2026-05-01',
      uploadedBy: 'hr@gsl',
      filename: 'handover.pdf',
      fileSize: 1234,
      storageRef: 'data/exit-handovers/emp-1/file-1.pdf',
    }
    const h: ExitHandover = { ...emptyHandover('emp-1', '2026-05-01'), document: doc }
    expect(handoverStatus(h)).toBe('Submitted')
  })

  it('returns Reviewed once HR signs off', () => {
    const h: ExitHandover = {
      ...emptyHandover('emp-1', '2026-05-01'),
      reviewedAt: '2026-05-05',
      reviewedBy: 'hr@gsl',
    }
    expect(handoverStatus(h)).toBe('Reviewed')
  })
})

describe('buildHandoverRepoPath', () => {
  it('produces a POSIX repo-relative path', () => {
    const p = buildHandoverRepoPath('emp-1', 'abc', '.pdf')
    expect(p).toBe('data/exit-handovers/emp-1/abc.pdf')
  })

  it('strips path-traversal characters', () => {
    const p = buildHandoverRepoPath('../../etc', 'file', '.pdf')
    expect(p).toBe('data/exit-handovers/etc/file.pdf')
  })

  it('normalises the extension', () => {
    expect(buildHandoverRepoPath('e', 'f', 'PDF')).toBe('data/exit-handovers/e/f.pdf')
  })
})
