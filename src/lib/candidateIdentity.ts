/*
 * Server-side candidate session helpers. Separated from candidateAuth.ts so
 * edge-runtime contexts (middleware) can import the signing primitives
 * without pulling in next/headers.
 */

import { cookies } from 'next/headers'
import {
  CANDIDATE_SESSION_COOKIE,
  MAGIC_LINK_CONSTANTS,
  candidateSessionCookieOptions,
  mintCandidateSession,
  verifyCandidateSession,
} from './candidateAuth'

export async function getCurrentCandidateId(): Promise<string | null> {
  const store = cookies()
  const token = store.get(CANDIDATE_SESSION_COOKIE)?.value
  if (!token) return null
  const result = await verifyCandidateSession(token)
  if (!result.valid) return null

  const age = Math.floor(Date.now() / 1000) - result.payload.issuedAt
  if (age > MAGIC_LINK_CONSTANTS.REFRESH_WINDOW_SECONDS) {
    try {
      const minted = await mintCandidateSession(result.payload.data.candidateId)
      store.set(CANDIDATE_SESSION_COOKIE, minted.token, candidateSessionCookieOptions())
    } catch {
      /* rolling refresh is best-effort */
    }
  }

  return result.payload.data.candidateId
}
