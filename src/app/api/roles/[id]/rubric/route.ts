import { NextResponse } from 'next/server'
import { findRoleById } from '@/lib/data'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import type { RubricCriterion } from '@/lib/types'

export const runtime = 'nodejs'

const VALID_SCALES = new Set(['stars-1-5', 'score-1-10', 'yes-no'])

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only Admin or HR can edit a rubric.' }, { status: 403 })
  }
  const role = findRoleById(params.id)
  if (!role) return NextResponse.json({ message: 'Role not found.' }, { status: 404 })

  let body: { rubric?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const rubricInput = Array.isArray(body.rubric) ? body.rubric : []
  const rubric: RubricCriterion[] = []
  for (const raw of rubricInput) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    const weight = typeof r.weight === 'number' && r.weight > 0 ? r.weight : 1
    const scale = typeof r.scale === 'string' && VALID_SCALES.has(r.scale) ? r.scale : 'score-1-10'
    const id =
      typeof r.id === 'string' && r.id.trim()
        ? r.id.trim()
        : `cr-${Math.random().toString(36).slice(2, 10)}`
    if (!name) continue
    rubric.push({ id, name, weight, scale: scale as RubricCriterion['scale'] })
  }

  const now = new Date().toISOString()
  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'role',
      operation: 'update',
      payload: {
        id: role.id,
        operation: 'set-rubric',
        before: { rubric: role.rubric },
        after: { rubric },
        notes: `Rubric updated by ${session.email} at ${now}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }
  return NextResponse.json({ ok: true, count: rubric.length })
}
