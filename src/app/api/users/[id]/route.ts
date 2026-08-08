import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { loadUsers } from '@/lib/data'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { hashPassword } from '@/lib/crypto/password'
import type { StaffRole } from '@/lib/types'

export const runtime = 'nodejs'

const VALID_ROLES = new Set<StaffRole>(['Admin', 'HR', 'HOD', 'Leadership'])

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  if (session.role !== 'Admin') {
    return NextResponse.json({ message: 'Only Admin can manage users.' }, { status: 403 })
  }

  const user = (await loadUsers()).find((u) => u.id === params.id)
  if (!user) return NextResponse.json({ message: 'User not found.' }, { status: 404 })

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

  const name = typeof body.name === 'string' ? body.name.trim() : user.name
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : user.email
  const role =
    typeof body.role === 'string' && VALID_ROLES.has(body.role as StaffRole)
      ? (body.role as StaffRole)
      : user.role
  const active = body.active !== false
  const ownedRoleIds = Array.isArray(body.ownedRoleIds)
    ? body.ownedRoleIds.filter((x): x is string => typeof x === 'string')
    : user.ownedRoleIds ?? []
  const password = typeof body.password === 'string' ? body.password : ''

  if (email !== user.email) {
    const clash = (await loadUsers()).find(
      (u) => u.id !== user.id && u.email.toLowerCase() === email,
    )
    if (clash) {
      return NextResponse.json({ message: 'Email already in use.' }, { status: 409 })
    }
  }

  const now = new Date().toISOString()
  const after: Record<string, unknown> = { name, email, role, active, ownedRoleIds }
  if (password) {
    if (password.length < 6) {
      return NextResponse.json({ message: 'Password must be at least 6 characters.' }, { status: 400 })
    }
    after.bcryptHash = await hashPassword(password)
  }

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'user',
      operation: 'update',
      payload: {
        id: user.id,
        operation: 'user.update',
        before: {
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
          ownedRoleIds: user.ownedRoleIds ?? [],
        },
        after,
        notes: `Updated by ${session.email}${password ? ' (password reset)' : ''}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }
  return NextResponse.json({ ok: true })
}
