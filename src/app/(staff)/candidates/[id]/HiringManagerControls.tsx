'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FEEDBACK_RECOMMENDATIONS, type FeedbackRecommendation, type InterviewFeedback } from '@/lib/types'

interface UserOption {
  id: string
  name: string
  role: string
}

interface Props {
  applicationId: string
  roleTitle: string
  candidateName: string
  currentStage: string
  /** Round label the gate expects feedback for at currentStage. */
  expectedRound: string
  hiringManagerId: string | null
  hiringManagerName: string | null
  /** Existing feedback entries on this application, oldest first. */
  feedback: InterviewFeedback[]
  /** Whether this application is currently parked in a stage where the
   * gate fires (used to highlight the "feedback needed" banner). */
  gateFires: boolean
  /** Whether the gate has cleared (i.e. feedback exists for the
   * currentStage round). False means the banner reads "awaiting feedback". */
  gateCleared: boolean
  /** Selectable hiring-manager options (active users only). */
  hmOptions: UserOption[]
  /** Session role + id, used to pick which affordances to render. */
  sessionRole: 'Admin' | 'HR' | 'HOD' | 'Leadership'
  sessionUserId: string
  /** Pre-filled mailto: for the "Send feedback request" button. */
  feedbackRequestMailto: string
  /** When the gate fires, this is the stage the override would advance to. */
  overrideTargetStage?: string | null
}

/**
 * Single composite control that owns the four feedback-gate affordances
 * on the candidate detail page:
 *
 *   1. Assign / reassign hiring manager (Admin + HR).
 *   2. "Awaiting feedback" banner + Send-feedback-request button (recruiter).
 *   3. Submit-feedback form (the assigned hiring manager or HR/Admin).
 *   4. Past feedback list (everyone allowed to see this page).
 *
 * Lives alongside the existing ApplicationStageActions on the per-app
 * card so the gate, the banner, and the transition buttons stack
 * vertically without re-flowing.
 */
