/*
 * IT asset per-id operations.
 *
 *   PATCH  /api/admin/it-assets/[id]    - assign / return / status / condition / metadata edits
 *   DELETE /api/admin/it-assets/[id]    - hard delete (Admin only)
 *
 * PATCH body shapes (mutually exclusive top-level intents):
 *   { action: 'assign', employeeId, location? }
 *   { action: 'return', returnedReason }
 *   { action: 'mark-status', status, notes? }       - In Repair / Retired / Lost / Stolen / Available
 *   { fields: { make?, model?, serialNumber?, assetTag?, purchaseDate?, purchaseCost?, warrantyEndDate?, condition?, location?, notes?, category? } }
 *
 * Admin + HR for assign/return/mark-status/edit. Admin-only for delete.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { canManageITAssets } from '@/lib/itAssets'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import {
  IT_ASSET_CATEGORIES,
  IT_ASSET_CONDITIONS,
  IT_ASSET_STATUSES,
  type ITAsset,
  type ITAssetCategory,
  type ITAssetCondition,
  type ITAssetStatus,
} from '@/lib/types'

export const runtime = 'nodejs'

const IT_ASSETS_PATH = 'src/data/it_assets.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface AssignAction {
  action: 'assign'
  employeeId: string
  location?: string
}
interface ReturnAction {
  action: 'return'
  returnedReason: string
}
interface MarkStatusAction {
  action: 'mark-status'
  status: ITAssetStatus
  notes?: string
}
interface EditFields {
  fields: {
    category?: ITAssetCategory
    make?: string
    model?: string
    serialNumber?: string
    assetTag?: string
    purchaseDate?: string | null
    purchaseCost?: number | null
    warrantyEndDate?: string | null
    condition?: ITAssetCondition
    location?: string
    notes?: string
  }
}
type PatchBody = AssignAction | ReturnAction | MarkStatusAction | EditFields

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!canManageITAssets(session)) return bad('Only Admin or HR can edit IT assets.', 403)

  const id = params.id?.trim()
  if (!id) return bad('id is required.')

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return bad('Body must be JSON.')
  }

  const now = new Date().toISOString()
  let touched = false
  let validationError: string | null = null

  await atomicUpdateJson<ITAsset[]>(
    IT_ASSETS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((a) => {
        if (a.id !== id) return a
        touched = true
        let updated: ITAsset = { ...a, updatedAt: now }
        let action = 'it-asset.update'
        const before: Record<string, unknown> = {}
        const after: Record<string, unknown> = {}

        if ('action' in body) {
          if (body.action === 'assign') {
            if (!body.employeeId?.trim()) {
              validationError = 'employeeId is required for assign.'
              return a
            }
            if (a.currentAssignment) {
              validationError = `Asset is currently assigned to ${a.currentAssignment.employeeId}. Return it first.`
              return a
            }
            if (a.status === 'Retired' || a.status === 'Lost' || a.status === 'Stolen') {
              validationError = `Cannot assign a ${a.status} asset.`
              return a
            }
            updated.currentAssignment = {
              employeeId: body.employeeId.trim(),
              assignedAt: now,
              assignedBy: session!.email,
            }
            updated.status = 'Assigned'
            if (body.location?.trim()) updated.location = body.location.trim()
            action = 'it-asset.assign'
            before.currentAssignment = a.currentAssignment
            before.status = a.status
            after.currentAssignment = updated.currentAssignment
            after.status = updated.status
          } else if (body.action === 'return') {
            if (!a.currentAssignment) {
              validationError = 'Asset is not currently assigned.'
              return a
            }
            const reason = body.returnedReason?.trim() ?? ''
            if (!reason) {
              validationError = 'returnedReason is required.'
              return a
            }
            updated.assignmentHistory = [
              ...a.assignmentHistory,
              {
                employeeId: a.currentAssignment.employeeId,
                assignedAt: a.currentAssignment.assignedAt,
                returnedAt: now,
                returnedReason: reason,
                assignedBy: a.currentAssignment.assignedBy,
              },
            ]
            updated.currentAssignment = null
            updated.status = 'Available'
            action = 'it-asset.return'
            before.currentAssignment = a.currentAssignment
            before.status = a.status
            after.currentAssignment = null
            after.status = 'Available'
          } else if (body.action === 'mark-status') {
            if (!IT_ASSET_STATUSES.includes(body.status)) {
              validationError = `status must be one of ${IT_ASSET_STATUSES.join(', ')}.`
              return a
            }
            // Marking Lost/Stolen/Retired while assigned auto-returns the asset
            // to history with a returned-reason mirroring the new status.
            if (
              a.currentAssignment &&
              (body.status === 'Retired' || body.status === 'Lost' || body.status === 'Stolen')
            ) {
              updated.assignmentHistory = [
                ...a.assignmentHistory,
                {
                  employeeId: a.currentAssignment.employeeId,
                  assignedAt: a.currentAssignment.assignedAt,
                  returnedAt: now,
                  returnedReason: `Asset marked ${body.status}`,
                  assignedBy: a.currentAssignment.assignedBy,
                },
              ]
              updated.currentAssignment = null
            }
            updated.status = body.status
            if (body.notes?.trim()) {
              updated.notes = a.notes ? `${a.notes}\n${now}: ${body.notes.trim()}` : body.notes.trim()
            }
            action = 'it-asset.mark-status'
            before.status = a.status
            after.status = body.status
          }
        } else if ('fields' in body) {
          const f = body.fields
          if (f.category != null) {
            if (!IT_ASSET_CATEGORIES.includes(f.category)) {
              validationError = 'Invalid category.'
              return a
            }
            before.category = a.category
            updated.category = f.category
            after.category = f.category
          }
          if (f.make != null) {
            before.make = a.make
            updated.make = f.make.trim()
            after.make = updated.make
          }
          if (f.model != null) {
            before.model = a.model
            updated.model = f.model.trim()
            after.model = updated.model
          }
          if (f.serialNumber != null) {
            before.serialNumber = a.serialNumber
            updated.serialNumber = f.serialNumber.trim()
            after.serialNumber = updated.serialNumber
          }
          if (f.assetTag != null) {
            before.assetTag = a.assetTag
            updated.assetTag = f.assetTag.trim()
            after.assetTag = updated.assetTag
          }
          if (f.purchaseDate !== undefined) {
            before.purchaseDate = a.purchaseDate
            updated.purchaseDate = f.purchaseDate
            after.purchaseDate = updated.purchaseDate
          }
          if (f.purchaseCost !== undefined) {
            if (f.purchaseCost != null && (typeof f.purchaseCost !== 'number' || f.purchaseCost < 0)) {
              validationError = 'purchaseCost must be a non-negative number.'
              return a
            }
            before.purchaseCost = a.purchaseCost
            updated.purchaseCost = f.purchaseCost
            after.purchaseCost = updated.purchaseCost
          }
          if (f.warrantyEndDate !== undefined) {
            before.warrantyEndDate = a.warrantyEndDate
            updated.warrantyEndDate = f.warrantyEndDate
            after.warrantyEndDate = updated.warrantyEndDate
          }
          if (f.condition != null) {
            if (!IT_ASSET_CONDITIONS.includes(f.condition)) {
              validationError = 'Invalid condition.'
              return a
            }
            before.condition = a.condition
            updated.condition = f.condition
            after.condition = updated.condition
          }
          if (f.location != null) {
            before.location = a.location
            updated.location = f.location.trim()
            after.location = updated.location
          }
          if (f.notes != null) {
            before.notes = a.notes
            updated.notes = f.notes
            after.notes = updated.notes
          }
          action = 'it-asset.edit'
        }

        if (validationError) return a

        updated.auditLog = [
          ...a.auditLog,
          {
            timestamp: now,
            user: session!.email,
            action,
            before: Object.keys(before).length ? before : undefined,
            after: Object.keys(after).length ? after : undefined,
          },
        ]
        return updated
      })
      return {
        next,
        commitMessage: `feat(it-assets): ${('action' in body ? body.action : 'edit')} ${id}`,
      }
    },
    { defaultValue: [] as ITAsset[] },
  )

  if (validationError) return bad(validationError)
  if (!touched) return bad('Asset not found.', 404)
  return NextResponse.json({ ok: true, note: 'Saved. Reflects once Vercel rebuilds (~2 minutes).' })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession()
  if (!session || session.role !== 'Admin') return bad('Only Admin can delete IT assets.', 403)

  const id = params.id?.trim()
  if (!id) return bad('id is required.')

  let removed = false
  await atomicUpdateJson<ITAsset[]>(
    IT_ASSETS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.filter((a) => a.id !== id)
      removed = next.length !== list.length
      return { next, commitMessage: `feat(it-assets): delete ${id}` }
    },
    { defaultValue: [] as ITAsset[] },
  )
  if (!removed) return bad('Asset not found.', 404)
  return NextResponse.json({ ok: true })
}
