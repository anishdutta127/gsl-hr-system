/*
 * Asset CRUD + assign/return.
 *
 *   POST   /api/admin/assets                  - create
 *   PATCH  /api/admin/assets                  - update by id (assign, return, retype, edit)
 *   DELETE /api/admin/assets?id=...           - delete
 *
 * Admin + HR only. Reporting Manager and Leadership are read-only via
 * the page-level loaders.
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { canManageAssets } from '@/lib/assets'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import {
  ASSET_CONDITIONS,
  ASSET_TYPES,
  type Asset,
  type AssetCondition,
  type AssetType,
} from '@/lib/types'

export const runtime = 'nodejs'

const ASSETS_PATH = 'src/data/assets.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface CreateBody {
  type: AssetType
  identifier: string
  notes?: string
  condition?: AssetCondition
}
interface UpdateBody {
  id: string
  assignedTo?: string | null
  /** When set, a return is recorded (sets returnedAt + clears assignedTo). */
  returnAction?: boolean
  condition?: AssetCondition
  notes?: string
  identifier?: string
  type?: AssetType
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!canManageAssets(session)) return bad('Only Admin or HR can create assets.', 403)

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return bad('Body must be JSON.')
  }
  if (!ASSET_TYPES.includes(body.type)) return bad(`type must be one of ${ASSET_TYPES.join(', ')}.`)
  const identifier = body.identifier?.trim()
  if (!identifier) return bad('identifier is required.')
  const cond: AssetCondition = body.condition ?? 'New'
  if (!ASSET_CONDITIONS.includes(cond)) return bad('Invalid condition.')

  const now = new Date().toISOString()
  const newAsset: Asset = {
    id: `asset-${crypto.randomUUID()}`,
    type: body.type,
    identifier,
    assignedTo: null,
    assignedAt: null,
    returnedAt: null,
    condition: cond,
    notes: body.notes ?? '',
    createdAt: now,
    createdBy: session!.email,
    auditLog: [
      {
        timestamp: now,
        user: session!.email,
        action: 'asset.create',
        after: { type: body.type, identifier, condition: cond },
      },
    ],
  }

  await atomicUpdateJson<Asset[]>(
    ASSETS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      return {
        next: [...list, newAsset],
        commitMessage: `feat(assets): add ${body.type} ${identifier.slice(0, 30)}`,
      }
    },
    { defaultValue: [] as Asset[] },
  )

  return NextResponse.json({ ok: true, asset: newAsset })
}

export async function PATCH(request: Request) {
  const session = await getCurrentSession()
  if (!canManageAssets(session)) return bad('Only Admin or HR can edit assets.', 403)

  let body: UpdateBody
  try {
    body = (await request.json()) as UpdateBody
  } catch {
    return bad('Body must be JSON.')
  }
  const id = body.id?.trim()
  if (!id) return bad('id is required.')

  const now = new Date().toISOString()
  let touched = false

  await atomicUpdateJson<Asset[]>(
    ASSETS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.map((a) => {
        if (a.id !== id) return a
        touched = true
        const before = {
          assignedTo: a.assignedTo,
          assignedAt: a.assignedAt,
          returnedAt: a.returnedAt,
          condition: a.condition,
          identifier: a.identifier,
          type: a.type,
          notes: a.notes,
        }
        let updated: Asset = { ...a }
        let action = 'asset.update'

        if (body.returnAction) {
          updated = {
            ...updated,
            returnedAt: now,
            assignedTo: null,
          }
          action = 'asset.return'
        } else if (body.assignedTo !== undefined) {
          // Assignment: also stamp assignedAt and clear any old returnedAt.
          updated = {
            ...updated,
            assignedTo: body.assignedTo,
            assignedAt: body.assignedTo ? now : null,
            returnedAt: body.assignedTo ? null : updated.returnedAt,
          }
          action = body.assignedTo ? 'asset.assign' : 'asset.unassign'
        }
        if (body.condition !== undefined) updated.condition = body.condition
        if (body.notes !== undefined) updated.notes = body.notes
        if (body.identifier !== undefined) updated.identifier = body.identifier.trim()
        if (body.type !== undefined) updated.type = body.type

        updated.auditLog = [
          ...a.auditLog,
          {
            timestamp: now,
            user: session!.email,
            action,
            before,
            after: {
              assignedTo: updated.assignedTo,
              assignedAt: updated.assignedAt,
              returnedAt: updated.returnedAt,
              condition: updated.condition,
              identifier: updated.identifier,
              type: updated.type,
            },
          },
        ]
        return updated
      })
      return {
        next,
        commitMessage: `feat(assets): update ${id.slice(0, 18)}`,
      }
    },
    { defaultValue: [] as Asset[] },
  )

  if (!touched) return bad('Asset not found.', 404)
  return NextResponse.json({
    ok: true,
    note: 'Saved. Reflects once Vercel rebuilds (~2 minutes).',
  })
}

export async function DELETE(request: Request) {
  const session = await getCurrentSession()
  if (!canManageAssets(session)) return bad('Only Admin or HR can delete assets.', 403)

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')?.trim()
  if (!id) return bad('id is required.')

  let removed = false
  await atomicUpdateJson<Asset[]>(
    ASSETS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const next = list.filter((a) => a.id !== id)
      removed = next.length !== list.length
      return {
        next,
        commitMessage: `feat(assets): delete ${id.slice(0, 18)}`,
      }
    },
    { defaultValue: [] as Asset[] },
  )

  if (!removed) return bad('Asset not found.', 404)
  return NextResponse.json({ ok: true })
}
