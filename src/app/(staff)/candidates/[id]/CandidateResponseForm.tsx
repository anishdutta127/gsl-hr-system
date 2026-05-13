'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CANDIDATE_RESPONSE_TYPES, type CandidateOfferResponse } from '@/lib/types'
import { formatDate } from '@/lib/format'

interface Props {
  applicationId: string
  candidateName: string
  response: CandidateOfferResponse | undefined
  /** Only render the form when Admin or HR. Leadership / HOD see history only. */
  canEdit: boolean
}

/**
 * Manual candidate-response capture. Sits on the candidate detail page
 * next to the pre-onboarding email block. Once a recruiter has heard
 * back from the candidate (call, email, WhatsApp), they log the answer
 * here so downstream affordances (appointment-letter send) unlock.
 */
export function CandidateResponseForm(props: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  async function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/applications/${props.applicationId}/candidate-response`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              response: formData.get('response'),
              responseDate: formData.get('responseDate'),
              notes: formData.get('notes'),
            }),
          },
        )
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string }
          setError(body.message ?? 'We could not save that. Try again.')
          return
        }
        setShowForm(false)
        router.refresh()
      } catch {
        setError('We could not reach our server. Try again.')
      }
    })
  }

  return (
    <section className="rounded-lg border border-line bg-card p-4">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base text-ink">Candidate response</h3>
        {props.response && (
          <span className="inline-flex items-center rounded border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink-2">
            {props.response.response}
          </span>
        )}
      </header>

      {props.response ? (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-ink-3">Recorded on</dt>
            <dd className="text-ink">{formatDate(props.response.responseDate)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Captured by</dt>
            <dd className="text-ink">
              {props.response.recordedBy}{' '}
              <span className="text-ink-3">({formatDate(props.response.recordedAt)})</span>
            </dd>
          </div>
          {props.response.notes && (
            <div className="col-span-full">
              <dt className="text-ink-3">Notes</dt>
              <dd className="mt-0.5 text-ink">{props.response.notes}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="text-xs text-ink-2">
          No response captured yet. Once {props.candidateName} replies (call, email, or
          WhatsApp), record the answer here so downstream actions unlock.
        </p>
      )}

      {props.canEdit && !showForm && (
        <button
          type="button"
          onClick={() => {
            setError(null)
            setShowForm(true)
          }}
          className="mt-3 inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          {props.response ? 'Update response' : 'Record response'}
        </button>
      )}

      {props.canEdit && showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit(new FormData(e.currentTarget))
          }}
          className="mt-3 space-y-3 rounded border border-line bg-card p-3 text-xs"
        >
          <label className="block">
            <span className="text-ink-2">Response</span>
            <select
              name="response"
              required
              defaultValue={props.response?.response ?? 'Accepted'}
              className="mt-1 block w-full min-h-[36px] rounded border border-line-strong bg-card px-2 py-1 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            >
              {CANDIDATE_RESPONSE_TYPES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-ink-2">Response date</span>
            <input
              type="date"
              name="responseDate"
              required
              defaultValue={(props.response?.responseDate ?? new Date().toISOString()).slice(0, 10)}
              className="mt-1 block w-full min-h-[36px] rounded border border-line-strong bg-card px-2 py-1 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            />
          </label>
          <label className="block">
            <span className="text-ink-2">Notes (optional)</span>
            <textarea
              name="notes"
              rows={2}
              defaultValue={props.response?.notes ?? ''}
              placeholder="e.g. confirmed verbally; awaiting written acceptance"
              className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save response'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={busy}
              className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <div role="alert" className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
    </section>
  )
}
