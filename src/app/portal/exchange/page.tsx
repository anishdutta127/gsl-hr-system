/*
 * Magic-link landing page. Validates the HMAC token, sets the candidate
 * session cookie, then redirects to /portal/welcome. Invalid token → the
 * request-new-link page with an explanation.
 *
 * Server component; all logic runs before render so there's no flash.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  CANDIDATE_SESSION_COOKIE,
  candidateSessionCookieOptions,
  mintCandidateSession,
  verifyMagicLink,
} from '@/lib/candidateAuth'

export const dynamic = 'force-dynamic'

export default async function ExchangePage({
  searchParams,
}: {
  searchParams: { t?: string }
}) {
  const token = searchParams.t
  if (!token) {
    redirect('/portal/request-new-link?reason=missing')
  }

  const result = await verifyMagicLink(token)
  if (!result.valid) {
    redirect('/portal/request-new-link?reason=invalid')
  }

  const { candidateId, applicationId } = result.payload.data
  const { token: sessionToken } = await mintCandidateSession(candidateId)
  cookies().set(CANDIDATE_SESSION_COOKIE, sessionToken, candidateSessionCookieOptions())

  if (applicationId) {
    redirect('/portal/welcome')
  }
  redirect('/portal/me')
}
