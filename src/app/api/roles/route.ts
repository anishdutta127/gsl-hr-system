import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/types'

export const runtime = 'nodejs'

interface Body {
  title?: unknown
  department?: unknown
  location?: unknown
  employmentType?: unknown
  description?: unknown
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  }
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json({ message: 'Only HR or Admin can create roles.' }, { status: 403 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const department = typeof body.department === 'string' ? body.department.trim() : ''
  const location = typeof body.location === 'string' ? body.location.trim() : ''
  const employmentType = typeof body.employmentType === 'string' ? body.employmentType : 'Full-time'
  const description = typeof body.description === 'string' ? body.description.trim() : ''

  if (!title) {
    return NextResponse.json({ message: 'Role title is required.' }, { status: 400 })
  }
  if (title.length > 120) {
    return NextResponse.json({ message: 'Role title is too long (max 120 characters).' }, { status: 400 })
  }

  const roleId = crypto.randomUUID()
  const now = new Date().toISOString()

  const payload = {
    id: roleId,
    title,
    department,
    location,
    employmentType,
    status: 'Open',
    pipelineStages: DEFAULT_PIPELINE_STAGES,
    rubric: [],
    description,
    responsibilities: [],
    mustHaves: [],
    niceToHaves: [],
    createdAt: now,
    createdBy: session.email,
    auditLog: [
      {
        timestamp: now,
        user: session.email,
        action: 'role.create',
        after: { title, department, location, employmentType },
        notes: 'Created via UI',
      },
    ],
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'role',
      operation: 'create',
      payload,
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Could not save: queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, roleId })
}
