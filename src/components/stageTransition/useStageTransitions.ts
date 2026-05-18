'use client'

/*
 * Shared controller for pipeline stage transitions.
 *
 * Owns: optimistic state map, in-flight guards, undo timer, error and
 * success toasts, and the modal-trigger flags (confirm + reject reason).
 * The Kanban and the candidates list both consume this hook so the rules
 * live in one place - Karpathy: one obvious surface per concern.
 *
 * Why a hook and not a component:
 *   - The Kanban already manages drag-drop optimism on the same data; lifting
 *     transitions into a hook lets the existing useOptimistic state be the
 *     single source of truth.
 *   - The candidates list will reuse this from a single-row context with no
 *     bulk surface - the hook returns only what each surface needs.
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
import { composeBulkToastMessage } from '@/lib/bulkActionToast'
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

/** Single-source-of-truth for a reopen invocation, shared by the modal and
 * the dispatch path. `applicationIds` covers single-card (one entry) and
 * bulk reopen (many entries). */
interface PendingReopen {
  applicationIds: string[]
  /** Eligible target stages, computed once when the modal opens. Empty
   * when no candidate in the selection has a reopen-eligible stage; the
   * modal renders a disabled state in that case. */
  targetStageOptions: Stage[]
  /** Source stage(s) for the helper copy. */
  fromLabel: string
  /** Display label for the modal title: candidate name (single) or
   * "N candidates" (bulk). */
  subjectLabel: string
  /** True for bulk reopen - the submit path posts to /bulk-reopen. */
  bulk: boolean
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
  // Reopen dispatch (single + bulk). Drag-drop OUT of terminal stages is
  // never the entry point; reopen is always explicit.
  reopenSingleStart: (applicationId: string) => void
  bulkReopenStart: (applicationIds: string[]) => void
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
  reopenModal: {
    open: boolean
    subjectLabel: string
    fromLabel: string
    targetStageOptions: Stage[]
    busy: boolean
    onCancel: () => void
    onSubmit: (payload: {
      targetStage: string
      reason: string
      notifyCandidate: boolean
    }) => void
  } | null
  // Toasts.
  successToast: { message: string; undo?: () => void } | null
  errorToast: string | null
  dismissError: () => void
  dismissSuccess: () => void
  /** Subset of busyApplicationIds whose in-flight transition has exceeded
   * the slow-threshold (1s). UI can render a "Saving…" affordance on
   * cards in this set without flashing on every fast success. */
  slowApplicationIds: Set<string>
}

const UNDO_WINDOW_MS = 5000

/** After this many ms in-flight, the card flags itself as "Saving…" so
 * the user has a visible signal something is taking longer than usual.
 * 1 second is the well-trodden user-perception threshold for "this
 * feels instant" vs. "this feels stuck". */
