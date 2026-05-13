'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PreOnboardingApproval } from '@/lib/types'
import { formatDate } from '@/lib/format'

interface Props {
  applicationId: string
  candidateName: string
  roleTitle: string
  /** Pre-fill values for the initiate form. Defaults come from the role +
   * any prior approval state. */
  defaults: {
    ctcConfirmed?: number
    joiningDateConfirmed?: string
    locationConfirmed?: string
    positionConfirmed?: string
  }
  approval: PreOnboardingApproval | undefined
  sessionRole: 'Admin' | 'HR' | 'HOD' | 'Leadership'
  isAssignedHiringManager: boolean
}

const STATUS_TONE: Record<string, string> = {
  'Not Started': 'border-line text-ink-2 bg-surface',
  'Pending Hiring Manager': 'border-warning text-ink bg-warning-bg',
  'Pending HR Approval': 'border-warning text-ink bg-warning-bg',
  'Approved': 'border-success text-success bg-success-bg',
  'Rejected': 'border-danger text-danger bg-danger-bg',
}

/**
 * Pre-onboarding approval block on the candidate detail page. State
 * machine renders per status — Not Started → initiate form; Pending HM
 * → approve / reject buttons (HM or HR/Admin); Pending HR → approve /
 * reject (HR/Admin only); Approved → static summary; Rejected → reason
 * + Admin reset.
 */
