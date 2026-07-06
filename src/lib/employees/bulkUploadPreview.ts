/*
 * Preview-row serialisation shared by the bulk-upload preview + commit routes.
 * Kept in lib (not the route files) so the route modules export only HTTP
 * handlers - Next's App Router rejects non-handler exports from route.ts.
 */

import type { RowResult } from './reconcileImport'

export interface PreviewDiff {
  field: string
  existing: unknown
  incoming: unknown
}

export interface PreviewRow {
  rowRef: string
  code: string
  name: string
  classification: RowResult['classification']
  errors: string[]
  warnings: string[]
  department: string | null
  location: string | null
  manager: string | null
  diffs: PreviewDiff[]
}

export function toPreviewRow(r: RowResult): PreviewRow {
  return {
    rowRef: r.rowRef,
    code: r.code,
    name: r.name,
    classification: r.classification,
    errors: r.errors,
    warnings: r.warnings,
    department: r.resolvedDepartment,
    location: r.resolvedLocation,
    manager: r.resolvedManager?.name ?? null,
    diffs: r.fieldDiffs.map((d) => ({ field: d.field, existing: d.existing, incoming: d.incoming })),
  }
}

export function tally(results: RowResult[]): { create: number; reactivate: number; update: number; error: number } {
  const t = { create: 0, reactivate: 0, update: 0, error: 0 }
  for (const r of results) t[r.classification]++
  return t
}
