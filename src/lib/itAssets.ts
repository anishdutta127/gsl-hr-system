/*
 * Server-side IT asset helpers: file loader + permission gates.
 *
 * Pure (browser-safe) helpers live in itAssetsPure.ts and are re-exported
 * here for convenience. Keep the node:fs/path imports out of any module
 * that a client component might pull in - webpack does not handle the
 * `node:` scheme and the build fails ungracefully if you forget.
 *
 * Storage: src/data/it_assets.json. Writes go through atomicUpdateJson
 * direct-commit (admin/HR-only), matching the existing Asset + taxonomy
 * pattern.
 *
 * ID generation: ASSET-{YYYY}-{NNNN} - gap-free within the calendar
 * year. Implemented in itAssetsPure.ts so concurrent atomic writes
 * converge on the same answer.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { ITAsset, SessionClaims } from './types'

const IT_ASSETS_FILE = path.join(process.cwd(), 'src', 'data', 'it_assets.json')

export function loadITAssets(): ITAsset[] {
  try {
    if (!fs.existsSync(IT_ASSETS_FILE)) return []
    const text = fs.readFileSync(IT_ASSETS_FILE, 'utf-8').trim()
    if (!text) return []
    const parsed = JSON.parse(text) as unknown
    return Array.isArray(parsed) ? (parsed as ITAsset[]) : []
  } catch {
    return []
  }
}

export function canManageITAssets(session: SessionClaims | null): boolean {
  if (!session) return false
  return session.role === 'Admin' || session.role === 'HR'
}

export function canViewITAssets(session: SessionClaims | null): boolean {
  if (!session) return false
  return (
    session.role === 'Admin' ||
    session.role === 'HR' ||
    session.role === 'Leadership' ||
    session.role === 'HOD'
  )
}

// Re-export the pure helpers so existing callers can still import them
// from "@/lib/itAssets" without breaking.
export {
  itAssetHistoryFor,
  itAssetsAssignedTo,
  matchesITAssetQuery,
  nextITAssetId,
} from './itAssetsPure'
