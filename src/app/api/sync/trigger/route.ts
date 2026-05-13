/*
 * Universal "Sync now" trigger.
 *
 * Any signed-in user can force-dispatch the apply-queue workflow so pending
 * writes apply immediately. Rate-limited to 1 trigger / 60s per user-email
 * so the GitHub Actions free-tier minutes don't get hammered.
 *
 * The earlier admin-only `POST /api/admin/sync-now` is kept as-is so any
 * external callers / older tests that hit it still work; this is the new
 * universal entry point and the one wired into the top-nav widget.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { rateLimited } from '@/lib/rateLimit'
import {
  dispatchWorkflow,
  QueueNotConfiguredError,
  QueueUpstreamError,
} from '@/lib/queue/githubQueue'

export const runtime = 'nodejs'

const APPLY_QUEUE_WORKFLOW = 'apply-queue.yml'

export async function POST() {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  }

  if (rateLimited(`sync-trigger:${session.email}`, 1, 60)) {
    return NextResponse.json(
      {
        message:
          'Sync was already triggered in the last minute. Wait a moment, then try again.',
      },
      { status: 429 },
    )
  }

  try {
    await dispatchWorkflow(APPLY_QUEUE_WORKFLOW)
  } catch (err) {
    if (err instanceof QueueNotConfiguredError) {
      return NextResponse.json({ message: err.message }, { status: 503 })
    }
    if (err instanceof QueueUpstreamError) {
      if (err.status === 403) {
        return NextResponse.json(
          {
            message:
              'Sync dispatch refused: the queue PAT lacks actions:write scope. ' +
              'Anish needs to update the fine-grained token in Vercel.',
          },
          { status: 503 },
        )
      }
      if (err.status === 404) {
        return NextResponse.json(
          { message: 'Apply-queue workflow not found on the repo.' },
          { status: 503 },
        )
      }
      return NextResponse.json({ message: err.message }, { status: 503 })
    }
    const message = err instanceof Error ? err.message : 'Sync dispatch failed.'
    return NextResponse.json({ message }, { status: 503 })
  }

  return NextResponse.json({
    ok: true,
    note:
      'Sync dispatched. The apply runner picks up within ~10 seconds; data should reflect once Vercel rebuilds (~30 seconds).',
  })
}
