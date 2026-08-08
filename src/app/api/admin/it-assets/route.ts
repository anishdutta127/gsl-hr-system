/*
 * IT asset CRUD + bulk-import endpoints.
 *
 *   GET   /api/admin/it-assets          - list (admin clients call this for the picker; pages use loadITAssets)
 *   POST  /api/admin/it-assets          - create
 *   POST  /api/admin/it-assets?bulk=1   - bulk CSV import (body = parsed rows)
 *
 * Admin + HR only.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { canManageITAssets, loadITAssets, nextITAssetId } from '@/lib/itAssets'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import {
  IT_ASSET_CATEGORIES,
  IT_ASSET_CONDITIONS,
  type ITAsset,
  type ITAssetCategory,
  type ITAssetCondition,
} from '@/lib/types'

export const runtime = 'nodejs'

const IT_ASSETS_PATH = 'src/data/it_assets.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

interface CreateBody {
  category: ITAssetCategory
  make: string
  model: string
  serialNumber: string
  assetTag?: string
  purchaseDate?: string | null
  purchaseCost?: number | null
  warrantyEndDate?: string | null
  condition?: ITAssetCondition
  location?: string
  notes?: string
}

interface BulkImportBody {
  rows: CreateBody[]
}

export async function GET() {
  const session = await getCurrentSession()
  if (!session) return bad('Unauthorised.', 401)
  return NextResponse.json({ assets: await loadITAssets() })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!canManageITAssets(session)) return bad('Only Admin or HR can create IT assets.', 403)

  const url = new URL(request.url)
  const bulk = url.searchParams.get('bulk') === '1'

  if (bulk) return handleBulkImport(request, session!.email)

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return bad('Body must be JSON.')
  }
  const validation = validateCreate(body)
  if (validation) return bad(validation)

  const now = new Date().toISOString()
  const year = new Date(now).getUTCFullYear()
  let created: ITAsset | null = null

  await atomicUpdateJson<ITAsset[]>(
    IT_ASSETS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const id = nextITAssetId(list, year)
      created = {
        id,
        category: body.category,
        make: body.make.trim(),
        model: body.model.trim(),
        serialNumber: body.serialNumber.trim(),
        assetTag: (body.assetTag ?? '').trim(),
        purchaseDate: body.purchaseDate ?? null,
        purchaseCost: typeof body.purchaseCost === 'number' ? body.purchaseCost : null,
        warrantyEndDate: body.warrantyEndDate ?? null,
        currentAssignment: null,
        assignmentHistory: [],
        status: 'Available',
        condition: body.condition ?? 'New',
        location: (body.location ?? '').trim(),
        notes: (body.notes ?? '').trim(),
        auditLog: [
          {
            timestamp: now,
            user: session!.email,
            action: 'it-asset.create',
            after: {
              category: body.category,
              make: body.make,
              model: body.model,
              serialNumber: body.serialNumber,
            },
          },
        ],
        createdBy: session!.email,
        createdAt: now,
        updatedAt: now,
      }
      return {
        next: [...list, created],
        commitMessage: `feat(it-assets): add ${id} (${body.category})`,
      }
    },
    { defaultValue: [] as ITAsset[] },
  )

  return NextResponse.json({ ok: true, asset: created })
}

async function handleBulkImport(request: Request, userEmail: string) {
  let body: BulkImportBody
  try {
    body = (await request.json()) as BulkImportBody
  } catch {
    return bad('Body must be JSON.')
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return bad('rows[] is required and must be non-empty.')
  }
  for (const [i, row] of body.rows.entries()) {
    const err = validateCreate(row)
    if (err) return bad(`Row ${i + 1}: ${err}`)
  }

  const now = new Date().toISOString()
  const year = new Date(now).getUTCFullYear()
  const createdIds: string[] = []

  await atomicUpdateJson<ITAsset[]>(
    IT_ASSETS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      let working = [...list]
      for (const row of body.rows) {
        const id = nextITAssetId(working, year)
        const asset: ITAsset = {
          id,
          category: row.category,
          make: row.make.trim(),
          model: row.model.trim(),
          serialNumber: row.serialNumber.trim(),
          assetTag: (row.assetTag ?? '').trim(),
          purchaseDate: row.purchaseDate ?? null,
          purchaseCost: typeof row.purchaseCost === 'number' ? row.purchaseCost : null,
          warrantyEndDate: row.warrantyEndDate ?? null,
          currentAssignment: null,
          assignmentHistory: [],
          status: 'Available',
          condition: row.condition ?? 'New',
          location: (row.location ?? '').trim(),
          notes: (row.notes ?? '').trim(),
          auditLog: [
            {
              timestamp: now,
              user: userEmail,
              action: 'it-asset.bulk-import',
            },
          ],
          createdBy: userEmail,
          createdAt: now,
          updatedAt: now,
        }
        working.push(asset)
        createdIds.push(id)
      }
      return {
        next: working,
        commitMessage: `feat(it-assets): bulk import ${createdIds.length} assets`,
      }
    },
    { defaultValue: [] as ITAsset[] },
  )

  return NextResponse.json({ ok: true, createdCount: createdIds.length, ids: createdIds })
}

function validateCreate(body: CreateBody): string | null {
  if (!IT_ASSET_CATEGORIES.includes(body.category))
    return `category must be one of ${IT_ASSET_CATEGORIES.join(', ')}.`
  if (!body.make?.trim()) return 'make is required.'
  if (!body.model?.trim()) return 'model is required.'
  if (!body.serialNumber?.trim()) return 'serialNumber is required.'
  if (body.condition && !IT_ASSET_CONDITIONS.includes(body.condition))
    return `condition must be one of ${IT_ASSET_CONDITIONS.join(', ')}.`
  if (body.purchaseCost != null && (typeof body.purchaseCost !== 'number' || body.purchaseCost < 0))
    return 'purchaseCost must be a non-negative number.'
  return null
}

