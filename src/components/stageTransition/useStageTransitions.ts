'use client'

/*
 * Shared controller for pipeline stage transitions.
 *
 * Owns: optimistic state map, in-flight guards, undo timer, error and
 * success toasts, and the modal-trigger flags (confirm + reject reason).
 * The Kanban and the candidates list both consume this hook so the rules
 * live in one place — Karpathy: one obvious surface per concern.
 *
 * Why a hook and not a component:
 *   - The Kanban already manages drag-drop optimism on the same data; lifting
 *     transitions into a hook lets the existing useOptimistic state be the
 *     single source of truth.
 *   - The candidates list will reuse this from a single-row context with no
 *     bulk surface — the hook returns only what each surface needs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ApplicationWithCandidate } from '@/lib/data'
import type { Role, Stage } from '@/lib/types'
import { isTerminal } from '@/lib/pipeline'
import {
  forwardLabel,
  isHodRoundStage,
  type RejectionReason,
} from '@/lib/stageTransition'
import type { TransitionIntent } from './StageTransitionButtons'

/** Snapshot we need to undo a single application's transition. */
interface UndoEntry {
  applicationId: string
  candidateName: string
  fromStage: Stage
  toStage: Stage
}

interface PendingTransition {
  /** Single application + target. */
  applicationId: string
  fromStage: Stage
  toStage: Stage
  /** When set, the transition is a Reject and a reason was captured. */
  rejectionReason?: RejectionReason
  rejectionNotes?: string
}

interface PendingBulkTransition {
  applicationIds: string[]
  /** Either a target stage (Reject) or 'forward'/'backward' direction. */
  targetStage?: Stage
  direction?: 'forward' | 'backward'
  rejectionReason?: RejectionReason
  rejectionNotes?: string
}

export interface UseStageTransitionsArgs {
  /** Current applications (already optimistically reflected by parent). */
  applications: ApplicationWithCandidate[]
  /** The role context. For pages with mixed roles (candidate list), pass the
   * matching role per application; for the Kanban (single role), it's static. */
  roleByApplicationId: (applicationId: string) => Role | undefined
  /** Apply an optimistic stage flip locally before queueing. */
  applyOptimistic: (applicationId: string, toStage: Stage) => void
  /** Revert the optimistic flip on failure / undo. */
  revertOptimistic: (applicationId: string, toStage: Stage) => void
  /** Trigger a Server Component refresh after the queue write succeeds. */
  refreshServer?: () => void
}

export type IntentDispatch = (applicationId: string, intent: TransitionIntent) => void

export interface UseStageTransitionsResult {
  // Single-card dispatch.
  onIntent: IntentDispatch
  busyApplicationIds: Set<string>
  // Bulk dispatch.
  bulkForward: (applicationIds: string[]) => void
  bulkBackward: (applicationIds: string[]) => void
  bulkRejectStart: (applicationIds: string[]) => void
  // Modal state.
  confirmModal: {
    open: boolean
    title: string
    body?: string
    variant: 'default' | 'warning' | 'danger'
    confirmLabel: string
    onConfirm: () => void
    onCancel: () => void
  } | null
  rejectModal: {
    open: boolean
    subjectLabel: string
    bulk: boolean
    busy: boolean
    onCancel: () => void
    onSubmit: (payload: { rejectionReason: RejectionReason; rejectionNotes?: string }) => void
  } | null
  // Toasts.
  successToast: { message: string; undo?: () => void } | null
  errorToast: string | null
  dismissError: () => void
  dismissSuccess: () => void
}

const UNDO_WINDOW_MS = 5000

/** Tail line appended to every staff-facing save toast. The queue lag is
 * the user-perceived "my change reverted" cause; this surfaces the
 * Sync now button as the explicit knob HR can pull instead of waiting. */
const SYNC_HINT = ' Click Sync now to force immediate sync, or wait for the next auto-sync.'

