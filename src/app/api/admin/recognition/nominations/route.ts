import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { loadNominationCycles, loadUsers } from '@/lib/data'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { NominationCycle } from '@/lib/types'

export const runtime = 'nodejs'

const NOMINATION_CYCLES_PATH = 'src/data/nomination_cycles.json'

/**
 * Logs a NominationCycle for the month. Admin + HR only.
 *
 * The actual mailto: fires client-side after this route returns 200.
 * We capture the intent + recipients here so the audit timeline shows
 * who asked for nominations and when, even though no actual email is
 * sent by the server.
 */
export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return NextResponse.json(
      { message: 'Only Admin or HR can open nomination cycles.' },
      { status: 403 },
    )
  }

  let body: { month?: unknown; hodIds?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const month = typeof body.month === 'string' ? body.month.trim() : ''
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ message: 'Month must be YYYY-MM.' }, { status: 400 })
  }
  const hodIds = Array.isArray(body.hodIds)
    ? body.hodIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : []
  if (hodIds.length === 0) {
    return NextResponse.json({ message: 'Select at least one HOD.' }, { status: 400 })
  }

  const users = await loadUsers()
  const validHodIds = new Set(
    users.filter((u) => u.active && u.role === 'HOD').map((u) => u.id),
  )
  const filtered = hodIds.filter((id) => validHodIds.has(id))
  if (filtered.length === 0) {
    return NextResponse.json(
      { message: 'None of the selected ids are active HODs.' },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()
  const cycle: NominationCycle = {
    id: `NOM-${month}-${crypto.randomUUID().slice(0, 8)}`,
    month,
    requestedAt: now,
    requestedBy: session.email,
    hodsNotified: filtered,
    auditLog: [
      {
        timestamp: now,
        user: session.email,
        action: 'nomination-cycle.create',
        after: { month, hodsNotified: filtered },
        notes: `Opened nomination cycle for ${month}.`,
      },
    ],
  }

  try {
    await atomicUpdateJson<NominationCycle[]>(
      NOMINATION_CYCLES_PATH,
      (current) => ({
        next: [...current, cycle],
        commitMessage: `chore(recognition): open nomination cycle for ${month}`,
      }),
      { defaultValue: await loadNominationCycles() },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true, cycleId: cycle.id })
}
