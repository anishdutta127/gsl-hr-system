/*
 * Public counters for the celebration page.
 *
 *   POST /api/public/recognition/[id]/track   body: { event: 'view' | 'share' }
 *
 * No auth. The view counter is deduplicated by (recognitionId, IP)
 * within a 1-hour window using a small in-memory ring buffer; the
 * dedup is best-effort and will reset on cold starts (acceptable - the
 * counter is a vanity metric, not a billable surface).
 */

import { NextResponse } from 'next/server'
import { findRecognitionById, loadRecognitions } from '@/lib/data'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { Recognition } from '@/lib/types'

export const runtime = 'nodejs'

const RECOGNITIONS_PATH = 'src/data/recognitions.json'

// Best-effort dedup: keyed by `${id}:${ip}`, value is a timestamp.
// Cap to 5000 entries to prevent memory growth.
const recentViews = new Map<string, number>()
const VIEW_DEDUP_MS = 60 * 60 * 1000
const VIEW_CACHE_CAP = 5000

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const rec = findRecognitionById(params.id)
  if (!rec) return bad('Not found.', 404)
  if (!rec.publicShareEnabled) return bad('Not a public celebration.', 403)

  let body: { event?: string }
  try {
    body = (await request.json()) as { event?: string }
  } catch {
    return bad('Body must be JSON.')
  }

  if (body.event === 'view') {
    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]!.trim()
    const key = `${params.id}:${ip}`
    const lastSeen = recentViews.get(key)
    const now = Date.now()
    if (lastSeen && now - lastSeen < VIEW_DEDUP_MS) {
      return NextResponse.json({ ok: true, deduplicated: true })
    }
    if (recentViews.size > VIEW_CACHE_CAP) recentViews.clear()
    recentViews.set(key, now)
    await bumpCounter(params.id, 'view')
    return NextResponse.json({ ok: true })
  } else if (body.event === 'share') {
    await bumpCounter(params.id, 'share')
    return NextResponse.json({ ok: true })
  }
  return bad('Unknown event.')
}

async function bumpCounter(id: string, kind: 'view' | 'share') {
  await atomicUpdateJson<Recognition[]>(
    RECOGNITIONS_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : loadRecognitions()
      const next = list.map((r) => {
        if (r.id !== id) return r
        return {
          ...r,
          viewCount: kind === 'view' ? (r.viewCount ?? 0) + 1 : r.viewCount ?? 0,
          shareCount: kind === 'share' ? (r.shareCount ?? 0) + 1 : r.shareCount ?? 0,
        }
      })
      return {
        next,
        commitMessage: `chore(queue): bump recognition ${kind} counter ${id}`,
      }
    },
    { defaultValue: loadRecognitions() },
  )
}
