'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface CurrentMembership {
  applicationId: string
  roleId: string
  roleTitle: string
  currentStage: string
}

export interface OpenRoleOption {
  id: string
  label: string
}

interface Props {
  candidateId: string
  candidateName: string
  /** Roles this candidate is currently in (any stage). Source for the Move
   * dropdown and the basis for excluding destinations from Add. */
  memberships: CurrentMembership[]
  /** All roles eligible to receive a new application (Open / Draft / Paused).
   * The component filters out memberships when building the destination list. */
  openRoles: OpenRoleOption[]
  /** Optional preselect for "Move from"; used by the role-side panel where
   * the contextual application is known. */
  defaultMoveSourceApplicationId?: string
  /** Compact = button row only; full = section with label and helper text. */
  variant?: 'compact' | 'section'
  /** When true, show "Move" button only (used when source is non-terminal). */
  hideAdd?: boolean
  /** When true, hide the Move button (used when no non-terminal memberships). */
  hideMove?: boolean
}

export function PipelineActions({
  candidateId,
  candidateName,
  memberships,
  openRoles,
  defaultMoveSourceApplicationId,
  variant = 'section',
  hideAdd = false,
  hideMove = false,
}: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<null | 'move' | 'add'>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmRequired, setConfirmRequired] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Memberships not in a terminal-non-active stage are valid Move sources.
  // Joined is fully terminal - Move not allowed; only Add available.
  const moveableMemberships = memberships.filter(
    (m) => m.currentStage !== 'Joined',
  )
  const defaultSource =
    defaultMoveSourceApplicationId &&
    moveableMemberships.some((m) => m.applicationId === defaultMoveSourceApplicationId)
      ? defaultMoveSourceApplicationId
      : moveableMemberships[0]?.applicationId ?? ''

  const [sourceApplicationId, setSourceApplicationId] = useState(defaultSource)
  const [destRoleId, setDestRoleId] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (modal === 'move') setSourceApplicationId(defaultSource)
    if (modal !== null) {
      setDestRoleId('')
      setNotes('')
      setError(null)
      setConfirmRequired(null)
    }
  }, [modal, defaultSource])

  useEffect(() => {
    if (!modal) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal])

  function closeModal() {
    setModal(null)
    setError(null)
    setConfirmRequired(null)
  }

  // Roles the candidate is currently ACTIVE in (non-terminal). Terminal
  // applications (Rejected / Withdrawn / NotInterested / OnHold) do not
  // block re-adding the candidate - the server-side bulk + move routes
  // already match this behaviour; before this fix the UI was stricter
  // than the server and the dropdown excluded re-addable roles.
  const TERMINAL_STAGES_FOR_DEDUPE = new Set([
    'Rejected',
    'Withdrawn',
    'NotInterested',
    'OnHold',
  ])
  const activeRoleIds = new Set(
    memberships
      .filter((m) => !TERMINAL_STAGES_FOR_DEDUPE.has(m.currentStage))
      .map((m) => m.roleId),
  )
  const destinationOptions = openRoles.filter((r) => !activeRoleIds.has(r.id))

  // For Move modal: exclude the source role from destinations too.
  const sourceRoleId = moveableMemberships.find((m) => m.applicationId === sourceApplicationId)?.roleId
  const moveDestinationOptions = destinationOptions.filter((r) => r.id !== sourceRoleId)

  async function handleMove(force = false) {
    if (!sourceApplicationId || !destRoleId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/applications/${sourceApplicationId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationRoleId: destRoleId, notes, force }),
      })
      if (res.status === 409) {
        const b = (await res.json().catch(() => ({}))) as {
          message?: string
          confirmationRequired?: boolean
        }
        if (b.confirmationRequired) {
          setConfirmRequired(b.message ?? 'Confirm move?')
          setBusy(false)
          return
        }
        setError(b.message ?? 'Already in destination.')
        setBusy(false)
        return
      }
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string }
        setError(b.message ?? 'Move failed.')
        setBusy(false)
        return
      }
      const destLabel = openRoles.find((r) => r.id === destRoleId)?.label ?? 'destination role'
      setSuccess(`${candidateName} moved to ${destLabel}. Will appear within ~10 minutes once the apply runner picks up the queue. Admins can use Sync now to force it.`)
      closeModal()
      router.refresh()
      setTimeout(() => setSuccess(null), 4000)
    } catch {
      setError("We couldn't reach our server.")
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd() {
    if (!destRoleId) return
    setBusy(true)
    setError(null)
    try {
      // Reuse the bulk endpoint with a single id - same dedupe + role-status
      // checks the bulk action enforces, no duplicated validation.
      const res = await fetch('/api/candidates/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateIds: [candidateId],
          action: { type: 'add-to-pipeline', roleId: destRoleId },
        }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string }
        setError(b.message ?? 'Add failed.')
        setBusy(false)
        return
      }
      const data = (await res.json()) as { applied: number; skipped: number }
      if (data.applied === 0 && data.skipped > 0) {
        setError(`${candidateName} is already in this role's pipeline.`)
        setBusy(false)
        return
      }
      const destLabel = openRoles.find((r) => r.id === destRoleId)?.label ?? 'destination role'
      setSuccess(`${candidateName} added to ${destLabel}. Will appear within ~10 minutes once the apply runner picks up the queue. Admins can use Sync now to force it.`)
      closeModal()
      router.refresh()
      setTimeout(() => setSuccess(null), 4000)
    } catch {
      setError("We couldn't reach our server.")
    } finally {
      setBusy(false)
    }
  }

  const moveDisabled = hideMove || moveableMemberships.length === 0 || destinationOptions.length === 0
  const addDisabled = hideAdd || destinationOptions.length === 0

  return (
    <>
      {success && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-[60] max-w-sm rounded border border-success bg-success-bg px-3 py-2 text-sm text-ink shadow-lg"
        >
          {success}
        </div>
      )}

      <div className={variant === 'section' ? 'flex flex-wrap gap-2' : 'flex flex-wrap gap-2'}>
        {!hideMove && (
          <button
            type="button"
            disabled={moveDisabled}
            onClick={() => setModal('move')}
            title={
              moveableMemberships.length === 0
                ? 'No moveable applications (all are Joined or none exist).'
                : destinationOptions.length === 0
                  ? 'No other open roles to move into.'
                  : ''
            }
            className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-50"
          >
            Move to other role
          </button>
        )}
        {!hideAdd && (
          <button
            type="button"
            disabled={addDisabled}
            onClick={() => setModal('add')}
            title={
              destinationOptions.length === 0
                ? 'No other open roles to add into.'
                : ''
            }
            className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add to additional role
          </button>
        )}
      </div>

      {modal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pipeline-action-heading"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-2 sm:items-center sm:p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-lg border border-line bg-card p-5 shadow-lg sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 id="pipeline-action-heading" className="font-display text-lg text-ink">
                {modal === 'move' ? 'Move to other role' : 'Add to additional role'}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={closeModal}
                className="text-ink-3 hover:text-ink"
              >
                ×
              </button>
            </div>

            {modal === 'move' && (
              <>
                <p className="text-sm text-ink-2">
                  Withdraws {candidateName} from the source role and lands them at Sourced in
                  the destination. Both ends are audited.
                </p>

                <label htmlFor="move-source" className="mt-4 block text-xs font-medium text-ink-2">
                  Source role
                </label>
                <select
                  id="move-source"
                  value={sourceApplicationId}
                  onChange={(e) => setSourceApplicationId(e.target.value)}
                  disabled={moveableMemberships.length <= 1}
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-70"
                >
                  {moveableMemberships.length === 0 && (
                    <option value="">No moveable applications</option>
                  )}
                  {moveableMemberships.map((m) => (
                    <option key={m.applicationId} value={m.applicationId}>
                      {m.roleTitle} ({m.currentStage})
                    </option>
                  ))}
                </select>

                <label htmlFor="move-dest" className="mt-3 block text-xs font-medium text-ink-2">
                  Destination role
                </label>
                <select
                  id="move-dest"
                  value={destRoleId}
                  onChange={(e) => setDestRoleId(e.target.value)}
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                >
                  <option value="">Select a role</option>
                  {moveDestinationOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </>
            )}

            {modal === 'add' && (
              <>
                <p className="text-sm text-ink-2">
                  Lands {candidateName} at Sourced in the destination. Existing roles are
                  untouched. Roles {candidateName} is already in are hidden from the dropdown.
                </p>

                <label htmlFor="add-dest" className="mt-4 block text-xs font-medium text-ink-2">
                  Destination role
                </label>
                <select
                  id="add-dest"
                  value={destRoleId}
                  onChange={(e) => setDestRoleId(e.target.value)}
                  className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                >
                  <option value="">Select a role</option>
                  {destinationOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label htmlFor="action-notes" className="mt-3 block text-xs font-medium text-ink-2">
              Notes (optional)
            </label>
            <textarea
              id="action-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={modal === 'move' ? 'e.g. better fit for this role' : 'e.g. sourcing for parallel position'}
              className="mt-1 block w-full rounded border border-line-strong bg-card px-3 py-2 text-sm text-ink focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            />

            {error && (
              <div role="alert" className="mt-3 rounded border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            {confirmRequired && (
              <div className="mt-3 rounded border border-warning bg-warning-bg px-3 py-2 text-sm text-ink">
                <p className="font-medium">{confirmRequired}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleMove(true)}
                    className="inline-flex min-h-[32px] items-center rounded bg-warning px-3 py-1 text-sm font-medium text-ink hover:opacity-90 disabled:opacity-60"
                  >
                    {busy ? 'Moving…' : 'Move anyway'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRequired(null)}
                    className="inline-flex min-h-[32px] items-center rounded border border-line-strong bg-card px-3 py-1 text-sm text-ink-2 hover:bg-surface"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  !destRoleId ||
                  (modal === 'move' && !sourceApplicationId) ||
                  confirmRequired !== null
                }
                onClick={() => {
                  if (modal === 'move') void handleMove(false)
                  else void handleAdd()
                }}
                className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-60"
              >
                {busy ? 'Saving…' : modal === 'move' ? 'Move' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
