/*
 * Server-side session identity lookup.
 * Used in Server Components and API routes to resolve the current logged-in
 * staff user from the session cookie.
 */

import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME, verifySessionToken } from './crypto/jwt'
import type { SessionClaims } from './types'

export async function getCurrentSession(): Promise<SessionClaims | null> {
  const cookieStore = cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export async function requireSession(): Promise<SessionClaims> {
  const session = await getCurrentSession()
  if (!session) {
    throw new Error('Unauthorised: no valid session')
  }
  return session
}
