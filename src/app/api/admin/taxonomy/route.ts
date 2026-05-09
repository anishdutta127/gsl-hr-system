/*
 * Taxonomy mutations API. One POST endpoint, dispatcher pattern keyed on
 * { kind, operation }. Admin + HR only — Riddhi runs renames; Anish
 * audits.
 *
 * Operations write directly to two repo files in one logical commit each:
 *
 *   employees.json — cascade-updated for rename / merge (department or
 *                    location field rewritten on every affected employee)
 *   taxonomy.json  — metadata moved from old key to new key (or
 *                    locationType toggled)
 *
 * Two commits land per rename. The first carries the cascade and triggers
 * a Vercel rebuild; the second carries the metadata move, also triggers a
 * rebuild. Acceptable: Riddhi does this rarely (once per dept/location
 * restructure).
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import {
  applyDepartmentRename,
  applyLocationRename,
  applyLocationRetype,
  cascadeRenameDepartment,
  cascadeRenameLocation,
} from '@/lib/taxonomy'
import type { Employee, LocationType, Taxonomy } from '@/lib/types'

export const runtime = 'nodejs'

const EMPLOYEES_PATH = 'src/data/employees.json'
const TAXONOMY_PATH = 'src/data/taxonomy.json'

interface RenameBody {
  kind: 'location' | 'department'
  operation: 'rename'
  from: string
  to: string
}
interface RetypeBody {
  kind: 'location'
  operation: 'retype'
  name: string
  type: LocationType
}
type Body = RenameBody | RetypeBody

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return bad('Only Admin or HR can manage taxonomy.', 403)
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return bad('Body must be JSON.')
  }

  const now = new Date().toISOString()
  const user = session.email

  if (body.operation === 'retype') {
    if (body.kind !== 'location') return bad('Retype is location-only.')
    const name = body.name?.trim()
    if (!name) return bad('name is required.')
    if (body.type !== 'office' && body.type !== 'remote-field')
      return bad('type must be office or remote-field.')
    await atomicUpdateJson<Taxonomy>(
      TAXONOMY_PATH,
      (current) => {
        const tax = normaliseTaxonomy(current)
        const { next } = applyLocationRetype({
          taxonomy: tax,
          name,
          type: body.type,
          user,
          now,
        })
        return {
          next,
          commitMessage: `feat(taxonomy): set ${name} type to ${body.type}`,
        }
      },
      { defaultValue: emptyTaxonomy() },
    )
    return NextResponse.json({ ok: true, name, type: body.type })
  }

  if (body.operation === 'rename') {
    const from = body.from?.trim()
    const to = body.to?.trim()
    if (!from || !to) return bad('from and to are both required.')
    if (body.kind !== 'location' && body.kind !== 'department')
      return bad('kind must be location or department.')
    if (from === to) return NextResponse.json({ ok: true, touched: 0, isMerge: false })

    // 1) Cascade-update employees.json (one commit).
    let touchedCount = 0
    await atomicUpdateJson<Employee[]>(
      EMPLOYEES_PATH,
      (current) => {
        const list = Array.isArray(current) ? current : []
        const { next, touchedIds } =
          body.kind === 'location'
            ? cascadeRenameLocation({ employees: list, from, to, user, now })
            : cascadeRenameDepartment({ employees: list, from, to, user, now })
        touchedCount = touchedIds.length
        return {
          next,
          commitMessage: `feat(taxonomy): rename ${body.kind} ${from} -> ${to} (${touchedIds.length} employees)`,
        }
      },
      { defaultValue: [] as Employee[] },
    )

    // 2) Update taxonomy metadata (second commit).
    let isMerge = false
    await atomicUpdateJson<Taxonomy>(
      TAXONOMY_PATH,
      (current) => {
        const tax = normaliseTaxonomy(current)
        const result =
          body.kind === 'location'
            ? applyLocationRename({ taxonomy: tax, from, to, user, now })
            : applyDepartmentRename({ taxonomy: tax, from, to, user, now })
        isMerge = result.isMerge
        return {
          next: result.next,
          commitMessage: result.isMerge
            ? `feat(taxonomy): merge ${body.kind} ${from} into ${to}`
            : `feat(taxonomy): rename ${body.kind} ${from} -> ${to}`,
        }
      },
      { defaultValue: emptyTaxonomy() },
    )

    return NextResponse.json({ ok: true, touched: touchedCount, isMerge })
  }

  return bad('Unknown operation.')
}

function emptyTaxonomy(): Taxonomy {
  return { locations: {}, departments: {}, auditLog: [] }
}

function normaliseTaxonomy(raw: unknown): Taxonomy {
  const t = (raw ?? {}) as Partial<Taxonomy>
  return {
    locations: t.locations ?? {},
    departments: t.departments ?? {},
    auditLog: t.auditLog ?? [],
  }
}
