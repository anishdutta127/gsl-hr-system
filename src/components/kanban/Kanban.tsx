'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { Column } from './Column'
import { CandidateCard } from './CandidateCard'
import { CandidateSidePanel, type SidePanelCandidate } from './CandidateSidePanel'
import { KanbanFilters, applyFilters, type FilterKey } from './KanbanFilters'
import { BulkActionBar } from './BulkActionBar'
import { useStageTransitions } from '@/components/stageTransition/useStageTransitions'
import { ConfirmModal } from '@/components/stageTransition/ConfirmModal'
import { RejectReasonModal } from '@/components/stageTransition/RejectReasonModal'
import type { Role, Stage } from '@/lib/types'
import type { ApplicationWithCandidate } from '@/lib/data'
import type { CurrentMembership, OpenRoleOption } from '@/components/PipelineActions'
import { isPipelineReadOnly } from '@/lib/roleStatus'

interface Props {
  role: Role
  applications: ApplicationWithCandidate[]
  stages: Stage[]
  membershipsByCandidate?: Record<string, CurrentMembership[]>
  openRoles?: OpenRoleOption[]
  /** When true, the viewer can move candidates and edit. Hides actions otherwise. */
  canEdit?: boolean
  /** Email of the current viewer; used by "My adds" filter. */
  currentUserEmail?: string
  /** Initial filter state hydrated from URL search params (server -> client). */
  initialFilters?: FilterKey[]
}

