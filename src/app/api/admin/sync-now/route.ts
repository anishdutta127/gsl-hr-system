/*
 * Admin "Sync now" — force-dispatches the apply-queue GitHub Action so
 * pending writes apply immediately instead of waiting for the next 5-min
 * cron tick. Reduces the gap between "I clicked Save" and "the page shows
 * the change" from up to ~15 min (cron + GitHub schedule lag) to ~30s
 * (workflow run + Vercel rebuild start).
 *
 * Admin-only. The PAT in GSL_QUEUE_GITHUB_TOKEN must have actions:write
 * scope on the repo. If it does not, GitHub returns 403 and we surface
 * a clear configuration error.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
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
  if (session.role !== 'Admin') {
    return NextResponse.json(
      { message: 'Only Admin can force a sync.' },
      { status: 403 },
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
              'Update the fine-grained token in Vercel and redeploy.',
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
      'Sync dispatched. The apply runner picks up within ~10 seconds; data should reflect once Vercel rebuilds (~2 minutes).',
  })
}
