import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { loadUsers } from '@/lib/data'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { hashPassword } from '@/lib/crypto/password'
import type { StaffRole } from '@/lib/types'

export const runtime = 'nodejs'

const VALID_ROLES = new Set<StaffRole>(['Admin', 'HR', 'HOD', 'Leadership'])

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin') {
    return NextResponse.json({ message: 'Only Admin can manage users.' }, { status: 403 })
  }

  let body: {
    name?: unknown
    email?: unknown
    role?: unknown
    password?: unknown
    active?: unknown
    ownedRoleIds?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = typeof body.role === 'string' && VALID_ROLES.has(body.role as StaffRole) ? (body.role as StaffRole) : null
  const password = typeof body.password === 'string' ? body.password : ''
  const active = body.active !== false
  const ownedRoleIds = Array.isArray(body.ownedRoleIds)
    ? body.ownedRoleIds.filter((x): x is string => typeof x === 'string')
    : []

  if (!name) return NextResponse.json({ message: 'Name required.' }, { status: 400 })
  if (!email) return NextResponse.json({ message: 'Email required.' }, { status: 400 })
  if (!role) return NextResponse.json({ message: 'Valid role required.' }, { status: 400 })
  if (!password || password.length < 6) {
    return NextResponse.json({ message: 'Starter password (min 6 chars) required.' }, { status: 400 })
  }

  const existing = (await loadUsers()).find((u) => u.email.toLowerCase() === email)
  if (existing) {
    return NextResponse.json({ message: 'A user with that email already exists.' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const bcryptHash = await hashPassword(password)

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'user',
      operation: 'create',
      payload: {
        id,
        name,
        email,
        role,
        bcryptHash,
        createdAt: now,
        active,
        ownedRoleIds,
        auditLog: [
          {
            timestamp: now,
            user: session.email,
            action: 'user.create',
            after: { email, name, role, active },
            notes: `Created by ${session.email}.`,
          },
        ],
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }
  return NextResponse.json({ ok: true, id })
}
