/*
 * Bulk employee upload - COMMIT.
 *
 *   POST /api/admin/employees/bulk-upload/commit
 *     multipart: file, overwrites (JSON array of "code:field" opt-in overwrites)
 *
 * Re-parses + re-reconciles the file SERVER-SIDE (never trusts a client-sent
 * row set), then writes the valid create/reactivate/update records into
 * employees.json via atomicUpdateJson (upsert by id) and generates Phase-4
 * onboarding tasks for the fresh creates. NEVER deletes and NEVER initiates or
 * completes an exit. Admin + HR only. Each record carries its own audit entry.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/identity'
import { loadUsers } from '@/lib/data'
import { MAX_BYTES, parseEmployeeUpload } from '@/lib/employees/parseUpload'
import { reconcileEmployeeImport } from '@/lib/employees/reconcileImport'
import { buildReconcileContext } from '@/lib/employees/importContext'
import {
  generateOnboardingTasksForEmployee,
  loadOnboardingTasks,
  loadOnboardingTemplates,
} from '@/lib/onboardingTasks'
import { atomicUpdateJson } from '@/lib/queue/githubQueue'
import type { Employee, OnboardingTask } from '@/lib/types'

export const runtime = 'nodejs'

const EMPLOYEES_PATH = 'src/data/employees.json'
const ONBOARDING_PATH = 'src/data/employee_onboarding_tasks.json'

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status })
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return bad('Not signed in.', 401)
  if (session.role !== 'Admin' && session.role !== 'HR') {
    return bad('Only Admin or HR can bulk-upload employees.', 403)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return bad('Expected a multipart file upload.')
  }
  const file = form.get('file')
  if (!(file instanceof Blob)) return bad('No file provided.')
  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length === 0) return bad('The file is empty.')
  if (buf.length > MAX_BYTES) return bad(`File too large (max ${Math.round(MAX_BYTES / 1024 / 1024)}MB).`, 413)

  let overwriteFields = new Set<string>()
  const rawOverwrites = form.get('overwrites')
  if (typeof rawOverwrites === 'string' && rawOverwrites.trim()) {
    try {
      const parsed = JSON.parse(rawOverwrites) as unknown
      if (Array.isArray(parsed)) overwriteFields = new Set(parsed.filter((x): x is string => typeof x === 'string'))
    } catch {
      return bad('Invalid overwrites payload.')
    }
  }

  const filename = 'name' in file && typeof file.name === 'string' ? file.name : 'upload'
  const { rows, errors } = parseEmployeeUpload(buf, filename)
  if (errors.length) return NextResponse.json({ message: errors.join(' '), fileErrors: errors }, { status: 422 })
  if (rows.length === 0) return bad('No data rows found in the file.', 422)

  const now = new Date().toISOString()
  const ctx = await buildReconcileContext({ actor: session.email, now, overwriteFields })
  const results = reconcileEmployeeImport(rows, ctx)
  const writable = results.filter((r) => r.classification !== 'error' && r.employee)

  if (writable.length === 0) {
    return NextResponse.json(
      { ok: false, message: 'Every row is an error - nothing to write.', result: summarise(results) },
      { status: 422 },
    )
  }

  // 1) Upsert the employee records (create + reactivate + update) atomically.
  const byId = new Map(writable.map((r) => [r.employee!.id, r.employee!]))
  await atomicUpdateJson<Employee[]>(
    EMPLOYEES_PATH,
    (current) => {
      const list = Array.isArray(current) ? current : []
      const kept = list.filter((e) => !byId.has(e.id))
      return {
        next: [...kept, ...byId.values()],
        commitMessage: `feat(employees): bulk upload ${writable.length} record(s) by ${session.email.slice(0, 24)}`,
      }
    },
    { defaultValue: [] as Employee[] },
  )

  // 2) Generate onboarding tasks for the fresh creates (same as the UI path).
  const creates = writable.filter((r) => r.classification === 'create').map((r) => r.employee!)
  const templates = loadOnboardingTemplates()
  const users = await loadUsers()
  let onboardingGenerated = 0
  if (creates.length > 0) {
    const existingTasks = loadOnboardingTasks()
    const fresh: OnboardingTask[] = []
    for (const emp of creates) {
      if (existingTasks.some((t) => t.employeeId === emp.id)) continue
      fresh.push(
        ...generateOnboardingTasksForEmployee({ employee: emp, templates, users, existing: existingTasks, now: new Date(now) }),
      )
    }
    onboardingGenerated = fresh.length
    if (fresh.length > 0) {
      await atomicUpdateJson<OnboardingTask[]>(
        ONBOARDING_PATH,
        (current) => {
          const list = Array.isArray(current) ? current : []
          const have = new Set(list.map((t) => t.id))
          const add = fresh.filter((t) => !have.has(t.id))
          return {
            next: [...list, ...add],
            commitMessage: `feat(onboarding): ${add.length} tasks for ${creates.length} bulk-created employee(s)`,
          }
        },
        { defaultValue: [] as OnboardingTask[] },
      )
    }
  }

  return NextResponse.json({
    ok: true,
    written: writable.length,
    onboardingGenerated,
    result: summarise(results),
    note: 'Records written. They appear in the roster once Vercel rebuilds (~2 minutes).',
  })
}

function summarise(results: ReturnType<typeof reconcileEmployeeImport>) {
  return results.map((r) => ({
    code: r.code,
    name: r.name,
    outcome: r.classification === 'error' ? 'skipped' : r.classification === 'create' ? 'created' : r.classification,
    reasons: r.classification === 'error' ? r.errors : r.warnings,
  }))
}
