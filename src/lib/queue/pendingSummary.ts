/*
 * Turn raw queue entries into something a board can show a human.
 *
 * WHY: role creates are queue-mediated. Between the create and the next
 * apply-runner drain the record does not exist in any rendered data, so the
 * board is honestly empty and HR reads that as "my write failed". On
 * 2026-08-07 that cost three roles: HR created them, saw nothing, and
 * reported the feature broken. The measured drain latency that day was 40 to
 * 75 minutes, not the "~1 minute" the form claimed.
 *
 * A pending write must be VISIBLE as pending. This module is the pure part;
 * PendingWritesNotice renders it.
 */

import type { PendingUpdate } from '@/lib/types'

export interface PendingSummaryItem {
  id: string
  /** What the write is about, e.g. "Regional Manager". */
  label: string
  /** Human phrase for the operation, e.g. "new role". */
  action: string
  queuedAt: string
  queuedBy: string
}

export interface PendingSummary {
  count: number
  items: PendingSummaryItem[]
}

/** Best-effort human label for a queued payload. */
function labelFor(entry: PendingUpdate): string {
  const payload = (entry.payload ?? {}) as Record<string, unknown>
  for (const key of ['title', 'name', 'candidateName', 'employeeName']) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  const after = payload.after
  if (after && typeof after === 'object') {
    const title = (after as Record<string, unknown>).title
    if (typeof title === 'string' && title.trim()) return title.trim()
  }
  return 'Untitled'
}

/** Human phrase for what the entry will do once drained. */
function actionFor(entry: PendingUpdate): string {
  if (entry.operation === 'create') return 'new role'
  if (entry.operation === 'delete') return 'removal'
  const payload = (entry.payload ?? {}) as Record<string, unknown>
  const op = payload.operation
  if (typeof op === 'string') {
    if (op === 'role.edit') return 'edit'
    if (op.startsWith('role.')) return op.slice('role.'.length)
  }
  return 'update'
}

/**
 * Summarise the queue, optionally narrowed to one entity kind.
 *
 * Defensive by design: the queue file is written by several producers and a
 * malformed entry must not blank the whole notice.
 */
export function summarisePendingUpdates(
  pending: unknown,
  entity?: PendingUpdate['entity'],
): PendingSummary {
  if (!Array.isArray(pending)) return { count: 0, items: [] }

  const items: PendingSummaryItem[] = []
  for (const raw of pending) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as PendingUpdate
    if (entity && entry.entity !== entity) continue
    items.push({
      id: typeof entry.id === 'string' ? entry.id : `${items.length}`,
      label: labelFor(entry),
      action: actionFor(entry),
      queuedAt: typeof entry.queuedAt === 'string' ? entry.queuedAt : '',
      queuedBy: typeof entry.queuedBy === 'string' ? entry.queuedBy : '',
    })
  }

  return { count: items.length, items }
}

/**
 * Sentence describing how stale the board might be.
 * Deliberately does NOT promise a duration - the scheduled runner is
 * throttled by GitHub to roughly 40-75 minutes and only runs Mon-Fri
 * 03:00-13:55 UTC, so any specific number we print will be wrong and will
 * teach HR to distrust the notice.
 */
export function pendingNoticeSentence(summary: PendingSummary): string {
  if (summary.count === 0) return ''
  const noun = summary.count === 1 ? 'change is' : 'changes are'
  return `${summary.count} role ${noun} saved but not yet visible on this board.`
}
