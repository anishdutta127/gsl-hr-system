/*
 * System settings — admin-editable defaults.
 *
 *   GET  /api/admin/system-settings           HR + Admin can read
 *   PUT  /api/admin/system-settings           Admin only — { leaveFlow }
 *
 * Persists to src/data/system_settings.json via atomicUpdateJson.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { loadSystemSettings } from '@/lib/systemSettings'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import { LEAVE_FLOWS, type LeaveFlow, type SystemSettings } from '@/lib/types'

export const runtime = 'nodejs'

const PATH = 'src/data/system_settings.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function GET() {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return bad('Only Admin or HR can read system settings.', 403)
  }
  return NextResponse.json(loadSystemSettings())
}

interface PutBody {
  leaveFlow?: LeaveFlow
}

export async function PUT(request: Request) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin') return bad('Only Admin can edit system settings.', 403)

  let body: PutBody
  try {
    body = (await request.json()) as PutBody
  } catch {
    return bad('Body must be JSON.')
  }
  if (body.leaveFlow !== undefined && !LEAVE_FLOWS.includes(body.leaveFlow)) {
    return bad(`leaveFlow must be one of: ${LEAVE_FLOWS.join(', ')}.`)
  }

  const now = new Date().toISOString()
  const current = loadSystemSettings()
  const next: SystemSettings = {
    leaveFlow: body.leaveFlow ?? current.leaveFlow,
    updatedAt: now,
    updatedBy: session.email,
  }

  await atomicUpdateJson<SystemSettings>(
    PATH,
    () => ({
      next,
      commitMessage: `chore(settings): leaveFlow -> ${next.leaveFlow}`,
    }),
    { defaultValue: next },
  )

  return NextResponse.json({
    ok: true,
    settings: next,
    note: 'Saved. Takes effect on the next page load once Vercel rebuilds (~2 minutes).',
  })
}
