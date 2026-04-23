/*
 * In-memory, per-instance rate limiter. Good enough for Phase 1 pilot volume.
 * Serverless cold starts reset the counter — fine for a 5/hr cap (worst case
 * attacker gets ~5 extra attempts per cold start; hCaptcha gating lands via
 * TODOS entry if abuse logs show it).
 */

const buckets = new Map<string, number[]>()

export function rateLimited(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now()
  const cutoff = now - windowSeconds * 1000
  const prior = buckets.get(key) ?? []
  const recent = prior.filter((t) => t >= cutoff)
  if (recent.length >= limit) {
    buckets.set(key, recent)
    return true
  }
  recent.push(now)
  buckets.set(key, recent)
  return false
}
