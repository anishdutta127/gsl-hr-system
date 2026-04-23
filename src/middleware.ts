/*
 * Auth middleware — staff JWT for authenticated routes, public for /careers.
 *
 * Route scopes:
 *   /login, /api/login       — public (auth endpoints themselves)
 *   /careers/**              — public (external candidate surface — Phase 1 Week 3)
 *   /portal/**               — candidate cookie auth (Phase 1 Week 3; for now returns 404-equivalent)
 *   /api/public/**           — public
 *   everything else          — staff JWT required
 *
 * On missing/invalid JWT for protected routes: redirect to /login preserving the
 * intended destination via ?next= query param.
 *
 * Refresh-on-activity is handled at the page level (by re-issuing the cookie
 * with a fresh exp when session is > 1 day old) rather than in middleware,
 * since middleware runs before cookie-writing is convenient.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/crypto/jwt'

const PUBLIC_PATHS = [
  '/login',
  '/api/login',
  '/api/logout',
  '/api/health',
]

const PUBLIC_PREFIXES = [
  '/careers',
  '/api/public',
  '/portal/request-new-link',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Static assets and Next internals are excluded via the matcher config
  // below. The middleware only runs on app routes.

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next()
  }
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Candidate portal: to be implemented in Week 3 with magic-link cookie.
  // For now, block with a friendly message.
  if (pathname.startsWith('/portal')) {
    return new NextResponse(
      'Candidate portal: coming soon. Check back in a week.',
      { status: 503 },
    )
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
    // Clear the invalid cookie.
    const response = NextResponse.redirect(url)
    response.cookies.delete(SESSION_COOKIE_NAME)
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.ico$|.*\\.png$|.*\\.webp$).*)'],
}
