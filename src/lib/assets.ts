/*
 * Asset tracker. Lightweight — laptop / ID card / SIM / email account /
 * other. Assigned to employees; returned on offboarding.
 *
 * Permissions: Admin + HR full; HOD read-only on their team's
 * assignments; Leadership read all.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { Asset, SessionClaims } from './types'

const ASSETS_FILE = path.join(process.cwd(), 'src', 'data', 'assets.json')

export function loadAssets(): Asset[] {
  try {
    if (!fs.existsSync(ASSETS_FILE)) return []
    const text = fs.readFileSync(ASSETS_FILE, 'utf-8').trim()
    if (!text) return []
    const parsed = JSON.parse(text) as unknown
    return Array.isArray(parsed) ? (parsed as Asset[]) : []
  } catch {
    return []
  }
}

export function canManageAssets(session: SessionClaims | null): boolean {
  if (!session) return false
  return session.role === 'Admin' || session.role === 'HR'
}

export function canViewAsset({
  session,
  asset,
  employeeReportingManagerId,
}: {
  session: SessionClaims | null
  asset: Asset
  employeeReportingManagerId?: string | null
}): boolean {
  if (!session) return false
  if (session.role === 'Admin' || session.role === 'HR' || session.role === 'Leadership')
    return true
  if (session.role === 'HOD') {
    if (!asset.assignedTo) return false
    return employeeReportingManagerId === session.sub
  }
  return false
}

export function assetsAssignedTo(assets: Asset[], employeeId: string): Asset[] {
  return assets.filter((a) => a.assignedTo === employeeId && a.returnedAt === null)
}

export function assetHistoryFor(assets: Asset[], employeeId: string): Asset[] {
  // Includes returned + currently-assigned. (We don't track historical
  // assignees as separate records — assignedTo flips back to null on
  // return; the audit log captures the chain.)
  return assets.filter(
    (a) => a.assignedTo === employeeId || a.auditLog.some((e) => e.notes?.includes(employeeId)),
  )
}