export function PreOnboardingApprovalBlock(props: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showRejectFor, setShowRejectFor] = useState<'hiring-manager' | 'hr' | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const status = props.approval?.status ?? 'Not Started'
  const isHrOrAdmin = props.sessionRole === 'Admin' || props.sessionRole === 'HR'
  const canInitiate = props.isAssignedHiringManager || isHrOrAdmin
  const canHmApprove = props.isAssignedHiringManager || isHrOrAdmin
  const canHrApprove = isHrOrAdmin
  const canReset = props.sessionRole === 'Admin'

  function reset() {
    setError(null)
    setSuccess(null)
  }

  async function post(action: string, extra: Record<string, unknown> = {}) {
    reset()
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/applications/${props.applicationId}/pre-onboarding`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...extra }),
          },
        )
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string }
          setError(body.message ?? 'We could not save that. Try again.')
          return
        }
        const body = await res.json() as { status?: string }
        setSuccess(`Approval status: ${body.status ?? 'updated'}.`)
        setShowRejectFor(null)
        setRejectReason('')
        router.refresh()
      } catch {
        setError('We could not reach our server. Try again.')
      }
    })
  }

  function onInitiate(formData: FormData) {
    void post('initiate', {
      ctcConfirmed: Number(formData.get('ctcConfirmed')),
      joiningDateConfirmed: formData.get('joiningDateConfirmed'),
      locationConfirmed: formData.get('locationConfirmed'),
      positionConfirmed: formData.get('positionConfirmed'),
      notes: formData.get('notes'),
    })
  }

  function onReject() {
    if (!showRejectFor) return
    void post('reject', {
      rejectedBy: showRejectFor,
      rejectionReason: rejectReason.trim(),
    })
  }

  return (
    <section className="rounded-lg border border-line bg-card p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base text-ink">Pre-onboarding approval</h3>
        <span
          className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status] ?? STATUS_TONE['Not Started']}`}
        >
          {status}
        </span>
      </header>

      {status === 'Not Started' && canInitiate && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onInitiate(new FormData(e.currentTarget))
          }}
          className="space-y-3 text-xs"
        >
          <p className="text-ink-2">
            Confirm the offer details for {props.candidateName}. Once you submit, an HR-Admin
            approver will be asked to finalise.
          </p>
          <FieldNumber
            name="ctcConfirmed"
            label="Confirmed CTC (Rs, annual)"
            defaultValue={props.defaults.ctcConfirmed}
            required
          />
          <FieldDate
            name="joiningDateConfirmed"
            label="Joining date"
            defaultValue={props.defaults.joiningDateConfirmed}
            required
          />
          <FieldText
            name="locationConfirmed"
            label="Location"
            defaultValue={props.defaults.locationConfirmed}
            required
          />
          <FieldText
            name="positionConfirmed"
            label="Position title"
            defaultValue={props.defaults.positionConfirmed ?? props.roleTitle}
            required
          />
          <label className="block">
            <span className="text-ink-2">Notes (optional)</span>
            <textarea
              name="notes"
              rows={2}
              className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Initiate approval'}
          </button>
        </form>
      )}

      {(status === 'Pending Hiring Manager' || status === 'Pending HR Approval' || status === 'Approved' || status === 'Rejected') &&
        props.approval && (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
            <Field label="Confirmed CTC">
              {props.approval.ctcConfirmed != null
                ? `Rs ${props.approval.ctcConfirmed.toLocaleString('en-IN')}`
                : '-'}
            </Field>
            <Field label="Joining date">
              {props.approval.joiningDateConfirmed
                ? formatDate(props.approval.joiningDateConfirmed)
                : '-'}
            </Field>
            <Field label="Location">{props.approval.locationConfirmed ?? '-'}</Field>
            <Field label="Position">{props.approval.positionConfirmed ?? '-'}</Field>
            {props.approval.hiringManagerApprovedBy && (
              <Field label="HM approval">
                {props.approval.hiringManagerApprovedBy}
                <span className="ml-1 text-ink-3">
                  {props.approval.hiringManagerApprovedAt
                    ? `(${formatDate(props.approval.hiringManagerApprovedAt)})`
                    : ''}
                </span>
              </Field>
            )}
            {props.approval.hrApprovedBy && (
              <Field label="HR approval">
                {props.approval.hrApprovedBy}
                <span className="ml-1 text-ink-3">
                  {props.approval.hrApprovedAt
                    ? `(${formatDate(props.approval.hrApprovedAt)})`
                    : ''}
                </span>
              </Field>
            )}
            {props.approval.notes && (
              <div className="col-span-full">
                <dt className="text-ink-3">Notes</dt>
                <dd className="mt-0.5 text-ink-2">{props.approval.notes}</dd>
              </div>
            )}
            {props.approval.rejectionReason && (
              <div className="col-span-full">
                <dt className="text-ink-3">Rejection reason ({props.approval.rejectedBy})</dt>
                <dd className="mt-0.5 text-ink">{props.approval.rejectionReason}</dd>
              </div>
            )}
          </dl>
        )}

      {status === 'Pending Hiring Manager' && canHmApprove && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => post('hiring-manager-approve')}
            disabled={busy}
            className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
          >
            Approve as hiring manager
          </button>
          <button
            type="button"
            onClick={() => setShowRejectFor('hiring-manager')}
            disabled={busy}
            className="inline-flex min-h-[36px] items-center rounded border border-danger bg-card px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      )}

      {status === 'Pending HR Approval' && canHrApprove && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => post('hr-approve')}
            disabled={busy}
            className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
          >
            Final HR approval
          </button>
          <button
            type="button"
            onClick={() => setShowRejectFor('hr')}
            disabled={busy}
            className="inline-flex min-h-[36px] items-center rounded border border-danger bg-card px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      )}

      {status === 'Rejected' && canReset && (
        <button
          type="button"
          onClick={() => post('reset')}
          disabled={busy}
          className="mt-3 inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reset approval (Admin)
        </button>
      )}

      {showRejectFor && (
        <div className="mt-3 rounded border border-danger bg-card p-3">
          <label className="block text-xs">
            <span className="text-ink-2">Reason for rejection (recorded in audit log)</span>
            <textarea
              rows={2}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onReject}
              disabled={busy || !rejectReason.trim()}
              className="inline-flex min-h-[36px] items-center rounded bg-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
            >
              Confirm rejection
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRejectFor(null)
                setRejectReason('')
              }}
              disabled={busy}
              className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="mt-3 rounded border border-success bg-success-bg px-3 py-2 text-xs text-success">
          {success}
        </div>
      )}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  )
}

function FieldNumber({ name, label, defaultValue, required }: {
  name: string
  label: string
  defaultValue?: number
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="text-ink-2">{label}</span>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        required={required}
        min={0}
        step={1}
        className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />
    </label>
  )
}

function FieldDate({ name, label, defaultValue, required }: {
  name: string
  label: string
  defaultValue?: string
  required?: boolean
}) {
  // Defaults are ISO strings; <input type="date"> expects yyyy-mm-dd.
  const value = defaultValue ? defaultValue.slice(0, 10) : undefined
  return (
    <label className="block">
      <span className="text-ink-2">{label}</span>
      <input
        type="date"
        name={name}
        defaultValue={value}
        required={required}
        className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />
    </label>
  )
}

function FieldText({ name, label, defaultValue, required }: {
  name: string
  label: string
  defaultValue?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="text-ink-2">{label}</span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="mt-1 block w-full rounded border border-line-strong bg-card px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />
    </label>
  )
}
