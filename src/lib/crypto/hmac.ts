/*
 * HMAC-SHA256 token signing and verification. Edge-runtime-compatible.
 *
 * Used by:
 * - Candidate magic links (Phase 1 Week 3)
 * - Candidate session cookies (Phase 1 Week 3)
 * - Any future signed-snapshot URL pattern
 *
 * Same signing key (GSL_SNAPSHOT_SIGNING_KEY) via HKDF-derived scope keys.
 * For Phase 1 Week 1 this file ships with primitives ready; consumers wire
 * up in Weeks 3-4.
 */

export interface HmacTokenPayload<T = Record<string, unknown>> {
  v: number
  issuedAt: number
  expiresAt: number
  scope: string
  data: T
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] as number)
  const b64 =
    typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const normal = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const binary =
    typeof atob === 'function' ? atob(normal) : Buffer.from(normal, 'base64').toString('binary')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function stringToBuffer(s: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(s)
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}

async function importHmacKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    stringToBuffer(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function hmacSignPayload(payloadB64: string, key: string): Promise<string> {
  const k = await importHmacKey(key)
  const sig = await crypto.subtle.sign('HMAC', k, stringToBuffer(payloadB64))
  return bytesToBase64Url(new Uint8Array(sig))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

export async function mintHmacToken<T extends Record<string, unknown>>(
  scope: string,
  data: T,
  ttlSeconds: number,
  key: string,
): Promise<{ token: string; expiresAt: number; issuedAt: number }> {
  if (!key) throw new Error('HMAC signing key is not set')
  const now = Math.floor(Date.now() / 1000)
  const payload: HmacTokenPayload<T> = {
    v: 1,
    issuedAt: now,
    expiresAt: now + ttlSeconds,
    scope,
    data,
  }
  const payloadB64 = bytesToBase64Url(new Uint8Array(stringToBuffer(JSON.stringify(payload))))
  const sig = await hmacSignPayload(payloadB64, key)
  return {
    token: `${payloadB64}.${sig}`,
    expiresAt: payload.expiresAt,
    issuedAt: payload.issuedAt,
  }
}

export async function verifyHmacToken<T extends Record<string, unknown>>(
  token: string,
  expectedScope: string,
  key: string,
): Promise<{ valid: false } | { valid: true; payload: HmacTokenPayload<T> }> {
  if (!token || !key) return { valid: false }
  const parts = token.split('.')
  if (parts.length !== 2) return { valid: false }
  const payloadB64 = parts[0]
  const sigB64 = parts[1]
  if (!payloadB64 || !sigB64) return { valid: false }

  let payload: HmacTokenPayload<T>
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(payloadB64))
    const parsed = JSON.parse(json) as HmacTokenPayload<T>
    if (parsed.v !== 1) return { valid: false }
    if (typeof parsed.issuedAt !== 'number' || typeof parsed.expiresAt !== 'number') {
      return { valid: false }
    }
    if (parsed.scope !== expectedScope) return { valid: false }
    payload = parsed
  } catch {
    return { valid: false }
  }

  const expected = await hmacSignPayload(payloadB64, key)
  if (!timingSafeEqual(expected, sigB64)) return { valid: false }

  const now = Math.floor(Date.now() / 1000)
  if (payload.expiresAt <= now) return { valid: false }

  return { valid: true, payload }
}
