/*
 * Backfill the F&F ledger (src/data/ff_settlements.json) from cockpit exit
 * processes so analytics + every F&F reader reflect amounts entered via the
 * exit cockpit (which stores F&F on the ExitProcess 'ff' step).
 *
 * ff_settlements.json is the single F&F source of truth for reads; the cockpit
 * is the edit surface. This projects each ExitProcess 'ff' step into a ledger
 * row, upserting by employeeId (one row per employee = no double-count) and
 * MERGING onto any existing row so richer legacy fields survive.
 *
 * Idempotent: uses projectFFSettlement's `changed` flag, only writes when at
 * least one row actually changed. Safe to run repeatedly, before or after a
 * deploy. Complements scripts/migrate_exit_processes.ts (which seeds the
 * cockpit 'ff' step FROM the legacy ledger for pre-cockpit exits).
 *
 * Run: npx tsx scripts/migrate_ff_settlements.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import { loadExitProcesses, projectFFSettlement } from '../src/lib/exitProcess'
import { loadFFSettlements } from '../src/lib/offboardingTasks'
import type { FFSettlement } from '../src/lib/types'

const FF_FILE = path.join(process.cwd(), 'src', 'data', 'ff_settlements.json')

function main(): void {
  const now = new Date().toISOString()
  const processes = loadExitProcesses()
  const byEmp = new Map<string, FFSettlement>(loadFFSettlements().map((f) => [f.employeeId, f]))

  let synced = 0
  let skippedNoAmount = 0
  for (const p of processes) {
    const proj = projectFFSettlement({ process: p, existing: byEmp.get(p.employeeId), by: 'system', now })
    if (!proj) {
      skippedNoAmount++
      continue
    }
    if (!proj.changed) continue
    byEmp.set(p.employeeId, proj.next)
    synced++
  }

  if (synced === 0) {
    console.log(
      `F&F ledger already in sync: ${processes.length} exit process(es) scanned, ` +
        `${skippedNoAmount} without an F&F amount. No changes written.`,
    )
    return
  }

  const out = [...byEmp.values()]
  fs.writeFileSync(FF_FILE, JSON.stringify(out, null, 2) + '\n')
  console.log(
    `F&F ledger sync complete: ${synced} row(s) updated from the exit cockpit, ` +
      `${out.length} ledger row(s) total (${processes.length} exit process(es) scanned).`,
  )
}

main()
