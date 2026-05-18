import { describe, expect, it } from 'vitest'
import { composeBulkToastMessage, summariseFailures } from '@/lib/bulkActionToast'

describe('summariseFailures', () => {
  it('returns an empty string for no failures', () => {
    expect(summariseFailures([])).toBe('')
  })

  it('ignores entries with empty messages', () => {
    expect(summariseFailures([{ message: '' }, { message: '   ' }])).toBe('')
  })

  it('returns the single reason verbatim when only one distinct message', () => {
    expect(
      summariseFailures([
        { message: 'Hiring manager feedback required.' },
        { message: 'Hiring manager feedback required.' },
      ]),
    ).toBe('Hiring manager feedback required.')
  })

  it('leads with the most-common reason and counts the rest', () => {
    const out = summariseFailures([
      { message: 'Hiring manager feedback required.' },
      { message: 'Hiring manager feedback required.' },
      { message: 'No next stage available.' },
    ])
    expect(out).toBe(
      'Hiring manager feedback required. (and 1 other reason)',
    )
  })

  it('pluralises "other reasons" for 2+ residuals', () => {
    const out = summariseFailures([
      { message: 'A' },
      { message: 'A' },
      { message: 'B' },
      { message: 'C' },
    ])
    expect(out).toMatch(/^A \(and 2 other reasons\)$/)
  })
})

describe('composeBulkToastMessage', () => {
  it('plain success with no failures has no tail', () => {
    expect(
      composeBulkToastMessage({
        successLabel: 'Moved forward',
        applied: 3,
        skipped: 0,
        errors: 0,
        failures: [],
      }),
    ).toBe('Moved forward 3 of 3 candidates.')
  })

  it('singular candidate when total is 1', () => {
    expect(
      composeBulkToastMessage({
        successLabel: 'Moved forward',
        applied: 1,
        skipped: 0,
        errors: 0,
        failures: [],
      }),
    ).toBe('Moved forward 1 of 1 candidate.')
  })

  it('reports the failure reason in the tail', () => {
    expect(
      composeBulkToastMessage({
        successLabel: 'Moved forward',
        applied: 3,
        skipped: 1,
        errors: 0,
        failures: [{ message: 'Hiring manager feedback required.' }],
      }),
    ).toBe(
      'Moved forward 3 of 4 candidates. 1 failed: Hiring manager feedback required.',
    )
  })

  it('falls back to plain count when failure messages are blank', () => {
    expect(
      composeBulkToastMessage({
        successLabel: 'Moved forward',
        applied: 0,
        skipped: 2,
        errors: 0,
        failures: [{ message: '' }, { message: '  ' }],
      }),
    ).toBe('Moved forward 0 of 2 candidates. 2 failed.')
  })

  it('reports zero applied with a clear "0 of N" head', () => {
    expect(
      composeBulkToastMessage({
        successLabel: 'Moved forward',
        applied: 0,
        skipped: 2,
        errors: 0,
        failures: [
          { message: 'Hiring manager feedback required.' },
          { message: 'Hiring manager feedback required.' },
        ],
      }),
    ).toBe(
      'Moved forward 0 of 2 candidates. 2 failed: Hiring manager feedback required.',
    )
  })
})