export function Kanban({
  role,
  applications,
  stages,
  membershipsByCandidate = {},
  openRoles = [],
  canEdit = false,
  currentUserEmail = '',
  initialFilters = [],
}: Props) {
  const router = useRouter()

  // Optimistic stage overrides. Each entry survives until the server props
  // catch up (the queue applies and `applications` re-arrives with the same
  // stage), at which point the override is redundant and we drop it. Leaving
  // stale entries in place is what produced the "Already at this stage"
  // false-positive in Workstream 4 — a second drag computed targetStage
  // against the override, which already matched currentStage.
  const [stageOverride, setStageOverride] = useState<Record<string, Stage>>({})

  // Drop overrides that match the server-side stage (the apply ran, or the
  // override was wrong and the server source of truth is the canonical state).
  useEffect(() => {
    setStageOverride((prev) => {
      let changed = false
      const next: Record<string, Stage> = {}
      for (const [id, ov] of Object.entries(prev)) {
        const serverApp = applications.find((a) => a.id === id)
        if (serverApp && serverApp.currentStage === ov) {
          changed = true
          continue
        }
        next[id] = ov
      }
      return changed ? next : prev
    })
  }, [applications])

  const merged = useMemo<ApplicationWithCandidate[]>(() => {
    return applications.map((a) =>
      stageOverride[a.id]
        ? ({ ...a, currentStage: stageOverride[a.id] as Stage } as ApplicationWithCandidate)
        : a,
    )
  }, [applications, stageOverride])

  const applyOptimistic = useCallback((applicationId: string, toStage: Stage) => {
    setStageOverride((prev) => ({ ...prev, [applicationId]: toStage }))
  }, [])

  const revertOptimistic = useCallback((applicationId: string, toStage: Stage) => {
    setStageOverride((prev) => ({ ...prev, [applicationId]: toStage }))
  }, [])

  const refreshServer = useCallback(() => {
    // Server props win after refresh; clear stale overrides for clarity.
    router.refresh()
  }, [router])

  const transitions = useStageTransitions({
    applications: merged,
    roleByApplicationId: () => role,
    applyOptimistic,
    revertOptimistic,
    refreshServer,
  })

  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<FilterKey[]>(initialFilters)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const filtered = useMemo(
    () =>
      applyFilters(merged, {
        filters,
        currentUserEmail,
      }),
    [merged, filters, currentUserEmail],
  )

  const byStage: Record<string, ApplicationWithCandidate[]> = {}
  for (const stage of stages) byStage[stage] = []
  for (const a of filtered) {
    const list = byStage[a.currentStage as string]
    if (list) list.push(a)
  }

  const active = activeId ? filtered.find((a) => a.id === activeId) : null

  const pipelineLocked = isPipelineReadOnly(role)
  const canActOnCard = canEdit && !pipelineLocked

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    if (!canActOnCard) return
    const applicationId = String(event.active.id)
    const targetStage = event.over ? String(event.over.id) : null
    if (!targetStage) return
    const application = merged.find((a) => a.id === applicationId)
    if (!application || application.currentStage === targetStage) return

    // Drag-drop = treat as forward (or rare back) move with no rejection
    // capture; rejecting a candidate by dragging into the Rejected column
    // still needs structured reason capture, so route through the same hook.
    if (targetStage === 'Rejected') {
      transitions.onIntent(applicationId, { kind: 'reject' })
      return
    }
    // For Joined and previous-stage drops, the hook puts up the right
    // confirmation. Forward = silent; back = warning confirm.
    const isBackward =
      role.pipelineStages.indexOf(targetStage) <
      role.pipelineStages.indexOf(application.currentStage as string)
    transitions.onIntent(applicationId, {
      kind: isBackward ? 'backward' : 'forward',
      targetStage,
    })
  }

  const selectedActiveIds = useMemo(
    () =>
      Array.from(selected).filter((id) => {
        const app = merged.find((a) => a.id === id)
        return app != null
      }),
    [selected, merged],
  )

  function toggleSelect(applicationId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(applicationId)) next.delete(applicationId)
      else next.add(applicationId)
      return next
    })
  }

  return (
    <div className="relative flex-1 overflow-x-auto">
      <KanbanFilters
        value={filters}
        onChange={setFilters}
        currentUserEmail={currentUserEmail}
      />

      {selectedActiveIds.length > 0 && canActOnCard && (
        <BulkActionBar
          role={role}
          selected={selectedActiveIds}
          applications={merged}
          onForward={() => {
            transitions.bulkForward(selectedActiveIds)
            setSelected(new Set())
          }}
          onBackward={() => {
            transitions.bulkBackward(selectedActiveIds)
            setSelected(new Set())
          }}
          onReject={() => {
            transitions.bulkRejectStart(selectedActiveIds)
            setSelected(new Set())
          }}
          onClear={() => setSelected(new Set())}
        />
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 p-4" role="list" aria-label={`${role.title} pipeline`}>
          {stages.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              role={role}
              applications={byStage[stage] ?? []}
              onSelect={setSelectedId}
              busyApplicationIds={transitions.busyApplicationIds}
              selectedIds={selected}
              onToggleSelect={canActOnCard ? toggleSelect : undefined}
              onIntent={canActOnCard ? transitions.onIntent : undefined}
              showActions={canActOnCard}
            />
          ))}
        </div>

        <DragOverlay>
          {active ? <CandidateCard application={active} role={role} isDragging /> : null}
        </DragOverlay>
      </DndContext>

      {/* Empty-result hint when filters yield nothing. */}
      {filters.length > 0 && filtered.length === 0 && (
        <div className="mx-4 mb-4 rounded-lg border border-dashed border-line-strong bg-card p-6 text-center text-sm text-ink-2">
          <p>No candidates match the selected filters.</p>
          <button
            type="button"
            onClick={() => setFilters([])}
            className="mt-2 inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Toasts */}
      {transitions.successToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded bg-ink px-4 py-2 text-sm text-white shadow-lg"
        >
          <span>{transitions.successToast.message}</span>
          {transitions.successToast.undo && (
            <button
              type="button"
              onClick={transitions.successToast.undo}
              className="rounded border border-white/30 px-2 py-0.5 text-xs font-medium text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Undo
            </button>
          )}
        </div>
      )}
      {transitions.errorToast && (
        <div
          role="alert"
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded bg-danger px-4 py-2 text-sm text-white shadow-lg"
        >
          <span>{transitions.errorToast}</span>
          <button
            onClick={transitions.dismissError}
            className="ml-3 underline"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Modals */}
      {transitions.confirmModal && (
        <ConfirmModal
          open={transitions.confirmModal.open}
          title={transitions.confirmModal.title}
          body={transitions.confirmModal.body}
          variant={transitions.confirmModal.variant}
          confirmLabel={transitions.confirmModal.confirmLabel}
          onConfirm={transitions.confirmModal.onConfirm}
          onCancel={transitions.confirmModal.onCancel}
        />
      )}
      {transitions.rejectModal && (
        <RejectReasonModal
          open={transitions.rejectModal.open}
          subjectLabel={transitions.rejectModal.subjectLabel}
          bulk={transitions.rejectModal.bulk}
          busy={transitions.rejectModal.busy}
          onCancel={transitions.rejectModal.onCancel}
          onSubmit={transitions.rejectModal.onSubmit}
        />
      )}

      {selectedId &&
        (() => {
          const app = merged.find((a) => a.id === selectedId)
          const cand = app?.candidate
          const sidePanelCandidate: SidePanelCandidate | null = cand
            ? {
                id: cand.id,
                name: cand.name,
                email: cand.email,
                phone: cand.phone ?? '',
                source: cand.source,
                programmes: cand.tags?.programmes ?? [],
                notes: cand.notes ?? '',
                resumeFilePath: cand.resumeFilePath,
              }
            : null
          return (
            <CandidateSidePanel
              open
              onClose={() => setSelectedId(null)}
              candidate={sidePanelCandidate}
              applicationId={app?.id ?? ''}
              currentStage={(app?.currentStage as string) ?? ''}
              memberships={cand ? membershipsByCandidate[cand.id] ?? [] : []}
              openRoles={openRoles}
              canEdit={canEdit}
            />
          )
        })()}
    </div>
  )
}
