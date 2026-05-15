/*
 * Auth middleware.
 *
 * Route scopes:
 *   /login, /api/login, /api/logout, /api/health   : public
 *   /careers/**                                    : public (candidate-facing)
 *   /api/public/**                                 : public
 *   /portal/**                                     : candidate session cookie required
 *                                                    (magic-link exchange sets it)
 *   /portal/request-new-link                       : public (recovery surface)
 *   /portal/exchange                               : public (magic-link landing)
 *   everything else                                : staff JWT required
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/crypto/jwt'
import { CANDIDATE_SESSION_COOKIE, verifyCandidateSession } from '@/lib/candidateAuth'

const PUBLIC_PATHS = [
  '/login',
  '/api/login',
  '/api/logout',
  '/api/health',
]

const PUBLIC_PREFIXES = [
  '/careers',
  '/api/public',
  // Public R&R celebration pages (Phase 4 gate 4). The page itself
  // checks publicShareEnabled and 404s when the flag is off; middleware
  // just opens the URL.
  '/celebrate',
]

const CANDIDATE_PUBLIC = [
  '/portal/request-new-link',
  '/portal/exchange',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next()
  }
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/portal') || pathname.startsWith('/api/portal')) {
    if (CANDIDATE_PUBLIC.some((p) => pathname.startsWith(p))) {
      return NextResponse.next()
    }
    const token = request.cookies.get(CANDIDATE_SESSION_COOKIE)?.value
    if (!token) {
      const url = request.nextUrl.clone()
      url.pathname = '/portal/request-new-link'
      url.search = ''
      return NextResponse.redirect(url)
    }
    const result = await verifyCandidateSession(token)
    if (!result.valid) {
      const url = request.nextUrl.clone()
      url.pathname = '/portal/request-new-link'
      url.search = '?reason=expired'
      const response = NextResponse.redirect(url)
      response.cookies.delete(CANDIDATE_SESSION_COOKIE)
      return response
    }
    return NextResponse.next()
  }

  // Staff JWT required for everything else
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!token) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = `?next=${encodeURIComponent(pathname)}`
    return NextResponse.redirect(url)
  }

  const session = await verifySessionToken(token)
  if (!session) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = `?next=${encodeURIComponent(pathname)}`
    const response = NextResponse.redirect(url)
    response.cookies.delete(SESSION_COOKIE_NAME)
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.ico$|.*\\.png$|.*\\.webp$).*)'],
}
