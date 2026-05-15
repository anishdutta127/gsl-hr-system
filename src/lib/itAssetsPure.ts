/*
 * Pure (browser-safe) IT asset helpers - no node:fs/path imports so this
 * module can be pulled into client components without leaking server
 * dependencies into the webpack bundle.
 *
 * The server-only loaders live in itAssets.ts (which re-exports these
 * for callers that only need one import).
 */

import type { ITAsset } from './types'

/** Next sequential ASSET-{YYYY}-{NNNN} id, gap-free within YYYY. */
export function nextITAssetId(existing: ITAsset[], year: number): string {
  const prefix = `ASSET-${year}-`
  let max = 0
  for (const a of existing) {
    if (!a.id.startsWith(prefix)) continue
    const suffix = a.id.slice(prefix.length)
    const n = Number.parseInt(suffix, 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

/** ITAssets currently assigned to an employee. */
export function itAssetsAssignedTo(assets: ITAsset[], employeeId: string): ITAsset[] {
  return assets.filter(
    (a) => a.currentAssignment?.employeeId === employeeId && a.status === 'Assigned',
  )
}

/** All historical involvement for an employee - currently assigned or in
 *  the assignmentHistory chain. */
export function itAssetHistoryFor(assets: ITAsset[], employeeId: string): ITAsset[] {
  return assets.filter(
    (a) =>
      a.currentAssignment?.employeeId === employeeId ||
      a.assignmentHistory.some((h) => h.employeeId === employeeId),
  )
}

/** Substring search across the indexable fields. Case-insensitive. */
export function matchesITAssetQuery(a: ITAsset, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return (
    a.id.toLowerCase().includes(needle) ||
    a.make.toLowerCase().includes(needle) ||
    a.model.toLowerCase().includes(needle) ||
    a.serialNumber.toLowerCase().includes(needle) ||
    a.assetTag.toLowerCase().includes(needle) ||
    a.location.toLowerCase().includes(needle)
  )
}
