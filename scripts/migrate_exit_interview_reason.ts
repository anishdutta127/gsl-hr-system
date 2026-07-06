/*
 * Migrate the legacy exit-interview free-text "Reason for leaving" into the
 * interview freeText notes, now that the editable reason field is replaced by
 * the confidential document upload.
 *
 * The CANONICAL reason (employee.exit.reason / ExitProcess.reasonForLeaving,
 * set at initiation + shown on the board) is the source of truth and is NOT
 * touched. This only preserves any HR-entered interview reason text so it is
 * not lost when the field disappears from the form - it is COPIED into freeText
 * and the original reasonForLeaving is kept (analytics + board keep working).
 *
 * Idempotent: a marker line prevents re-copying on re-runs.
 *
 * Run: npx tsx scripts/migrate_exit_interview_reason.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import type { ExitInterview } from '../src/lib/types'

const FILE = path.join(process.cwd(), 'src', 'data', 'exit_interviews.json')
const MARKER = 'Reason for leaving (from the interview):'

function main(): void {
  if (!fs.existsSync(FILE)) {
    console.log('No exit_interviews.json - nothing to migrate.')
    return
  }
  const now = new Date().toISOString()
  const text = fs.readFileSync(FILE, 'utf-8').trim()
  const list: ExitInterview[] = text ? (JSON.parse(text) as ExitInterview[]) : []

  let migrated = 0
  for (const interview of list) {
    const reason = (interview.reasonForLeaving ?? '').trim()
    if (!reason) continue
    if ((interview.freeText ?? '').includes(MARKER)) continue // already migrated

    const line = `${MARKER} ${reason}`
    interview.freeText = interview.freeText?.trim() ? `${interview.freeText.trim()}\n\n${line}` : line
    interview.auditLog = [
      ...(interview.auditLog ?? []),
      {
        timestamp: now,
        user: 'exit-interview-reason-migration',
        action: 'exit-interview.reason.migrate-to-notes',
        after: { copiedReason: reason },
        notes: 'Copied the legacy interview reason into freeText; the editable field is replaced by the document upload.',
      },
    ]
    migrated++
  }

  if (migrated === 0) {
    console.log(`No interviews needed migration (${list.length} scanned).`)
    return
  }
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2) + '\n', 'utf-8')
  console.log(`Migrated ${migrated} interview reason(s) into freeText (${list.length} scanned).`)
}

main()
