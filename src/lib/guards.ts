/*
 * Page-level role guards. Sidebar hides entries per role, but direct URL
 * access needs a server-side redirect too. Centralised so we don't drift.
 */

import { redirect } from 'next/navigation'
import type { SessionClaims, StaffRole } from './types'
import { getCurrentSession } from './identity'

export async function requireRoles(allowed: StaffRole[]): Promise<SessionClaims> {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  if (!allowed.includes(session.role)) redirect('/')
  return session
}
