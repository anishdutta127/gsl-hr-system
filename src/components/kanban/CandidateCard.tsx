'use client'

import { useDraggable } from '@dnd-kit/core'
import type { ApplicationWithCandidate } from '@/lib/data'
import { formatDaysInStage } from '@/lib/format'

interface Props {
  application: ApplicationWithCandidate
  isDragging?: boolean
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

export function CandidateCard({ application, isDragging = false }: Props) {
  const { attributes, listeners, setNodeRef, isDragging: isActiveDrag } = useDraggable({
    id: application.id,
  })
  const candidate = application.candidate
  const sourceClass = candidate
    ? SOURCE_COLOR_CLASSES[candidate.source] ?? SOURCE_COLOR_CLASSES.Other
    : SOURCE_COLOR_CLASSES.Other

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Candidate ${candidate?.name ?? 'unknown'}, stage ${application.currentStage}`}
      className={
        isDragging || isActiveDrag
          ? 'cursor-grabbing rounded border border-teal bg-card px-3 py-2 shadow-lg'
          : 'cursor-grab rounded border border-line bg-card px-3 py-2 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal'
      }
    >
      <div className="text-sm font-medium text-ink leading-tight">
        {candidate?.name ?? '(candidate removed)'}
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
    </div>
  )
}
