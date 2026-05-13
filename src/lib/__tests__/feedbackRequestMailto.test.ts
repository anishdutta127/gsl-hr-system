import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../company', () => ({
  loadCompany: () => ({ name: 'Get Set Learn' }),
}))

import { buildFeedbackRequestMailto } from '../feedbackRequestMailto'

describe('buildFeedbackRequestMailto', () => {
  beforeEach(() => {
    delete (process.env as any).NEXT_PUBLIC_APP_URL
    delete (process.env as any).APP_BASE_URL
  })

  const args = {
    toEmail: 'manali@gsl.in',
    toName: 'Manali Sengupta',
    candidateName: 'Priya Sharma',
    candidateId: 'cand-123',
    roleTitle: 'STEM Coach',
    stage: 'HODRoundDone',
    roundLabel: 'HOD',
    recruiterEmail: 'shruti@gsl.in',
  }

  it('produces a mailto: URL with subject and body params', () => {
    const url = buildFeedbackRequestMailto(args)
    expect(url.startsWith('mailto:')).toBe(true)
    expect(url).toContain(encodeURIComponent('manali@gsl.in'))
    expect(url).toContain('subject=')
    expect(url).toContain('body=')
  })

  it('subject contains candidate, role, and round label', () => {
    const url = buildFeedbackRequestMailto(args)
    const params = new URLSearchParams(url.split('?')[1] ?? '')
    const subject = params.get('subject') ?? ''
    expect(subject).toContain('Priya Sharma')
    expect(subject).toContain('STEM Coach')
    expect(subject).toContain('HOD')
  })

  it('body greets by first name and signs with the recruiter email', () => {
    const url = buildFeedbackRequestMailto(args)
    const params = new URLSearchParams(url.split('?')[1] ?? '')
    const body = params.get('body') ?? ''
    expect(body).toContain('Hi Manali,')
    expect(body).toContain('shruti@gsl.in')
    expect(body).toContain('Get Set Learn')
  })

  it('omits a "Open the candidate" deep-link when no base URL is configured', () => {
    const url = buildFeedbackRequestMailto(args)
    const body = new URLSearchParams(url.split('?')[1] ?? '').get('body') ?? ''
    expect(body).toContain('GSL HR system')
    expect(body).not.toContain('https://')
  })

  it('includes the deep-link when NEXT_PUBLIC_APP_URL is set', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://hr.gsl/'
    const url = buildFeedbackRequestMailto(args)
    const body = new URLSearchParams(url.split('?')[1] ?? '').get('body') ?? ''
    expect(body).toContain('https://hr.gsl/candidates/cand-123')
  })

  it('falls back to "there" when the recipient has a single-token name', () => {
    const url = buildFeedbackRequestMailto({ ...args, toName: 'Anish' })
    const body = new URLSearchParams(url.split('?')[1] ?? '').get('body') ?? ''
    expect(body).toContain('Hi Anish,')
  })
})
