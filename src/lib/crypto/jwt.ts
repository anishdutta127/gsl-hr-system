/*
 * Staff JWT signing + verification via jose (Edge-compatible).
 *
 * Tokens live in httpOnly SameSite=Strict cookies.
 * Default TTL: 7 days. Refresh-on-activity happens in middleware (renews
 * exp if more than 1 day has passed since issued, silently rotating the
 * cookie).
 */

import { SignJWT, jwtVerify } from 'jose'
import type { SessionClaims, StaffRole } from '../types'

const JWT_COOKIE_NAME = 'gsl_hr_session'
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

function jwtSecret(): Uint8Array {
  const s = process.env.GSL_JWT_SECRET
  if (!s) {
    throw new Error(
      'GSL_JWT_SECRET is not set. Generate with: openssl rand -hex 32. Set in Vercel env vars.',
    )
  }
  return new TextEncoder().encode(s)
}

export interface IssueSessionParams {
  sub: string
  email: string
  name: string
  role: StaffRole
  ttlSeconds?: number
}

export async function issueSessionToken(params: IssueSessionParams): Promise<string> {
  const ttl = params.ttlSeconds ?? DEFAULT_TTL_SECONDS
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    sub: params.sub,
    email: params.email,
    name: params.name,
    role: params.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .setIssuer('gsl-hr-system')
    .setAudience('staff')
    .sign(jwtSecret())
}

export async function verifySessionToken(
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      issuer: 'gsl-hr-system',
      audience: 'staff',
    })
    return payload as unknown as SessionClaims
  } catch {
    return null
  }
}

export const SESSION_COOKIE_NAME = JWT_COOKIE_NAME

export function sessionCookieOptions(maxAgeSeconds: number = DEFAULT_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  }
}
