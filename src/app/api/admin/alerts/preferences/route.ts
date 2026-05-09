/*
 * Alert preferences. HR + Admin can read; only Admin can edit.
 *
 *   GET  /api/admin/alerts/preferences
 *   PUT  /api/admin/alerts/preferences
 *     body: { enabled, extraRecipients, globalEnabled }
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { loadAlertPreferences } from '@/lib/alerts'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import { ALERT_CATEGORIES, type AlertCategory, type AlertPreferences } from '@/lib/types'

export const runtime = 'nodejs'

const PATH = 'src/data/alert_preferences.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function GET() {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return bad('Only Admin or HR can read alert preferences.', 403)
  }
  return NextResponse.json(loadAlertPreferences())
}

interface PutBody {
  enabled?: Partial<Record<AlertCategory, boolean>>
  extraRecipients?: string[]
  globalEnabled?: boolean
}

export async function PUT(request: Request) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin') return bad('Only Admin can edit alert preferences.', 403)

  let body: PutBody
  try {
    body = (await request.json()) as PutBody
  } catch {
    return bad('Body must be JSON.')
  }

  const enabled: Partial<Record<AlertCategory, boolean>> = { ...(body.enabled ?? {}) }
  for (const k of Object.keys(enabled)) {
    if (!ALERT_CATEGORIES.includes(k as AlertCategory)) {
      return bad(`Unknown alert category: ${k}`)
    }
  }

  const next: AlertPreferences = {
    enabled,
    extraRecipients: (body.extraRecipients ?? [])
      .map((s) => s.trim())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)),
    globalEnabled: body.globalEnabled ?? true,
    updatedAt: new Date().toISOString(),
  }

  await atomicUpdateJson<AlertPreferences>(
    PATH,
    () => ({
      next,
      commitMessage: `feat(alerts): update preferences (globalEnabled=${next.globalEnabled})`,
    }),
    { defaultValue: next },
  )

  return NextResponse.json({
    ok: true,
    note: 'Saved. Reflects on the next cron run after Vercel rebuilds (~2 minutes).',
  })
}