export function HiringManagerControls(props: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)
  const [hmDropdownValue, setHmDropdownValue] = useState(props.hiringManagerId ?? '')

  const isHrOrAdmin = props.sessionRole === 'HR' || props.sessionRole === 'Admin'
  const isAdmin = props.sessionRole === 'Admin'
  const isAssignedHm =
    props.hiringManagerId !== null && props.hiringManagerId === props.sessionUserId
  const canSubmitFeedback = isAssignedHm || isHrOrAdmin
  const [overrideReason, setOverrideReason] = useState('')
  const [showOverride, setShowOverride] = useState(false)

  function reset() {
    setError(null)
    setSuccess(null)
  }

  async function assignHiringManager(userId: string) {
    reset()
    setHmDropdownValue(userId)
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/applications/${props.applicationId}/hiring-manager`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hiringManagerId: userId || null }),
          },
        )
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string }
          setError(body.message ?? 'We could not save that. Try again.')
          return
        }
        setSuccess(userId ? 'Hiring manager assigned.' : 'Hiring manager cleared.')
        router.refresh()
      } catch {
        setError('We could not reach our server. Try again.')
      }
    })
  }

  async function submitFeedback(formData: FormData) {
    reset()
    const payload = {
      round: props.expectedRound,
      recommendation: formData.get('recommendation'),
      strengths: formData.get('strengths'),
      concerns: formData.get('concerns'),
      overallNotes: formData.get('overallNotes'),
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/applications/${props.applicationId}/feedback`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        )
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string }
          setError(body.message ?? 'We could not save that. Try again.')
          return
        }
        setSuccess('Feedback submitted. The recruiter has been notified.')
        setShowFeedbackForm(false)
        router.refresh()
      } catch {
        setError('We could not reach our server. Try again.')
      }
    })
  }

  async function overrideAndAdvance() {
    reset()
    if (!props.overrideTargetStage) {
      setError('No target stage available to override into.')
      return
    }
    if (!overrideReason.trim()) {
      setError('Override reason is required.')
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/applications/${props.applicationId}/transition`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetStage: props.overrideTargetStage,
              override: true,
              overrideReason: overrideReason.trim(),
            }),
          },
        )
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string }
          setError(body.message ?? 'Override failed. Try again.')
          return
        }
        setSuccess(
          `Override recorded. ${props.candidateName} advanced to ${props.overrideTargetStage}.`,
        )
        setShowOverride(false)
        setOverrideReason('')
        router.refresh()
      } catch {
        setError('We could not reach our server. Try again.')
      }
    })
  }

  async function sendFeedbackRequest() {
    reset()
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/applications/${props.applicationId}/feedback/request`,
          { method: 'POST' },
        )
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string }
          setError(body.message ?? 'We could not log the request. Try again.')
          return
        }
        // Open mailto: in a new window AFTER the audit log lands so the
        // user does not lose the click if the API is slow.
        window.location.href = props.feedbackRequestMailto
        setSuccess(`Request logged. Outlook should open with the draft.`)
        router.refresh()
      } catch {
        setError('We could not reach our server. Try again.')
      }
    })
  }

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-3">
          Hiring manager feedback
        </div>
        {props.hiringManagerName && (
          <div className="text-xs text-ink-2">
            <span className="text-ink-3">Assigned:</span>{' '}
            <span className="font-medium text-ink">{props.hiringManagerName}</span>
          </div>
        )}
      </div>

      {isHrOrAdmin && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <span className="min-w-fit">Hiring manager:</span>
          <select
            value={hmDropdownValue}
            onChange={(e) => assignHiringManager(e.target.value)}
            disabled={busy}
            className="min-h-[36px] rounded border border-line-strong bg-card px-2 py-1 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Assign hiring manager"
          >
            <option value="">(none)</option>
            {props.hmOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </label>
      )}

      {props.gateFires && !props.gateCleared && (
        <div
          role="status"
          className="rounded border border-warning bg-warning-bg px-3 py-2 text-sm text-ink"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-medium">
                Awaiting {props.expectedRound} feedback before {props.candidateName} can move
                forward.
              </div>
              <p className="mt-0.5 text-xs text-ink-2">
                {props.hiringManagerName
                  ? `Hiring manager: ${props.hiringManagerName}.`
                  : 'No hiring manager assigned yet.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {props.hiringManagerId && (props.sessionRole === 'Admin' || props.sessionRole === 'HR' || props.sessionRole === 'HOD') && (
                <button
                  type="button"
                  onClick={sendFeedbackRequest}
                  disabled={busy}
                  className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Send feedback request
                </button>
              )}
              {isAdmin && props.overrideTargetStage && (
                <button
                  type="button"
                  onClick={() => {
                    setShowOverride((v) => !v)
                    reset()
                  }}
                  disabled={busy}
                  className="inline-flex min-h-[36px] items-center rounded border border-danger bg-card px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {showOverride ? 'Cancel override' : 'Override gate (Admin)'}
                </button>
              )}
            </div>
          </div>
          {showOverride && isAdmin && props.overrideTargetStage && (
            <div className="mt-3 rounded border border-danger bg-card p-3">
              <label className="block text-xs">
                <span className="text-ink-2">
                  Why are you bypassing the feedback gate? Captured in the audit log.
                </span>
                <textarea
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                  placeholder="e.g. Hiring manager away; verbally confirmed Strong Hire on call."
                />
              </label>
              <button
                type="button"
                onClick={overrideAndAdvance}
                disabled={busy || !overrideReason.trim()}
                className="mt-2 inline-flex min-h-[36px] items-center rounded bg-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Saving…' : `Advance to ${props.overrideTargetStage}`}
              </button>
            </div>
          )}
        </div>
      )}

      {canSubmitFeedback && (
        <div>
          {!showFeedbackForm ? (
            <button
              type="button"
              onClick={() => {
                reset()
                setShowFeedbackForm(true)
              }}
              className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            >
              Submit interview feedback
            </button>
          ) : (
            <FeedbackForm
              expectedRound={props.expectedRound}
              busy={busy}
              onCancel={() => setShowFeedbackForm(false)}
              onSubmit={submitFeedback}
            />
          )}
        </div>
      )}

      {props.feedback.length > 0 && (
        <details className="rounded border border-line bg-surface px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-ink-2">
            Past feedback ({props.feedback.length})
          </summary>
          <ol className="mt-2 space-y-2">
            {[...props.feedback].reverse().map((f, idx) => (
              <li key={idx} className="rounded border border-line bg-card px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-ink">{f.round}</span>{' '}
                    <span className="text-ink-3">·</span>{' '}
                    <span className="text-ink-2">{f.recommendation}</span>
                  </div>
                  <time className="text-ink-3" dateTime={f.submittedAt}>
                    {new Date(f.submittedAt).toLocaleDateString('en-GB')}
                  </time>
                </div>
                <p className="mt-1 text-ink-3">By {f.submittedBy}</p>
                {f.strengths && (
                  <p className="mt-1">
                    <span className="text-ink-3">Strengths:</span>{' '}
                    <span className="text-ink">{f.strengths}</span>
                  </p>
                )}
                {f.concerns && (
                  <p className="mt-1">
                    <span className="text-ink-3">Concerns:</span>{' '}
                    <span className="text-ink">{f.concerns}</span>
                  </p>
                )}
                {f.overallNotes && (
                  <p className="mt-1 text-ink-2">{f.overallNotes}</p>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}

      {error && (
        <div role="alert" className="rounded border border-danger bg-danger-bg px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded border border-success bg-success-bg px-3 py-2 text-xs text-success">
          {success}
        </div>
      )}
    </div>
  )
}

interface FormProps {
  expectedRound: string
  busy: boolean
  onCancel: () => void
  onSubmit: (data: FormData) => void
}

function FeedbackForm({ expectedRound, busy, onCancel, onSubmit }: FormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(new FormData(e.currentTarget))
      }}
      className="space-y-3 rounded border border-line bg-card p-3"
    >
      <div className="text-xs font-medium text-ink-2">
        Round: <span className="text-ink">{expectedRound}</span>
      </div>
      <label className="block text-xs">
        <span className="text-ink-2">Recommendation</span>
        <select
          name="recommendation"
          required
          defaultValue="Move Forward"
          className="mt-1 block w-full min-h-[36px] rounded border border-line-strong bg-card px-2 py-1 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          {(FEEDBACK_RECOMMENDATIONS as readonly FeedbackRecommendation[]).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        <span className="text-ink-2">Strengths</span>
        <textarea
          name="strengths"
          rows={3}
          placeholder="What did they do well in this round?"
          className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </label>
      <label className="block text-xs">
        <span className="text-ink-2">Concerns</span>
        <textarea
          name="concerns"
          rows={3}
          placeholder="Where did you have reservations?"
          className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </label>
      <label className="block text-xs">
        <span className="text-ink-2">Overall notes (optional)</span>
        <textarea
          name="overallNotes"
          rows={2}
          placeholder="Anything else the recruiter should see?"
          className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Submit feedback'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
