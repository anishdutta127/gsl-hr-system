/*
 * Universal sync-status snapshot.
 *
 * Powers the top-nav Sync now dropdown: pending writes count + last drain
 * timestamp. Reads the live GitHub state (not the bundled file, which is
 * always stale between drains because `chore(queue):` commits are skipped
 * by Vercel's ignoreCommand).
 *
 * Falls back to local file reads when GSL_QUEUE_GITHUB_TOKEN is missing
 * (local dev) so the widget still renders something useful instead of
 * exploding.
 */

import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { getCurrentSession } from '@/lib/identity'
import { findLastDrainCommit, readRepoFile } from '@/lib/queue/githubQueue'
import { summarisePendingUpdates, type PendingSummaryItem } from '@/lib/queue/pendingSummary'
import type { PendingUpdate } from '@/lib/types'

export const runtime = 'nodejs'

interface SyncStatus {
  pendingCount: number
  lastDrainAt: string | null
  lastDrainSubject: string | null
  source: 'github' | 'local'
  /**
   * Queue entries narrowed to `?entity=` when supplied. Lets a board show
   * exactly which of its own records are saved-but-not-yet-visible, instead
   * of rendering an honestly-empty list that reads as a failed write.
   */
  entityPendingCount: number
  entityPendingItems: PendingSummaryItem[]
}

const KNOWN_ENTITIES = new Set([
  'role',
  'candidate',
  'application',
  'employee',
  'offer',
  'interview',
  'user',
])

export async function GET(request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
  }

  const requested = new URL(request.url).searchParams.get('entity')
  const entity =
    requested && KNOWN_ENTITIES.has(requested)
      ? (requested as PendingUpdate['entity'])
      : undefined

  // Try GitHub first; fall back to local on any failure (incl. missing PAT
  // in dev). We never want this endpoint to 500 — the widget must render.
  let status: SyncStatus = {
    pendingCount: 0,
    lastDrainAt: null,
    lastDrainSubject: null,
    source: 'local',
    entityPendingCount: 0,
    entityPendingItems: [],
  }

  const applySummary = (parsed: PendingUpdate[]) => {
    const summary = summarisePendingUpdates(parsed, entity)
    status.entityPendingCount = summary.count
    status.entityPendingItems = summary.items
  }

  try {
    const [pendingText, lastDrain] = await Promise.all([
      readRepoFile('src/data/pending_updates.json'),
      findLastDrainCommit(),
    ])
    if (pendingText !== null) {
      const parsed = JSON.parse(pendingText) as PendingUpdate[]
      if (Array.isArray(parsed)) {
        status = {
          pendingCount: parsed.length,
          lastDrainAt: lastDrain?.date ?? null,
          lastDrainSubject: lastDrain?.message ?? null,
          source: 'github',
          entityPendingCount: 0,
          entityPendingItems: [],
        }
        applySummary(parsed)
      }
    }
  } catch {
    // Fall through to local read.
  }

  if (status.source === 'local') {
    try {
      const localPath = path.join(process.cwd(), 'src', 'data', 'pending_updates.json')
      if (fs.existsSync(localPath)) {
        const text = fs.readFileSync(localPath, 'utf-8')
        const parsed = JSON.parse(text) as PendingUpdate[]
        if (Array.isArray(parsed)) {
          status.pendingCount = parsed.length
          applySummary(parsed)
        }
      }
    } catch {
      // Stay at zero.
    }
  }

  return NextResponse.json(status)
}
