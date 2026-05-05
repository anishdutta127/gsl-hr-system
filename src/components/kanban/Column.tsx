'use client'

import { useDroppable } from '@dnd-kit/core'
import { CandidateCard } from './CandidateCard'
import type { Stage } from '@/lib/types'
import type { ApplicationWithCandidate } from '@/lib/data'

interface Props {
  stage: Stage
  applications: ApplicationWithCandidate[]
  onSelect?: (applicationId: string) => void
}

export function Column({ stage, applications, onSelect }: Props) {
  const { isOver, setNodeRef } = useDroppable({ id: stage })
  return (
    <div
      ref={setNodeRef}
      role="listitem"
      aria-label={`${stage} column`}
      className={
        isOver
          ? 'flex min-w-[280px] max-w-[280px] shrink-0 flex-col rounded-lg border-2 border-teal bg-card ring-2 ring-teal/20'
          : 'flex min-w-[280px] max-w-[280px] shrink-0 flex-col rounded-lg border border-line bg-card'
      }
    >
      <div className="border-b border-line px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">{stage}</span>
          <span className="text-xs text-ink-3 tabular">{applications.length}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2 overflow-y-auto max-h-[calc(100vh-11rem)]">
        {applications.length === 0 ? (
          <div className="py-6 text-center text-xs text-ink-3">No candidates</div>
        ) : (
          applications.map((a) => (
            <CandidateCard key={a.id} application={a} onSelect={onSelect} />
          ))
        )}
      </div>
    </div>
  )
}
