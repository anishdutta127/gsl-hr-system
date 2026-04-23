'use client'

import { useOptimistic, useState, useTransition } from 'react'
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
import type { Role, Stage } from '@/lib/types'
import type { ApplicationWithCandidate } from '@/lib/data'

interface Props {
  role: Role
  applications: ApplicationWithCandidate[]
  stages: Stage[]
}

export function Kanban({ role, applications, stages }: Props) {
  const [optimistic, setOptimistic] = useOptimistic(
    applications,
    (state, update: { applicationId: string; targetStage: Stage }) =>
      state.map((a) =>
        a.id === update.applicationId ? { ...a, currentStage: update.targetStage } : a,
      ),
  )

  const [, startTransition] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [errorToast, setErrorToast] = useState<string | null>(null)
  const [successToast, setSuccessToast] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const byStage: Record<string, ApplicationWithCandidate[]> = {}
  for (const stage of stages) byStage[stage] = []
  for (const a of optimistic) {
    const list = byStage[a.currentStage]
    if (list) list.push(a)
  }

  const active = activeId ? optimistic.find((a) => a.id === activeId) : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const applicationId = String(event.active.id)
    const targetStage = event.over ? String(event.over.id) : null
    if (!targetStage) return
    const application = optimistic.find((a) => a.id === applicationId)
    if (!application || application.currentStage === targetStage) return

    startTransition(async () => {
      setOptimistic({ applicationId, targetStage })
      try {
        const response = await fetch(`/api/applications/${applicationId}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetStage }),
        })
        if (!response.ok) {
          const body = await response.json().catch(() => ({ message: 'Save failed.' }))
          setErrorToast(body.message ?? 'Save failed. Retry, or WhatsApp Anish.')
          return
        }
        setSuccessToast('Saved. Appears in ~1 min.')
        setTimeout(() => setSuccessToast(null), 4000)
      } catch {
        setErrorToast('Network error. Retry.')
      }
    })
  }

  return (
    <div className="relative flex-1 overflow-x-auto">
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 p-4" role="list" aria-label={`${role.title} pipeline`}>
          {stages.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              applications={byStage[stage] ?? []}
            />
          ))}
        </div>

        <DragOverlay>
          {active ? <CandidateCard application={active} isDragging /> : null}
        </DragOverlay>
      </DndContext>

      {successToast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 right-6 rounded bg-ink px-4 py-2 text-sm text-white shadow-lg"
        >
          {successToast}
        </div>
      )}
      {errorToast && (
        <div
          role="alert"
          className="fixed bottom-6 right-6 rounded bg-danger px-4 py-2 text-sm text-white shadow-lg"
        >
          <span>{errorToast}</span>
          <button
            onClick={() => setErrorToast(null)}
            className="ml-3 underline"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
