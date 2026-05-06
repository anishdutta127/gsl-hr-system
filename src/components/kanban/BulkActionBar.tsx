'use client'

import { useMemo, useState } from 'react'
import type { Role } from '@/lib/types'
import type { ApplicationWithCandidate } from '@/lib/data'
import { isTerminal } from '@/lib/pipeline'
import { neighbours } from '@/lib/stageTransition'

interface Props {
  role: Role
  selected: string[]
  applications: ApplicationWithCandidate[]
  onForward: () => void
  onBackward: () => void
  onReject: () => void
  onClear: () => void
}

/** Sticky multi-select bar at the top of the Kanban view. Shows the count
 * and the bulk actions, plus a "show details" panel that explains which of
 * the selected candidates are at incompatible stages so HR understands
 * before HR commits. */
export function BulkActionBar({
  role,
  selected,
  applications,
  onForward,
  onBackward,
  onReject,
  onClear,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false)

  const selectedApps = useMemo(
    () => applications.filter((a) => selected.includes(a.id)),
    [applications, selected],
  )

  // Compatibility tally: split into "can go forward", "can go backward", and
  // "stuck (terminal or end-of-pipeline)" so the helper text matches what the
  // server will accept.
  const compat = useMemo(() => {
    let canForward = 0
    let canBackward = 0
    let stuck = 0
    let terminal = 0
    for (const a of selectedApps) {
      if (isTerminal(a.currentStage)) {
        terminal++
        continue
      }
      const { next, previous } = neighbours(role, a.currentStage)
      if (next) canForward++
      if (previous) canBackward++
      if (!next && !previous) stuck++
    }
    return { canForward, canBackward, stuck, terminal, total: selectedApps.length }
  }, [role, selectedApps])

  const hasMixed =
    compat.canForward < compat.total ||
    compat.canBackward < compat.total ||
    compat.terminal > 0

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky top-0 z-30 -mx-4 -mt-4 mb-2 border-b border-line bg-card px-4 py-3 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium text-ink">
          {selected.length} selected
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={compat.canForward === 0}
            onClick={onForward}
            title={
              compat.canForward === 0
                ? 'No selected candidates can move forward.'
                : 'Move each selected candidate to the next stage.'
            }
            className="inline-flex min-h-[36px] items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
          >
            Move forward
          </button>
          <button
            type="button"
            disabled={compat.canBackward === 0}
            onClick={onBackward}
            title={
              compat.canBackward === 0
                ? 'No selected candidates can move back.'
                : 'Move each selected candidate one stage back.'
            }
            className="inline-flex min-h-[36px] items-center rounded border border-line-strong bg-card px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:cursor-not-allowed disabled:opacity-60"
          >
            Move back
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={selectedApps.every((a) => isTerminal(a.currentStage))}
            className="inline-flex min-h-[36px] items-center rounded border border-danger bg-danger-bg px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
          >
            Reject…
          </button>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex min-h-[36px] items-center rounded px-3 py-1.5 text-sm font-medium text-ink-2 hover:text-ink"
          >
            Clear selection
          </button>
        </div>
      </div>
      {hasMixed && (
        <div className="mt-2 text-xs text-ink-2">
          {compat.canForward} of {compat.total} can move forward
          {compat.terminal > 0 ? ` · ${compat.terminal} already in a terminal state` : ''}
          {compat.stuck > 0 ? ` · ${compat.stuck} at the end of the pipeline` : ''}
          .{' '}
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="ml-1 underline hover:text-ink"
          >
            {detailsOpen ? 'Hide details' : 'Show details'}
          </button>
        </div>
      )}
      {detailsOpen && hasMixed && (
        <ul className="mt-2 max-h-32 overflow-y-auto rounded border border-line bg-surface px-3 py-2 text-xs text-ink-2">
          {selectedApps.map((a) => {
            const term = isTerminal(a.currentStage)
            const { next, previous } = neighbours(role, a.currentStage)
            const note = term
              ? `terminal — ${a.currentStage}`
              : !next && !previous
                ? `stuck at ${a.currentStage}`
                : !next
                  ? `last non-terminal stage (${a.currentStage}) — no forward target`
                  : !previous
                    ? `first stage (${a.currentStage}) — no back target`
                    : `OK — at ${a.currentStage}`
            return (
              <li key={a.id} className="py-0.5">
                <span className="font-medium text-ink">{a.candidate?.name ?? '(unknown)'}</span>
                {' · '}
                {note}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
