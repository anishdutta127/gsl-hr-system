/*
 * Backfill ExitProcess records for in-flight exits.
 *
 * For every employee whose exit is in flight (status 'Exited' or
 * employmentStatus 'On Notice'), create or merge a six-step ExitProcess. Old
 * completion signals from the legacy offboarding records map onto the new
 * steps WITHOUT clobbering anything already Completed, and the new No Dues +
 * F&F steps are appended where missing.
 *
 * Idempotent: re-running merges, never resets a Completed step. Safe to run
 * repeatedly.
 *
 * Run: npx tsx scripts/migrate_exit_processes.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  loadExitProcesses,
  loadExitStepTemplates,
  mergeExitProcess,
  type ExitSignals,
} from '../src/lib/exitProcess'
import { loadFFSettlements } from '../src/lib/offboardingTasks'
import { handoverStatus, loadExitHandovers } from '../src/lib/exitHandover'
import type { Employee, ExitProcess } from '../src/lib/types'

const EMPLOYEES_FILE = path.join(process.cwd(), 'src', 'data', 'employees.json')
const PROCESSES_FILE = path.join(process.cwd(), 'src', 'data', 'exit_processes.json')

function loadEmployees(): Employee[] {
  try {
    const text = fs.readFileSync(EMPLOYEES_FILE, 'utf-8').trim()
    if (!text) return []
    const parsed = JSON.parse(text) as unknown
    return Array.isArray(parsed) ? (parsed as Employee[]) : []
  } catch {
    return []
  }
}

function isInFlightExit(e: Employee): boolean {
  return e.status === 'Exited' || e.employmentStatus === 'On Notice'
}

function main(): void {
  const now = new Date().toISOString()
  const employees = loadEmployees()
  const templates = loadExitStepTemplates()
  const existing = loadExitProcesses()
  const ffByEmp = new Map(loadFFSettlements().map((f) => [f.employeeId, f]))
  const handoverByEmp = new Map(loadExitHandovers().map((h) => [h.employeeId, h]))

  if (templates.length === 0) {
    console.error('No exit step templates found at src/data/exit_step_templates.json. Aborting.')
    process.exitCode = 1
    return
  }

  const byEmp = new Map(existing.map((p) => [p.employeeId, p]))
  const out: ExitProcess[] = [...existing]
  let created = 0
  let merged = 0

  for (const e of employees) {
    if (!isInFlightExit(e)) continue
    const ff = ffByEmp.get(e.id)
    const handover = handoverByEmp.get(e.id)
    const signals: ExitSignals = {
      relievingLetterIssued: Boolean(e.exit?.relievingLetterIssued),
      experienceLetterIssued: Boolean(e.exit?.experienceLetterIssued),
      ffPaidAt: ff?.paidAt ?? null,
      ffAmount: ff?.totalNet ?? null,
      handoverReviewed: handoverStatus(handover) === 'Reviewed',
    }
    const current = byEmp.get(e.id)
    const next = mergeExitProcess({ existing: current, templates, employee: e, signals, now })
    if (current) {
      const idx = out.findIndex((p) => p.employeeId === e.id)
      out[idx] = next
      merged++
    } else {
      out.push(next)
      created++
    }
  }

  fs.writeFileSync(PROCESSES_FILE, JSON.stringify(out, null, 2) + '\n')
  console.log(
    `Exit-process migration complete: ${created} created, ${merged} merged, ${out.length} total. ` +
      `(${employees.filter(isInFlightExit).length} in-flight exits scanned.)`,
  )
}

main()
