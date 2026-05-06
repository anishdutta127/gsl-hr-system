'use client'

import { useDraggable } from '@dnd-kit/core'
import type { ApplicationWithCandidate } from '@/lib/data'
import type { Role } from '@/lib/types'
import { formatDaysInStage } from '@/lib/format'
import { StageTransitionButtons } from '@/components/stageTransition/StageTransitionButtons'
import type { TransitionIntent } from '@/components/stageTransition/StageTransitionButtons'

interface Props {
  application: ApplicationWithCandidate
  /** Required when actions are shown (forward/back labels read pipelineStages). */
  role?: Role
  isDragging?: boolean
  onSelect?: (applicationId: string) => void
  selected?: boolean
  onToggleSelect?: (applicationId: string) => void
  onIntent?: (applicationId: string, intent: TransitionIntent) => void
  busy?: boolean
  showActions?: boolean
}

const SOURCE_COLOR_CLASSES: Record<string, string> = {
  Naukri: 'bg-navy-light text-navy-dark',
  Referral: 'bg-teal-light text-teal-dark',
  Educohire: 'bg-[color:var(--color-steam)] bg-opacity-10 text-[color:var(--color-steam)]',
  Careerchoice: 'bg-[color:var(--color-yp)] bg-opacity-10 text-[color:var(--color-yp)]',
  HRTeam: 'bg-success-bg text-success',
  Application: 'bg-surface text-ink-2',
  CSS: 'bg-[color:var(--color-hbpe)] bg-opacity-10 text-[color:var(--color-hbpe)]',
  Other: 'bg-surface text-ink-3',
}

export function CandidateCard({
  application,
  role,
  isDragging = false,
  onSelect,
  selected = false,
  onToggleSelect,
  onIntent,
  busy = false,
  showActions = false,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging: isActiveDrag } = useDraggable({
    id: application.id,
  })
  const candidate = application.candidate
  const sourceClass = candidate
    ? SOURCE_COLOR_CLASSES[candidate.source] ?? SOURCE_COLOR_CLASSES.Other
    : SOURCE_COLOR_CLASSES.Other

  function handleCardClick(e: React.MouseEvent) {
    if (isActiveDrag || !onSelect) return
    if ((e.target as HTMLElement).closest('[data-card-action]')) return
    if ((e.target as HTMLElement).closest('[data-card-select]')) return
    onSelect(application.id)
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={handleCardClick}
      aria-label={`Candidate ${candidate?.name ?? 'unknown'}, stage ${application.currentStage}`}
      className={`group ${
        isDragging || isActiveDrag
          ? 'cursor-grabbing rounded border border-teal bg-card px-3 py-2 shadow-lg'
          : 'cursor-grab rounded border border-line bg-card px-3 py-2 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal'
      } ${busy ? 'opacity-70' : ''} ${selected ? 'ring-2 ring-teal/60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {onToggleSelect && (
            <input
              data-card-select
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(application.id)}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Select ${candidate?.name ?? 'candidate'}`}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong text-navy focus-visible:ring-2 focus-visible:ring-teal"
            />
          )}
          <div className="min-w-0 text-sm font-medium text-ink leading-tight">
            {candidate?.name ?? '(candidate removed)'}
          </div>
        </div>
        {onSelect && (
          <button
            type="button"
            data-card-action="open"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(application.id)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Open ${candidate?.name ?? 'candidate'} details`}
            className="shrink-0 rounded px-1 text-[11px] font-medium text-ink-3 hover:bg-surface hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            Open
          </button>
        )}
      </div>
      {candidate && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span
            className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${sourceClass}`}
          >
            {candidate.source}
          </span>
          <span className="text-[11px] text-ink-3 tabular">
            {formatDaysInStage(application.stageEnteredAt)}
          </span>
        </div>
      )}
      {showActions && role && onIntent && (
        <div className="mt-2">
          <StageTransitionButtons
            role={role}
            applicationId={application.id}
            currentStage={application.currentStage}
            disabled={busy}
            visibility="hover-desktop"
            compact
            onIntent={onIntent}
          />
        </div>
      )}
    </div>
  )
}
