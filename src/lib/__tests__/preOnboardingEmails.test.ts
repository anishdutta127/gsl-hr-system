import { describe, expect, it, vi } from 'vitest'

vi.mock('../company', () => ({
  loadCompany: () => ({ name: 'Get Set Learn' }),
}))

import { amountToWordsIndian } from '../preOnboardingEmails/amountInWords'
import {
  getMissingFieldsForTemplate,
  renderEmailTemplate,
  PRE_ONBOARDING_TEMPLATE_IDS,
} from '../preOnboardingEmails'

describe('amountToWordsIndian', () => {
  it('handles zero', () => {
    expect(amountToWordsIndian(0)).toBe('Zero')
  })

  it('handles single digit', () => {
    expect(amountToWordsIndian(7)).toBe('Seven')
  })

  it('handles teens', () => {
    expect(amountToWordsIndian(15)).toBe('Fifteen')
  })

  it('handles tens', () => {
    expect(amountToWordsIndian(42)).toBe('Forty Two')
  })

  it('handles hundreds', () => {
    expect(amountToWordsIndian(305)).toBe('Three Hundred Five')
  })

  it('handles thousands', () => {
    expect(amountToWordsIndian(12_500)).toBe('Twelve Thousand Five Hundred')
  })

  it('handles a typical CTC: Rs 12,50,000', () => {
    expect(amountToWordsIndian(12_50_000)).toBe('Twelve Lakh Fifty Thousand')
  })

  it('handles crores: Rs 1,25,00,000', () => {
    expect(amountToWordsIndian(1_25_00_000)).toBe('One Crore Twenty Five Lakh')
  })

  it('rounds non-integer rupee amounts', () => {
    expect(amountToWordsIndian(99.4)).toBe('Ninety Nine')
    expect(amountToWordsIndian(99.7)).toBe('One Hundred')
  })

  it('falls back to Zero for non-finite input', () => {
    expect(amountToWordsIndian(Number.NaN)).toBe('Zero')
    expect(amountToWordsIndian(Number.POSITIVE_INFINITY)).toBe('Zero')
  })

  it('handles negative values with Minus prefix', () => {
    expect(amountToWordsIndian(-500)).toBe('Minus Five Hundred')
  })
})

describe('getMissingFieldsForTemplate', () => {
  it('reports every required field missing when context is empty', () => {
    const missing = getMissingFieldsForTemplate('offer-intimation', {})
    expect(missing).toContain('candidateName')
    expect(missing).toContain('positionTitle')
    expect(missing).toContain('ctcAmount')
  })

  it('treats blank strings as missing', () => {
    const missing = getMissingFieldsForTemplate('offer-followup', {
      candidateName: '  ',
      positionTitle: 'X',
      offerIntimationDate: '2026-05-13',
      recruiterName: 'A',
      recruiterEmail: 'a@gsl.in',
    })
    expect(missing).toEqual(['candidateName'])
  })

  it('treats zero or negative CTC as missing', () => {
    const missing = getMissingFieldsForTemplate('offer-intimation', {
      candidateName: 'A',
      positionTitle: 'X',
      location: 'Mumbai',
      joiningDate: '2026-06-01',
      ctcAmount: 0,
      recruiterName: 'A',
      recruiterEmail: 'a@gsl.in',
    })
    expect(missing).toEqual(['ctcAmount'])
  })

  it('returns empty when all required fields are present', () => {
    const missing = getMissingFieldsForTemplate('offer-intimation', {
      candidateName: 'Priya',
      positionTitle: 'STEM Coach',
      location: 'Mumbai',
      joiningDate: '2026-06-01',
      ctcAmount: 1_200_000,
      recruiterName: 'Shruti',
      recruiterEmail: 'shruti@gsl.in',
    })
    expect(missing).toEqual([])
  })
})

describe('renderEmailTemplate', () => {
  const fullCtx = {
    candidateName: 'Priya Sharma',
    positionTitle: 'STEM Coach',
    location: 'Mumbai',
    joiningDate: '2026-06-01',
    ctcAmount: 12_50_000,
    offerIntimationDate: '2026-05-13',
    appointmentReturnByDate: '2026-05-20',
    recruiterName: 'Shruti',
    recruiterEmail: 'shruti@gsl.in',
  }

  it('renders all four templates without missing tokens', () => {
    for (const id of PRE_ONBOARDING_TEMPLATE_IDS) {
      const out = renderEmailTemplate(id, fullCtx)
      expect(out.subject).not.toBe('')
      expect(out.body).not.toContain('{{')
      expect(out.body).not.toContain('}}')
    }
  })

  it('throws with a useful message when required fields are missing', () => {
    expect(() =>
      renderEmailTemplate('offer-intimation', {
        ...fullCtx,
        ctcAmount: undefined as unknown as number,
      }),
    ).toThrow(/ctcAmount/)
  })

  it('renders the CTC + words pair correctly', () => {
    const out = renderEmailTemplate('offer-intimation', fullCtx)
    expect(out.body).toContain('Rs. 12,50,000 LPA')
    expect(out.body).toContain('Rupees Twelve Lakh Fifty Thousand only')
  })

  it('renders subject without trailing whitespace and with placeholders filled', () => {
    const out = renderEmailTemplate('appointment-letter', fullCtx)
    expect(out.subject).toBe('Appointment Letter – STEM Coach')
  })

  it('substitutes companyName from loadCompany()', () => {
    const out = renderEmailTemplate('notice-period-checkin', fullCtx)
    expect(out.body).toContain('Get Set Learn')
  })

  it('surfaces the offer-intimation attachments checklist', () => {
    const out = renderEmailTemplate('offer-intimation', fullCtx)
    expect(out.attachmentSuggestions).toContain('New Joinee Form (Excel)')
    expect(out.attachmentSuggestions).toContain('PF Declaration Form')
    expect(out.attachmentSuggestions).toContain('Investment Declaration - Form 12BB')
    expect(out.attachmentSuggestions).toContain('Medical Policy Nomination Form')
  })

  it('returns an empty attachments list for follow-up', () => {
    const out = renderEmailTemplate('offer-followup', fullCtx)
    expect(out.attachmentSuggestions).toEqual([])
  })

  it('formats joining date as DD-MMM-YYYY', () => {
    const out = renderEmailTemplate('offer-intimation', fullCtx)
    expect(out.body).toContain('01-Jun-2026')
  })
})
