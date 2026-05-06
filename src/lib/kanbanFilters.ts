/*
 * Pure helpers for the Kanban quick-filter chips.
 *
 * Server components import parseFiltersFromQuery (URL → filter list) before
 * passing the initial state to the client KanbanFilters component. The
 * applyFilters predicate runs on the client per render to slice the visible
 * applications. Both are pure for unit tests in __tests__/kanbanFilters.test.
 */

import type { ApplicationWithCandidate } from './data'
import { isTerminal } from './pipeline'

export const FILTER_KEYS = ['stale', 'mine', 'new', 'mineToAction'] as const
export type FilterKey = (typeof FILTER_KEYS)[number]

interface ApplyArgs {
  filters: FilterKey[]
  currentUserEmail: string
  /** Effective "now" for date math; tests can override. */
  now?: number
}

const DAY_MS = 86_400_000

/** AND-combined filter pipeline. Empty filter list = pass-through. */
export function applyFilters(
  apps: ApplicationWithCandidate[],
  { filters, currentUserEmail, now }: ApplyArgs,
): ApplicationWithCandidate[] {
  if (filters.length === 0) return apps
  const t = now ?? Date.now()
  const sevenDaysAgo = t - 7 * DAY_MS
  const threeDaysAgo = t - 3 * DAY_MS

  return apps.filter((a) => {
    for (const f of filters) {
      if (f === 'stale') {
        if (isTerminal(a.currentStage)) return false
        const enteredMs = parseTime(a.stageEnteredAt)
        if (!(enteredMs != null && enteredMs <= sevenDaysAgo)) return false
        continue
      }
      if (f === 'mine') {
        if (!currentUserEmail) return false
        if (a.createdBy !== currentUserEmail) return false
        continue
      }
      if (f === 'new') {
        const createdMs = parseTime(a.createdAt)
        if (!(createdMs != null && createdMs >= sevenDaysAgo)) return false
        continue
      }
      if (f === 'mineToAction') {
        if (!currentUserEmail) return false
        if (isTerminal(a.currentStage)) return false
        // "Assigned to me" approximated by createdBy + 3-day-stale on stage.
        // The real assignment graph (HR or HOD owner) is one query away; we
        // can refine when HR feedback shows the heuristic is too loose.
        if (a.createdBy !== currentUserEmail) return false
        const enteredMs = parseTime(a.stageEnteredAt)
        if (!(enteredMs != null && enteredMs <= threeDaysAgo)) return false
        continue
      }
    }
    return true
  })
}

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

export function parseFiltersFromQuery(value: string | string[] | undefined): FilterKey[] {
  if (!value) return []
  const raw = Array.isArray(value) ? value.join(',') : value
  const parts = raw.split(',').map((s) => s.trim())
  const out: FilterKey[] = []
  for (const p of parts) {
    if ((FILTER_KEYS as readonly string[]).includes(p)) out.push(p as FilterKey)
  }
  return out
}