const SLOW_THRESHOLD_MS = 1000

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
  const [slow, setSlow] = useState<Set<string>>(new Set())
  const slowTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<{ message: string; entries: UndoEntry[] } | null>(null)
  const [confirmState, setConfirmState] = useState<UseStageTransitionsResult['confirmModal']>(null)
  const [rejectState, setRejectState] = useState<{
    bulk: boolean
    pending: PendingTransition | PendingBulkTransition
    subjectLabel: string
    busy: boolean
  } | null>(null)
  const [reopenState, setReopenState] = useState<{
    pending: PendingReopen
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
    // Slow-tracker: schedule a one-shot per id when going busy; clear
    // both the timer and the slow flag when going un-busy.
    for (const id of ids) {
      const existing = slowTimers.current.get(id)
      if (existing) {
        clearTimeout(existing)
        slowTimers.current.delete(id)
      }
      if (on) {
        const t = setTimeout(() => {
          setSlow((prev) => {
            if (prev.has(id)) return prev
            const next = new Set(prev)
            next.add(id)
            return next
          })
          slowTimers.current.delete(id)
        }, SLOW_THRESHOLD_MS)
        slowTimers.current.set(id, t)
      } else {
        setSlow((prev) => {
          if (!prev.has(id)) return prev
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    }
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
        // state we shouldn't trivially undo (Joined). Reject is undoable -
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

        const message = composeBulkToastMessage({
          successLabel,
          applied: data.applied,
          skipped: data.skipped,
          errors: data.errors,
          failures: data.details.filter((d) => d.status !== 'applied'),
        })
        setSuccessMsg({
          message: `${message}${SYNC_HINT}`,
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
              `Marks ${candidateName} as Joined for ${role.title}. Joined is a terminal state - you can't move them back through this menu after this.`,
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

  // -- Reopen dispatch -----------------------------------------------------

  const reopenSingleStart = useCallback(
    (applicationId: string) => {
      const app = appById.get(applicationId)
      const role = roleByApplicationId(applicationId)
      if (!app || !role) return
      if (!isTerminal(app.currentStage)) {
        // Defensive: caller should only invoke from a terminal-stage card.
        setError(`${app.candidate?.name ?? 'This candidate'} is not in a terminal stage.`)
        return
      }
      setReopenState({
        pending: {
          applicationIds: [applicationId],
          targetStageOptions: [...role.pipelineStages] as Stage[],
          fromLabel: String(app.currentStage),
          subjectLabel: app.candidate?.name ?? 'this candidate',
          bulk: false,
        },
        busy: false,
      })
    },
    [appById, roleByApplicationId],
  )

  const bulkReopenStart = useCallback(
    (applicationIds: string[]) => {
      if (applicationIds.length === 0) return
      // Only terminal-stage selections are eligible - silently drop the
      // non-terminal ones so the modal doesn't reopen something that's
      // already live. The caller (bulk action bar) gates this with the
      // same predicate, but be defensive.
      const eligible: typeof applicationIds = []
      const fromStageCounts = new Map<string, number>()
      let intersectedStages: string[] | null = null
      for (const id of applicationIds) {
        const app = appById.get(id)
        const role = roleByApplicationId(id)
        if (!app || !role) continue
        if (!isTerminal(app.currentStage)) continue
        eligible.push(id)
        const from = String(app.currentStage)
        fromStageCounts.set(from, (fromStageCounts.get(from) ?? 0) + 1)
        const stages = role.pipelineStages as string[]
        intersectedStages =
          intersectedStages === null
            ? [...stages]
            : intersectedStages.filter((s) => stages.includes(s))
      }
      if (eligible.length === 0) {
        setError('None of the selected candidates are in a terminal state.')
        return
      }
      const fromLabel =
        [...fromStageCounts.entries()]
          .map(([s, n]) => (n > 1 ? `${s} (${n})` : s))
          .join(', ') || '(terminal)'
      setReopenState({
        pending: {
          applicationIds: eligible,
          targetStageOptions: (intersectedStages ?? []) as Stage[],
          fromLabel,
          subjectLabel: `${eligible.length} candidate${eligible.length === 1 ? '' : 's'}`,
          bulk: true,
        },
        busy: false,
      })
    },
    [appById, roleByApplicationId],
  )

  const performSingleReopen = useCallback(
    async (
      pending: PendingReopen,
      payload: { targetStage: string; reason: string; notifyCandidate: boolean },
    ): Promise<boolean> => {
      const applicationId = pending.applicationIds[0]
      if (!applicationId) return false
      const app = appById.get(applicationId)
      if (!app) return false
      const fromStage = app.currentStage
      const targetStage = payload.targetStage as Stage
      markBusy([applicationId], true)
      try {
        applyOptimistic(applicationId, targetStage)
        const res = await fetch(`/api/applications/${applicationId}/reopen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          revertOptimistic(applicationId, fromStage)
          const b = (await res.json().catch(() => ({}))) as { message?: string }
          setError(b.message ?? 'Reopen failed.')
          return false
        }
        const candidateName = app.candidate?.name ?? 'this candidate'
        setSuccessMsg({
          message: `${candidateName} reopened from ${fromStage} to ${targetStage}.${SYNC_HINT}`,
          entries: [],
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
    [appById, applyOptimistic, refreshServer, revertOptimistic, markBusy],
  )

  const performBulkReopen = useCallback(
    async (
      pending: PendingReopen,
      payload: { targetStage: string; reason: string; notifyCandidate: boolean },
    ): Promise<boolean> => {
      const ids = pending.applicationIds
      markBusy(ids, true)
      const flippedFrom = new Map<string, Stage>()
      try {
        for (const id of ids) {
          const app = appById.get(id)
          if (!app) continue
          flippedFrom.set(id, app.currentStage)
          applyOptimistic(id, payload.targetStage as Stage)
        }
        const res = await fetch('/api/applications/bulk-reopen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationIds: ids, ...payload }),
        })
        if (!res.ok) {
          for (const [id, fromStage] of flippedFrom) revertOptimistic(id, fromStage)
          const b = (await res.json().catch(() => ({}))) as { message?: string }
          setError(b.message ?? 'Reopen failed.')
          return false
        }
        const data = (await res.json()) as {
          applied: number
          skipped: number
          errors: number
          details: Array<{
            applicationId: string
            status: 'applied' | 'skipped' | 'error'
            message?: string
          }>
        }
        const appliedSet = new Set(
          data.details.filter((d) => d.status === 'applied').map((d) => d.applicationId),
        )
        for (const [id, fromStage] of flippedFrom) {
          if (!appliedSet.has(id)) revertOptimistic(id, fromStage)
        }
        const message = composeBulkToastMessage({
          successLabel: 'Reopened',
          applied: data.applied,
          skipped: data.skipped,
          errors: data.errors,
          failures: data.details.filter((d) => d.status !== 'applied'),
        })
        setSuccessMsg({
          message: `${message}${SYNC_HINT}`,
          entries: [],
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
    [appById, applyOptimistic, refreshServer, revertOptimistic, markBusy],
  )

  const submitReopen = useCallback(
    async (payload: { targetStage: string; reason: string; notifyCandidate: boolean }) => {
      if (!reopenState) return
      setReopenState((prev) => (prev ? { ...prev, busy: true } : prev))
      const ok = reopenState.pending.bulk
        ? await performBulkReopen(reopenState.pending, payload)
        : await performSingleReopen(reopenState.pending, payload)
      if (ok) setReopenState(null)
      else setReopenState((prev) => (prev ? { ...prev, busy: false } : prev))
    },
    [performBulkReopen, performSingleReopen, reopenState],
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
    reopenSingleStart,
    bulkReopenStart,
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
    reopenModal: reopenState
      ? {
          open: true,
          subjectLabel: reopenState.pending.subjectLabel,
          fromLabel: reopenState.pending.fromLabel,
          targetStageOptions: reopenState.pending.targetStageOptions,
          busy: reopenState.busy,
          onCancel: () => setReopenState(null),
          onSubmit: (payload) => void submitReopen(payload),
        }
      : null,
    successToast,
    errorToast: error,
    dismissError: () => setError(null),
    dismissSuccess: () => {
      if (successTimer.current) clearTimeout(successTimer.current)
      setSuccessMsg(null)
    },
    slowApplicationIds: slow,
  }
}

export function forwardLabelFor(stage: Stage): string {
  return forwardLabel(stage)
}
