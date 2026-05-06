'use client'

import type { Role, Stage } from '@/lib/types'
import { isTerminal } from '@/lib/pipeline'
import { forwardLabel, neighbours } from '@/lib/stageTransition'

export type TransitionIntent =
  | { kind: 'forward'; targetStage: Stage }
  | { kind: 'backward'; targetStage: Stage }
  | { kind: 'reject' }

interface Props {
  role: Role
  applicationId: string
  currentStage: Stage
  /** Disable when the role is read-only (Closed/Archived). */
  disabled?: boolean
  /** Visual posture: hover-revealed on desktop, always-on on mobile (default),
   * or always-on everywhere ("static") for non-Kanban surfaces like the
   * candidates list. */
  visibility?: 'hover-desktop' | 'static'
  /** Compact = squashes labels for tight space (used on cards). */
  compact?: boolean
  onIntent: (applicationId: string, intent: TransitionIntent) => void
}

/**
 * Three-action affordance for moving an application along the pipeline.
 * Reads role.pipelineStages so the labels adapt per-role (Academics gets a
 * second HOD round; some Sales roles run HR-first; etc.).
 *
 * Mobile-first sizing — buttons hit the 44px target and stay reachable on
 * 375px screens. On desktop the parent can opt in to hover-reveal.
 */
export function StageTransitionButtons({
  role,
  applicationId,
  currentStage,
  disabled = false,
  visibility = 'hover-desktop',
  compact = false,
  onIntent,
}: Props) {
  const terminal = isTerminal(currentStage)
  const { next, previous } = neighbours(role, currentStage)
  const showAny = !terminal && (next != null || previous != null || true)
  if (!showAny) return null

  const visibilityClass =
    visibility === 'hover-desktop'
      ? 'flex flex-wrap gap-1.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
      : 'flex flex-wrap gap-1.5'

  const sizeClass = compact
    ? 'inline-flex min-h-[36px] sm:min-h-[28px] items-center rounded px-2 py-1 text-[11px] font-medium'
    : 'inline-flex min-h-[36px] items-center rounded px-2.5 py-1 text-xs font-medium'

  return (
    <div
      data-stage-actions
      className={visibilityClass}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {next && (
        <button
          type="button"
          data-card-action="forward"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            onIntent(applicationId, { kind: 'forward', targetStage: next })
          }}
          aria-label={`${forwardLabel(next)} for this candidate`}
          title={forwardLabel(next)}
          className={`${sizeClass} border border-navy bg-navy text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {compact ? truncate(forwardLabel(next), 22) : forwardLabel(next)}
        </button>
      )}
      {previous && (
        <button
          type="button"
          data-card-action="backward"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            onIntent(applicationId, { kind: 'backward', targetStage: previous })
          }}
          aria-label={`Move back to ${previous}`}
          title={`Move back to ${previous}`}
          className={`${sizeClass} border border-line-strong bg-card text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {compact ? `← ${truncate(previous, 14)}` : `← Move back to ${previous}`}
        </button>
      )}
      {!terminal && (
        <button
          type="button"
          data-card-action="reject"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            onIntent(applicationId, { kind: 'reject' })
          }}
          aria-label="Reject this candidate"
          title="Reject"
          className={`${sizeClass} border border-danger bg-danger-bg text-danger hover:bg-danger hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60`}
        >
          Reject
        </button>
      )}
    </div>
  )
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}
