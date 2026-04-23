/*
 * Candidate magic-link + session cookie auth.
 *
 * Magic link: HMAC token scoped "magic-link", 15-min TTL, single-use enforced
 * by a nonce replay check written to src/data/_magic_link_nonces.json through
 * the queue. Exchange endpoint validates the token and sets a session cookie.
 *
 * Session cookie: HMAC token scoped "candidate-session", 30-day TTL, httpOnly
 * SameSite=Strict. Contains only the candidateId. Rolling refresh: pages
 * re-mint the cookie when issuedAt is more than a day old.
 *
 * Both token scopes use GSL_SNAPSHOT_SIGNING_KEY so magic-link exchange and
 * session verification trust a single signer.
 */

import { mintHmacToken, verifyHmacToken } from './crypto/hmac'

export const MAGIC_LINK_SCOPE = 'magic-link'
export const CANDIDATE_SESSION_SCOPE = 'candidate-session'
export const CANDIDATE_SESSION_COOKIE = 'gsl_candidate_session'

const MAGIC_LINK_TTL_SECONDS = 15 * 60 // 15 minutes
const CANDIDATE_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days
const REFRESH_WINDOW_SECONDS = 24 * 60 * 60 // refresh if > 1 day old

function signingKey(): string {
  const key = process.env.GSL_SNAPSHOT_SIGNING_KEY
  if (!key) {
    throw new Error(
      'GSL_SNAPSHOT_SIGNING_KEY is not set. Generate with: openssl rand -hex 32. Set in Vercel env.',
    )
  }
  return key
}

export interface MagicLinkData extends Record<string, unknown> {
  candidateId: string
  applicationId?: string
  nonce: string
}

export async function mintMagicLink(params: {
  candidateId: string
  applicationId?: string
  nonce: string
}) {
  return mintHmacToken<MagicLinkData>(
    MAGIC_LINK_SCOPE,
    {
      candidateId: params.candidateId,
      applicationId: params.applicationId,
      nonce: params.nonce,
    },
    MAGIC_LINK_TTL_SECONDS,
    signingKey(),
  )
}

export async function verifyMagicLink(token: string) {
  return verifyHmacToken<MagicLinkData>(token, MAGIC_LINK_SCOPE, signingKey())
}

export interface CandidateSessionData extends Record<string, unknown> {
  candidateId: string
}

export async function mintCandidateSession(candidateId: string) {
  return mintHmacToken<CandidateSessionData>(
    CANDIDATE_SESSION_SCOPE,
    { candidateId },
    CANDIDATE_SESSION_TTL_SECONDS,
    signingKey(),
  )
}

export async function verifyCandidateSession(token: string) {
  return verifyHmacToken<CandidateSessionData>(
    token,
    CANDIDATE_SESSION_SCOPE,
    signingKey(),
  )
}

export function candidateSessionCookieOptions(maxAge: number = CANDIDATE_SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge,
  }
}

export const MAGIC_LINK_CONSTANTS = {
  MAGIC_LINK_TTL_SECONDS,
  CANDIDATE_SESSION_TTL_SECONDS,
  REFRESH_WINDOW_SECONDS,
}
