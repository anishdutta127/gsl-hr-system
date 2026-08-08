/*
 * Liveness probe used by post-deploy verification.
 *
 * Deliberately unauthenticated and deliberately boring: it reports whether the
 * process is up and whether it can reach Postgres, and nothing about the data.
 * A count would leak headcount to anyone who curls it.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()
  try {
    await prisma.$queryRaw`select 1`
    return NextResponse.json({
      ok: true,
      database: 'reachable',
      latencyMs: Date.now() - startedAt,
    })
  } catch (err) {
    // Report the failure honestly rather than returning 200 with a flag nobody
    // reads. A health endpoint that cannot go red is not a health endpoint.
    return NextResponse.json(
      {
        ok: false,
        database: 'unreachable',
        error: err instanceof Error ? err.message.split('\n')[0] : 'unknown error',
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 },
    )
  }
}
