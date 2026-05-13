/*
 * Rewards & Recognition helpers.
 *
 * Schema: src/lib/types.ts (Recognition + NominationCycle).
 * Storage: src/data/recognitions.json (array) + src/data/nomination_cycles.json (array).
 *
 * Writes happen via atomicUpdateJson direct-commit (admin/HR-only),
 * mirroring the taxonomy and holidays pattern — rare writes, single
 * canonical state, no queue replay needed.
 *
 * ID generation: RECOG-{FY}-{NN} where FY is the financial year start
 * (April→March) and NN is gap-free within that FY. Examples:
 *   2026-05-13 nomination → FY 2026 → RECOG-2026-01.
 *   2026-04-01 nomination → FY 2026 → RECOG-2026-01.
 *   2026-03-31 nomination → FY 2025 → RECOG-2025-NN.
 *
 * Why gap-free: HR's printed Canva-fidelity poster series is identified
 * by these IDs and a gap raises uncomfortable questions. We compute the
 * next NN from the max existing within the FY, not from a counter, so
 * the function tolerates concurrent writes via the atomic update.
 */

import type { Recognition } from './types'

/** Financial-year start (April) for an ISO date. */
export function financialYearStart(iso: string): number {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`financialYearStart: invalid date "${iso}"`)
  }
  // Month is 0-indexed; April === 3.
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1
}

/** Next sequential RECOG-{FY}-{NN} id. Caller passes the existing list +
 * the financial year (typically derived from today's date). Returns
 * max(existing-NN-for-FY) + 1, defaulting to 01 when empty. We never
 * fill gaps — a deleted RECOG-2026-05 stays a gap because the printed
 * Canva-style poster series HR maintains is identified by these ids
 * and reusing a number would conflict with what's already gone out. */
export function nextRecognitionId(
  existing: Recognition[],
  fy: number,
): string {
  const prefix = `RECOG-${fy}-`
  let max = 0
  for (const r of existing) {
    if (!r.id.startsWith(prefix)) continue
    const suffix = r.id.slice(prefix.length)
    const n = Number.parseInt(suffix, 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  const next = max + 1
  return `${prefix}${String(next).padStart(2, '0')}`
}

/** Group recognitions by YYYY-MM for the public history grid on /recognition. */
export function groupByMonth(list: Recognition[]): Map<string, Recognition[]> {
  const out = new Map<string, Recognition[]>()
  for (const r of list) {
    const bucket = out.get(r.month) ?? []
    bucket.push(r)
    out.set(r.month, bucket)
  }
  return out
}

/** Returns the current YYYY-MM, used as the default nomination cycle month. */
export function currentMonth(now: Date = new Date()): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Human-readable month label for display ("May 2026"). */
export function formatMonthLabel(yyyyMm: string): string {
  const [yearStr, monthStr] = yyyyMm.split('-')
  if (!yearStr || !monthStr) return yyyyMm
  const monthIdx = Number.parseInt(monthStr, 10) - 1
  if (!Number.isInteger(monthIdx) || monthIdx < 0 || monthIdx > 11) return yyyyMm
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  return `${monthNames[monthIdx]} ${yearStr}`
}

/** Substring search across the public-facing fields. Case-insensitive. */
export function matchesQuery(r: Recognition, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return (
    r.department.toLowerCase().includes(needle) ||
    r.category.toLowerCase().includes(needle) ||
    r.writeup.toLowerCase().includes(needle) ||
    r.id.toLowerCase().includes(needle)
  )
}
