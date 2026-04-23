/*
 * pending_updates.json queue writer.
 *
 * API routes call enqueueUpdate to append a write intent. The self-hosted
 * sync runner consumes the queue on its next tick, applies each entry to
 * the appropriate JSON file with audit-log appending, and clears the entry.
 *
 * Persistence goes through the GitHub Contents API (see githubQueue.ts);
 * Vercel serverless filesystem is read-only outside /tmp. Trade-off:
 * 500ms-2s round-trip per write, acceptable for ≤100 writes/day internal tool.
 */

import crypto from 'node:crypto'
import { appendToQueue } from './githubQueue'
import type { PendingUpdate, PendingUpdateEntity } from '../types'

export async function enqueueUpdate(params: {
  queuedBy: string
  entity: PendingUpdateEntity
  operation: 'create' | 'update' | 'delete'
  payload: Record<string, unknown>
}): Promise<PendingUpdate> {
  const entry: PendingUpdate = {
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
    queuedBy: params.queuedBy,
    entity: params.entity,
    operation: params.operation,
    payload: params.payload,
    retryCount: 0,
  }
  await appendToQueue(entry)
  return entry
}
