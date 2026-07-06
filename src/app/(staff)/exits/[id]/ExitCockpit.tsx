'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatRs, formatDate } from '@/lib/format'
import { amountToWordsIndian } from '@/lib/preOnboardingEmails/amountInWords'
import type { ExitStepData, ExitStepKind, ExitStepStatus, ExitType } from '@/lib/types'
import { CloseExitDialog } from '../CloseExitDialog'

interface ClosedState {
  closedAt: string | null
  closedBy: string | null
  closeReason: string | null
}

const STATUS_ORDER: ExitStepStatus[] = ['Not Started', 'In Progress', 'Completed', 'N/A']

export interface CockpitStep {
  templateId: string
  name: string
  kind: ExitStepKind
  isMandatory: boolean
  status: ExitStepStatus
  data: ExitStepData
  notes: string
  canSeeDetail: boolean
}

interface HandoverEmail {
  toName: string
  toEmail: string | null
  ccEmails: string[]
  subject: string
  body: string
  checklist: string[]
}

interface ExitMeta {
  exitType: ExitType
  reasonForLeaving: string
  resignationDate: string | null
  terminationDate: string | null
  lastWorkingDay: string
  completedAt: string | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const INPUT =
  'mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal'

function parseRupees(s: string): number | null {
  const cleaned = s.replace(/[,\s₹]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

function letterTemplateIdForKind(kind: ExitStepKind): string | null {
  return kind.startsWith('letter:') ? kind.slice('letter:'.length) : null
}

function StatusChip({ status }: { status: ExitStepStatus }) {
  const cls =
    status === 'Completed'
      ? 'bg-success-bg text-success'
      : status === 'In Progress'
        ? 'bg-orange-light text-orange-dark'
        : status === 'N/A'
          ? 'bg-surface text-ink-3'
          : 'bg-surface text-ink-2'
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

function SaveChip({ state, msg }: { state: SaveState; msg?: string }) {
  if (state === 'idle') return null
  if (state === 'saving')
    return (
      <span className="text-xs text-ink-3" role="status">
        Saving…
      </span>
    )
  if (state === 'saved')
    return (
      <span className="text-xs text-success" role="status">
        Saved
      </span>
    )
  return (
    <span className="text-xs text-danger" role="alert">
      {msg ?? 'Save failed'}
    </span>
  )
}

export function ExitCockpit({
  employeeId,
  employeeName,
  exitMeta,
  steps: initialSteps,
  summary: initialSummary,
  canEdit,
  viewerEmail,
  handover,
  letterBaseValues,
  closedState,
  canReopen: initialCanReopen,
}: {
  employeeId: string
  employeeName: string
  exitMeta: ExitMeta
  steps: CockpitStep[]
  summary: { total: number; completed: number; mandatoryRemaining: number; isComplete: boolean; percent: number }
  canEdit: boolean
  viewerEmail: string
  handover: HandoverEmail
  letterBaseValues: Record<string, Record<string, string>>
  closedState: ClosedState
  canReopen: boolean
}) {
  const router = useRouter()
  const [steps, setSteps] = useState<CockpitStep[]>(initialSteps)
  const [save, setSave] = useState<Record<string, { state: SaveState; msg?: string }>>({})
  const [newStepName, setNewStepName] = useState('')
  const [addingStep, setAddingStep] = useState(false)
  const [closed, setClosed] = useState<ClosedState>(closedState)
  const [canReopen, setCanReopen] = useState(initialCanReopen)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [closeBusy, setCloseBusy] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [reopenBusy, setReopenBusy] = useState(false)

  const outstandingSteps = useMemo(
    () =>
      steps
        .filter((s) => s.isMandatory && s.status !== 'Completed' && s.status !== 'N/A')
        .map((s) => s.name),
    [steps],
  )

  async function closeExit(reason: string) {
    setCloseBusy(true)
    setCloseError(null)
    try {
      const res = await fetch(`/api/admin/exits/${employeeId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message ?? 'Could not close the exit.')
      setClosed({ closedAt: new Date().toISOString(), closedBy: viewerEmail, closeReason: reason || null })
      setCanReopen(canEdit) // just closed it: within any window
      setShowCloseDialog(false)
      router.refresh()
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Could not close the exit.')
    } finally {
      setCloseBusy(false)
    }
  }

  async function reopenExit() {
    if (!window.confirm('Reopen this exit? It returns to the active board.')) return
    setReopenBusy(true)
    try {
      const res = await fetch(`/api/admin/exits/${employeeId}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message ?? 'Could not reopen the exit.')
      setClosed({ closedAt: null, closedBy: null, closeReason: null })
      setCanReopen(false)
      router.refresh()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not reopen the exit.')
    } finally {
      setReopenBusy(false)
    }
  }

  const summary = useMemo(() => {
    let mandatoryTotal = 0
    let mandatoryDone = 0
    let completed = 0
    for (const s of steps) {
      if (s.status === 'Completed' || s.status === 'N/A') completed++
      if (s.isMandatory) {
        mandatoryTotal++
        if (s.status === 'Completed' || s.status === 'N/A') mandatoryDone++
      }
    }
    const percent = mandatoryTotal === 0 ? 0 : Math.round((mandatoryDone / mandatoryTotal) * 100)
    return {
      total: steps.length,
      completed,
      mandatoryRemaining: mandatoryTotal - mandatoryDone,
      isComplete: steps.length > 0 && mandatoryTotal - mandatoryDone === 0,
      percent,
    }
  }, [steps])

  const isClosed = Boolean(closed.closedAt)

  function setSaveState(templateId: string, state: SaveState, msg?: string) {
    setSave((v) => ({ ...v, [templateId]: { state, msg } }))
  }

  async function patchStep(
    templateId: string,
    patch: { status?: ExitStepStatus; notes?: string; data?: Partial<ExitStepData> },
  ) {
    const prev = steps
    setSteps((list) =>
      list.map((s) =>
        s.templateId === templateId
          ? {
              ...s,
              status: patch.status ?? s.status,
              notes: patch.notes ?? s.notes,
              data: patch.data ? { ...s.data, ...patch.data } : s.data,
            }
          : s,
      ),
    )
    setSaveState(templateId, 'saving')
    try {
      const res = await fetch(`/api/admin/exits/${employeeId}/steps/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message ?? 'Save failed. Retry, or WhatsApp Anish.')
      }
      setSaveState(templateId, 'saved')
      router.refresh()
      window.setTimeout(() => setSaveState(templateId, 'idle'), 2500)
    } catch (err) {
      setSteps(prev)
      setSaveState(templateId, 'error', err instanceof Error ? err.message : 'Save failed.')
    }
  }

  async function generateLetter(step: CockpitStep, extraValues: Record<string, string>, markComplete: boolean) {
    const letterId = letterTemplateIdForKind(step.kind)
    if (!letterId) return
    setSaveState(step.templateId, 'saving')
    try {
      const values = { ...(letterBaseValues[letterId] ?? {}), ...extraValues }
      const res = await fetch(`/api/letters/${letterId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, values }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message ?? 'Letter generation failed.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('Content-Disposition') ?? ''
      a.download = cd.match(/filename="([^"]+)"/)?.[1] ?? `${letterId}.docx`
      a.click()
      URL.revokeObjectURL(url)
      const now = new Date().toISOString()
      await patchStep(step.templateId, {
        status: markComplete ? 'Completed' : 'In Progress',
        data: { letterIssuedAt: now, letterIssuedBy: viewerEmail },
      })
    } catch (err) {
      setSaveState(step.templateId, 'error', err instanceof Error ? err.message : 'Letter generation failed.')
    }
  }

  async function addCustomStep() {
    const name = newStepName.trim()
    if (!name) return
    setAddingStep(true)
    try {
      const res = await fetch(`/api/admin/exits/${employeeId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.message ?? 'Could not add step.')
      setSteps((list) => [...list, { ...body.step, canSeeDetail: true }])
      setNewStepName('')
      router.refresh()
    } catch {
      /* surfaced inline by the failed add; keep the typed name */
    } finally {
      setAddingStep(false)
    }
  }

  async function removeCustomStep(templateId: string) {
    if (!window.confirm('Remove this custom step?')) return
    const prev = steps
    setSteps((list) => list.filter((s) => s.templateId !== templateId))
    try {
      const res = await fetch(`/api/admin/exits/${employeeId}/steps/${templateId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      setSteps(prev)
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress header */}
      <div className="rounded-lg border border-line bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg text-ink">
            {summary.isComplete
              ? 'Exit complete'
              : `${summary.completed} of ${summary.total} steps done`}
          </h2>
          {summary.isComplete ? (
            <span className="rounded-sm bg-success-bg px-2 py-0.5 text-xs font-medium text-success">
              Moved to alumni{exitMeta.completedAt ? ` · ${formatDate(exitMeta.completedAt)}` : ''}
            </span>
          ) : isClosed ? (
            <span className="rounded-sm bg-surface px-2 py-0.5 text-xs font-medium text-ink-2">
              Closed{closed.closedAt ? ` · ${formatDate(closed.closedAt)}` : ''}
            </span>
          ) : (
            <span className="rounded-sm bg-orange-light px-2 py-0.5 text-xs font-medium text-orange-dark">
              In progress
            </span>
          )}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded bg-line" role="progressbar" aria-label="Exit completion" aria-valuenow={summary.percent} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={summary.isComplete ? 'h-full bg-success' : 'h-full bg-orange'}
            style={{ width: `${summary.percent}%` }}
          />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <Meta label="Exit type" value={exitMeta.exitType} />
          <Meta label="Last working day" value={formatDate(exitMeta.lastWorkingDay)} />
          <Meta
            label={exitMeta.terminationDate ? 'Termination date' : 'Resignation date'}
            value={formatDate(exitMeta.terminationDate ?? exitMeta.resignationDate)}
          />
          <Meta label="Reason" value={exitMeta.reasonForLeaving || '-'} />
        </dl>

        {canEdit && (isClosed || !summary.isComplete) && (
          <div className="mt-4 border-t border-line pt-4">
            {isClosed ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-2">
                  Closed{closed.closedAt ? ` ${formatDate(closed.closedAt)}` : ''}
                  {closed.closedBy ? ` by ${closed.closedBy}` : ''}.
                  {closed.closeReason ? ` Reason: ${closed.closeReason}` : ''}
                </p>
                {canReopen ? (
                  <button
                    type="button"
                    onClick={reopenExit}
                    disabled={reopenBusy}
                    className="inline-flex min-h-[44px] shrink-0 items-center rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-navy hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
                  >
                    {reopenBusy ? 'Reopening…' : 'Reopen exit'}
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-ink-3">Reopen window passed - ask an Admin.</span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-2">
                  Close to archive this exit now, even with steps outstanding (e.g. a termination with
                  no experience letter). No letters are issued.
                </p>
                <button
                  type="button"
                  onClick={() => setShowCloseDialog(true)}
                  className="inline-flex min-h-[44px] shrink-0 items-center rounded border border-orange bg-card px-4 py-2 text-sm font-medium text-orange-dark hover:bg-orange-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                >
                  Close exit
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Steps */}
      <ol className="space-y-4">
        {steps.map((step, idx) => (
          <li key={step.templateId}>
            <StepCard
              index={idx + 1}
              step={step}
              canEdit={canEdit}
              save={save[step.templateId] ?? { state: 'idle' }}
              handover={handover}
              exitMeta={exitMeta}
              onStatus={(status) => patchStep(step.templateId, { status })}
              onNotes={(notes) => patchStep(step.templateId, { notes })}
              onData={(data, status) => patchStep(step.templateId, { data, status })}
              onGenerate={(extra, markComplete) => generateLetter(step, extra, markComplete)}
              onRemove={() => removeCustomStep(step.templateId)}
            />
          </li>
        ))}
      </ol>

      {/* Add custom step */}
      {canEdit && (
        <div className="rounded-lg border border-dashed border-line-strong bg-card p-4">
          <label htmlFor="new-step" className="block text-xs font-medium text-ink-2">
            Add a step (this exit only)
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              id="new-step"
              type="text"
              value={newStepName}
              onChange={(e) => setNewStepName(e.target.value)}
              placeholder="e.g., Collect company credit card"
              className="min-w-[220px] flex-1 rounded border border-line-strong bg-card px-3 py-2 text-base text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            />
            <button
              type="button"
              onClick={addCustomStep}
              disabled={addingStep || !newStepName.trim()}
              className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
            >
              {addingStep ? 'Adding…' : 'Add step'}
            </button>
          </div>
        </div>
      )}

      {showCloseDialog && (
        <CloseExitDialog
          employeeName={employeeName}
          outstandingSteps={outstandingSteps}
          busy={closeBusy}
          error={closeError}
          onConfirm={closeExit}
          onCancel={() => {
            setShowCloseDialog(false)
            setCloseError(null)
          }}
        />
      )}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  )
}

function StepCard({
  index,
  step,
  canEdit,
  save,
  handover,
  exitMeta,
  onStatus,
  onNotes,
  onData,
  onGenerate,
  onRemove,
}: {
  index: number
  step: CockpitStep
  canEdit: boolean
  save: { state: SaveState; msg?: string }
  handover: HandoverEmail
  exitMeta: ExitMeta
  onStatus: (status: ExitStepStatus) => void
  onNotes: (notes: string) => void
  onData: (data: Partial<ExitStepData>, status?: ExitStepStatus) => void
  onGenerate: (extra: Record<string, string>, markComplete: boolean) => void
  onRemove: () => void
}) {
  const done = step.status === 'Completed' || step.status === 'N/A'
  return (
    <div className={`rounded-lg border bg-card p-5 ${done ? 'border-line' : 'border-line-strong'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              step.status === 'Completed'
                ? 'bg-success text-white'
                : step.status === 'N/A'
                  ? 'bg-line text-ink-3'
                  : 'bg-orange-light text-orange-dark'
            }`}
            aria-hidden="true"
          >
            {index}
          </span>
          <div>
            <h3 className="font-display text-base text-ink">
              {step.name}
              {!step.isMandatory && <span className="ml-2 text-xs font-normal text-ink-3">(optional)</span>}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SaveChip state={save.state} msg={save.msg} />
          <StatusChip status={step.status} />
        </div>
      </div>

      {!step.canSeeDetail ? (
        <p className="mt-3 text-sm text-ink-3">Settlement details are visible to HR and Admin only.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <StepBody
            step={step}
            canEdit={canEdit}
            handover={handover}
            exitMeta={exitMeta}
            onData={onData}
            onGenerate={onGenerate}
          />

          {canEdit && (
            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
              <div>
                <label htmlFor={`status-${step.templateId}`} className="block text-xs font-medium text-ink-2">
                  Status
                </label>
                <select
                  id={`status-${step.templateId}`}
                  value={step.status}
                  onChange={(e) => onStatus(e.target.value as ExitStepStatus)}
                  className="mt-1 rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              {step.kind === 'custom' && (
                <button
                  type="button"
                  onClick={onRemove}
                  className="text-xs font-medium text-danger hover:underline"
                >
                  Remove step
                </button>
              )}
            </div>
          )}

          {canEdit && (
            <div>
              <label htmlFor={`notes-${step.templateId}`} className="block text-xs font-medium text-ink-2">
                Notes
              </label>
              <textarea
                id={`notes-${step.templateId}`}
                rows={2}
                defaultValue={step.notes}
                onBlur={(e) => {
                  if (e.target.value !== step.notes) onNotes(e.target.value)
                }}
                className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
              />
            </div>
          )}
          {!canEdit && step.notes && <p className="text-sm text-ink-2">{step.notes}</p>}
        </div>
      )}
    </div>
  )
}

function StepBody({
  step,
  canEdit,
  handover,
  exitMeta,
  onData,
  onGenerate,
}: {
  step: CockpitStep
  canEdit: boolean
  handover: HandoverEmail
  exitMeta: ExitMeta
  onData: (data: Partial<ExitStepData>, status?: ExitStepStatus) => void
  onGenerate: (extra: Record<string, string>, markComplete: boolean) => void
}) {
  switch (step.kind) {
    case 'initiate':
      return (
        <p className="text-sm text-ink-2">
          Captured at the start of the exit. Reason: {exitMeta.reasonForLeaving || '-'}; last working day{' '}
          {formatDate(exitMeta.lastWorkingDay)}.
        </p>
      )
    case 'handover':
      return <HandoverBody step={step} canEdit={canEdit} handover={handover} onData={onData} />
    case 'letter:NO-DUES-v1':
      return <NoDuesBody step={step} canEdit={canEdit} onData={onData} onGenerate={onGenerate} />
    case 'ff':
      return <FFBody step={step} canEdit={canEdit} onData={onData} />
    case 'letter:RELIEVING-v1':
    case 'letter:EXPERIENCE-v1':
      return <LetterBody step={step} canEdit={canEdit} onGenerate={onGenerate} />
    default:
      return (
        <p className="text-sm text-ink-2">
          Track this step with the status and notes below.
        </p>
      )
  }
}

function HandoverBody({
  step,
  canEdit,
  handover,
  onData,
}: {
  step: CockpitStep
  canEdit: boolean
  handover: HandoverEmail
  onData: (data: Partial<ExitStepData>, status?: ExitStepStatus) => void
}) {
  const [copied, setCopied] = useState<'none' | 'body' | 'all'>('none')
  const mailto = `mailto:${encodeURIComponent(handover.toEmail ?? '')}?cc=${encodeURIComponent(
    handover.ccEmails.join(','),
  )}&subject=${encodeURIComponent(handover.subject)}&body=${encodeURIComponent(handover.body)}`

  async function copy(text: string, which: 'body' | 'all') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      window.setTimeout(() => setCopied('none'), 2000)
    } catch {
      /* clipboard blocked; the user can still select the text */
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <dl className="space-y-1">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-ink-3">To</dt>
          <dd className="text-ink">
            {handover.toName}
            {handover.toEmail ? ` <${handover.toEmail}>` : ' (no email on record)'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-ink-3">Cc</dt>
          <dd className="text-ink">{handover.ccEmails.join(', ') || '-'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-ink-3">Subject</dt>
          <dd className="text-ink">{handover.subject}</dd>
        </div>
      </dl>
      <pre
        tabIndex={0}
        role="region"
        aria-label="Handover email body"
        className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-line bg-surface p-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
      >
        {handover.body}
      </pre>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copy(handover.body, 'body')}
          className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
        >
          {copied === 'body' ? 'Copied' : 'Copy email body'}
        </button>
        <a
          href={mailto}
          className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
        >
          Open in mail client
        </a>
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => onData({ handoverEmailedAt: new Date().toISOString() })}
            className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
          >
            {step.data.handoverEmailedAt ? `Marked sent ${formatDate(step.data.handoverEmailedAt)}` : 'Mark email sent'}
          </button>
          <button
            type="button"
            onClick={() => onData({ rmConfirmedAt: new Date().toISOString() }, 'Completed')}
            className="inline-flex min-h-[44px] items-center rounded bg-orange-dark px-3 py-2 text-sm font-medium text-white hover:brightness-95"
          >
            Reporting manager confirmed - mark complete
          </button>
        </div>
      )}
    </div>
  )
}

function MoneyInput({
  id,
  label,
  defaultValue,
  onCommit,
  disabled,
}: {
  id: string
  label: string
  defaultValue: number | null | undefined
  onCommit: (n: number | null) => void
  disabled?: boolean
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-ink-2">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        disabled={disabled}
        defaultValue={defaultValue != null ? formatRs(defaultValue, { bare: true }) : ''}
        onBlur={(e) => onCommit(parseRupees(e.target.value))}
        className={INPUT}
        placeholder="Rs 0"
      />
    </div>
  )
}

function NoDuesBody({
  step,
  canEdit,
  onData,
  onGenerate,
}: {
  step: CockpitStep
  canEdit: boolean
  onData: (data: Partial<ExitStepData>, status?: ExitStepStatus) => void
  onGenerate: (extra: Record<string, string>, markComplete: boolean) => void
}) {
  const figures = step.data.settlementFigures ?? null
  const words = step.data.settlementWords ?? (figures ? `${amountToWordsIndian(figures)} only` : '')
  const canGenerate = Boolean(figures && figures > 0 && words)

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <MoneyInput
          id={`nd-fig-${step.templateId}`}
          label="Settlement amount (figures)"
          defaultValue={figures}
          disabled={!canEdit}
          onCommit={(n) =>
            onData({ settlementFigures: n, settlementWords: n ? `${amountToWordsIndian(n)} only` : '' })
          }
        />
        <MoneyInput
          id={`nd-lds-${step.templateId}`}
          label="Last drawn salary (monthly)"
          defaultValue={step.data.lastDrawnSalary}
          disabled={!canEdit}
          onCommit={(n) => onData({ lastDrawnSalary: n })}
        />
      </div>
      <div>
        <label htmlFor={`nd-words-${step.templateId}`} className="block text-xs font-medium text-ink-2">
          Settlement amount (words)
        </label>
        <input
          id={`nd-words-${step.templateId}`}
          type="text"
          disabled={!canEdit}
          defaultValue={words}
          key={words}
          onBlur={(e) => onData({ settlementWords: e.target.value })}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor={`nd-pending-${step.templateId}`} className="block text-xs font-medium text-ink-2">
          Pending items
        </label>
        <textarea
          id={`nd-pending-${step.templateId}`}
          rows={2}
          disabled={!canEdit}
          defaultValue={step.data.pendingItems ?? ''}
          onBlur={(e) => onData({ pendingItems: e.target.value })}
          className={INPUT}
          placeholder="None, or list outstanding items"
        />
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <button
            type="button"
            disabled={!canGenerate}
            onClick={() =>
              onGenerate(
                {
                  settlementAmountFigures: figures ? formatRs(figures, { bare: true }) : '',
                  // The letter body supplies the trailing "only" ("Indian Rupees {words} only"),
                  // so strip any trailing "only" the stored/computed words carry to avoid "only only".
                  settlementAmountWords: words.replace(/\s*only\s*$/i, ''),
                },
                false,
              )
            }
            className="inline-flex min-h-[44px] items-center rounded bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-60"
          >
            Generate No Dues (.docx)
          </button>
          {!canGenerate && <span className="text-xs text-ink-3">Enter the settlement amount first.</span>}
          {step.data.letterIssuedAt && (
            <span className="text-xs text-ink-3">Generated {formatDate(step.data.letterIssuedAt)}</span>
          )}
        </div>
      )}
      {canEdit && (
        <div className="space-y-2 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => onData({ signed: true, signedAt: new Date().toISOString() }, 'Completed')}
            className="inline-flex min-h-[44px] items-center rounded border border-line-strong bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
          >
            {step.data.signed ? `Signed copy recorded ${formatDate(step.data.signedAt)}` : 'Mark as signed by employee'}
          </button>
          <div>
            <label htmlFor={`nd-signednote-${step.templateId}`} className="block text-xs font-medium text-ink-2">
              Signed copy note / location
            </label>
            <input
              id={`nd-signednote-${step.templateId}`}
              type="text"
              defaultValue={step.data.signedCopyNote ?? ''}
              onBlur={(e) => onData({ signedCopyNote: e.target.value })}
              className={INPUT}
              placeholder="e.g., scan filed in OneDrive / employee documents"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function FFBody({
  step,
  canEdit,
  onData,
}: {
  step: CockpitStep
  canEdit: boolean
  onData: (data: Partial<ExitStepData>, status?: ExitStepStatus) => void
}) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <MoneyInput
          id={`ff-amt-${step.templateId}`}
          label="Settlement amount"
          defaultValue={step.data.ffAmount}
          disabled={!canEdit}
          onCommit={(n) => onData({ ffAmount: n })}
        />
        <div>
          <label htmlFor={`ff-date-${step.templateId}`} className="block text-xs font-medium text-ink-2">
            Payment date
          </label>
          <input
            id={`ff-date-${step.templateId}`}
            type="date"
            disabled={!canEdit}
            defaultValue={step.data.paymentDate ?? ''}
            onBlur={(e) => onData({ paymentDate: e.target.value })}
            className={INPUT}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`ff-ref-${step.templateId}`} className="block text-xs font-medium text-ink-2">
          Payment reference
        </label>
        <input
          id={`ff-ref-${step.templateId}`}
          type="text"
          disabled={!canEdit}
          defaultValue={step.data.paymentReference ?? ''}
          onBlur={(e) => onData({ paymentReference: e.target.value })}
          className={INPUT}
          placeholder="UTR / cheque / transfer reference"
        />
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={() => onData({ paymentDate: step.data.paymentDate ?? new Date().toISOString().slice(0, 10) }, 'Completed')}
          className="inline-flex min-h-[44px] items-center rounded bg-orange-dark px-3 py-2 text-sm font-medium text-white hover:brightness-95"
        >
          Mark settled and paid
        </button>
      )}
    </div>
  )
}

function LetterBody({
  step,
  canEdit,
  onGenerate,
}: {
  step: CockpitStep
  canEdit: boolean
  onGenerate: (extra: Record<string, string>, markComplete: boolean) => void
}) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-ink-2">
        Generates the {step.name.toLowerCase()} as a .docx with the signatory and company details from
        configuration. Generating marks this step complete.
      </p>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onGenerate({}, true)}
            className="inline-flex min-h-[44px] items-center rounded bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-navy-dark"
          >
            Generate {step.name} (.docx)
          </button>
          {step.data.letterIssuedAt && (
            <span className="text-xs text-ink-3">Issued {formatDate(step.data.letterIssuedAt)}</span>
          )}
        </div>
      )}
    </div>
  )
}
