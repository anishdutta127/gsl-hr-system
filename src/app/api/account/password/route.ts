import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { loadUsers } from '@/lib/data'
import { enqueueUpdate } from '@/lib/queue/pendingUpdates'
import { hashPassword, verifyPassword } from '@/lib/crypto/password'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })

  let body: { currentPassword?: unknown; newPassword?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 })
  }

  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
  if (!currentPassword) {
    return NextResponse.json({ message: 'Current password required.' }, { status: 400 })
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ message: 'New password must be at least 6 characters.' }, { status: 400 })
  }

  const user = (await loadUsers()).find((u) => u.id === session.sub)
  if (!user) return NextResponse.json({ message: 'User not found.' }, { status: 404 })

  const valid = await verifyPassword(currentPassword, user.bcryptHash)
  if (!valid) return NextResponse.json({ message: 'Current password is incorrect.' }, { status: 401 })

  const bcryptHash = await hashPassword(newPassword)
  const now = new Date().toISOString()

  try {
    await enqueueUpdate({
      queuedBy: session.email,
      entity: 'user',
      operation: 'update',
      payload: {
        id: user.id,
        operation: 'user.password-change',
        before: { bcryptHash: 'redacted' },
        after: { bcryptHash },
        notes: `Self-serve password change at ${now}.`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Queue write failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
