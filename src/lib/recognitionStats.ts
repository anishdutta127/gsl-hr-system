/*
 * Public-page leaderboard + counters for the celebration grid.
 *
 * The aggregations are pure functions over the Recognition list; the
 * cached wrapper (statsCachedFor1h) reads the underlying list once
 * per hour to keep the public page snappy on a Hobby-tier function.
 *
 * Cache is in-memory and TTL is short (1h) so HR-Admin's edits
 * surface naturally on the next miss. No cold-start invalidation
 * needed - if the warm function dies between TTLs we just recompute.
 */

import { loadRecognitions } from './data'
import type { Recognition } from './types'

export interface LeaderboardEntry {
  recognition: Recognition
  // Joined-in details for rendering without re-querying:
  employeeName: string
  employeeDesignation: string
  photoUrl: string | null
}

export interface RecognitionStats {
  totalThisYear: number
  totalAllTime: number
  uniqueEmployees: number
  uniqueDepartments: number
  /** Sorted recent first. Capped to 6 by the consumer. */
  recent: Recognition[]
  /** Calendar-year string -> count. */
  byYear: Map<string, number>
  /** Department -> count. */
  byDepartment: Map<string, number>
  /** Employee id -> count of recognitions. */
  mostCelebrated: Map<string, number>
}

export function publicRecognitions(list: Recognition[]): Recognition[] {
  return list.filter((r) => r.publicShareEnabled && r.status === 'Published')
}

export function computeStats(list: Recognition[], now: Date = new Date()): RecognitionStats {
  const visible = publicRecognitions(list)
  const thisYear = String(now.getUTCFullYear())
  const byYear = new Map<string, number>()
  const byDepartment = new Map<string, number>()
  const mostCelebrated = new Map<string, number>()
  let totalThisYear = 0
  const employees = new Set<string>()
  const departments = new Set<string>()

  for (const r of visible) {
    const year = r.month.slice(0, 4)
    byYear.set(year, (byYear.get(year) ?? 0) + 1)
    byDepartment.set(r.department, (byDepartment.get(r.department) ?? 0) + 1)
    mostCelebrated.set(r.employeeId, (mostCelebrated.get(r.employeeId) ?? 0) + 1)
    employees.add(r.employeeId)
    departments.add(r.department)
    if (year === thisYear) totalThisYear++
  }

  const recent = [...visible].sort((a, b) =>
    (b.publishedAt ?? b.approvedAt ?? b.nominatedAt).localeCompare(
      a.publishedAt ?? a.approvedAt ?? a.nominatedAt,
    ),
  )

  return {
    totalThisYear,
    totalAllTime: visible.length,
    uniqueEmployees: employees.size,
    uniqueDepartments: departments.size,
    recent,
    byYear,
    byDepartment,
    mostCelebrated,
  }
}

// --- 1-hour TTL cache --------------------------------------------------

interface CachedStats {
  expiresAt: number
  value: RecognitionStats
}
let cache: CachedStats | null = null
const CACHE_MS = 60 * 60 * 1000

export async function statsCachedFor1h(): Promise<RecognitionStats> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.value
  const value = computeStats(await loadRecognitions())
  cache = { expiresAt: now + CACHE_MS, value }
  return value
}

/** Reset the cache (useful for tests and admin operations that
 *  immediately need fresh data, e.g. after toggling publicShareEnabled). */
export function resetStatsCache(): void {
  cache = null
}