export function useStageTransitions({
  applications,
  roleByApplicationId,
  applyOptimistic,
  revertOptimistic,
  refreshServer,
}: UseStageTransitionsArgs): UseStageTransitionsResult {
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<{ message: string; entries: UndoEntry[] } | null>(null)
  const [confirmState, setConfirmState] = useState<UseStageTransitionsResult['confirmModal']>(null)
  const [rejectState, setRejectState] = useState<{
    bulk: boolean
    pending: PendingTransition | PendingBulkTransition
    subjectLabel: string
    busy: boolean
  } | null>(null)

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoBlockedRef = useRef<Set<string>>(new Set())

  const appById = useMemo(() => {
    const m = new Map<string, ApplicationWithCandidate>()
    for (const a of applications) m.set(a.id, a)
    return m
  }, [applications])

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current)
    }
  }, [])

  const markBusy = useCallback((ids: string[], on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }, [])

  // -- Single-card transitions ---------------------------------------------

  const performSingle = useCallback(
    async (
      pending: PendingTransition,
      candidateName: string,
      successPrefix: string,
      overrideContext?: { override: true; overrideReason: string },
    ): Promise<boolean> => {
      const { applicationId, fromStage, toStage } = pending
      markBusy([applicationId], true)
      try {
        applyOptimistic(applicationId, toStage)
        const res = await fetch(`/api/applications/${applicationId}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetStage: toStage,
            rejectionReason: pending.rejectionReason,
            rejectionNotes: pending.rejectionNotes,
            ...(overrideContext ?? {}),
          }),
        })
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as {
            message?: string
            gate?: 'no-hiring-manager-assigned' | 'feedback-not-submitted'
            promptHint?: string
          }
          revertOptimistic(applicationId, fromStage)
          if (res.status === 409 && b.gate) {
            // Surface a friendly explanation that hands the user back to the
            // Hiring Manager Controls block. Admin override is offered via
            // a confirm-with-text-input dialog separately.
            setError(
              b.message ??
                'Feedback required before moving this candidate forward. Submit feedback first, or ask Admin to override.',
            )
            return false
          }
          setError(b.message ?? 'We could not save that. Try again, or WhatsApp Anish.')
          return false
        }
        // Surface a single-entry undo unless the move is into a terminal
        // state we shouldn't trivially undo (Joined). Reject is undoable —
        // explicit user-feedback ask for reversal of accidental rejects.
        const undoable = toStage !== 'Joined'
        const entries: UndoEntry[] = undoable
          ? [{ applicationId, candidateName, fromStage, toStage }]
          : []
        const noun = isHodRoundStage(toStage) ? `. HOD has been notified` : ''
        setSuccessMsg({
          message: `${successPrefix}${noun}.${SYNC_HINT}`,
          entries,
        })
        scheduleSuccessClear()
        refreshServer?.()
        return true
      } catch {
        revertOptimistic(applicationId, fromStage)
        setError('We could not reach our server. Try again.')
        return false
      } finally {
        markBusy([applicationId], false)
      }
    },
    [applyOptimistic, refreshServer, revertOptimistic, markBusy],
  )

  function scheduleSuccessClear() {
    if (successTimer.current) clearTimeout(successTimer.current)
    successTimer.current = setTimeout(() => {
      setSuccessMsg(null)
    }, UNDO_WINDOW_MS)
  }

  // -- Bulk -----------------------------------------------------------------

  const performBulk = useCallback(
    async (
      bulk: PendingBulkTransition,
      successLabel: string,
    ): Promise<boolean> => {
      const ids = bulk.applicationIds
      markBusy(ids, true)
      // Optimistic flips: per-app target depends on direction; for explicit
      // targetStage we flip immediately; for direction we compute per-role.
      const flippedFrom = new Map<string, Stage>()
      try {
        for (const id of ids) {
          const app = appById.get(id)
          if (!app) continue
          const role = roleByApplicationId(id)
          if (!role) continue
          let to: Stage | null = null
          if (bulk.targetStage) to = bulk.targetStage
          else if (bulk.direction === 'forward') {
            const idx = role.pipelineStages.indexOf(app.currentStage as string)
            if (idx >= 0 && idx < role.pipelineStages.length - 1)
              to = role.pipelineStages[idx + 1] ?? null
          } else if (bulk.direction === 'backward') {
            const idx = role.pipelineStages.indexOf(app.currentStage as string)
            if (idx > 0) to = role.pipelineStages[idx - 1] ?? null
          }
          if (!to) continue
          flippedFrom.set(id, app.currentStage)
          applyOptimistic(id, to)
        }
        const res = await fetch('/api/applications/bulk-transition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            applicationIds: ids,
            targetStage: bulk.targetStage,
            direction: bulk.direction,
            rejectionReason: bulk.rejectionReason,
            rejectionNotes: bulk.rejectionNotes,
          }),
        })
        if (!res.ok) {
          // Roll back every optimistic flip.
          for (const [id, fromStage] of flippedFrom) revertOptimistic(id, fromStage)
          const b = (await res.json().catch(() => ({}))) as { message?: string }
          setError(b.message ?? 'Bulk action failed.')
          return false
        }
        const data = (await res.json()) as {
          applied: number
          skipped: number
          errors: number
          details: Array<{
            applicationId: string
            candidateName?: string
            fromStage: string
            toStage?: string
            status: 'applied' | 'skipped' | 'error'
            message?: string
          }>
        }

        // Roll back optimism for ones the server skipped or errored on so the
        // UI doesn't promise a flip that didn't land.
        const appliedSet = new Set<string>()
        for (const d of data.details) {
          if (d.status === 'applied') appliedSet.add(d.applicationId)
        }
        for (const [id, fromStage] of flippedFrom) {
          if (!appliedSet.has(id)) revertOptimistic(id, fromStage)
        }

        const undoEntries: UndoEntry[] = data.details
          .filter((d) => d.status === 'applied' && d.toStage && d.toStage !== 'Joined')
          .map((d) => ({
            applicationId: d.applicationId,
            candidateName: d.candidateName ?? 'candidate',
            fromStage: (flippedFrom.get(d.applicationId) ?? d.fromStage) as Stage,
            toStage: d.toStage as Stage,
          }))

        const tail =
          data.skipped + data.errors > 0
            ? ` ${data.skipped + data.errors} could not be moved.`
            : ''
        setSuccessMsg({
          message: `${successLabel} ${data.applied} candidate${data.applied === 1 ? '' : 's'}.${tail}${SYNC_HINT}`,
          entries: undoEntries,
        })
        scheduleSuccessClear()
        refreshServer?.()
        return true
      } catch {
        for (const [id, fromStage] of flippedFrom) revertOptimistic(id, fromStage)
        setError('We could not reach our server. Try again.')
        return false
      } finally {
        markBusy(ids, false)
      }
    },
    [appById, applyOptimistic, refreshServer, revertOptimistic, roleByApplicationId, markBusy],
  )

  // -- Undo -----------------------------------------------------------------

  const performUndo = useCallback(
    async (entries: UndoEntry[]) => {
      if (entries.length === 0) return
      // Stash the current "after" stages so we can reset to them on failure.
      const reverseFrom = new Map<string, Stage>()
      for (const e of entries) {
        if (undoBlockedRef.current.has(e.applicationId)) continue
        reverseFrom.set(e.applicationId, e.toStage)
      }
      // Optimistic revert immediately.
      for (const [id, _to] of reverseFrom) {
        const e = entries.find((x) => x.applicationId === id)
        if (!e) continue
        applyOptimistic(id, e.fromStage)
      }
      markBusy([...reverseFrom.keys()], true)
      try {
        const res = await fetch('/api/applications/bulk-transition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            applicationIds: [...reverseFrom.keys()],
            // Per-application target stage isn't supported by the bulk API
            // (one targetStage per call), so for the common case where every
            // entry shares the same fromStage we use that. When the entries
            // span different from-stages we fall back to N single calls.
            ...computeUndoBody(entries.filter((e) => reverseFrom.has(e.applicationId))),
            notes: 'Undo of stage transition.',
          }),
        })
        if (!res.ok) {
          // Revert the revert.
          for (const [id, to] of reverseFrom) applyOptimistic(id, to)
          const b = (await res.json().catch(() => ({}))) as { message?: string }
          setError(b.message ?? 'Undo failed.')
          return
        }
        const data = (await res.json()) as {
          applied: number
          details: Array<{
            applicationId: string
            status: 'applied' | 'skipped' | 'error'
            message?: string
          }>
        }
        // Re-revert for ids the server didn't actually undo.
        const undoneIds = new Set(
          data.details.filter((d) => d.status === 'applied').map((d) => d.applicationId),
        )
        for (const [id, to] of reverseFrom) {
          if (!undoneIds.has(id)) applyOptimistic(id, to)
        }
        setSuccessMsg({
          message: `Reverted ${data.applied} candidate${data.applied === 1 ? '' : 's'}.${SYNC_HINT}`,
          entries: [],
        })
        scheduleSuccessClear()
        refreshServer?.()
      } catch {
        for (const [id, to] of reverseFrom) applyOptimistic(id, to)
        setError('Undo could not reach our server.')
      } finally {
        markBusy([...reverseFrom.keys()], false)
      }
    },
    [applyOptimistic, refreshServer, markBusy],
  )

  function computeUndoBody(entries: UndoEntry[]): {
    targetStage?: string
    direction?: 'forward' | 'backward'
  } {
    if (entries.length === 0) return {}
    const first = entries[0]
    if (!first) return {}
    const allSame = entries.every((e) => e.fromStage === first.fromStage)
    if (allSame) return { targetStage: first.fromStage as string }
    // Mixed from-stages: best effort using direction. Most undo sets are
    // homogeneous in practice (all forward → all back).
    return { direction: 'backward' }
  }

  // -- Intent dispatch (single) --------------------------------------------

  const onIntent = useCallback<IntentDispatch>(
    (applicationId, intent) => {
      const app = appById.get(applicationId)
      const role = roleByApplicationId(applicationId)
      if (!app || !role) return
      if (busy.has(applicationId)) return
      if (isTerminal(app.currentStage)) {
        setError(`Cannot move ${app.candidate?.name ?? 'this candidate'} from ${app.currentStage}.`)
        return
      }
      const candidateName = app.candidate?.name ?? 'this candidate'
      if (intent.kind === 'forward') {
        const toStage = intent.targetStage
        if (toStage === 'Joined') {
          setConfirmState({
            open: true,
            title: `Confirm ${candidateName}'s hire?`,
            body:
              `Marks ${candidateName} as Joined for ${role.title}. Joined is a terminal state — you can't move them back through this menu after this.`,
            variant: 'default',
            confirmLabel: 'Confirm hire',
            onConfirm: () => {
              setConfirmState(null)
              void performSingle(
                { applicationId, fromStage: app.currentStage, toStage },
                candidateName,
                `${candidateName} marked as Joined`,
              )
            },
            onCancel: () => setConfirmState(null),
          })
          return
        }
        void performSingle(
          { applicationId, fromStage: app.currentStage, toStage },
          candidateName,
          `${candidateName} moved to ${toStage}`,
        )
      } else if (intent.kind === 'backward') {
        const toStage = intent.targetStage
        setConfirmState({
          open: true,
          title: `Move ${candidateName} back to ${toStage}?`,
          body: `Backwards moves are unusual. Confirm only if the previous stage info needs redoing.`,
          variant: 'warning',
          confirmLabel: `Move back`,
          onConfirm: () => {
            setConfirmState(null)
            void performSingle(
              { applicationId, fromStage: app.currentStage, toStage },
              candidateName,
              `${candidateName} moved back to ${toStage}`,
            )
          },
          onCancel: () => setConfirmState(null),
        })
      } else if (intent.kind === 'reject') {
        setRejectState({
          bulk: false,
          pending: {
            applicationId,
            fromStage: app.currentStage,
            toStage: 'Rejected',
          } as PendingTransition,
          subjectLabel: candidateName,
          busy: false,
        })
      }
    },
    [appById, busy, performSingle, roleByApplicationId],
  )

  // -- Bulk dispatch -------------------------------------------------------

  const bulkForward = useCallback(
    (applicationIds: string[]) => {
      if (applicationIds.length === 0) return
      void performBulk(
        { applicationIds, direction: 'forward' },
        'Moved forward',
      )
    },
    [performBulk],
  )

  const bulkBackward = useCallback(
    (applicationIds: string[]) => {
      if (applicationIds.length === 0) return
      void performBulk(
        { applicationIds, direction: 'backward' },
        'Moved backward',
      )
    },
    [performBulk],
  )

  const bulkRejectStart = useCallback(
    (applicationIds: string[]) => {
      if (applicationIds.length === 0) return
      setRejectState({
        bulk: true,
        pending: { applicationIds, targetStage: 'Rejected' } as PendingBulkTransition,
        subjectLabel: `${applicationIds.length} candidate${applicationIds.length === 1 ? '' : 's'}`,
        busy: false,
      })
    },
    [],
  )

  // -- Reject modal submit -------------------------------------------------

  const submitReject = useCallback(
    async (payload: { rejectionReason: RejectionReason; rejectionNotes?: string }) => {
      if (!rejectState) return
      setRejectState((prev) => (prev ? { ...prev, busy: true } : prev))
      if (!rejectState.bulk) {
        const p = rejectState.pending as PendingTransition
        const app = appById.get(p.applicationId)
        const candidateName = app?.candidate?.name ?? 'this candidate'
        const ok = await performSingle(
          {
            ...p,
            rejectionReason: payload.rejectionReason,
            rejectionNotes: payload.rejectionNotes,
          },
          candidateName,
          `${candidateName} rejected (${payload.rejectionReason})`,
        )
        if (ok) setRejectState(null)
        else setRejectState((prev) => (prev ? { ...prev, busy: false } : prev))
      } else {
        const p = rejectState.pending as PendingBulkTransition
        const ok = await performBulk(
          {
            ...p,
            rejectionReason: payload.rejectionReason,
            rejectionNotes: payload.rejectionNotes,
          },
          'Rejected',
        )
        if (ok) setRejectState(null)
        else setRejectState((prev) => (prev ? { ...prev, busy: false } : prev))
      }
    },
    [appById, performBulk, performSingle, rejectState],
  )

  const successToast = useMemo<UseStageTransitionsResult['successToast']>(() => {
    if (!successMsg) return null
    const undoEntries = successMsg.entries
    return {
      message: successMsg.message,
      undo:
        undoEntries.length > 0
          ? () => {
              if (successTimer.current) clearTimeout(successTimer.current)
              setSuccessMsg(null)
              void performUndo(undoEntries)
            }
          : undefined,
    }
  }, [performUndo, successMsg])

  return {
    onIntent,
    busyApplicationIds: busy,
    bulkForward,
    bulkBackward,
    bulkRejectStart,
    confirmModal: confirmState,
    rejectModal: rejectState
      ? {
          open: true,
          subjectLabel: rejectState.subjectLabel,
          bulk: rejectState.bulk,
          busy: rejectState.busy,
          onCancel: () => setRejectState(null),
          onSubmit: (payload) => void submitReject(payload),
        }
      : null,
    successToast,
    errorToast: error,
    dismissError: () => setError(null),
    dismissSuccess: () => {
      if (successTimer.current) clearTimeout(successTimer.current)
      setSuccessMsg(null)
    },
  }
}

export function forwardLabelFor(stage: Stage): string {
  return forwardLabel(stage)
}
